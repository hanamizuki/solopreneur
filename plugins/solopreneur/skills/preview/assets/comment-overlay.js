// preview skill: in-page comment overlay (Google Docs-style markers)
//
// Highlight text -> write a comment. The comment leaves a visible yellow
// <mark> on the text and a card in a side panel (desktop) or a bottom
// sheet (mobile). Comments persist to localStorage for the review session
// and re-anchor to their text by surrounding context (W3C-style
// TextQuoteSelector), so they survive reload, Alpine re-renders, and the
// diff/clean toggle.
//
// Pure client-side, no backend, no build step, no external dependency.
// A revision is a new URL/page: markers do NOT need to survive across
// revisions, only across reloads within one review session.

(function () {
  "use strict";

  // v2: each comment gains { id, anchor:{exact,prefix,suffix} }.
  // v1 data (no anchor) still loads — it just renders as a detached
  // panel card (cannot place a marker), never discarded, never crashes.
  const STORAGE_KEY = "preview_comments_v2";
  const LEGACY_KEY = "preview_comments_v1";
  const CTX = 32; // chars of prefix/suffix context captured for anchoring
  const DESKTOP_MIN = 1024; // px; >= is docked panel, < is bottom sheet

  let comments = [];
  try {
    comments = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!Array.isArray(comments)) comments = null;
  } catch (_) {
    comments = null;
  }
  if (comments == null) {
    // First load under v2: migrate any v1 data so existing review
    // sessions don't silently lose comments. v1 entries have no anchor,
    // so they degrade to detached cards (handled downstream).
    comments = [];
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
      if (Array.isArray(legacy)) comments = legacy;
    } catch (_) {
      comments = [];
    }
  }

  // Backfill ids on any entry missing one (v1 / hand-edited storage).
  let mutatedOnLoad = false;
  comments.forEach((c) => {
    if (!c.id) {
      c.id = newId();
      mutatedOnLoad = true;
    }
  });

  function newId() {
    try {
      if (window.crypto && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch (_) {
      /* fall through */
    }
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
    } catch (_) {
      /* storage blocked — UI still works for this session */
    }
    updateBadge();
    renderPanel();
  };

  // small DOM helper
  function el(tag, styleStr, opts) {
    const node = document.createElement(tag);
    if (styleStr) node.style.cssText = styleStr;
    if (opts) {
      if (opts.id) node.id = opts.id;
      if (opts.cls) node.className = opts.cls;
      if (opts.text != null) node.textContent = opts.text;
      if (opts.attrs) for (const k in opts.attrs) node.setAttribute(k, opts.attrs[k]);
    }
    return node;
  }

  function isDesktop() {
    return window.matchMedia("(min-width:" + DESKTOP_MIN + "px)").matches;
  }

  // ===================================================================
  // Text-node anchoring (W3C-style TextQuoteSelector)
  // ===================================================================
  // We avoid character offsets and DOM paths: Alpine.js can re-render
  // subtrees and the diff/clean toggle hides/shows <del>/<ins>, both of
  // which invalidate offsets and node references. Anchoring by the text
  // itself + a window of surrounding text re-locates the range by content
  // on every load.

  // Collect the document's visible text nodes (skip our own UI and
  // <script>/<style>). Returns an array of { node, start, end } plus the
  // concatenated string, so a character span maps back to a DOM Range.
  function collectTextNodes() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(n) {
          if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
          let p = n.parentNode;
          while (p && p !== document.body) {
            const tag = p.nodeName;
            if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
              return NodeFilter.FILTER_REJECT;
            }
            // Skip anything inside the overlay's own injected UI.
            if (p.nodeType === 1 && p.dataset && p.dataset.cmtUi === "1") {
              return NodeFilter.FILTER_REJECT;
            }
            p = p.parentNode;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );
    const nodes = [];
    let text = "";
    let n;
    while ((n = walker.nextNode())) {
      const v = n.nodeValue;
      nodes.push({ node: n, start: text.length, end: text.length + v.length });
      text += v;
    }
    return { nodes, text };
  }

  // Map an absolute character offset (into the concatenated string) to a
  // { node, offset } DOM position.
  function locate(nodes, charIdx) {
    for (let i = 0; i < nodes.length; i++) {
      const e = nodes[i];
      if (charIdx >= e.start && charIdx <= e.end) {
        return { node: e.node, offset: charIdx - e.start };
      }
    }
    const last = nodes[nodes.length - 1];
    return last ? { node: last.node, offset: last.node.nodeValue.length } : null;
  }

  // Find the unique occurrence of an anchor in the live document. Returns
  // a DOM Range, or null if not found / ambiguous (-> detached card).
  function findRange(anchor) {
    if (!anchor || !anchor.exact) return null;
    const { nodes, text } = collectTextNodes();
    if (!nodes.length) return null;

    const exact = anchor.exact;
    const prefix = anchor.prefix || "";
    const suffix = anchor.suffix || "";

    // Prefer the disambiguated prefix+exact+suffix match. If that whole
    // window isn't found (surrounding text changed) fall back to a unique
    // bare `exact`. If `exact` itself is non-unique, treat as detached.
    let needle = prefix + exact + suffix;
    let idx = text.indexOf(needle);
    let exactStart;
    if (idx !== -1 && text.indexOf(needle, idx + 1) === -1) {
      exactStart = idx + prefix.length;
    } else {
      idx = text.indexOf(exact);
      if (idx === -1) return null;
      if (text.indexOf(exact, idx + 1) !== -1) return null; // ambiguous
      exactStart = idx;
    }
    const exactEnd = exactStart + exact.length;

    const startPos = locate(nodes, exactStart);
    const endPos = locate(nodes, exactEnd);
    if (!startPos || !endPos) return null;

    const range = document.createRange();
    try {
      range.setStart(startPos.node, startPos.offset);
      range.setEnd(endPos.node, endPos.offset);
    } catch (_) {
      return null;
    }
    return range.collapsed ? null : range;
  }

  // Wrap a Range in <mark> elements. A Range can span multiple text nodes
  // and Range.surroundContents() throws when the range only partially
  // intersects a node, so we wrap per intersected text node instead: this
  // also keeps existing <del>/<ins> element structure intact (we never
  // move element boundaries, only split/wrap text).
  function wrapRange(range, id, comment) {
    // Snapshot the intersected text nodes before mutating the DOM.
    const root = range.commonAncestorContainer;
    const walkRoot = root.nodeType === 1 ? root : root.parentNode;
    const walker = document.createTreeWalker(walkRoot, NodeFilter.SHOW_TEXT);
    const targets = [];
    let n;
    while ((n = walker.nextNode())) {
      if (range.intersectsNode(n)) targets.push(n);
    }

    const startNode = range.startContainer;
    const startOff = range.startOffset;
    const endNode = range.endContainer;
    const endOff = range.endOffset;
    const marks = [];

    targets.forEach((node) => {
      let from = 0;
      let to = node.nodeValue.length;
      if (node === startNode) from = startOff;
      if (node === endNode) to = endOff;
      if (from >= to) return;

      // Split so `node` becomes exactly the covered slice.
      let target = node;
      if (to < target.nodeValue.length) target.splitText(to);
      if (from > 0) target = target.splitText(from);

      const mark = document.createElement("mark");
      mark.className = "cmt-mark";
      mark.setAttribute("data-cmt-id", id);
      mark.setAttribute("tabindex", "0");
      mark.setAttribute("role", "button");
      mark.setAttribute(
        "aria-label",
        "comment: " + (comment || "").slice(0, 60)
      );
      target.parentNode.insertBefore(mark, target);
      mark.appendChild(target);
      marks.push(mark);
    });
    return marks;
  }

  // Remove all <mark.cmt-mark> for an id and merge the text back so the
  // DOM returns to its pre-marker state (used by delete + re-anchor).
  function unwrapMarks(id) {
    const sel = id
      ? '.cmt-mark[data-cmt-id="' + cssEsc(id) + '"]'
      : ".cmt-mark";
    document.querySelectorAll(sel).forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
  }

  function cssEsc(s) {
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(s);
    return String(s).replace(/["\\\]]/g, "\\$&");
  }

  // (Re-)place every comment's marker. Called on load and after Alpine
  // settles. Idempotent: clears existing markers first.
  let detachedIds = new Set();
  function placeAllMarkers() {
    unwrapMarks(null);
    detachedIds = new Set();
    comments.forEach((c) => {
      const range = c.anchor ? findRange(c.anchor) : null;
      if (range) {
        wrapRange(range, c.id, c.comment);
      } else {
        detachedIds.add(c.id);
      }
    });
    renderPanel();
  }

  // ===================================================================
  // Comment creation
  // ===================================================================
  const addBtn = el(
    "button",
    "position:absolute;display:none;z-index:9999;padding:4px 10px;background:#1f2937;color:#fff;border:none;border-radius:6px;font:500 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)",
    { id: "cmt-add", text: "+ comment", attrs: { "data-cmt-ui": "1" } }
  );
  document.body.appendChild(addBtn);

  let pendingText = null;
  let pendingRange = null;

  document.addEventListener("mouseup", (e) => {
    if (
      e.target.closest(
        "#cmt-add,#cmt-modal,#cmt-export-modal,#cmt-panel,#cmt-sheet,#cmt-sheet-scrim,#cmt-fab,.cmt-mark"
      )
    ) {
      return;
    }
    const sel = window.getSelection();
    const text = sel && sel.toString().trim();
    if (!text || sel.rangeCount === 0) {
      addBtn.style.display = "none";
      pendingText = null;
      pendingRange = null;
      return;
    }
    pendingText = text;
    pendingRange = sel.getRangeAt(0).cloneRange();
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    addBtn.style.left = rect.right + window.scrollX + 8 + "px";
    addBtn.style.top = rect.top + window.scrollY - 4 + "px";
    addBtn.style.display = "block";
  });

  addBtn.addEventListener("click", () => {
    if (!pendingText || !pendingRange) return;
    openModal(pendingText, pendingRange);
    addBtn.style.display = "none";
  });

  // Build a TextQuoteSelector anchor from a live Range: exact selection
  // plus ~CTX chars of surrounding text content for disambiguation.
  function buildAnchor(range) {
    const exact = range.toString();
    if (!exact) return null;
    const { nodes, text } = collectTextNodes();
    if (!nodes.length) return { exact: exact, prefix: "", suffix: "" };

    // Locate exact's absolute char position via the start container.
    let base = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].node === range.startContainer) {
        base = nodes[i].start + range.startOffset;
        break;
      }
    }
    // If the start container wasn't a collected text node (rare), fall
    // back to first occurrence of exact.
    if (text.substr(base, exact.length) !== exact) {
      const found = text.indexOf(exact);
      base = found === -1 ? 0 : found;
    }
    const prefix = text.slice(Math.max(0, base - CTX), base);
    const suffix = text.slice(base + exact.length, base + exact.length + CTX);
    return { exact: exact, prefix: prefix, suffix: suffix };
  }

  function openModal(quoteText, range) {
    const overlay = el(
      "div",
      "position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif",
      { id: "cmt-modal", attrs: { "data-cmt-ui": "1" } }
    );
    const card = el(
      "div",
      "background:#fff;border-radius:12px;padding:24px;max-width:520px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,.2)"
    );
    const quoteBox = el(
      "div",
      "font-size:13px;color:#6b7280;margin-bottom:12px;font-style:italic;max-height:120px;overflow:auto;border-left:2px solid #d1d5db;padding:4px 0 4px 10px;line-height:1.5",
      { text: quoteText.length > 240 ? quoteText.slice(0, 240) + "…" : quoteText }
    );
    const input = el(
      "textarea",
      "width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font:inherit;font-size:14px;resize:vertical;box-sizing:border-box",
      { id: "cmt-input", attrs: { rows: "4", placeholder: "Your comment…" } }
    );
    const btnRow = el(
      "div",
      "display:flex;justify-content:flex-end;gap:8px;margin-top:14px"
    );
    const cancelBtn = el(
      "button",
      "padding:6px 14px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font:inherit;font-size:13px",
      { text: "cancel" }
    );
    const saveBtn = el(
      "button",
      "padding:6px 14px;border:none;background:#1f2937;color:#fff;border-radius:6px;cursor:pointer;font:inherit;font-size:13px",
      { text: "add" }
    );
    btnRow.append(cancelBtn, saveBtn);
    card.append(quoteBox, input, btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    input.focus();

    const close = () => overlay.remove();
    const commit = () => {
      const txt = input.value.trim();
      if (txt) {
        const anchor = buildAnchor(range);
        const entry = {
          id: newId(),
          // quote stays === anchor.exact so buildMarkdown() output is
          // byte-for-byte unchanged from v1.
          quote: anchor ? anchor.exact : quoteText,
          comment: txt,
          ts: new Date().toISOString(),
          anchor: anchor,
        };
        comments.push(entry);
        // Inject the marker immediately (no reload). The marker IS the
        // confirmation — no transient toast anymore.
        if (anchor) {
          const live = findRange(anchor);
          if (live) wrapRange(live, entry.id, entry.comment);
          else detachedIds.add(entry.id);
        } else {
          detachedIds.add(entry.id);
        }
        save();
        announce("comment added");
        if (!isDesktop()) openSheetSingle(entry.id);
      }
      close();
    };

    cancelBtn.addEventListener("click", close);
    saveBtn.addEventListener("click", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  // ===================================================================
  // Screen-reader announcement (replaces the old visible toast)
  // ===================================================================
  const liveRegion = el(
    "div",
    "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap",
    { attrs: { "aria-live": "polite", role: "status", "data-cmt-ui": "1" } }
  );
  document.body.appendChild(liveRegion);
  function announce(msg) {
    liveRegion.textContent = "";
    requestAnimationFrame(() => (liveRegion.textContent = msg));
  }

  // ===================================================================
  // Comment panel (desktop, >=1024px)
  // ===================================================================
  const panel = el(
    "aside",
    "",
    { id: "cmt-panel", cls: "cmt-panel", attrs: { "data-cmt-ui": "1" } }
  );
  const panelHead = el("div", "", { cls: "cmt-panel-head" });
  panelHead.appendChild(el("span", "", { cls: "cmt-panel-title", text: "Comments" }));
  const panelList = el("div", "", { cls: "cmt-panel-list" });
  const panelFoot = el("div", "", { cls: "cmt-panel-foot" });
  panel.append(panelHead, panelList, panelFoot);
  document.body.appendChild(panel);

  function quoteSnippet(s) {
    s = (s || "").replace(/\s+/g, " ").trim();
    return s.length > 90 ? s.slice(0, 90) + "…" : s;
  }

  // Order cards by each marker's vertical document position; detached
  // comments (no marker) sort last, keeping their relative order.
  function orderedComments() {
    return comments
      .map((c, i) => {
        const m = document.querySelector(
          '.cmt-mark[data-cmt-id="' + cssEsc(c.id) + '"]'
        );
        let y = Number.MAX_SAFE_INTEGER;
        if (m) {
          const r = m.getBoundingClientRect();
          y = r.top + window.scrollY;
        }
        return { c: c, y: y, i: i };
      })
      .sort((a, b) => (a.y - b.y) || (a.i - b.i))
      .map((o) => o.c);
  }

  function buildCard(c) {
    const detached = detachedIds.has(c.id);
    const cardEl = el("div", "", {
      cls: "cmt-card" + (detached ? " cmt-detached" : ""),
      attrs: { "data-cmt-id": c.id },
    });

    const q = el("div", "", { cls: "cmt-card-quote", text: quoteSnippet(c.quote) });
    const body = el("div", "", { cls: "cmt-card-body", text: c.comment });
    cardEl.append(q, body);

    if (detached) {
      cardEl.appendChild(
        el("div", "", {
          cls: "cmt-card-detached",
          text: "detached — text not found on this page",
          attrs: { "aria-hidden": "false" },
        })
      );
      cardEl.setAttribute("aria-disabled", "true");
    }

    const actions = el("div", "", { cls: "cmt-card-actions" });
    const editBtn = el("button", "", { cls: "cmt-act", text: "編輯" });
    const delBtn = el("button", "", { cls: "cmt-act cmt-act-del", text: "刪" });
    actions.append(editBtn, delBtn);
    cardEl.appendChild(actions);

    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startInlineEdit(cardEl, c);
    });
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm("Delete this comment? This removes its marker too.")) return;
      deleteComment(c.id);
    });

    if (!detached) {
      cardEl.addEventListener("click", () => {
        const m = document.querySelector(
          '.cmt-mark[data-cmt-id="' + cssEsc(c.id) + '"]'
        );
        if (m) {
          scrollToEl(m);
          flash(m);
        }
      });
    }
    return cardEl;
  }

  function startInlineEdit(cardEl, c) {
    if (cardEl.querySelector(".cmt-edit-ta")) return;
    const body = cardEl.querySelector(".cmt-card-body");
    const ta = el("textarea", "", { cls: "cmt-edit-ta" });
    ta.value = c.comment;
    body.replaceWith(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    const row = el("div", "", { cls: "cmt-edit-row" });
    const saveB = el("button", "", { cls: "cmt-act", text: "存" });
    const cancelB = el("button", "", { cls: "cmt-act", text: "取消" });
    row.append(saveB, cancelB);
    ta.after(row);

    const finish = () => renderPanel();
    saveB.addEventListener("click", () => {
      const v = ta.value.trim();
      if (v) {
        c.comment = v;
        const m = document.querySelector(
          '.cmt-mark[data-cmt-id="' + cssEsc(c.id) + '"]'
        );
        if (m) m.setAttribute("aria-label", "comment: " + v.slice(0, 60));
        save();
      }
      finish();
    });
    cancelB.addEventListener("click", finish);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") finish();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveB.click();
    });
  }

  function deleteComment(id) {
    unwrapMarks(id);
    detachedIds.delete(id);
    const idx = comments.findIndex((x) => x.id === id);
    if (idx !== -1) comments.splice(idx, 1);
    save();
    announce("comment deleted");
  }

  function renderPanel() {
    if (!panelList) return;
    panelList.textContent = "";
    const ordered = orderedComments();
    if (!ordered.length) {
      panelList.appendChild(
        el("div", "", { cls: "cmt-empty", text: "No comments yet." })
      );
    } else {
      ordered.forEach((c) => panelList.appendChild(buildCard(c)));
    }
    syncDesktopState();
  }

  // Click a marker -> open its card (panel on desktop, sheet on mobile).
  document.addEventListener("click", (e) => {
    const m = e.target.closest(".cmt-mark");
    if (!m) return;
    const id = m.getAttribute("data-cmt-id");
    if (isDesktop()) {
      const card = panelList.querySelector(
        '.cmt-card[data-cmt-id="' + cssEsc(id) + '"]'
      );
      if (card) {
        card.scrollIntoView({ behavior: prefersMotion() ? "smooth" : "auto", block: "center" });
        flash(card);
      }
    } else {
      openSheetSingle(id);
    }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("cmt-mark")) {
      e.preventDefault();
      e.target.click();
    }
  });

  function prefersMotion() {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function scrollToEl(node) {
    node.scrollIntoView({
      behavior: prefersMotion() ? "smooth" : "auto",
      block: "center",
    });
  }

  // Flash via class + animationend (robust to rapid re-clicks).
  function flash(node) {
    node.classList.remove("cmt-flash");
    // force reflow so re-adding restarts the animation
    void node.offsetWidth;
    node.classList.add("cmt-flash");
    const done = () => {
      node.classList.remove("cmt-flash");
      node.removeEventListener("animationend", done);
    };
    node.addEventListener("animationend", done);
  }

  // ===================================================================
  // Mobile bottom sheet (<1024px)
  // ===================================================================
  let sheetScrim = null;
  let sheet = null;
  let savedScrollY = 0;

  function lockScroll() {
    savedScrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = -savedScrollY + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
  }
  function unlockScroll() {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    window.scrollTo(0, savedScrollY);
  }

  function closeSheet() {
    if (sheet) sheet.remove();
    if (sheetScrim) sheetScrim.remove();
    sheet = null;
    sheetScrim = null;
    unlockScroll();
  }

  function ensureSheet() {
    if (sheet) {
      // re-entrant: swap content, don't stack
      sheet.querySelector(".cmt-sheet-body").textContent = "";
      return sheet.querySelector(".cmt-sheet-body");
    }
    sheetScrim = el("div", "", {
      id: "cmt-sheet-scrim",
      cls: "cmt-sheet-scrim",
      attrs: { "data-cmt-ui": "1" },
    });
    sheet = el("div", "", {
      id: "cmt-sheet",
      cls: "cmt-sheet",
      attrs: { "data-cmt-ui": "1", role: "dialog", "aria-modal": "true" },
    });
    const handle = el("div", "", { cls: "cmt-sheet-handle" });
    const head = el("div", "", { cls: "cmt-sheet-head" });
    const closeB = el("button", "", {
      cls: "cmt-sheet-close",
      text: "✕",
      attrs: { "aria-label": "close" },
    });
    head.appendChild(closeB);
    const bodyWrap = el("div", "", { cls: "cmt-sheet-body" });
    sheet.append(handle, head, bodyWrap);
    document.body.appendChild(sheetScrim);
    document.body.appendChild(sheet);
    lockScroll();
    sheetScrim.addEventListener("click", closeSheet);
    closeB.addEventListener("click", closeSheet);
    return bodyWrap;
  }

  function openSheetSingle(id) {
    const c = comments.find((x) => x.id === id);
    if (!c) return;
    const body = ensureSheet();
    body.appendChild(buildCard(c));
  }

  function openSheetAll() {
    const body = ensureSheet();
    const ordered = orderedComments();
    if (!ordered.length) {
      body.appendChild(el("div", "", { cls: "cmt-empty", text: "No comments yet." }));
    } else {
      ordered.forEach((c) => body.appendChild(buildCard(c)));
    }
  }

  // Floating "comments (N)" button — opens the full-list sheet (mobile).
  const fab = el("button", "", {
    id: "cmt-fab",
    cls: "cmt-fab",
    attrs: { "data-cmt-ui": "1" },
  });
  const fabLabel = document.createTextNode("comments (");
  const fabBadge = el("span", null, { id: "cmt-fab-badge", text: "0" });
  fab.append(fabLabel, fabBadge, document.createTextNode(")"));
  document.body.appendChild(fab);
  fab.addEventListener("click", openSheetAll);

  // ===================================================================
  // Export (markdown) — format byte-for-byte unchanged
  // ===================================================================
  const exportBtn = el(
    "button",
    "",
    { id: "cmt-export", cls: "cmt-tool-btn", attrs: { "data-cmt-ui": "1" } }
  );
  const exportLabel = document.createTextNode("export comments (");
  const badge = el("span", null, { id: "cmt-badge", text: "0" });
  const exportTail = document.createTextNode(")");
  exportBtn.append(exportLabel, badge, exportTail);

  exportBtn.addEventListener("click", () => {
    showExportModal(buildMarkdown());
  });

  function buildMarkdown() {
    const title = document.title || "untitled";
    const url = window.location.href;
    const lines = [
      `## comments on: ${title}`,
      url,
      `exported: ${new Date().toISOString()}`,
      "",
    ];
    comments.forEach((c, i) => {
      lines.push(`### comment ${i + 1}`);
      c.quote.split("\n").forEach((q) => lines.push(`> ${q}`));
      lines.push("");
      lines.push(c.comment);
      lines.push("");
    });
    return lines.join("\n");
  }

  function showExportModal(md) {
    const overlay = el(
      "div",
      "position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:10001;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif",
      { id: "cmt-export-modal", attrs: { "data-cmt-ui": "1" } }
    );
    const card = el(
      "div",
      "background:#fff;padding:20px 22px;border-radius:12px;width:92%;max-width:680px;box-shadow:0 12px 40px rgba(0,0,0,.2)"
    );
    const header = el(
      "div",
      "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"
    );
    const title = el("h3", "margin:0;font-size:15px;color:#111827;font-weight:600", {
      text: `Export ${comments.length} comment${comments.length === 1 ? "" : "s"}`,
    });
    const closeX = el(
      "button",
      "border:none;background:transparent;cursor:pointer;font-size:18px;color:#6b7280;line-height:1;padding:4px 8px",
      { text: "✕" }
    );
    header.append(title, closeX);

    const hint = el(
      "p",
      "margin:0 0 10px;font-size:12px;color:#6b7280",
      {
        text:
          "Edit the markdown if needed, then Copy → paste back to the agent. Comments stay stored until you Clear; edits here don't write back, so reopening regenerates from the originals.",
      }
    );

    const ta = el(
      "textarea",
      "width:100%;height:320px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.55;padding:10px;border:1px solid #d1d5db;border-radius:8px;box-sizing:border-box;background:#fff;color:#111827"
    );
    ta.value = md;

    const row = el("div", "display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px");
    const clearBtn = el(
      "button",
      "padding:7px 14px;border:1px solid #fca5a5;background:#fff;color:#b91c1c;border-radius:6px;cursor:pointer;font:inherit;font-size:13px",
      { text: "Clear comments" }
    );
    const rightGroup = el("div", "display:flex;gap:8px");
    const closeBtn = el(
      "button",
      "padding:7px 14px;border:1px solid #d1d5db;background:#fff;color:#111827;border-radius:6px;cursor:pointer;font:inherit;font-size:13px",
      { text: "Close" }
    );
    const copyBtn = el(
      "button",
      "padding:7px 14px;border:none;background:#1f2937;color:#fff;border-radius:6px;cursor:pointer;font:inherit;font-size:13px;min-width:96px",
      { text: "Copy" }
    );
    rightGroup.append(closeBtn, copyBtn);
    row.append(clearBtn, rightGroup);

    card.append(header, hint, ta, row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    ta.focus();
    ta.select();

    const close = () => overlay.remove();
    closeX.addEventListener("click", close);
    closeBtn.addEventListener("click", close);

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(ta.value);
        copyBtn.textContent = "Copied ✓";
        copyBtn.style.background = "#10b981";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.style.background = "#1f2937";
        }, 1500);
      } catch (_) {
        ta.focus();
        ta.select();
        copyBtn.textContent = "Press ⌘C";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1800);
      }
    });

    clearBtn.addEventListener("click", () => {
      if (!confirm(`Clear all ${comments.length} comments? This can't be undone.`)) return;
      unwrapMarks(null);
      detachedIds = new Set();
      comments = [];
      save();
      close();
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener(
      "keydown",
      function esc(e) {
        if (e.key === "Escape") {
          close();
          document.removeEventListener("keydown", esc);
        }
      }
    );
  }

  function updateBadge() {
    const n = comments.length;
    badge.textContent = n;
    fabBadge.textContent = n;
    syncDesktopState();
  }

  // ===================================================================
  // Diff / clean toggle (unchanged behavior; relocated for the panel)
  // ===================================================================
  const DIFF_CLEAN_KEY = "preview_diff_clean_v1";
  const hasDiff = !!document.querySelector("del, ins");

  let diffClean = false;
  try {
    diffClean = localStorage.getItem(DIFF_CLEAN_KEY) === "1";
  } catch (_) {
    diffClean = false;
  }
  document.body.classList.toggle("diff-clean", diffClean);

  const diffBtn = el(
    "button",
    "",
    { id: "cmt-diff-toggle", cls: "cmt-tool-btn", attrs: { "data-cmt-ui": "1" } }
  );

  function updateDiffBtn() {
    diffBtn.style.display = hasDiff ? "" : "none";
    diffBtn.textContent = document.body.classList.contains("diff-clean")
      ? "顯示修改"
      : "乾淨版";
  }

  diffBtn.addEventListener("click", () => {
    const clean = document.body.classList.toggle("diff-clean");
    try {
      localStorage.setItem(DIFF_CLEAN_KEY, clean ? "1" : "0");
    } catch (_) {
      /* storage blocked — toggle still works for this session */
    }
    updateDiffBtn();
    // Diff toggle changes which text is present; re-anchor markers so
    // they track the now-visible content.
    placeAllMarkers();
  });

  // ===================================================================
  // Tool button placement: inside the panel footer on desktop, floating
  // bottom-right cluster on mobile. Keeps the 320px panel from hiding
  // them and avoids a scattered fixed-button trio.
  // ===================================================================
  const floatCluster = el("div", "", {
    id: "cmt-float-cluster",
    cls: "cmt-float-cluster",
    attrs: { "data-cmt-ui": "1" },
  });
  document.body.appendChild(floatCluster);

  function placeToolButtons() {
    if (isDesktop()) {
      panelFoot.appendChild(diffBtn);
      panelFoot.appendChild(exportBtn);
    } else {
      floatCluster.appendChild(diffBtn);
      floatCluster.appendChild(exportBtn);
      floatCluster.appendChild(fab);
    }
  }

  // Toggle desktop layout: dock the panel + shift body, or hide it and
  // surface the mobile FAB/sheet path.
  function syncDesktopState() {
    const desktop = isDesktop();
    document.body.classList.toggle("cmt-has-panel", desktop);
    panel.style.display = desktop ? "" : "none";
    fab.style.display = desktop ? "none" : (comments.length ? "" : "none");
    exportBtn.style.display = comments.length ? "" : "none";
    placeToolButtons();
    updateDiffBtn();
  }

  // ===================================================================
  // Boot + re-anchor lifecycle
  // ===================================================================
  function boot() {
    placeAllMarkers();
    updateBadge();
    syncDesktopState();
    if (mutatedOnLoad) save();
  }

  // Alpine may rewrite the DOM after its own init; re-place markers once
  // it has settled. Also re-place on resize across the breakpoint.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  // Alpine dispatches alpine:initialized when ready; re-anchor after it.
  document.addEventListener("alpine:initialized", () => placeAllMarkers());
  // Safety net: re-anchor shortly after load in case Alpine re-rendered
  // without the event (older builds) — idempotent.
  setTimeout(() => placeAllMarkers(), 600);

  let lastDesktop = isDesktop();
  window.addEventListener("resize", () => {
    const now = isDesktop();
    if (now !== lastDesktop) {
      lastDesktop = now;
      if (now) closeSheet();
      syncDesktopState();
    }
  });
})();
