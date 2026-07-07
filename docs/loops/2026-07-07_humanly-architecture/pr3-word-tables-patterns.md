# feat(humanly): expand word tables and review-only patterns

## Requirements

- Implement batch three from `docs/loops/2026-07-07_humanly-architecture/source-handoff.md` after PR2 has merged.
- Expand `word-table-zh.md` with the approved high-confidence banned sentence patterns and overclaiming terms:
  - summary cliches such as `綜上所述`, `總而言之`, `歸根結底`, `由此可見`, `不難看出`
  - era openers such as `在當今...的時代` and `隨著...快速發展`
  - ordinal connective shells such as `首先...其次...最後`
  - overclaiming terms where the approved tiering applies: `毋庸置疑` / `顯而易見` as Tier 1; `眾所周知` as Tier 2
- Expand `word-table-en.md` with the approved missing terms and a new banned sentence patterns section:
  - terms such as `vital`, `milestone`, `indispensable`, `catalyst`, `pillar`, `bedrock`, `linchpin`, `mitigate`, `propel`, `transcend`, `thus`, and `hence`
  - banned sentence patterns covering throat-clearing, era openers such as `In today's fast-paced world`, semicolon overuse, and absolute-word shells
- Update `scripts/build-prewrite.py` so the new English banned sentence patterns section is extracted into generated English prewrite output.
- Add source-header standards to the word tables: include only entries seen across three different sources, and document the model-era note that GPT-4-era word tells are weaker while structural tells are stronger in newer model output.
- Apply strict filtering from the handoff: do not add Taiwan-normalized internet terms such as `痛點`, `剛需`, or `復盤`; do not add platform-only phrases such as `寶子們` / `家人們`; do not add `其實`.
- Add the approved review-only patterns in both catalogs where applicable:
  - overcertain claims
  - stock metaphors and blacklist
  - hidden actor / abstract subject
  - review-commentary sentence shells, only where not already covered
  - update the existing `Not X but Y`, rhythm, posture verb, and disclaimer patterns as specified
  - add high-risk exception notes only where approved, such as moat in finance context and significant in p-value context
- New batch-three patterns are review-only and must not carry the `prewrite` flag unless the handoff explicitly says otherwise.

## Files to Read

- `docs/loops/2026-07-07_humanly-architecture/source-handoff.md` — batch three requirements, strict filtering decisions, and approved exceptions.
- `plugins/marketer/skills/humanly/references/word-table-zh.md` — Chinese tiers and banned sentence patterns.
- `plugins/marketer/skills/humanly/references/word-table-en.md` — English tiers and the new banned sentence pattern section.
- `plugins/marketer/skills/humanly/references/patterns-zh.md` — Chinese pattern style and existing related rules.
- `plugins/marketer/skills/humanly/references/patterns-en.md` — English pattern style and existing related rules.
- `plugins/marketer/skills/humanly/scripts/build-prewrite.py` — `word_sections` extraction list.

## Files to Create/Modify

- `plugins/marketer/skills/humanly/references/word-table-zh.md` — add approved Chinese terms, sentence patterns, and source-header standards.
- `plugins/marketer/skills/humanly/references/word-table-en.md` — add approved English terms, create banned sentence patterns section, and add source-header standards.
- `plugins/marketer/skills/humanly/references/patterns-zh.md` — add and update approved review-only patterns and exceptions.
- `plugins/marketer/skills/humanly/references/patterns-en.md` — add and update approved review-only patterns and exceptions.
- `plugins/marketer/skills/humanly/scripts/build-prewrite.py` — include the English banned sentence patterns heading in `word_sections`.
- `plugins/marketer/skills/humanly/references/generated/prewrite-zh.md` — regenerate only.
- `plugins/marketer/skills/humanly/references/generated/prewrite-en.md` — regenerate only.

## Acceptance Criteria

- [ ] Test command: `python3 plugins/marketer/skills/humanly/scripts/build-prewrite.py --check`
- [ ] The build command without `--check` regenerates both generated prewrite files successfully.
- [ ] The English generated prewrite file includes the new English banned sentence patterns section.
- [ ] `rg -n "痛點|剛需|復盤|寶子們|家人們|其實" plugins/marketer/skills/humanly/references/word-table-zh.md` returns no matches for newly added entries.
- [ ] New batch-three review-only patterns appear in the generated appendix index but their full bodies are not included in the selected prewrite pattern section.
- [ ] `unlock` is not used as a recommended replacement if it is classified as an AI-ish term.
- [ ] Pattern numbering remains contiguous in both language catalogs.
- [ ] This PR does not add `slop-scan.py` or hard-evidence scanning; that belongs to PR4.

## Notes

- Err on the side of not adding a term when the handoff says the signal is weak or local usage is normal.
- Keep the batch focused on catalog and word-table data plus the minimal build-script extraction update needed for English banned sentence patterns.
