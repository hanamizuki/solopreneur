# Humanly Architecture Source Handoff

This file preserves the approved construction instructions that the scheduled
autopilot run must read. It replaces the original temporary handoff file, which
may not exist in a later cron or worktree session.

## Goal

Finish the approved `humanly` skill architecture adjustments after the mode
rename PR has merged. Do not redesign or reopen decisions already captured here.
The remaining work is split into four sequential PRs:

1. Guardrails, protected spans, convergence stop rule, and sterile-voice pattern.
2. Nominalization syntax pattern.
3. Word-table expansion and companion review-only patterns.
4. `slop-scan.py`, hard-evidence pattern, and build self-collision lint.

Release and cross-repo local plugin cache updates are intentionally out of this
autopilot plan. Run them manually after all four implementation PRs merge.

## Approved Guardrails

Add this section to `plugins/marketer/skills/humanly/SKILL.md` after Mode
Detection and before the mode sections. Translate into English while preserving
the order and meaning:

```text
## Guardrails (before every rule)

humanly is a subtraction engine: remove AI traces, do not inject personality.
Tone comes from the user: their voice guide, the voice already present in the
draft, and the real material they provide. When the text is clean but voiceless,
flag it and ask the user for material; do not invent it for them.

When rules conflict, resolve in this order:

1. Do not fabricate — no edit may add facts, numbers, experiences, sources, or
   scenes not present in the original. If a rule asks for specificity and no
   material exists, this rule wins.
2. Stop when material is missing — if it cannot be fixed, mark it instead of
   half-fixing it. Rewrite mode lists these items as "missing material"; review
   mode only marks them.
3. Protect register — context-profile tolerance beats generic pattern rules
   for technical abbreviations, legal/medical disclaimers, and code conventions.
4. Do not over-sanitize — real personality in the source text, such as catch
   phrases, profanity, intentional repetition, or broken syntax, is not a flaw.
   When unsure whether something is style or AI smell, keep it and mark it as a
   judgment call.
5. Subtract first — once a problem is confirmed, delete or simplify before
   rewriting. Do not replace one template with another.
6. Polish last — rhythm and sentence-length tuning come after the above rules
   and may not violate them.
```

Mode interpretation: prewrite uses rules 1 and 2 as writing red lines; rewrite
uses all rules; review uses rules 1, 2, and 4 to distinguish clear problems from
judgment calls in the Assessment section.

## Approved Protected Spans

Insert before Step 4:

```text
Step 3.5: Inventory protected spans. Scan the source draft and internally copy
five lists: (1) numbers: quantities, dates, percentages, money, units; (2)
versions and models; (3) commands, code, paths, URLs, including inline code
spans; (4) quotations: direct quotes, titles, names, and any AI smell inside a
quote is left untouched because it is source material; (5) attribution: who said,
did, or claimed what. "A claims X" must not become "X".
```

Add to Step 7:

- Check every protected span: each item exists and is unchanged. If anything
  drifted, restore it and report either "no drift" or list what was restored.
- Check every sentence for unchanged claim polarity and strength: positive vs.
  negative direction, and modal strength such as must/can/may not. Legal trimming
  of overqualification may reduce clutter but must not reverse direction.

Clarify the split with the Self-Reference Escape Hatch: the escape hatch controls
what not to flag; protected spans control what not to modify.

## Approved Convergence Rule

Replace Step 7's "if score below 35, repeat from Step 4" rule:

```text
Run Steps 4-7 at most 3 rounds total, including any round that triggers rollback.
After each rewrite, compare against the previous version. If any condition below
is hit, discard this round, return to the previous version, and transparently
report it in the second-pass audit:

(a) thinner text — facts, examples, or steps disappeared rather than filler;
(b) more uniform sentence length — rhythm became flatter than the previous
version; (c) protected-span drift spread across the rewrite; a single drift can
be restored in place, but many drifts mean the round lost control; (d) new Tier 1
word-table terms appear that were not in the original.

If round 3 still scores below 35, stop. Output the best current version, mark
"structural AI smell is too heavy; the author should rewrite from prewrite
guidance instead of continuing to patch", and list the remaining issues.
```

Do not add a percentage-based edit cap.

## Approved Routing Tests

Add to `patterns-{zh,en}.md` headers:

