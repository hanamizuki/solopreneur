// preview skill: Library chrome injected into every item entry page.
//
// Four pieces of chrome, all inside a Shadow DOM so the shell's styles
// never leak into (or inherit from) the preview content:
//   1. a library sidebar (active + archive sections, archive collapsed,
//      current page marked; archive rows with supersededBy nest under
//      their canonical as "Earlier copies"). Expand/collapse is one
//      concept: a floating expand control when closed; the same control
//      relocates into the sidebar head when open (no folder glyph, no ✕).
//      On wide viewports the open state is a PUSH layout (page content
//      shifts right, no scrim); on narrow viewports it stays an overlay
//      drawer with scrim. Open/closed is remembered in localStorage
//      across pages in the same origin.
//   2. a Manage section at the bottom of the sidebar — toggle checkboxes
//      on rows and "Copy instructions" to build a library archive request
//      for an agent (read-only; no filesystem / deploy from the page);
//   3. a provenance footer ("who produced / last updated" this preview),
//      rendered from the display shape resolve-provenance.mjs returns;
//   4. a Share request block — it does NOT deploy and holds NO token; it
//      builds a copyable request that a /preview agent later consumes.
//
// Data flow: the builder injects the CURRENT item's metadata (id, title,
// revision, timestamps, contentHash, resolved provenance) as a trusted
// JSON island (<script id="preview-shell-data" type="application/json">).
// The full catalog for the sidebar is fetched from /directory.json (the
// same file the Library index is generated from) — a single source, not
// duplicated into every page.
//
// Pure client-side, no backend, no build step, no external dependency.
//
// The file is dual-target: it runs as a browser classic <script>, and it
// is importable by Node's node:test to unit-test the pure helpers. The
// DOM-free helpers are defined first and exported through a CommonJS
// guard; the browser boot runs only when a document exists.

