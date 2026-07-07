# feat(humanly): add nominalization syntax patterns

## Requirements

- Implement batch two from `/tmp/handoff/2026-07-07_humanly-construction-plan.md` after PR1 has merged.
- Add one major syntax-level pattern for nominalization in both language catalogs.
- Chinese pattern scope: constructions such as `進行` / `加以` / `做出` plus verbal nouns, stacked `的`, stacked passive `被` clauses, and accumulated `性` / `化` suffixes.
- English pattern scope: nominalization chains such as `-tion` / `-ment`, Latinate verb substitutions such as `utilize -> use`, and sentence shapes where actions are hidden inside abstract nouns.
- This pattern must carry the `prewrite` flag because the approved routing test says it is actionable while writing and is commonly missed without priming.
- Keep the pattern orthogonal to word-table replacements: this PR adds syntax guidance, not a broad word-table expansion.

## Files to Read

- `/tmp/handoff/2026-07-07_humanly-construction-plan.md` — batch two requirements and approved flag decision.
- `plugins/marketer/skills/humanly/references/patterns-zh.md` — Chinese pattern style, numbering, examples, prewrite flag format.
- `plugins/marketer/skills/humanly/references/patterns-en.md` — English pattern style, numbering, examples, prewrite flag format.
- `plugins/marketer/skills/humanly/scripts/build-prewrite.py` — generated extraction behavior.

## Files to Create/Modify

- `plugins/marketer/skills/humanly/references/patterns-zh.md` — add the Chinese nominalization syntax pattern with `prewrite` flag.
- `plugins/marketer/skills/humanly/references/patterns-en.md` — add the English nominalization syntax pattern with `prewrite` flag.
- `plugins/marketer/skills/humanly/references/generated/prewrite-zh.md` — regenerate only.
- `plugins/marketer/skills/humanly/references/generated/prewrite-en.md` — regenerate only.

## Acceptance Criteria

- [ ] Test command: `python3 plugins/marketer/skills/humanly/scripts/build-prewrite.py --check`
- [ ] The build command without `--check` regenerates both generated prewrite files successfully.
- [ ] New pattern numbers are contiguous in both `patterns-zh.md` and `patterns-en.md`.
- [ ] The new nominalization pattern appears in the full body section of both generated prewrite files, not only in the appendix.
- [ ] `rg -n "去名詞化|Nominalization|nominalization|prewrite" plugins/marketer/skills/humanly/references/patterns-{zh,en}.md` shows the new pattern and its `prewrite` flag.
- [ ] This PR does not add the batch-three word-table terms or review-only patterns.

## Notes

- Do not import external claims or statistics. Use the approved handoff requirements and existing catalog style.
- Keep examples practical and minimal; this is a writing-rule addition, not a grammar essay.