```text
When to add the `prewrite` flag: (1) the rule is actionable while drafting
(word choice, sentence construction, opening, or ending) and not only detectable
after the draft exists; and (2) writers commonly violate it without priming. Both
must pass. The flag is scarce: the full pattern body and examples enter prewrite,
so before adding a new flag, ask what existing flag can be downgraded.
```

Add to `word-table-{zh,en}.md` headers:

```text
Tier 1 and banned sentence pattern sections are extracted into prewrite. Use the
same two-part routing test before adding a Tier 1 entry; weak, rare, or
post-draft-only signals belong in Tier 2/3.
```

## Batch One

- Add central Guardrails.
- Add protected-span inventory and Step 7 checks.
- Add the convergence stop rule.
- Dissolve the `Personality and Soul` / `個性與靈魂` principles chapter. Remove
  additive voice prescriptions and vivid-rewrite examples.
- Convert "soulless writing" signals into a new review-only sterile-voice pattern
  using the next contiguous pattern number in each language. Include the rule
  "three consecutive paragraphs with no concrete detail = flag". Note that docs
  and support email profiles can legitimately use neutral voice.
- Add "read it aloud; if it does not sound like talking to a friend, revise" to
  the formatting/rhythm check.
- Add technical abbreviation allowlist in `context-profiles.md`, including API,
  MCP, and TLDR.
- Add the generated prewrite intro boundary: tone comes from the user's voice
  guide and real material; humanly does not invent personality.

## Batch Two

Add one large `prewrite`-flagged nominalization syntax pattern in both languages.
Chinese scope: `進行` / `加以` / `做出` plus verbal nouns, stacked `的`, stacked
passive `被`, and accumulated `性` / `化` suffixes. English scope:
nominalization chains such as `-tion` / `-ment`, Latinate verb substitutions
such as `utilize -> use`, and actions hidden inside abstract nouns.

## Batch Three

Word tables:

- Chinese banned sentence patterns: summary cliches, era openers, and ordinal
  connective shells.
- Chinese overclaiming tier decisions: `毋庸置疑` and `顯而易見` are Tier 1;
  `眾所周知` is Tier 2.
- English missing terms: `vital`, `milestone`, `indispensable`, `catalyst`,
  `pillar`, `bedrock`, `linchpin`, `mitigate`, `propel`, `transcend`, `thus`,
  and `hence`. Do not add `seamlessly` or `meticulously`; they already exist.
- English banned sentence patterns: throat-clearing, era openers such as
  `In today's fast-paced world`, semicolon overuse, and absolute-word shells.
- Update `build-prewrite.py` so the English banned sentence pattern section is
  extracted.
- Add word-table source standards: three different sources before a term enters
  the table; GPT-4-era word tells are weaker while newer model output has
  stronger structural tells.

Strict exclusions: do not add Taiwan-normalized terms such as `痛點`, `剛需`, or
`復盤`; do not add platform-only phrases such as `寶子們` / `家人們`; do not add
`其實`.

Patterns, all review-only unless an existing rule already has a flag:

- overcertain claims
- stock metaphors and blacklist
- hidden actor / abstract subject
- review-commentary shells only where not already covered
- update `Not X but Y`, rhythm, posture verb, and disclaimer patterns as
  specified in the specs
- add high-risk exception notes only where approved, such as moat in finance
  context and significant in p-value context

## Batch Four

- Add stdlib-only `scripts/slop-scan.py`.
- Parse `word-table-{lang}.md` at runtime for Tier 1 terms and banned sentence
  patterns. Do not duplicate those lists in the script.
- Hardcode only structural checks: banned punctuation, `Not X but Y` variants,
  placeholders, `utm_source=chatgpt.com`, false precision, source leakage such
  as `turn0search0`, and fake DOI shapes.
- Output line number, matched string, category, and category counts.
- Add SKILL.md guidance before Step 4: when `python3` is available, run the
  scanner and feed its hits into the model scan. Hits are not automatically
  violations; misses do not prove the text is clean.
- Add hard-evidence patterns in both catalogs as review-only/detect-only:
  one occurrence is enough to report, but do not auto-repair.
- Add build self-collision lint: generated prose sections must not introduce the
  skill's own Tier 1 terms, while skipping table rows and examples/quoted
  sections to avoid false positives.

## Release And Local Sync

After all four PRs merge, run the release flow manually. The changelog must
mention the mode rename and the `review` semantic swap. Then sync local plugins,
verify old `pre-write-*.md` generated files are gone from the merged skill cache,
and update boba/creator references in the shared `~/Agents` tree as a separate
commit according to repo policy.
