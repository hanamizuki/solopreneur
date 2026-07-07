# feat(humanly): add rewrite guardrails and sterile-voice detection

## Requirements

- Implement batch one from `/tmp/handoff/2026-07-07_humanly-construction-plan.md` after PR #91 has merged into `main`.
- Add a central Guardrails section to `plugins/marketer/skills/humanly/SKILL.md` immediately after Mode Detection and before the mode sections. Translate the approved Chinese guardrail text into English without changing the decision order or semantics.
- Add protected-span handling to the rewrite/review pipeline: insert Step 3.5 before Step 4, add protected-span and polarity checks to Step 7, and document the relationship to the Self-Reference Escape Hatch.
- Replace the Step 7 repeat rule with the approved three-round convergence and rollback rule. Do not add a percentage-based edit cap.
- Dissolve the `Personality and Soul` / `個性與靈魂` principles chapter in both language pattern files. Remove additive voice prescriptions and "vivid rewrite" examples. Keep principles focused on core rules plus formatting/rhythm checks.
- Add a new review-only sterile-voice pattern in both languages using the next contiguous pattern number available after PR #91 and this PR's edits. The pattern must include the approved "three consecutive paragraphs without concrete detail" density rule and must note that neutral voice is legitimate for profiles such as docs and support email.
- Add the approved routing test text to the headers of `patterns-{zh,en}.md` and `word-table-{zh,en}.md`, using the post-PR #91 `prewrite` flag spelling.
- Add a technical abbreviation allowlist to `references/context-profiles.md` so API, MCP, TLDR, and similar technical abbreviations are not rewritten just because they look unnatural in casual prose.
- Add the approved tone-boundary line to both generated prewrite intros through `scripts/build-prewrite.py`: tone comes from the user's voice guide and real material; humanly does not invent personality.

## Files to Read

- `/tmp/handoff/2026-07-07_humanly-construction-plan.md` — source of approved wording and decisions; do not redesign.
- `plugins/marketer/skills/humanly/SKILL.md` — mode table, rewrite/review pipeline, Guardrails insertion point, Step 3.5/7 edits.
- `plugins/marketer/skills/humanly/references/patterns-zh.md` — Chinese principles chapter, pattern numbering, sterile-voice pattern insertion.
- `plugins/marketer/skills/humanly/references/patterns-en.md` — English principles chapter, pattern numbering, sterile-voice pattern insertion.
- `plugins/marketer/skills/humanly/references/word-table-zh.md` — header routing-test text.
- `plugins/marketer/skills/humanly/references/word-table-en.md` — header routing-test text.
- `plugins/marketer/skills/humanly/references/context-profiles.md` — profile tolerance matrix and abbreviation allowlist placement.
- `plugins/marketer/skills/humanly/scripts/build-prewrite.py` — generated intro text and output paths.

## Files to Create/Modify

- `plugins/marketer/skills/humanly/SKILL.md` — add Guardrails, protected spans, convergence rule, and Step 7 audit changes.
- `plugins/marketer/skills/humanly/references/patterns-zh.md` — remove additive voice chapter content, add Chinese sterile-voice pattern, add routing-test header text.
- `plugins/marketer/skills/humanly/references/patterns-en.md` — remove additive voice chapter content, add English sterile-voice pattern, add routing-test header text.
- `plugins/marketer/skills/humanly/references/word-table-zh.md` — add Tier 1 / banned sentence routing-test header text.
- `plugins/marketer/skills/humanly/references/word-table-en.md` — add Tier 1 / banned sentence routing-test header text.
- `plugins/marketer/skills/humanly/references/context-profiles.md` — add technical abbreviation allowlist.
- `plugins/marketer/skills/humanly/scripts/build-prewrite.py` — add tone-boundary intro line.
- `plugins/marketer/skills/humanly/references/generated/prewrite-zh.md` — regenerate only.
- `plugins/marketer/skills/humanly/references/generated/prewrite-en.md` — regenerate only.

## Acceptance Criteria

- [ ] PR #91 is merged before implementation starts, and the worktree is created from updated `main`.
- [ ] Test command: `python3 plugins/marketer/skills/humanly/scripts/build-prewrite.py --check`
- [ ] The build command without `--check` regenerates both generated prewrite files successfully.
- [ ] The sterile-voice pattern appears in the generated appendix index but its full body is not included in the selected prewrite pattern section.
- [ ] Generated prewrite files are thinner than before this PR because additive voice prescriptions were removed from the principles block.
- [ ] `rg -n "How to add voice|如何增加語調|Personality and Soul|個性與靈魂" plugins/marketer/skills/humanly/references/generated` returns no matches.
- [ ] Repo search finds no legacy hyphenated prewrite file, script, flag, or mode names under `plugins/marketer/skills/humanly`; use `prewrite` spelling throughout.
- [ ] Guardrails clearly state that humanly is a subtraction engine and must not invent facts, experience, sources, scenes, or personality.
- [ ] Step 7 includes protected-span verification and polarity/strength verification.

## Notes

- Do not change pattern rules individually to add "missing material" exceptions; the central Guardrails section owns that arbitration.
- Keep all repo text in English except Chinese-language source content in `patterns-zh.md` and `word-table-zh.md`.
- Do not include release notes or changelog changes in this PR.
