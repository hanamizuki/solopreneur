# feat(humanly): add slop scan prefilter

## Requirements

- Implement batch four from `/tmp/handoff/2026-07-07_humanly-construction-plan.md` after PR3 has merged.
- Add `plugins/marketer/skills/humanly/scripts/slop-scan.py` using only Python standard library.
- `slop-scan.py` must parse `word-table-{lang}.md` at runtime as the single source of truth for Tier 1 terms and banned sentence pattern sections. Do not duplicate those word lists in the script.
- The scanner may hardcode structural checks from the handoff:
  - banned punctuation
  - `Not X but Y` / `不是 X 是 Y` variants
  - hard evidence tells such as placeholders, `utm_source=chatgpt.com`, false precision, prompt/source leakage such as `turn0search0`, and fake DOI shapes
- Scanner output must include line number, matched string, category, and category counts.
- Add SKILL.md guidance before Step 4: when `python3` is available, run `slop-scan.py` and feed its hits into the model scan; hits are not automatically violations, and misses do not prove the text is clean.
- Add the hard-evidence pattern to both pattern catalogs as detect-only / review-only guidance: one occurrence is enough to report, but do not auto-repair it.
- Add a self-collision lint to `build-prewrite.py`: generated prose sections must not introduce the skill's own Tier 1 terms, while skipping table rows and examples/quoted sections to avoid false positives.

## Files to Read

- `/tmp/handoff/2026-07-07_humanly-construction-plan.md` — batch four scanner and lint requirements.
- `plugins/marketer/skills/humanly/SKILL.md` — Step 4 insertion point.
- `plugins/marketer/skills/humanly/references/word-table-zh.md` — runtime parse target.
- `plugins/marketer/skills/humanly/references/word-table-en.md` — runtime parse target.
- `plugins/marketer/skills/humanly/references/patterns-zh.md` — hard-evidence pattern insertion.
- `plugins/marketer/skills/humanly/references/patterns-en.md` — hard-evidence pattern insertion.
- `plugins/marketer/skills/humanly/scripts/build-prewrite.py` — self-collision lint integration.

## Files to Create/Modify

- `plugins/marketer/skills/humanly/scripts/slop-scan.py` — new stdlib-only scanner.
- `plugins/marketer/skills/humanly/SKILL.md` — add scanner guidance before Step 4.
- `plugins/marketer/skills/humanly/references/patterns-zh.md` — add Chinese hard-evidence pattern.
- `plugins/marketer/skills/humanly/references/patterns-en.md` — add English hard-evidence pattern.
- `plugins/marketer/skills/humanly/scripts/build-prewrite.py` — add self-collision lint.
- `plugins/marketer/skills/humanly/references/generated/prewrite-zh.md` — regenerate only.
- `plugins/marketer/skills/humanly/references/generated/prewrite-en.md` — regenerate only.

## Acceptance Criteria

- [ ] Test command: `python3 plugins/marketer/skills/humanly/scripts/build-prewrite.py --check`
- [ ] Test command: `python3 plugins/marketer/skills/humanly/scripts/slop-scan.py --help`
- [ ] Test command: `python3 plugins/marketer/skills/humanly/scripts/slop-scan.py --lang zh plugins/marketer/skills/humanly/references/generated/prewrite-zh.md`
- [ ] Test command: `python3 plugins/marketer/skills/humanly/scripts/slop-scan.py --lang en plugins/marketer/skills/humanly/references/generated/prewrite-en.md`
- [ ] `slop-scan.py` does not hardcode Tier 1 word-table entries; changing a Tier 1 row in a word table changes scanner behavior without editing the script.
- [ ] Scanner output contains line numbers, matched strings, categories, and category counts.
- [ ] SKILL.md explicitly says scanner hits are not automatically violations and scanner misses do not prove cleanliness.
- [ ] The hard-evidence pattern appears in both pattern indexes and is not included as a full prewrite pattern.
- [ ] The build self-collision lint skips table rows and examples/quoted sections; it must not fail simply because Tier 1 terms are listed in generated word-table sections.
- [ ] The implementation uses only Python standard library.

## Notes

- Keep the scanner as a prefilter, not a judge. The model still applies escape hatches, context profiles, and exceptions.
- Do not add external detector integrations or network calls.
