// preview skill: in-page comment overlay (Google Docs-style markers)
//
// Highlight text -> write a comment. The comment leaves a visible yellow
// <mark> on the text and a margin annotation card in the right gutter
// (desktop) or a bottom sheet (mobile). Comments persist to localStorage
// for the review session
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
  const DESKTOP_MIN = 1024; // px; >= is margin layer, < is bottom sheet
  const CARD_GAP = 12; // px vertical gap between cascaded margin cards

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

  // Relative timestamp, pure function of an ISO string. Recomputed on
  // every render (no ticking timer). Hardened: unparseable -> "" so a
  // card never shows "NaN"; negative delta (clock skew / future ts)
  // clamps to 0 -> "now"; old dates use an explicit locale format.
  function relativeTime(ts) {
    const t = Date.parse(ts);
    if (isNaN(t)) return "";
    let delta = Math.floor((Date.now() - t) / 1000);
    if (delta < 0) delta = 0;
    if (delta < 60) return "now";
    if (delta < 3600) return Math.floor(delta / 60) + "m ago";
    if (delta < 86400) return Math.floor(delta / 3600) + "h ago";
    if (delta < 604800) return Math.floor(delta / 86400) + "d ago";
    return new Date(t).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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
            if (p.nodeType === 1) {
              const tag = p.nodeName;
              if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
                return NodeFilter.FILTER_REJECT;
              }
              // Skip anything inside the overlay's own injected UI.
              if (p.dataset && p.dataset.cmtUi === "1") {
                return NodeFilter.FILTER_REJECT;
              }
              // Skip text that is currently hidden. Critical for the
              // diff/clean toggle: in clean view `body.diff-clean del`
              // is display:none — without this, a marker could re-anchor
              // onto removed text the reader cannot see. Walking the
              // ancestor chain once (we're already iterating it) keeps
              // this cheap; getComputedStyle reflects the active CSS gate.
              if (p.hidden) return NodeFilter.FILTER_REJECT;
              const cs = window.getComputedStyle(p);
              if (cs.display === "none" || cs.visibility === "hidden") {
                return NodeFilter.FILTER_REJECT;
              }
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
    // Normalize each parent once after unwrapping: several markers often
    // share a parent (multiple comments in one paragraph), so per-mark
    // normalize() would re-walk the same subtree repeatedly.
    const parents = new Set();
    document.querySelectorAll(sel).forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      parents.add(parent);
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
    });
    parents.forEach((p) => p.normalize());
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
  // Desktop creation button: floats next to the selection (absolute,
  // document coordinates). Triggered by mouseup.
  const addBtn = el(
    "button",
    "position:absolute;display:none;z-index:9999;padding:4px 10px;background:#1f2937;color:#fff;border:none;border-radius:6px;font:500 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)",
    { id: "cmt-add", text: "+ comment", attrs: { "data-cmt-ui": "1" } }
  );
  document.body.appendChild(addBtn);

  // Mobile creation button: a STABLE fixed position (bottom center,
  // above the float cluster). Touch selection never fires mouseup and
  // the OS selection callout covers the selection area, so anchoring a
  // button to the selection is unreliable on phones — keep it parked.
  const addFixed = el("button", "", {
    id: "cmt-add-fixed",
    cls: "cmt-add-fixed",
    text: "+ comment",
    attrs: { "data-cmt-ui": "1" },
  });
  document.body.appendChild(addFixed);

  let pendingText = null;
  let pendingRange = null;

  const UI_SEL =
    "#cmt-add,#cmt-add-fixed,#cmt-modal,#cmt-export-modal," +
    "#cmt-margin-layer,#cmt-sheet,#cmt-sheet-scrim,#cmt-fab,.cmt-mark";

  // Is a node part of the prose (inside main.doc) and NOT inside any
  // overlay-injected UI? Used by both mouseup and selectionchange so a
  // selection inside a card/modal never arms creation.
  function selectionInDoc(sel) {
    if (!sel || sel.rangeCount === 0) return false;
    const doc = document.querySelector("main.doc");
    if (!doc) return false;
    const a = sel.anchorNode;
    const f = sel.focusNode;
    if (!a || !f) return false;
    const aEl = a.nodeType === 1 ? a : a.parentElement;
    const fEl = f.nodeType === 1 ? f : f.parentElement;
    if (!aEl || !fEl) return false;
    if (!doc.contains(aEl) || !doc.contains(fEl)) return false;
    if (aEl.closest("[data-cmt-ui]") || fEl.closest("[data-cmt-ui]")) {
      return false;
    }
    return true;
  }

  document.addEventListener("mouseup", (e) => {
    // Touch browsers (e.g. Android Chrome) synthesize mouseup after a
    // selection. Without this guard the absolute desktop #cmt-add button
    // would appear on mobile alongside the fixed #cmt-add-fixed. The
    // selectionchange handler has the mirror guard (isDesktop early-out).
    if (!isDesktop()) {
      addBtn.style.display = "none";
      return;
    }
    if (e.target.closest(UI_SEL)) return;
    const sel = window.getSelection();
    const text = sel && sel.toString().trim();
    if (!text || sel.rangeCount === 0 || !selectionInDoc(sel)) {
      addBtn.style.display = "none";
      pendingText = null;
      pendingRange = null;
      return;
    }
    pendingText = text;
    pendingRange = sel.getRangeAt(0).cloneRange();
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    // addBtn is position:absolute appended directly to <body>. This
    // relies on the SAME body{margin:0} + no-positioned-ancestor
    // absolute-positioning containing-block invariant documented for
    // the margin layer: viewport rect + scroll offset == document
    // coords only because the offset parent is the ICB. A future
    // refactor that wraps <body> in a positioned element breaks both.
    addBtn.style.left = rect.right + window.scrollX + 8 + "px";
    addBtn.style.top = rect.top + window.scrollY - 4 + "px";
    addBtn.style.display = "block";
  });

  addBtn.addEventListener("click", () => {
    if (!pendingText || !pendingRange) return;
    openModal(pendingText, pendingRange);
    addBtn.style.display = "none";
  });

  // --- Mobile: selectionchange-driven creation -----------------------
  // selectionchange fires for touch selection (mouseup does not). Debounce
  // it (it fires rapidly while dragging handles). Only capture when the
  // selection is non-empty AND inside main.doc AND outside any
  // [data-cmt-ui] node. On collapse, hide the button but DEFER nulling
  // pendingRange: iOS Safari collapses the selection the instant the user
  // taps the button, so the captured range must outlive the collapse.
  let selDebounce = null;
  function onSelectionChange() {
    if (isDesktop()) return; // desktop uses mouseup
    if (selDebounce) clearTimeout(selDebounce);
    selDebounce = setTimeout(() => {
      const sel = window.getSelection();
      const text = sel && sel.toString().trim();
      if (!text || sel.rangeCount === 0 || !selectionInDoc(sel)) {
        // Hide but keep pendingRange — a button tap may already be in
        // flight after the OS collapsed the selection.
        document.body.classList.remove("cmt-add-visible");
        return;
      }
      pendingText = text;
      pendingRange = sel.getRangeAt(0).cloneRange();
      document.body.classList.add("cmt-add-visible");
    }, 250);
  }
  document.addEventListener("selectionchange", onSelectionChange);

  // pointerdown + mousedown preventDefault so a (rare) pointer/mouse
  // press on the fixed button does NOT collapse the live selection
  // before the open fires. We deliberately do NOT preventDefault on
  // touchstart: doing so suppresses the synthesized click on touch
  // browsers and kills the only mobile create path. It is also
  // unnecessary for selection preservation on touch — pendingText /
  // pendingRange are captured in the debounced selectionchange handler
  // BEFORE the tap and intentionally retained on selection collapse, so
  // losing the live selection to the tap is already harmless here.
  function guardPress(e) {
    e.preventDefault();
  }
  addFixed.addEventListener("pointerdown", guardPress);
  addFixed.addEventListener("mousedown", guardPress);

  // Open the create modal from the retained pending selection. Guarded
  // against a double-open: touchend fires first (and preventDefault()s
  // its own synthesized click), but a stray click could still arrive on
  // some browsers, so a short re-entrancy latch coalesces them.
  let openingFromFixed = false;
  function openFromFixed() {
    if (openingFromFixed) return;
    if (!pendingText || !pendingRange) return;
    openingFromFixed = true;
    document.body.classList.remove("cmt-add-visible");
    openModal(pendingText, pendingRange);
    setTimeout(() => {
      openingFromFixed = false;
    }, 400);
  }
  // touchend: the reliable mobile open. preventDefault() here stops the
  // browser from also dispatching the duplicate synthesized click.
  addFixed.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      openFromFixed();
    },
    { passive: false }
  );
  // click: desktop / non-touch path (and a fallback if touchend was
  // missed). The latch prevents a second modal when both fire.
  addFixed.addEventListener("click", openFromFixed);

  // Map a Range boundary (node, offset) to an absolute index into the
  // concatenated text built by collectTextNodes(). Returns -1 if the
  // boundary's text node isn't in the collected set.
  function indexOfBoundary(nodes, container, offset) {
    if (container.nodeType === 3) {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].node === container) return nodes[i].start + offset;
      }
      return -1;
    }
    // Element container: offset is a child index. Resolve to the first
    // collected text node at/after that child position.
    const child = container.childNodes[offset] || null;
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i].node;
      if (child && (nd === child || (child.contains && child.contains(nd)))) {
        return nodes[i].start;
      }
      if (!child && container.contains(nd)) {
        // offset past last child: end of container's text
        return nodes[i].end;
      }
    }
    return -1;
  }

  // Build a TextQuoteSelector anchor from a live Range.
  //
  // exact MUST be sliced from the SAME concatenated text that findRange()
  // searches, not from range.toString(). Browsers insert "\n" between
  // block elements in Selection/Range.toString(), but collectTextNodes()
  // concatenates raw nodeValues with no separator. Using toString() for a
  // cross-block selection would store an `exact` containing newlines that
  // findRange() can never locate, detaching the comment on the next pass.
  function buildAnchor(range) {
    const { nodes, text } = collectTextNodes();
    let start = indexOfBoundary(nodes, range.startContainer, range.startOffset);
    let end = indexOfBoundary(nodes, range.endContainer, range.endOffset);

    let exact;
    if (start !== -1 && end !== -1 && end > start) {
      exact = text.slice(start, end);
    } else {
      // Fallback: container mapping failed (e.g. selection touches a node
      // collectTextNodes skipped). Use toString() and try to find it.
      exact = range.toString();
      if (!exact) return null;
      const found = text.indexOf(exact);
      if (found === -1) {
        // Last resort: keep toString() value; findRange() will likely
        // mark it detached, which is the documented graceful degrade.
        return { exact: exact, prefix: "", suffix: "" };
      }
      start = found;
      end = found + exact.length;
    }
    if (!exact) return null;
    const prefix = text.slice(Math.max(0, start - CTX), start);
    const suffix = text.slice(end, end + CTX);
    // Record whether the captured window actually omitted any text upstream
    // / downstream — checking `.length >= CTX` at render time can't tell the
    // exact-boundary case (e.g. `start === CTX`, where `prefix.length === CTX`
    // but the window spans the entire doc prefix with nothing truncated)
    // apart from the truncating case (e.g. `start > CTX`).
    return {
      exact: exact,
      prefix: prefix,
      suffix: suffix,
      prefixTruncated: start > CTX,
      suffixTruncated: end + CTX < text.length,
    };
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

    // Clear the captured selection on every teardown path (cancel,
    // overlay click, Escape, and the trailing close() inside commit()).
    // Without this the pending range survives; combined with the
    // deliberate keep-on-selectionchange-collapse behavior a later
    // button tap could reopen the modal on a stale range. The
    // keep-on-collapse path in onSelectionChange is unaffected — it
    // never calls close().
    const close = () => {
      overlay.remove();
      pendingText = null;
      pendingRange = null;
    };
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
  // Desktop margin layer (>=1024px)
  // ===================================================================
  // INVARIANT: the margin layer is a DIRECT child of <body>. <body> has
  // margin:0 (set in template.html) and no positioned / transformed /
  // will-change / contain ancestor exists, so the layer's containing
  // block is the initial containing block. The layer is
  // position:absolute; top:0 (CSS starts it at height:0), therefore a
  // child card's `top` value equals its target Y in DOCUMENT
  // coordinates 1:1 (rect.top + window.scrollY). Do NOT reparent this
  // layer under any positioned element or the cards will be offset.
  // layoutCards() then sets the layer's height to the lowest laid-out
  // card's bottom so cards placed past main.doc's natural end still
  // grow document.scrollHeight and remain reachable; layout is
  // idempotent so the resulting ResizeObserver refire converges (its
  // lastH dedupe stops it after one repeat).
  const marginLayer = el("div", "", {
    id: "cmt-margin-layer",
    cls: "cmt-margin-layer",
    attrs: { "data-cmt-ui": "1" },
  });
  document.body.appendChild(marginLayer);

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

    // Card content top->bottom: quote -> relative time -> comment body.
    // No name, no avatar (data model has none and the design forbids it).
    const q = el("div", "", { cls: "cmt-card-quote", text: quoteSnippet(c.quote) });
    const children = [q];
    const rel = relativeTime(c.ts);
    if (rel) {
      children.push(el("div", "", { cls: "cmt-card-time", text: rel }));
    }
    const body = el("div", "", { cls: "cmt-card-body", text: c.comment });
    children.push(body);
    cardEl.append.apply(cardEl, children);

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
    const editBtn = el("button", "", { cls: "cmt-act", text: "Edit" });
    const delBtn = el("button", "", { cls: "cmt-act cmt-act-del", text: "Delete" });
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
    const saveB = el("button", "", { cls: "cmt-act", text: "Save" });
    const cancelB = el("button", "", { cls: "cmt-act", text: "Cancel" });
    row.append(saveB, cancelB);
    ta.after(row);

    // The textarea + actions row make this card taller than its rendered
    // body. Desktop cards are absolutely positioned via the cascade in
    // layoutCards(), so without a relayout a lower card can overlap the
    // open editor. Reuse the single debounced scheduler: once after the
    // swap, and again on every keystroke as the textarea grows (the
    // existing ~100ms debounce coalesces input bursts — no new timer).
    // On mobile scheduleLayout()/layoutCards() early-returns, so this is
    // inert there. Save/Cancel both run finish() -> renderPanel() ->
    // scheduleLayout(), restoring the normal cascade.
    scheduleLayout();
    ta.addEventListener("input", scheduleLayout);

    const finish = () => {
      renderPanel();
      rerenderSheetIfOpen();
    };
    saveB.addEventListener("click", () => {
      const v = ta.value.trim();
      if (v) {
        c.comment = v;
        // A range spanning multiple text nodes produces several <mark>
        // elements sharing one data-cmt-id — update them all.
        document
          .querySelectorAll('.cmt-mark[data-cmt-id="' + cssEsc(c.id) + '"]')
          .forEach((m) => {
            m.setAttribute("aria-label", "comment: " + v.slice(0, 60));
          });
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
    if (sheetMode === "single" && sheetCurrentId === id) {
      // The single-comment sheet now has nothing to show.
      closeSheet();
    }
    save();
    rerenderSheetIfOpen();
    announce("comment deleted");
  }

  // renderPanel() keeps its name (every call site already invokes it on
  // add/edit/delete) but now rebuilds the desktop margin layer and then
  // funnels positioning through the single debounced scheduler. The
  // mobile bottom sheet is rendered separately via buildCard().
  function renderPanel() {
    if (marginLayer) {
      // Don't wipe an open inline editor. placeAllMarkers() (600ms boot
      // safety net, alpine:initialized re-anchor) calls renderPanel()
      // unconditionally; rebuilding the layer here would destroy a
      // `.cmt-edit-ta` the user is mid-typing in. Marker re-anchoring
      // (in placeAllMarkers, on the prose) already ran and ids are
      // stable, so keeping the current cards is safe — the rebuild is
      // deferred until the edit finishes (finish() calls renderPanel()).
      if (marginLayer.querySelector(".cmt-edit-ta")) {
        syncDesktopState();
        scheduleLayout();
        return;
      }
      marginLayer.textContent = "";
      if (isDesktop()) {
        orderedComments().forEach((c) => marginLayer.appendChild(buildCard(c)));
      }
    }
    syncDesktopState();
    scheduleLayout();
  }

  // Position every margin card. Order by marker Y (orderedComments),
  // walk top->bottom, place each at max(markerY, prevBottom + GAP) —
  // cascading push so close markers never overlap. Detached cards (no
  // marker) stack after all anchored cards at the column bottom.
  //
  // Layout-thrash guard: this is a strict write -> read -> write batch.
  // (1) cards are already in the DOM from renderPanel() (write).
  // (2) read ALL marker Ys and ALL card heights first (read phase).
  // (3) set ALL `top` values last (write phase). No interleaved
  // read/write per card.
  function layoutCards() {
    if (!marginLayer || !isDesktop()) {
      // Not desktop / layer inert: collapse so it never reserves
      // scroll height on mobile (where the sheet path is used).
      if (marginLayer) marginLayer.style.height = "0px";
      return;
    }
    const cards = Array.prototype.slice.call(
      marginLayer.querySelectorAll(".cmt-card")
    );
    if (!cards.length) {
      marginLayer.style.height = "0px";
      return;
    }

    // READ phase: marker Y (document coords) + card height for each.
    const measured = cards.map((card) => {
      const id = card.getAttribute("data-cmt-id");
      const m = document.querySelector(
        '.cmt-mark[data-cmt-id="' + cssEsc(id) + '"]'
      );
      let markerY = null;
      if (m) {
        const r = m.getBoundingClientRect();
        markerY = r.top + window.scrollY;
      }
      return { card: card, markerY: markerY, h: card.offsetHeight };
    });

    // COMPUTE phase: anchored cards cascade by marker Y; detached cards
    // (markerY == null) stack after, keyed off the last bottom.
    let prevBottom = -Infinity;
    const tops = measured.map((mi) => {
      let top;
      if (mi.markerY != null) {
        top = Math.max(mi.markerY, prevBottom + CARD_GAP);
      } else {
        top = prevBottom + CARD_GAP;
        if (!isFinite(top)) top = 0;
      }
      prevBottom = top + mi.h;
      return top;
    });

    // WRITE phase: apply all tops.
    measured.forEach((mi, i) => {
      mi.card.style.top = tops[i] + "px";
    });

    // Extend the (otherwise height:0, out-of-flow) layer down to the
    // lowest card's bottom so cards placed past the natural end of
    // main.doc — a comment near the doc bottom, or a downward cascade —
    // still grow document.scrollHeight and stay scrollable/reachable.
    // tops[i] is already in document coords (layer is top:0 against the
    // ICB; see the INVARIANT comment), so top + card height is the
    // card's document-space bottom; the max over all cards is the
    // needed layer height.
    let maxBottom = 0;
    for (let i = 0; i < measured.length; i++) {
      const b = tops[i] + measured[i].h;
      if (b > maxBottom) maxBottom = b;
    }
    // Idempotent: same markers -> same tops -> same maxBottom, so a
    // ResizeObserver refire (this write can grow body height once)
    // recomputes the identical value; the RO's lastH dedupe then stops
    // it. Convergence in <=2 passes — do NOT weaken that guard.
    marginLayer.style.height = maxBottom + "px";
  }

  // Single debounced scheduler. Every recompute hook (load / resize /
  // ResizeObserver / 600ms net / alpine:initialized) routes here so the
  // layout pass runs at most once per burst, AFTER markers are placed.
  // NEVER call layoutCards() synchronously from a ResizeObserver
  // callback — that risks a resize-observer loop. The ~100ms setTimeout
  // breaks that cycle and defers the read past the current task's
  // style/layout flush; layoutCards() forces its own reflow via
  // offsetHeight, so an extra rAF is unnecessary (and would stall when
  // frames are starved, e.g. a background/headless tab).
  let layoutTimer = null;
  function scheduleLayout() {
    if (layoutTimer) clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      layoutTimer = null;
      layoutCards();
    }, 100);
  }

  // Click a marker -> flash its margin card (desktop) or open the sheet
  // (mobile).
  document.addEventListener("click", (e) => {
    const m = e.target.closest(".cmt-mark");
    if (!m) return;
    const id = m.getAttribute("data-cmt-id");
    if (isDesktop()) {
      // Click a marker -> scroll the page so the marker is visible, then
      // flash its margin card. Cards are absolutely positioned in
      // document coordinates so a plain page scroll already keeps the
      // card paired with its text; we only need to flash it.
      scrollToEl(m);
      const card =
        marginLayer &&
        marginLayer.querySelector(
          '.cmt-card[data-cmt-id="' + cssEsc(id) + '"]'
        );
      if (card) flash(card);
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
  // Track what the open sheet is showing so edit/delete can refresh it
  // (renderPanel() only rebuilds the desktop list, not the mobile sheet).
  let sheetMode = null; // "single" | "all" | null
  let sheetCurrentId = null;

  function rerenderSheetIfOpen() {
    if (!sheet) return;
    const body = sheet.querySelector(".cmt-sheet-body");
    if (!body) return;
    body.textContent = "";
    if (sheetMode === "single" && sheetCurrentId) {
      const c = comments.find((x) => x.id === sheetCurrentId);
      if (c) body.appendChild(buildCard(c));
      else
        body.appendChild(
          el("div", "", { cls: "cmt-empty", text: "No comments yet." })
        );
    } else if (sheetMode === "all") {
      const ordered = orderedComments();
      if (!ordered.length) {
        body.appendChild(
          el("div", "", { cls: "cmt-empty", text: "No comments yet." })
        );
      } else {
        ordered.forEach((c) => body.appendChild(buildCard(c)));
      }
    }
  }

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
    // Only unlock if a sheet was actually open. The resize handler calls
    // closeSheet() on every breakpoint crossing; an unconditional
    // unlockScroll() would window.scrollTo(0, savedScrollY=0) and jump
    // the page to the top even when no sheet existed.
    const wasOpen = !!sheet || !!sheetScrim;
    if (sheet) sheet.remove();
    if (sheetScrim) sheetScrim.remove();
    sheet = null;
    sheetScrim = null;
    sheetMode = null;
    sheetCurrentId = null;
    if (wasOpen) unlockScroll();
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
    sheetMode = "single";
    sheetCurrentId = id;
    const body = ensureSheet();
    body.appendChild(buildCard(c));
  }

  function openSheetAll() {
    sheetMode = "all";
    sheetCurrentId = null;
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
  // Export (markdown) — v2 entries render the selected exact span with
  // surrounding context (…prefix **exact** suffix…); v1 entries (no
  // anchor) fall back to the bare quote and stay unchanged.
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

  // Escape every `\`, `*`, and `_` so neither prefix/suffix text nor the
  // `exact` span can collide with the `**…**` wrappers we add around the
  // selected span. `*` / `_` handle the obvious emphasis-marker cases
  // (`*italic*`, `__bold__`, prefix ending in `*`). `\` handles a subtler
  // case: a trailing backslash in prefix (e.g. captured around a Windows
  // path like `C:\`) would, after concatenation with `**`, become `\**`
  // — CommonMark reads that as an escaped `*` plus a stray `*`, breaking
  // the bold opener and dropping the highlight. Escape `\` first (by
  // ordering it first in the alternation) so we don't double-escape the
  // backslashes we ourselves introduce.
  function escapeEmphasisMarkers(s) {
    return s.replace(/([\\*_])/g, "\\$1");
  }

  // Collapse internal whitespace runs (incl. newlines) in prefix / suffix
  // to a single space. The anchor's prefix / suffix windows are sliced
  // from raw DOM text-node concatenation and can include layout newlines
  // and indentation whitespace; those leak into the exported blockquote
  // as multi-line `>` blocks and (if a line happens to start with `>` or
  // `#`) as nested-quote or heading artifacts. Single-line context is
  // sufficient for disambiguating which occurrence the reader selected.
  function flattenContextWindow(s) {
    return s.replace(/\s+/g, " ");
  }

  // Build the markdown quote for a comment. When the entry carries an
  // anchor ({ exact, prefix, suffix } — captured at selection time with
  // CTX chars on each side), wrap the selected span in **...** and prepend
  // the prefix / append the suffix so an agent reading the exported
  // markdown can disambiguate when the same text appears multiple times
  // on the page. Outer `…` mark that the context window is truncated.
  // v1 entries (no anchor) fall back to the bare quote.
  function renderQuoteWithContext(c) {
    const a = c.anchor;
    if (!a || !a.exact) return c.quote;
    // buildAnchor records prefixTruncated / suffixTruncated booleans so
    // we can mark `…` only when text was actually omitted. Older entries
    // (saved before those flags existed) fall back to a length heuristic
    // — slightly off in the exact-CTX-boundary case, but correct enough
    // for legacy data we can't recompute.
    const prefixTruncated =
      typeof a.prefixTruncated === "boolean"
        ? a.prefixTruncated
        : !!(a.prefix && a.prefix.length >= CTX);
    const suffixTruncated =
      typeof a.suffixTruncated === "boolean"
        ? a.suffixTruncated
        : !!(a.suffix && a.suffix.length >= CTX);
    const prefix = a.prefix
      ? (prefixTruncated ? "…" : "") +
        flattenContextWindow(escapeEmphasisMarkers(a.prefix))
      : "";
    const suffix = a.suffix
      ? flattenContextWindow(escapeEmphasisMarkers(a.suffix)) +
        (suffixTruncated ? "…" : "")
      : "";
    // Wrap each line of `exact` separately so multi-line selections still
    // render as bold per-line — CommonMark won't bold across a hard line
    // break inside the same `**…**` pair. Lift each line's leading and
    // trailing whitespace OUTSIDE the wrapper too: `** foo **` is not a
    // valid CommonMark strong emphasis run (the opener can't be followed
    // by whitespace, the closer can't be preceded by it), so wrapping a
    // drag-selection that picked up edge whitespace would silently lose
    // the highlight. Lines that are all whitespace or empty stay
    // unwrapped to avoid `****` runs.
    const exact = escapeEmphasisMarkers(a.exact)
      .split("\n")
      .map((line) => {
        if (!line) return line;
        const m = line.match(/^(\s*)([\s\S]*?)(\s*)$/);
        if (!m || !m[2]) return line;
        return `${m[1]}**${m[2]}**${m[3]}`;
      })
      .join("\n");
    return `${prefix}${exact}${suffix}`;
  }

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
      renderQuoteWithContext(c)
        .split("\n")
        .forEach((q) => lines.push(`> ${q}`));
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

    // Single teardown for every close path (✕ / Close / Clear / overlay
    // click / Escape). Must also detach the document-level keydown
    // listener — otherwise every open→close-without-Escape cycle leaks
    // one listener holding a closure over the removed overlay.
    const close = () => {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
    };
    function onKeydown(e) {
      if (e.key === "Escape") close();
    }
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
    document.addEventListener("keydown", onKeydown);
  }

  function updateBadge() {
    const n = comments.length;
    badge.textContent = n;
    fabBadge.textContent = n;
    syncDesktopState();
  }

  // ===================================================================
  // Diff / clean toggle (unchanged behavior; lives in the float cluster)
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
      ? "Show edits"
      : "Clean";
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
  // Tool button placement: the desktop panel footer is gone, so Export +
  // diff toggle live in the floating bottom-right cluster on EVERY
  // viewport now. The mobile-only "comments (N)" FAB joins it on mobile.
  // ===================================================================
  const floatCluster = el("div", "", {
    id: "cmt-float-cluster",
    cls: "cmt-float-cluster",
    attrs: { "data-cmt-ui": "1" },
  });
  document.body.appendChild(floatCluster);

  function placeToolButtons() {
    // Stable order in the cluster: diff toggle, export, then (mobile
    // only) the list FAB. appendChild is idempotent — re-appending an
    // existing child just reorders, it does not duplicate.
    floatCluster.appendChild(diffBtn);
    floatCluster.appendChild(exportBtn);
    if (!isDesktop()) floatCluster.appendChild(fab);
  }

  // Reserve the right gutter only when >=1 comment exists (full-width on
  // a zero-comment first draft). Surface the margin layer on desktop, the
  // FAB/sheet path on mobile.
  function syncDesktopState() {
    const desktop = isDesktop();
    const hasComments = comments.length > 0;
    document.body.classList.toggle("cmt-has-margin", desktop && hasComments);
    if (marginLayer) marginLayer.style.display = desktop ? "" : "none";
    fab.style.display = desktop ? "none" : (hasComments ? "" : "none");
    exportBtn.style.display = hasComments ? "" : "none";
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
  // placeAllMarkers() ends in renderPanel() -> scheduleLayout(), so the
  // margin pass is funneled through the single scheduler automatically.
  document.addEventListener("alpine:initialized", () => placeAllMarkers());
  // Safety net: re-anchor shortly after load in case Alpine re-rendered
  // without the event (older builds) — idempotent, still scheduler-gated.
  setTimeout(() => placeAllMarkers(), 600);

  // Late web-font / image reflow shifts marker Y after `load`. Just
  // schedule a relayout (markers don't need re-anchoring, only
  // repositioning) through the shared debounced scheduler.
  window.addEventListener("load", scheduleLayout);

  let lastDesktop = isDesktop();
  window.addEventListener("resize", () => {
    const now = isDesktop();
    if (now !== lastDesktop) {
      lastDesktop = now;
      // cmt-add-visible is only added on mobile and never removed on a
      // breakpoint cross; clear it so #cmt-add-fixed cannot persist onto
      // desktop. The @media (min-width:1024px) rule also hides it — both
      // are cheap, keep both.
      document.body.classList.remove("cmt-add-visible");
      if (now) closeSheet();
      // Crossing into desktop must (re)build the margin cards;
      // renderPanel() rebuilds + reschedules layout. Crossing into
      // mobile: renderPanel() clears the layer + syncs state.
      renderPanel();
    } else {
      // Same breakpoint, width changed: prose wrap shifts marker Y.
      scheduleLayout();
    }
  });

  // Post-load reflow (lazy images, async content, font swaps) changes
  // body height and marker Ys. A debounced ResizeObserver catches what
  // `load` misses. CRITICAL: never relayout synchronously here — route
  // through scheduleLayout() (debounced setTimeout) so we don't trip a
  // resize-observer loop. layoutCards() now sets the margin layer's
  // height to the lowest card's bottom, so this write CAN grow body's
  // box and fire the RO once — that is intentional and safe: layout is
  // idempotent (same markers -> same tops -> same computed height), so
  // the next pass writes the identical height and the lastH dedupe
  // below halts it (convergence in <=2 passes).
  //
  // Hardening: dedupe on body height (skip when unchanged so a
  // steady-state RO callback can never re-arm the scheduler) and only
  // schedule when the margin layer is actually live (desktop + >=1
  // comment). Keeps the single debounced-scheduler design.
  if (typeof ResizeObserver === "function") {
    let lastH = -1;
    const ro = new ResizeObserver(() => {
      const h = document.body.offsetHeight;
      if (h === lastH) return;
      lastH = h;
      if (isDesktop() && comments.length) scheduleLayout();
    });
    ro.observe(document.body);
  }
})();
