// preview skill: in-page comment overlay
// Highlight text → write comment → export markdown to clipboard
// Pure client-side, no backend, persists to localStorage during the session.

(function () {
  const STORAGE_KEY = "preview_comments_v1";
  let comments = [];
  try {
    comments = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (_) {
    comments = [];
  }

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
    updateBadge();
  };

  // small DOM helper
  function el(tag, styleStr, opts) {
    const node = document.createElement(tag);
    if (styleStr) node.style.cssText = styleStr;
    if (opts) {
      if (opts.id) node.id = opts.id;
      if (opts.text != null) node.textContent = opts.text;
      if (opts.attrs) for (const k in opts.attrs) node.setAttribute(k, opts.attrs[k]);
    }
    return node;
  }

  // --- floating "+ comment" button shown after text selection ---
  const addBtn = el(
    "button",
    "position:absolute;display:none;z-index:9999;padding:4px 10px;background:#1f2937;color:#fff;border:none;border-radius:6px;font:500 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)",
    { id: "cmt-add", text: "+ comment" }
  );
  document.body.appendChild(addBtn);

  let pending = null;

  document.addEventListener("mouseup", (e) => {
    if (e.target.closest("#cmt-add,#cmt-modal,#cmt-export,#cmt-fallback,#cmt-diff-toggle")) return;
    const sel = window.getSelection();
    const text = sel && sel.toString().trim();
    if (!text) {
      addBtn.style.display = "none";
      pending = null;
      return;
    }
    pending = text;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    addBtn.style.left = rect.right + window.scrollX + 8 + "px";
    addBtn.style.top = rect.top + window.scrollY - 4 + "px";
    addBtn.style.display = "block";
  });

  addBtn.addEventListener("click", () => {
    if (!pending) return;
    openModal(pending);
    addBtn.style.display = "none";
  });

  // --- modal for writing the comment ---
  function openModal(quote) {
    const overlay = el(
      "div",
      "position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif",
      { id: "cmt-modal" }
    );
    const card = el(
      "div",
      "background:#fff;border-radius:12px;padding:24px;max-width:520px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,.2)"
    );
    const quoteBox = el(
      "div",
      "font-size:13px;color:#6b7280;margin-bottom:12px;font-style:italic;max-height:120px;overflow:auto;border-left:2px solid #d1d5db;padding:4px 0 4px 10px;line-height:1.5",
      { text: quote.length > 240 ? quote.slice(0, 240) + "…" : quote }
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
        comments.push({ quote, comment: txt, ts: new Date().toISOString() });
        save();
        toast("comment added");
      }
      close();
    };

    cancelBtn.addEventListener("click", close);
    saveBtn.addEventListener("click", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
    });
  }

  // --- export button (bottom-right) ---
  const exportBtn = el(
    "button",
    "position:fixed;bottom:20px;right:20px;z-index:9998;padding:10px 16px;background:#1f2937;color:#fff;border:none;border-radius:8px;font:500 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);display:none",
    { id: "cmt-export" }
  );
  const exportLabel = document.createTextNode("export comments (");
  const badge = el("span", null, { id: "cmt-badge", text: "0" });
  const exportTail = document.createTextNode(")");
  exportBtn.append(exportLabel, badge, exportTail);
  document.body.appendChild(exportBtn);

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

  // Export modal — shown when user clicks "export comments".
  // Displays the markdown in a textarea (preview-able) with explicit
  // Copy / Clear / Close buttons. Nothing is auto-cleared, so the user
  // can re-open it, recopy, edit before pasting, etc.
  function showExportModal(md) {
    const overlay = el(
      "div",
      "position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:10001;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif",
      { id: "cmt-export-modal" }
    );
    const card = el(
      "div",
      "background:#fff;padding:20px 22px;border-radius:12px;width:92%;max-width:680px;box-shadow:0 12px 40px rgba(0,0,0,.2)"
    );

    // header row: title + close X
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

    // button row
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

    // pre-select the markdown so cmd-c also works
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
        // clipboard blocked — user can still cmd-c since textarea is selected
        ta.focus();
        ta.select();
        copyBtn.textContent = "Press ⌘C";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1800);
      }
    });

    clearBtn.addEventListener("click", () => {
      if (!confirm(`Clear all ${comments.length} comments? This can't be undone.`)) return;
      comments = [];
      save();
      close();
    });

    // ESC to close, clicking the dark overlay closes too
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

  // --- transient toast ---
  function toast(msg) {
    const t = el(
      "div",
      "position:fixed;bottom:80px;right:20px;z-index:10002;padding:10px 16px;background:#10b981;color:#fff;border-radius:8px;font:500 13px system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.2);opacity:0;transition:opacity .15s",
      { text: msg }
    );
    document.body.appendChild(t);
    requestAnimationFrame(() => (t.style.opacity = "1"));
    setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 200);
    }, 2200);
  }

  function updateBadge() {
    badge.textContent = comments.length;
    exportBtn.style.display = comments.length ? "inline-block" : "none";
  }

  updateBadge();

  // --- diff / clean toggle (bottom-right, above export button) ---
  // On a post-feedback revision the agent rewrites the page with
  // GitHub-diff markup: removed text in <del>, added/changed text in
  // <ins> (see SKILL.md Step 5). This button lets the reader flip
  // between the diff view and a clean rendered view by toggling
  // body.diff-clean (CSS gate lives in template.html). State persists
  // to localStorage so it survives reload during a review session.
  //
  // Default when nothing is stored: diff VISIBLE (no diff-clean class) —
  // the reader should see how their feedback was applied first, like a
  // GitHub PR opening on the diff. On a first-draft page there is no
  // diff markup yet, so the button hides itself entirely.
  const DIFF_CLEAN_KEY = "preview_diff_clean_v1";

  // Page has diff markup only after a revision round.
  const hasDiff = !!document.querySelector("del, ins");

  let diffClean = false;
  try {
    diffClean = localStorage.getItem(DIFF_CLEAN_KEY) === "1";
  } catch (_) {
    diffClean = false;
  }

  // Apply persisted state synchronously (script runs at end of <body>,
  // so this settles before paint — no diff flash).
  document.body.classList.toggle("diff-clean", diffClean);

  const diffBtn = el(
    "button",
    "position:fixed;bottom:64px;right:20px;z-index:9998;padding:10px 16px;background:#1f2937;color:#fff;border:none;border-radius:8px;font:500 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);display:none",
    { id: "cmt-diff-toggle" }
  );

  function updateDiffBtn() {
    // Only meaningful when the page actually carries diff markup.
    diffBtn.style.display = hasDiff ? "inline-block" : "none";
    // Label reflects what the click will DO:
    //   diff visible  → offer 乾淨版 (hide diff)
    //   clean view    → offer 顯示修改 (show diff)
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
  });

  document.body.appendChild(diffBtn);
  updateDiffBtn();
})();