(function () {
  "use strict";

  // Schema version of the Share REQUEST contract (not the preview schema).
  // A /preview agent consuming a pasted request keys off this.
  const SHARE_SCHEMA_VERSION = 1;

  // Access options for a Share request. project-members is the default
  // (least-surprising, matches a private target); anyone-with-link is the
  // deliberate opt-in. The request only STATES the desired access — it
  // performs no deploy and carries no token.
  const ACCESS_OPTIONS = ["project-members", "anyone-with-link"];

  // Sidebar layout: wide enough to push content; narrower = temporary overlay.
  const SIDEBAR_WIDTH_PX = 300;
  const SIDEBAR_PUSH_MIN_PX = 720;
  // Origin-scoped; only this shell reads/writes it. Values: "open" | "closed".
  const SIDEBAR_STORAGE_KEY = "preview_shell_sidebar";

  // ===================================================================
  // Pure, DOM-free helpers (also the Node unit-test seam)
  // ===================================================================

  // "push" = docked panel that reserves layout space; "overlay" = drawer +
  // scrim. Pure so unit tests pin the breakpoint without a window.
  function sidebarLayoutMode(viewportWidthPx, minPushPx) {
    const w = Number(viewportWidthPx);
    const min = Number(minPushPx);
    if (!Number.isFinite(w) || !Number.isFinite(min)) return "overlay";
    return w >= min ? "push" : "overlay";
  }

  // localStorage value -> whether to restore open on boot. Anything other
  // than the exact string "open" is closed (including missing / corrupt).
  function sidebarStoredOpen(stored) {
    return stored === "open";
  }

  // Group a directory.json item list into { active, archive }, each sorted
  // updatedAt DESC then id ASC. The builder already emits them in that
  // order, but the shell must not assume it (a hand-edited or partial
  // directory.json must still render sanely). Any collection that is not
  // "archive" falls into the active section.
  function groupDirectory(items) {
    const list = Array.isArray(items) ? items.slice() : [];
    const instant = (s) => {
      const t = Date.parse(s);
      return Number.isNaN(t) ? -Infinity : t;
    };
    list.sort((a, b) => {
      const ta = instant(a && a.updatedAt);
      const tb = instant(b && b.updatedAt);
      if (ta !== tb) return tb - ta; // newer first
      const ia = (a && a.id) || "";
      const ib = (b && b.id) || "";
      return ia < ib ? -1 : ia > ib ? 1 : 0;
    });
    const groups = { active: [], archive: [] };
    for (const it of list) {
      if (!it || typeof it.id !== "string") continue;
      (it.collection === "archive" ? groups.archive : groups.active).push(it);
    }
    return groups;
  }

  // Same updatedAt DESC / id ASC order as groupDirectory. Shared so
  // groupArchiveWithSuperseded can re-sort child lists without duplicating
  // the comparator.
  function sortCatalogItems(list) {
    const arr = Array.isArray(list) ? list.slice() : [];
    const instant = (s) => {
      const t = Date.parse(s);
      return Number.isNaN(t) ? -Infinity : t;
    };
    arr.sort((a, b) => {
      const ta = instant(a && a.updatedAt);
      const tb = instant(b && b.updatedAt);
      if (ta !== tb) return tb - ta;
      const ia = (a && a.id) || "";
      const ib = (b && b.id) || "";
      return ia < ib ? -1 : ia > ib ? 1 : 0;
    });
    return arr;
  }

  // Fold archive rows that declare supersededBy:<canonicalId> under that
  // canonical when the canonical is ALSO in the archive list. Copies whose
  // target is missing or only in active stay top-level (do not drop them).
  // Returns { topLevel: Item[], childrenOf: { [canonicalId]: Item[] } }.
  function groupArchiveWithSuperseded(archiveItems) {
    const list = sortCatalogItems(archiveItems);
    const inArchive = new Map();
    for (const it of list) {
      if (it && typeof it.id === "string") inArchive.set(it.id, it);
    }
    const childrenOf = Object.create(null);
    const nested = new Set();
    for (const it of list) {
      if (!it || typeof it.id !== "string") continue;
      const target = it.supersededBy;
      if (typeof target === "string" && target && target !== it.id && inArchive.has(target)) {
        if (!childrenOf[target]) childrenOf[target] = [];
        childrenOf[target].push(it);
        nested.add(it.id);
      }
    }
    for (const k of Object.keys(childrenOf)) {
      childrenOf[k] = sortCatalogItems(childrenOf[k]);
    }
    const topLevel = list.filter((it) => it && typeof it.id === "string" && !nested.has(it.id));
    return { topLevel, childrenOf };
  }

  // Build the agent-facing archive request text. Empty archive/restore
  // sections are OMITTED entirely (no "- (none)" noise). Titles fall back
  // to id. `exported` is supplied by the caller so unit tests stay pure.
  // Chinese section headers are part of the agent parse contract (not UI chrome).
  function buildArchiveRequest(o) {
    const src = o && typeof o === "object" ? o : {};
    // libraryLabel: prefer an explicit string (shell/config). Browser path
    // falls back to location.host or the literal "library" — never invents
    // absolute local paths the page cannot know.
    const libraryLabel =
      typeof src.libraryLabel === "string" && src.libraryLabel
        ? src.libraryLabel
        : "library";
    const exported = typeof src.exported === "string" ? src.exported : "";
    const archive = Array.isArray(src.archive) ? src.archive : [];
    const restore = Array.isArray(src.restore) ? src.restore : [];

    const lines = [
      "## library archive request",
      "library: " + libraryLabel,
      "exported: " + exported,
      "",
    ];
    const bullet = (it) => {
      const id = it && typeof it.id === "string" ? it.id : "";
      const title =
        it && typeof it.title === "string" && it.title ? it.title : id;
      return "- " + id + " — " + title;
    };
    if (archive.length) {
      lines.push("archive（active → archive）：");
      for (const it of archive) lines.push(bullet(it));
      lines.push("");
    }
    if (restore.length) {
      lines.push("restore（archive → active）：");
      for (const it of restore) lines.push(bullet(it));
      lines.push("");
    }
    lines.push(
      "（給 agent：對每個 id 做 mv <root>/<from>/<id> <root>/<to>/<id>，全部完成後重新發布 library。）"
    );
    return lines.join("\n");
  }

  // Resolve the library: label for archive requests in the browser.
  // Prefer shell.library / shell.configPath / shell.root when the builder
  // injects one; else the deployment host; else the literal "library".
  function resolveLibraryLabel(shell) {
    const s = shell && typeof shell === "object" ? shell : {};
    for (const key of ["library", "configPath", "root"]) {
      if (typeof s[key] === "string" && s[key]) return s[key];
    }
    try {
      if (typeof location !== "undefined" && location && location.host) {
        return location.host;
      }
    } catch (_) { /* non-browser */ }
    return "library";
  }

  // A resolved provenance party ({ agent?, platform?, sessionTitle? }) as a
  // single display line. Empty / missing -> "unrecorded" (never fabricated;
  // mirrors resolve-provenance.mjs's "never guess" contract).
  function partyLine(party) {
    if (!party || typeof party !== "object") return "unrecorded";
    const parts = [];
    if (typeof party.agent === "string" && party.agent) parts.push(party.agent);
    if (typeof party.platform === "string" && party.platform) parts.push(party.platform);
    if (typeof party.sessionTitle === "string" && party.sessionTitle) parts.push(party.sessionTitle);
    return parts.length ? parts.join(" · ") : "unrecorded";
  }

  // Turn the injected shell data into a footer model. Consumes the exact
  // shape resolve-provenance.mjs returns: { producedBy } (creator ==
  // updater -> one line) or { createdBy, lastUpdatedBy } (distinct -> two
  // lines). Timestamps are passed through as ISO for the renderer to
  // localize; the model itself stays pure (no Intl, no DOM).
  function footerModel(shell) {
    const s = shell && typeof shell === "object" ? shell : {};
    const prov = s.provenance && typeof s.provenance === "object" ? s.provenance : { producedBy: {} };
    const model = {
      createdAt: typeof s.createdAt === "string" ? s.createdAt : null,
      updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : null,
      revision: s.revision,
    };
    if (prov.producedBy !== undefined) {
      model.mode = "produced";
      model.producedBy = partyLine(prov.producedBy);
    } else {
      model.mode = "distinct";
      model.createdBy = partyLine(prov.createdBy);
      model.lastUpdatedBy = partyLine(prov.lastUpdatedBy);
    }
    return model;
  }

  // Build the Share REQUEST object. An unknown/absent access falls back to
  // the project-members default. This is the contract carried in the
  // copyable text: schemaVersion, preview id, revision, contentHash, the
  // current item URL, and the chosen access.
  function buildShareRequest(o) {
    const src = o && typeof o === "object" ? o : {};
    const access = ACCESS_OPTIONS.indexOf(src.access) !== -1 ? src.access : ACCESS_OPTIONS[0];
    return {
      schemaVersion: SHARE_SCHEMA_VERSION,
      kind: "preview-share-request",
      previewId: typeof src.id === "string" && src.id ? src.id : null,
      revision: src.revision != null ? src.revision : null,
      contentHash: typeof src.contentHash === "string" && src.contentHash ? src.contentHash : null,
      url: typeof src.url === "string" && src.url ? src.url : null,
      access,
    };
  }

  // The copyable request text — pretty JSON, a clean machine + human
  // contract.
  function shareRequestText(req) {
    return JSON.stringify(req, null, 2);
  }

  // Node unit-test seam: expose the pure helpers when imported as a
  // CommonJS module. Browsers (where `module` is undeclared) skip this;
  // `typeof` on an undeclared identifier is safe (no ReferenceError).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      groupDirectory,
      sortCatalogItems,
      groupArchiveWithSuperseded,
      buildArchiveRequest,
      resolveLibraryLabel,
      partyLine,
      footerModel,
      buildShareRequest,
      shareRequestText,
      sidebarLayoutMode,
      sidebarStoredOpen,
      SHARE_SCHEMA_VERSION,
      ACCESS_OPTIONS,
      SIDEBAR_WIDTH_PX,
      SIDEBAR_PUSH_MIN_PX,
      SIDEBAR_STORAGE_KEY,
    };
  }

  // ===================================================================
  // Browser boot
  // ===================================================================
  function boot() {
    // Double-load guard: a second include must be a no-op (no duplicate
    // sidebar / footer).
    if (window.__previewShellLoaded) return;
    window.__previewShellLoaded = true;

    const shell = readShellData();
    const currentId = shell && typeof shell.id === "string" ? shell.id : "";

    const host = document.createElement("div");
    host.id = "preview-shell-host";
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = STYLE + MARKUP;

    wireSidebar(root);
    const manage = wireManage(root, shell);
    wireShare(root, shell);
    renderFooter(root, shell);

    // The catalog for the sidebar comes from the deployment's
    // /directory.json (the same file the index is generated from), so the
    // sidebar always reflects what was actually deployed. Failure degrades
    // to a small note, never a crash.
    fetchDirectory().then((dir) => {
      manage.setDirectory(dir, currentId);
      manage.render();
    });
  }

  function readShellData() {
    const node = document.getElementById("preview-shell-data");
    if (!node) return {};
    try {
      return JSON.parse(node.textContent) || {};
    } catch (_) {
      return {};
    }
  }

  function fetchDirectory() {
    try {
      return fetch("/directory.json", { cache: "no-store" })
        .then((r) => (r && r.ok ? r.json() : null))
        .catch(() => null);
    } catch (_) {
      return Promise.resolve(null);
    }
  }

  // --- local time formatting ---------------------------------------------
  // Render an ISO instant in the VIEWER's local timezone (no explicit
  // timeZone -> runtime local), returning { text, iso } so the caller can
  // put the full ISO in a title tooltip. The instant always carries a
  // timezone (the builder's schema requires Z or ±HH:MM), so Date parsing
  // is unambiguous. An unparseable value degrades to the raw string.
  function formatLocal(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { text: String(iso), iso: String(iso) };
    let text;
    try {
      text = new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch (_) {
      text = d.toLocaleString();
    }
    return { text, iso: String(iso) };
  }

  // --- sidebar ------------------------------------------------------------
  //
  // Two open modes (breakpoint SIDEBAR_PUSH_MIN_PX):
  //   - push (wide): the panel is a fixed dock; the LIGHT DOM page is
  //     shifted right so content is not covered. No scrim — clicking the
  //     preview does not dismiss the catalog. Open/closed is sticky.
  //   - overlay (narrow): classic drawer + dimmed scrim; scrim click closes.
  // Mode is re-evaluated on resize while open so a phone rotating into
  // landscape does not leave a stuck scrim or a missing push offset.
  //
  // Persistence: SIDEBAR_STORAGE_KEY on localStorage ("open" | "closed").
  // Failures (private mode, quota) are silent — the toggle still works for
  // the current page.
  //
  // Why margin+width (not just padding-left on body): preview pages often
  // style `body { padding: …; max-width: … }` and some layouts treat the
  // body as a full-bleed canvas. A lone padding-left is easy to lose to
  // shorthand resets or to leave 100vw-wide children sitting under the
  // fixed panel. margin-left shifts the whole body box; width calc keeps
  // it from overflowing the viewport. Inline `setProperty(…, 'important')`
  // is the single path — no mirrored stylesheet (that was dual-tracked noise).

  // Inline body properties the push offset may overwrite. Snapshotted on
  // first apply so close restores the page's own values instead of wiping
  // authored inline styles for the rest of the session.
  const PUSH_STYLE_PROPS = ["margin-left", "width", "max-width", "box-sizing"];
  let pushStyleSnapshot = null; // null = no push applied by us

  // Apply or clear the light-DOM push offset. Safe to call on every open/
  // mode-change/close: closed restores any snapshotted page styles.
  function applyPushOffset(on) {
    const body = document.body;
    if (!body) return;
    const w = SIDEBAR_WIDTH_PX + "px";
    if (on) {
      if (!pushStyleSnapshot) {
        pushStyleSnapshot = {};
        for (const prop of PUSH_STYLE_PROPS) {
          pushStyleSnapshot[prop] = {
            value: body.style.getPropertyValue(prop),
            priority: body.style.getPropertyPriority(prop),
          };
        }
      }
      body.style.setProperty("margin-left", w, "important");
      body.style.setProperty("width", "calc(100% - " + w + ")", "important");
      body.style.setProperty("max-width", "calc(100vw - " + w + ")", "important");
      body.style.setProperty("box-sizing", "border-box", "important");
    } else if (pushStyleSnapshot) {
      for (const prop of PUSH_STYLE_PROPS) {
        const prev = pushStyleSnapshot[prop];
        if (prev && prev.value) body.style.setProperty(prop, prev.value, prev.priority || undefined);
        else body.style.removeProperty(prop);
      }
      pushStyleSnapshot = null;
    }
  }

  function currentSidebarMode() {
    // matchMedia is the native breakpoint primitive (same approach as
    // comment-overlay.js). Pure sidebarLayoutMode stays for Node tests.
    try {
      if (window.matchMedia) {
        return window.matchMedia("(min-width: " + SIDEBAR_PUSH_MIN_PX + "px)").matches
          ? "push"
          : "overlay";
      }
    } catch (_) { /* fall through */ }
    return sidebarLayoutMode(window.innerWidth || 0, SIDEBAR_PUSH_MIN_PX);
  }

  function readStoredSidebarOpen() {
    try {
      return sidebarStoredOpen(localStorage.getItem(SIDEBAR_STORAGE_KEY));
    } catch (_) {
      return false;
    }
  }

  function writeStoredSidebarOpen(isOpen) {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, isOpen ? "open" : "closed");
    } catch (_) {
      /* private mode / quota — non-fatal */
    }
  }

  function wireSidebar(root) {
    const wrap = root.querySelector(".ps-wrap");
    // Two placements of the same expand/collapse control:
    //   #ps-expand   — floating, only while closed (opens the panel)
    //   #ps-collapse — in the sidebar head, only while open (closes it)
    // Never both visible; never a folder glyph or a bare ✕.
    const expandBtn = root.querySelector("#ps-expand");
    const collapseBtn = root.querySelector("#ps-collapse");
    const sidebar = root.querySelector("#ps-sidebar");
    const scrim = root.querySelector("#ps-scrim");
    const archiveToggle = root.querySelector("#ps-archive-toggle");

    // A closed sidebar is only translated off-screen, so without `inert` its
    // links / collapse button / archive toggle would stay in the Tab order and
    // exposed to assistive tech — invisible controls a keyboard user lands on
    // mid-page. `inert` is the native fix (no focus, no AT, no clicks); it
    // starts set in the markup and is cleared only while open. Browsers without
    // `inert` simply ignore it, which is no worse than not having it.
    const applyChrome = (isOpen) => {
      const mode = currentSidebarMode();
      const push = isOpen && mode === "push";
      const overlay = isOpen && mode === "overlay";

      sidebar.classList.toggle("open", isOpen);
      // is-push styles the docked panel (no drawer shadow). Only class that
      // the stylesheet reads — no dead is-open / is-overlay toggles.
      wrap.classList.toggle("is-push", push);

      // Scrim only in overlay mode — never in push (that would feel temporary).
      scrim.classList.toggle("open", overlay);

      // Push shifts the page; overlay must never leave a leftover offset.
      applyPushOffset(push);

      // Floating expand is hidden while open so it cannot cover the shifted
      // content; the collapse control in the head takes over.
      expandBtn.hidden = isOpen;
      collapseBtn.hidden = !isOpen;
      expandBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      collapseBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");

      if (isOpen) {
        sidebar.inert = false;
        sidebar.removeAttribute("inert");
      } else {
        sidebar.inert = true;
        sidebar.setAttribute("inert", "");
      }
    };

    const open = () => {
      applyChrome(true);
      writeStoredSidebarOpen(true);
      // Move focus into the still-visible control (expand is now hidden).
      try { collapseBtn.focus(); } catch (_) { /* non-focusable environments */ }
    };
    const close = () => {
      applyChrome(false);
      writeStoredSidebarOpen(false);
      // Return focus to the floating expand (standard expandable-panel a11y).
      try { expandBtn.focus(); } catch (_) { /* non-focusable environments */ }
    };

    expandBtn.addEventListener("click", open);
    collapseBtn.addEventListener("click", close);
    // Scrim is only interactive in overlay mode (see applyChrome); a no-op
    // click when closed is fine.
    scrim.addEventListener("click", close);
    // Escape must work when focus is in the light-DOM page content, so listen
    // on document — a shadow-root-only listener never sees those keydowns.
    // Skip when the comment overlay (or any other light-DOM UI) already
    // consumed Escape: it sets defaultPrevented / stopPropagation, and its
    // active editors live under [data-cmt-ui] / contenteditable surfaces.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!sidebar.classList.contains("open")) return;
      if (e.defaultPrevented) return;
      const t = e.target;
      if (t && typeof t.closest === "function") {
        if (t.closest("[data-cmt-ui], [contenteditable='true'], textarea, input, select")) return;
      }
      close();
    });

    // Re-apply chrome when the viewport crosses the push/overlay breakpoint
    // so offset and scrim stay consistent with the current mode. matchMedia
    // fires only on the crossing, not on every pixel of a resize drag.
    const mql = window.matchMedia
      ? window.matchMedia("(min-width: " + SIDEBAR_PUSH_MIN_PX + "px)")
      : null;
    const onBreakpoint = () => {
      // Re-check open: a delayed callback must not reopen after the user
      // explicitly collapsed (TOCTOU with any prior debounce; still correct
      // with matchMedia's synchronous change).
      if (sidebar.classList.contains("open")) applyChrome(true);
    };
    if (mql) {
      if (typeof mql.addEventListener === "function") mql.addEventListener("change", onBreakpoint);
      else if (typeof mql.addListener === "function") mql.addListener(onBreakpoint); // Safari < 14
    }

    // Restore prior open state only in push mode. Overlay restore would slam
    // a scrim over the page on a phone that shared the desktop's open flag.
    // Use applyChrome + writeStored (not open()) so restore does NOT steal
    // focus into the sidebar — the newly loaded document keeps initial focus.
    if (readStoredSidebarOpen() && currentSidebarMode() === "push") {
      applyChrome(true);
      writeStoredSidebarOpen(true);
    }

    // Archive is COLLAPSED by default (aria-expanded="false", section
    // hidden). Toggling flips both.
    archiveToggle.addEventListener("click", () => {
      const expanded = archiveToggle.getAttribute("aria-expanded") === "true";
      archiveToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
      root.querySelector("#ps-archive").hidden = expanded;
    });
  }

  // Manage mode: checkboxes on rows + copyable archive request. Page stays
  // read-only (no mv / deploy). State lives in this closure so re-renders
  // keep selections until the user toggles mode off (clears) or unchecks.
  function wireManage(root, shell) {
    let dir = null;
    let currentId = "";
    let manageMode = false;
    // id -> { id, title, action: "archive" | "restore" }
    const selected = new Map();
    const libraryLabel = resolveLibraryLabel(shell);

    const toggleBtn = root.querySelector("#ps-manage-toggle");
    const copyBtn = root.querySelector("#ps-manage-copy");
    const wrap = root.querySelector("#ps-manage");

    const updateCopyEnabled = () => {
      copyBtn.disabled = selected.size === 0;
    };

    const setManageMode = (on) => {
      manageMode = !!on;
      toggleBtn.setAttribute("aria-pressed", manageMode ? "true" : "false");
      toggleBtn.classList.toggle("ps-manage-on", manageMode);
      wrap.classList.toggle("ps-manage-active", manageMode);
      if (!manageMode) selected.clear();
      updateCopyEnabled();
      render();
    };

    toggleBtn.addEventListener("click", () => setManageMode(!manageMode));

    copyBtn.addEventListener("click", () => {
      if (!selected.size) return;
      const archive = [];
      const restore = [];
      for (const row of selected.values()) {
        if (row.action === "archive") archive.push(row);
        else if (row.action === "restore") restore.push(row);
      }
      // Stable id ASC so copy output is deterministic for agents/tests.
      const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      archive.sort(byId);
      restore.sort(byId);
      const text = buildArchiveRequest({
        libraryLabel,
        exported: new Date().toISOString(),
        archive,
        restore,
      });
      copyText(text, copyBtn);
    });

    function onCheckChange(it, action, checked) {
      if (checked) {
        selected.set(it.id, {
          id: it.id,
          title: typeof it.title === "string" && it.title ? it.title : it.id,
          action,
        });
      } else {
        selected.delete(it.id);
      }
      updateCopyEnabled();
    }

    function render() {
      renderSidebar(root, dir, currentId, {
        manageMode,
        selected,
        onCheckChange,
      });
      updateCopyEnabled();
    }

    updateCopyEnabled();

    return {
      setDirectory(nextDir, id) {
        dir = nextDir;
        currentId = id || "";
      },
      render,
    };
  }

  function renderSidebar(root, dir, currentId, manage) {
    const activeWrap = root.querySelector("#ps-active");
    const archiveWrap = root.querySelector("#ps-archive");
    activeWrap.textContent = "";
    archiveWrap.textContent = "";
    const opts = manage && typeof manage === "object" ? manage : {};
    const manageMode = !!opts.manageMode;
    const selected = opts.selected instanceof Map ? opts.selected : new Map();
    const onCheckChange =
      typeof opts.onCheckChange === "function" ? opts.onCheckChange : null;

    if (!dir) {
      activeWrap.appendChild(note("Catalog unavailable."));
      return;
    }
    const groups = groupDirectory(dir.items);
    root.querySelector("#ps-active-count").textContent = String(groups.active.length);
    root.querySelector("#ps-archive-count").textContent = String(groups.archive.length);

    if (!groups.active.length) activeWrap.appendChild(note("No active previews."));
    for (const it of groups.active) {
      activeWrap.appendChild(
        sidebarRow(it, currentId, {
          manageMode,
          action: "archive",
          checked: selected.has(it.id),
          onCheckChange,
        })
      );
    }

    if (!groups.archive.length) {
      archiveWrap.appendChild(note("Nothing archived."));
      return;
    }
    const folded = groupArchiveWithSuperseded(groups.archive);
    for (const it of folded.topLevel) {
      archiveWrap.appendChild(
        sidebarRow(it, currentId, {
          manageMode,
          action: "restore",
          checked: selected.has(it.id),
          onCheckChange,
        })
      );
      const kids = folded.childrenOf[it.id];
      if (kids && kids.length) {
        archiveWrap.appendChild(
          earlierCopiesGroup(kids, currentId, {
            manageMode,
            selected,
            onCheckChange,
          })
        );
      }
    }
  }

  // Collapsed-by-default group of superseded archive rows under a canonical.
  function earlierCopiesGroup(kids, currentId, manageOpts) {
    const details = document.createElement("details");
    details.className = "ps-earlier";
    const summary = document.createElement("summary");
    summary.className = "ps-earlier-summary";
    summary.textContent = "Earlier copies (" + kids.length + ")";
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "ps-earlier-body";
    for (const it of kids) {
      body.appendChild(
        sidebarRow(it, currentId, {
          manageMode: !!(manageOpts && manageOpts.manageMode),
          action: "restore",
          checked: !!(manageOpts && manageOpts.selected && manageOpts.selected.has(it.id)),
          onCheckChange: manageOpts && manageOpts.onCheckChange,
        })
      );
    }
    details.appendChild(body);
    return details;
  }

  // One catalog row. Links ALWAYS target the SAME deployment's /p/<id>/
  // (never a cross-deployment URL). The current page is clearly marked
  // with "v<revision> · updated <local date/time>" and aria-current.
  // When manageMode is on, a checkbox sits before the link (archive =
  // active→archive, restore = archive→active).
  function sidebarRow(it, currentId, manageOpts) {
    const opts = manageOpts && typeof manageOpts === "object" ? manageOpts : {};
    const manageMode = !!opts.manageMode;
    const isCurrent = it.id === currentId;

    const a = document.createElement("a");
    a.className = "ps-row" + (isCurrent ? " ps-current" : "");
    a.href = "/p/" + encodeURIComponent(it.id) + "/";

    const title = document.createElement("span");
    title.className = "ps-row-title";
    title.textContent = it.title || it.id;
    a.appendChild(title);

    if (isCurrent) {
      a.setAttribute("aria-current", "page");
      const meta = document.createElement("span");
      meta.className = "ps-row-meta";
      const bits = [];
      if (it.revision != null) bits.push("v" + it.revision);
      let when = null;
      if (it.updatedAt) {
        when = formatLocal(it.updatedAt);
        bits.push("updated " + when.text);
      }
      meta.textContent = bits.join(" · ");
      if (when) meta.title = when.iso;
      a.appendChild(meta);
    }

    if (!manageMode) return a;

    const row = document.createElement("div");
    row.className = "ps-row-wrap" + (isCurrent ? " ps-current" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "ps-row-check";
    cb.checked = !!opts.checked;
    const labelText = (it.title || it.id) +
      (opts.action === "archive" ? " (archive)" : " (restore)");
    cb.setAttribute("aria-label", labelText);
    cb.addEventListener("change", () => {
      if (typeof opts.onCheckChange === "function") {
        opts.onCheckChange(it, opts.action || "archive", cb.checked);
      }
    });
    // Stop checkbox activation from also navigating the adjacent link.
    cb.addEventListener("click", (e) => e.stopPropagation());
    row.appendChild(cb);
    row.appendChild(a);
    return row;
  }

  function note(text) {
    const d = document.createElement("div");
    d.className = "ps-note";
    d.textContent = text;
    return d;
  }

  // --- provenance footer --------------------------------------------------
  function renderFooter(root, shell) {
    const model = footerModel(shell);
    const prov = root.querySelector("#ps-footer-prov");
    prov.textContent = "";
    if (model.mode === "produced") {
      prov.appendChild(footerLine("Produced by", model.producedBy));
    } else {
      prov.appendChild(footerLine("Created by", model.createdBy));
      prov.appendChild(footerLine("Last updated by", model.lastUpdatedBy));
    }

    const times = root.querySelector("#ps-footer-times");
    times.textContent = "";
    if (model.createdAt) times.appendChild(timeLine("Created", model.createdAt));
    // Only show a separate "Updated" line when it differs from creation.
    if (model.updatedAt && model.updatedAt !== model.createdAt) {
      times.appendChild(timeLine("Updated", model.updatedAt));
    }
    if (model.revision != null) {
      const rev = document.createElement("span");
      rev.className = "ps-chip";
      rev.textContent = "revision " + model.revision;
      times.appendChild(rev);
    }
  }

  function footerLine(label, value) {
    const line = document.createElement("div");
    line.className = "ps-footer-line";
    const l = document.createElement("span");
    l.className = "ps-label";
    l.textContent = label + " ";
    const v = document.createElement("span");
    v.className = "ps-value" + (value === "unrecorded" ? " ps-unrecorded" : "");
    v.textContent = value;
    line.append(l, v);
    return line;
  }

  function timeLine(label, iso) {
    const when = formatLocal(iso);
    const span = document.createElement("span");
    span.className = "ps-chip";
    span.textContent = label + " " + when.text;
    span.title = when.iso; // full ISO on hover
    return span;
  }

  // --- share request block -----------------------------------------------
  function wireShare(root, shell) {
    const btn = root.querySelector("#ps-share-btn");
    const block = root.querySelector("#ps-share-block");
    const sel = root.querySelector("#ps-share-access");
    const ta = root.querySelector("#ps-share-text");
    const copy = root.querySelector("#ps-share-copy");

    // Populate the access selector from the single source of options.
    for (const opt of ACCESS_OPTIONS) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    }

    const refresh = () => {
      const req = buildShareRequest({
        id: shell && shell.id,
        revision: shell && shell.revision,
        contentHash: shell && shell.contentHash,
        url: location.href,
        access: sel.value,
      });
      ta.value = shareRequestText(req);
    };

    btn.addEventListener("click", () => {
      const opening = block.hasAttribute("hidden");
      if (opening) {
        block.removeAttribute("hidden");
        refresh();
      } else {
        block.setAttribute("hidden", "");
      }
      btn.setAttribute("aria-expanded", opening ? "true" : "false");
    });
    sel.addEventListener("change", refresh);
    copy.addEventListener("click", () => copyText(ta.value, copy));
  }

  // Copy-to-clipboard with an execCommand fallback (the temp textarea
  // lives in the light DOM, where execCommand("copy") is reliable).
  function copyText(text, btn) {
    const done = () => {
      const label = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(() => {
        btn.textContent = label;
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const tmp = document.createElement("textarea");
    tmp.value = text;
    tmp.setAttribute("readonly", "");
    tmp.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1";
    document.body.appendChild(tmp);
    tmp.focus();
    tmp.select();
    try {
      if (document.execCommand("copy")) done();
    } catch (_) {
      /* clipboard unavailable — the textarea is selectable for manual copy */
    }
    document.body.removeChild(tmp);
  }

  // ===================================================================
  // Shadow-DOM styles + markup
  // ===================================================================
  // `:host { all: initial }` resets inherited page styles so the shell
  // looks the same regardless of the preview's CSS; `direction` is set
  // explicitly because `all` does not reset it. All chrome fonts/colors
  // are declared here, inside the shadow root, so nothing leaks either way.
  const STYLE = `<style>
  /* Reset the host and, crucially, make the reset win. Shadow DOM isolates
     DESCENDANTS, not the host itself: a light-DOM rule that matches the host
     (e.g. body > div { display:none }) outranks a NORMAL :host rule, so a
     preview's own CSS could hide or move the whole chrome. Important :host
     declarations beat important outer declarations, so important gives the
     reset the precedence the isolation guarantee needs. "all: initial" would
     otherwise leave the host display:inline (a block footer in an inline box),
     so display:block is restored. */
  :host { all: initial !important; display: block !important; }
  * { box-sizing: border-box; }
  .ps-wrap {
    direction: ltr;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #111827;
    line-height: 1.5;
  }
  /* Expand control — fixed top-left while the panel is closed. Hidden
     entirely when open (the head's collapse control takes over) so it
     never sits on top of the pushed content. Fixed positioning resolves
     against the viewport from inside a shadow root. */
  #ps-expand {
    position: fixed; top: 14px; left: 14px; z-index: 9996;
    width: 40px; height: 40px; border-radius: 10px;
    border: 1px solid #e5e7eb; background: #ffffff; color: #1f2937;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.10);
    padding: 0;
  }
  #ps-expand:hover { background: #f9fafb; }
  #ps-expand[hidden] { display: none !important; }
  #ps-expand svg, #ps-collapse svg { width: 20px; height: 20px; display: block; }
  /* Scrim is overlay-only (narrow). Push mode never adds .open to it. */
  #ps-scrim {
    position: fixed; inset: 0; z-index: 10010;
    background: rgba(0,0,0,.35); opacity: 0; pointer-events: none;
    transition: opacity .18s ease;
  }
  #ps-scrim.open { opacity: 1; pointer-events: auto; }
  #ps-sidebar {
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 10011;
    width: ${SIDEBAR_WIDTH_PX}px; max-width: 84vw; background: #ffffff;
    border-right: 1px solid #e5e7eb;
    /* Overlay feels like a drawer (shadow); push feels like a docked pane. */
    box-shadow: 2px 0 24px rgba(0,0,0,.14);
    transform: translateX(-104%); transition: transform .2s cubic-bezier(.22,1,.36,1);
    display: flex; flex-direction: column;
  }
  #ps-sidebar.open { transform: translateX(0); }
  .ps-wrap.is-push #ps-sidebar {
    box-shadow: none;
    max-width: ${SIDEBAR_WIDTH_PX}px; /* never shrink the docked panel under vw pressure */
  }
  @media (prefers-reduced-motion: reduce) {
    #ps-sidebar, #ps-scrim { transition: none; }
  }
  .ps-sidebar-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 10px 10px 14px; border-bottom: 1px solid #f0f0ef;
    gap: 8px;
  }
  .ps-sidebar-title { font-size: 14px; font-weight: 600; color: #111827; }
  /* Collapse control — same visual language as #ps-expand, sits where the
     old ✕ was. Hidden while the panel is closed. */
  #ps-collapse {
    flex: 0 0 auto;
    width: 36px; height: 36px; border-radius: 10px;
    border: 1px solid #e5e7eb; background: #ffffff; color: #1f2937;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; padding: 0;
  }
  #ps-collapse:hover { background: #f9fafb; }
  #ps-collapse[hidden] { display: none !important; }
  .ps-sidebar-body { overflow-y: auto; padding: 8px 10px 20px; }
  .ps-section-head {
    display: flex; align-items: center; gap: 6px; width: 100%;
    background: transparent; border: none; cursor: default;
    font: 600 11px ui-sans-serif, system-ui, sans-serif;
    letter-spacing: .06em; text-transform: uppercase; color: #9ca3af;
    padding: 12px 6px 6px;
  }
  button.ps-section-head { cursor: pointer; }
  .ps-count {
    font-weight: 500; color: #9ca3af; letter-spacing: 0;
    text-transform: none; font-size: 11px;
  }
  .ps-caret { margin-left: auto; transition: transform .15s ease; color: #9ca3af; }
  button.ps-section-head[aria-expanded="true"] .ps-caret { transform: rotate(90deg); }
  .ps-row {
    display: block; text-decoration: none; color: #374151;
    padding: 7px 8px; border-radius: 8px; font-size: 13.5px;
    flex: 1 1 auto; min-width: 0;
  }
  .ps-row:hover { background: #f3f4f6; }
  .ps-row-wrap {
    display: flex; align-items: flex-start; gap: 4px;
    border-radius: 8px;
  }
  .ps-row-wrap:hover { background: #f3f4f6; }
  .ps-row-wrap .ps-row:hover { background: transparent; }
  .ps-row-check {
    flex: 0 0 auto; margin: 10px 2px 0 6px; width: 14px; height: 14px;
    accent-color: #4f46e5; cursor: pointer;
  }
  .ps-row-title { display: block; word-break: break-word; }
  .ps-current { background: #eef2ff; }
  .ps-current .ps-row-title { color: #1f2937; font-weight: 600; }
  .ps-row-meta { display: block; margin-top: 2px; font-size: 11.5px; color: #6366f1; }
  .ps-note { padding: 6px 8px; font-size: 12.5px; color: #9ca3af; }
  /* supersededBy earlier-copies group (Archive only; collapsed by default) */
  .ps-earlier {
    margin: 0 0 4px 10px; padding: 0 0 0 8px;
    border-left: 2px solid #e5e7eb;
  }
  .ps-earlier-summary {
    list-style: none; cursor: pointer;
    font: 500 11.5px ui-sans-serif, system-ui, sans-serif;
    color: #9ca3af; padding: 4px 6px;
  }
  .ps-earlier-summary::-webkit-details-marker { display: none; }
  .ps-earlier-summary::before {
    content: "›"; display: inline-block; margin-right: 4px;
    transition: transform .15s ease;
  }
  .ps-earlier[open] > .ps-earlier-summary::before { transform: rotate(90deg); }
  .ps-earlier-body { padding-bottom: 2px; }
  /* Manage section — read-only instruction export at sidebar bottom */
  #ps-manage {
    margin-top: 16px; padding-top: 12px; border-top: 1px solid #f0f0ef;
  }
  .ps-manage-blurb {
    margin: 0 0 10px; padding: 0 6px;
    font-size: 11.5px; line-height: 1.45; color: #9ca3af;
  }
  .ps-manage-actions {
    display: flex; flex-wrap: wrap; gap: 6px; padding: 0 4px;
  }
  #ps-manage-toggle, #ps-manage-copy {
    padding: 6px 10px; border-radius: 7px;
    border: 1px solid #e5e7eb; background: #ffffff; color: #1f2937;
    font: 500 12px ui-sans-serif, system-ui, sans-serif; cursor: pointer;
  }
  #ps-manage-toggle:hover, #ps-manage-copy:hover { background: #f9fafb; }
  #ps-manage-toggle.ps-manage-on {
    background: #eef2ff; border-color: #c7d2fe; color: #3730a3;
  }
  #ps-manage-copy:disabled {
    opacity: .45; cursor: not-allowed;
  }
  #ps-manage-copy:disabled:hover { background: #ffffff; }
  /* Provenance footer — in-flow at the very bottom of the entry (the host
     is appended last in <body>). Not fixed, so it sits after content. */
  #ps-footer {
    margin: 40px auto 0; max-width: 768px;
    padding: 18px 20px 96px; border-top: 1px solid #ececec;
    font-size: 12.5px; color: #6b7280;
  }
  .ps-footer-line { margin: 2px 0; }
  .ps-label { color: #9ca3af; }
  .ps-value { color: #374151; }
  .ps-unrecorded { color: #9ca3af; font-style: italic; }
  .ps-footer-meta {
    margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  }
  .ps-chip {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    background: #f3f4f6; color: #6b7280; font-size: 11.5px;
  }
  #ps-share-btn {
    margin-top: 12px; padding: 6px 12px; border-radius: 7px;
    border: 1px solid #e5e7eb; background: #ffffff; color: #1f2937;
    font: 500 12.5px ui-sans-serif, system-ui, sans-serif; cursor: pointer;
  }
  #ps-share-btn:hover { background: #f9fafb; }
  #ps-share-block {
    margin-top: 10px; padding: 12px; border: 1px solid #e5e7eb;
    border-radius: 10px; background: #fafafa; max-width: 520px;
  }
  #ps-share-block[hidden] { display: none; }
  .ps-share-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  .ps-share-row label { font-size: 12px; color: #6b7280; }
  #ps-share-access {
    font: inherit; font-size: 12.5px; padding: 4px 8px;
    border: 1px solid #d1d5db; border-radius: 6px; background: #fff; color: #111827;
  }
  #ps-share-text {
    width: 100%; min-height: 132px; resize: vertical; box-sizing: border-box;
    font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px;
    line-height: 1.5; padding: 8px 10px; border: 1px solid #d1d5db;
    border-radius: 8px; background: #fff; color: #111827;
  }
  .ps-share-hint { margin: 0 0 8px; font-size: 11.5px; color: #9ca3af; }
  #ps-share-copy {
    margin-top: 8px; padding: 6px 14px; border: none; border-radius: 7px;
    background: #1f2937; color: #fff; font: 500 12.5px ui-sans-serif, system-ui, sans-serif;
    cursor: pointer; min-width: 92px;
  }
  #ps-share-copy:hover { background: #111827; }
</style>`;

  // Expand / collapse glyphs: a left rail (the panel) + a chevron. Expand
  // points the chevron outward (open the panel); collapse points it inward
  // (dock it away). Same metaphor in both placements — not a folder, not ✕.
  const ICON_EXPAND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="6" height="16" rx="1.5"></rect>
      <path d="M14 8l4 4-4 4"></path>
    </svg>`;
  const ICON_COLLAPSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="6" height="16" rx="1.5"></rect>
      <path d="M18 8l-4 4 4 4"></path>
    </svg>`;

  const MARKUP = `<div class="ps-wrap">
  <button id="ps-expand" type="button" aria-label="Expand library" aria-expanded="false" aria-controls="ps-sidebar" data-cmt-ui="1">
    ${ICON_EXPAND}
  </button>
  <div id="ps-scrim" data-cmt-ui="1"></div>
  <nav id="ps-sidebar" aria-label="Preview library" data-cmt-ui="1" inert>
    <div class="ps-sidebar-head">
      <span class="ps-sidebar-title">Library</span>
      <button id="ps-collapse" type="button" aria-label="Collapse library" aria-expanded="false" aria-controls="ps-sidebar" hidden data-cmt-ui="1">
        ${ICON_COLLAPSE}
      </button>
    </div>
    <div class="ps-sidebar-body">
      <div class="ps-section-head">
        Active <span class="ps-count">(<span id="ps-active-count">0</span>)</span>
      </div>
      <div id="ps-active"></div>
      <button id="ps-archive-toggle" class="ps-section-head" type="button" aria-expanded="false" aria-controls="ps-archive">
        Archive <span class="ps-count">(<span id="ps-archive-count">0</span>)</span>
        <span class="ps-caret" aria-hidden="true">›</span>
      </button>
      <div id="ps-archive" hidden></div>
      <div id="ps-manage">
        <p class="ps-manage-blurb">Active = in progress · Archive = kept for reference · archiving does not change the URL.</p>
        <div class="ps-manage-actions">
          <button id="ps-manage-toggle" type="button" aria-pressed="false" aria-label="Manage mode">Manage mode</button>
          <button id="ps-manage-copy" type="button" disabled aria-label="Copy archive instructions">Copy instructions</button>
        </div>
      </div>
    </div>
  </nav>
  <footer id="ps-footer" data-cmt-ui="1">
    <div id="ps-footer-prov"></div>
    <div id="ps-footer-times" class="ps-footer-meta"></div>
    <button id="ps-share-btn" type="button" aria-expanded="false" aria-controls="ps-share-block">Share…</button>
    <div id="ps-share-block" hidden>
      <p class="ps-share-hint">This builds a request to copy back to an agent. It does not deploy or share anything by itself.</p>
      <div class="ps-share-row">
        <label for="ps-share-access">Access</label>
        <select id="ps-share-access"></select>
      </div>
      <textarea id="ps-share-text" readonly aria-label="Share request"></textarea>
      <button id="ps-share-copy" type="button">Copy</button>
    </div>
  </footer>
</div>`;

  // Boot LAST — only after STYLE and MARKUP are initialized. boot() reads them
  // (root.innerHTML = STYLE + MARKUP), and they are `const`, so invoking boot()
  // before their declarations would hit the temporal dead zone and throw. Under
  // Node (no document) this is skipped; only the exported helpers above are used.
  if (typeof document !== "undefined") boot();
})();
