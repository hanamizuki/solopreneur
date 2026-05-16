# feat(preview): conditional scope step + Google Docs-style comment markers

PR1 implementation spec. Full design rationale:
`docs/superpowers/specs/2026-05-17-preview-comment-markers-design.md`.

## Requirements

### Feature A — conditional scope-confirmation step (SKILL.md only)

- Add **Step 2.5 "Define what goes in"** to `SKILL.md`, between Step 2 and
  Step 3, as `### 2.5`. Renumber nothing else.
- Agent self-assesses proposal ambiguity. Ask the user **only if** any hold:
  - the session discussed >=2 separable topics/deliverables and the preview
    request did not name which;
  - the request is a bare "做個 preview" after a wide-ranging discussion
    with no single clear target;
  - multiple candidate artifacts exist (plan + pricing model + roadmap etc).
- Clear -> state in one line what is being previewed, proceed, no question.
  Ambiguous -> `AskUserQuestion` (multiSelect) listing the candidate pieces;
  the selected set is the Step 3 content contract.
- Rewrite "The comment overlay (what the user sees)" to describe the marker
  + side panel + mobile sheet behavior. Keep the export-markdown paragraph
  accurate (format unchanged).

### Feature B — Google Docs-style comment markers

Pure client-side, `localStorage` only, single static page, single review
session. A revision is a new URL/page; markers do NOT survive across
revisions. No backend, no build step, no new external dependency.

1. **Anchoring** — W3C TextQuoteSelector. Persist
   `anchor:{exact,prefix,suffix}` (~32 chars context). On load, locate the
   unique `prefix+exact+suffix` by walking text nodes; wrap in
   `<mark class="cmt-mark" data-cmt-id>`. Per-intersected-text-node wrap
   (`surroundContents` throws on partial-node ranges). Unmatchable -> render
   detached in panel; never drop.
2. **Data model** — each entry gains `id` + `anchor`. `quote === exact` so
   `buildMarkdown()` is byte-identical. `STORAGE_KEY` ->
   `preview_comments_v2`. v1 data loads detached.
3. **Desktop >=1024px** — fixed ~320px right panel; content right margin;
   cards ordered by marker vertical position; click pairing via
   `data-cmt-id`; inline edit; delete unwraps mark.
4. **Mobile <1024px** — no docked panel; tap mark -> single-comment sheet;
   floating "comments (N)" -> full-list sheet; reuse modal vocabulary.
5. **Coexistence** — keep export + diff/clean toggle (re-layout so 320px
   panel does not hide them); `<mark>` coexists with `<del>`/`<ins>`;
   inject marker + card on create with no reload; remove the old toast.
6. **template.html CSS** — `.cmt-mark` highlight + flash; panel container +
   content shift; mobile sheet + `@media (max-width:1023px)`; must not
   regress `body.diff-clean`.

## Acceptance Criteria

- [ ] `node --check .../comment-overlay.js` exits 0
- [ ] `grep -q "preview_comments_v2" .../comment-overlay.js`
- [ ] `grep -qE "2\.5|Define what goes in" .../SKILL.md`
- [ ] `grep -q "cmt-mark" .../template.html`
- [ ] `grep -q "max-width" .../template.html`
- [ ] `buildMarkdown()` output format unchanged (code inspection)
- [ ] Manual trace documented in PR body

## Notes

- `patch`-level for `solopreneur`. Do NOT bump `plugin.json` (handled by
  `/release`).
- Canonical `comment-overlay.js` is tracked here (gitignored only in
  consumer repos).
- No heavyweight test framework. Single-file vanilla JS only.
