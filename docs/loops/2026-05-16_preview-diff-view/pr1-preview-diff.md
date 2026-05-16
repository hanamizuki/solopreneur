# PR1 — preview skill diff-style revision view

## Goal

Make the `preview` skill show post-feedback revisions GitHub-diff-style
instead of silently replacing content. Internal behaviour enhancement of an
existing skill — no new skill, no new asset file.

## Scope

- `plugins/solopreneur/skills/preview/assets/template.html` — semantic
  `<del>`/`<ins>` diff CSS + `body.diff-clean` clean-view gate + minimal
  `.revision-log` callout modifier. Page ships without `diff-clean` so diff
  is visible on load.
- `plugins/solopreneur/skills/preview/assets/comment-overlay.js` — floating
  `乾淨版` / `顯示修改` toggle that flips `body.diff-clean`, persisted to
  `localStorage` (`preview_diff_clean_v1`), default diff-visible, hidden
  when the page has no `<del>`/`<ins>` markup. No regression to the existing
  comment/export flow.
- `plugins/solopreneur/skills/preview/SKILL.md` — Step 5 rewritten to be
  diff-aware (flatten previous round → apply this round as `<del>`/`<ins>` →
  refresh `.revision-log` → never silently replace → reader can toggle
  clean); overlay section + what-not-to-do + files-list wording updated.

## Design decisions

- **Semantic `<del>`/`<ins>` over custom spans** — default meaningful
  rendering, accessibility/screen-reader friendly, clean view only needs to
  hide/neutralize two element types.
- **Per-round reset over cumulative history** — diff always means "changes
  since your last review"; the page stays readable after many iterations.
- **Default diff-visible over default-clean** — the reader immediately sees
  how their feedback was applied, like a GitHub PR opening on the diff.
- **Unscoped `del`/`ins`/`diff-clean` CSS** (not under `.doc`) so the markup
  works wherever the agent injects it — inside tables, lists, or callouts.

## Constraints

- No `plugins/solopreneur/.claude-plugin/plugin.json` version bump (bumps
  happen only through `/release`).
- No `.claude-plugin/marketplace.json` or `README.md` change (not a new
  skill; skill count stays 16).
- No third asset file — exactly `template.html` + `comment-overlay.js`.
