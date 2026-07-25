# docs(mvp): align preview layout with Library active/

The mvp skill still assumes `/preview` writes `docs/preview/<date>-<slug>/` and
leans on per-page `**/comment-overlay.js` gitignore guidance. Library v2 default
is `active/<id>/` under a path-scoped `.solopreneur.json` root, with shared
overlay injected at build time.

Align wording only — no mvp runtime scripts.

## Requirements

1. Where mvp tells the agent to produce a preview for human review, state that
   when a v2 Library config resolves (nearest `.solopreneur.json` with `preview`),
   content goes under `<root>/active/<id>/` with `preview.json`, and publish is
   via the preview skill's Library path (`deploy-library.mjs` / `/preview`
   Library workflow) — not a new flat date-slug dir as the default.
2. If no v2 config is present, keep a clear fallback: follow `/preview` skill
   (setup or legacy) rather than inventing layout.
3. Mark the deferred `**/comment-overlay.js` gitignore line as **legacy /
   transition** detail (Library injects shared overlay at build; do not teach
   copying overlay into every item as the happy path).
4. Do not hardcode Hana project names or `~/Agents` paths.
5. Touch only `plugins/solopreneur/skills/mvp/SKILL.md`.

## Files to Read

- `plugins/solopreneur/skills/mvp/SKILL.md` (sections mentioning preview path,
  comment-overlay, docs/preview)
- `plugins/solopreneur/skills/preview/SKILL.md` (if already rewritten on main —
  otherwise architecture defaults: active/, preview.json, deploy-library)

## Files to Create/Modify

- `plugins/solopreneur/skills/mvp/SKILL.md`

## Acceptance Criteria

- [ ] `git diff --name-only` contains only `plugins/solopreneur/skills/mvp/SKILL.md`
- [ ] `rg -n "active/|preview\\.json|Library|deploy-library" plugins/solopreneur/skills/mvp/SKILL.md`
      shows Library-aware guidance
- [ ] Any remaining `docs/preview/<date>-<slug>` (or equivalent flat layout) is
      explicitly labeled legacy/fallback, not the default when v2 config exists
- [ ] `rg -n "hana-previews|mojo-apps-preview" plugins/solopreneur/skills/mvp/SKILL.md`
      has zero matches
- [ ] comment-overlay gitignore guidance is demoted or clarified as non-Library-default

## Notes

- Minimal edit preferred: change the few paragraphs that encode the old layout;
  do not rewrite the whole mvp skill.
- English, same tone as existing mvp SKILL.
