# humanly: refresh against the current Wikipedia "Signs of AI writing"

Trigger: the r/claudeskills post "A free claude skill to de-ai your written
content" (2026-09-24). It ships a `de-ai-writing` skill: a SKILL.md, a
27-sign `references/signs.md` condensed from Wikipedia's *Signs of AI writing*
(September 2026), and a regex scanner (`check_ai_signs.py`, repo link never
posted). Compared both the skill and its primary source,
[Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
(revision 1376815715, 2026-09-26, fetched with `action=raw`), against
`skills/marketer/humanly`.

**Bottom line:** the skill is a subset of humanly (27 signs vs our 41 en /
50 zh patterns; no fidelity layer, no prewrite, no zh). The value is in the
primary source. The current Wikipedia page has evidence that contradicts four
of our rules, and it lists five signs we don't cover. Two critiques from the
comment thread hit humanly too (A4 and C).

---

## A. Evidence that contradicts current humanly rules (fix first)

### A1. `in order to` / `due to the fact that` sit in EN Tier 1

- **Where:** `references/word-table-en.md:63-64` (Tier 1, "Always Replace"),
  which flows into `generated/prewrite-en.md:280-281`. Also the #22 examples
  in `patterns-en.md`.
- **Source:** §"Signs of human writing → Syntax". Isolated wordy constructions
  ("as a result of", "in order to", "all of the", "a part of", "the fact that")
  are empirically *more* common in human-written articles than in AI text.
  The same list names plain is/has, plain verbs (wrote / moved / used / tried /
  died), definitive statements where true ("is the only", "was the first"),
  and ordinary hedges and intensifiers ("very", "perhaps", "tends to").
- **Why it matters:** Tier 1 is defined as "5-20x more frequent in AI text".
  These two fail our own definition, and prewrite steers composition away from
  a human-typical construction.
- **Fix:** drop both from Tier 1. Keep them in #22 only as optional
  conciseness edits, marked "not an AI tell". Add a row to
  `protected-list.md` Likely False Positives that lists the human-signal
  constructions above as leave-alone.

### A2. #18 Curly quotes: "use straight quotes, not curly quotes"

- **Where:** `patterns-en.md:382-394`.
- **Source:** §"Curly quotation marks and apostrophes". Curly quotes alone do
  not prove LLM use: macOS/iOS smart quotes, Word and professional typesetting
  all produce them. It is a ChatGPT/DeepSeek trait, and "Gemini and Claude
  models typically do not use curly quotes". The usable signal is
  *inconsistent mixing* within one text.
- **Why it matters:** as written, the rule mostly fires on human-typed macOS
  text and degrades correct typography.
- **Fix:** flag only mixed curly/straight quotes within one piece; otherwise
  match the surrounding convention. The summary line changes, so rebuild.

### A3. Step 6: "Conjunctive adverbs (Additionally, However)? Consider removing"

- **Where:** `SKILL.md:131`; also P2 "Transition phrases" at `SKILL.md:118`.
- **Source:** §"Ineffective indicators". Transition words in isolation are not
  a strong tell. Only a few are known to be overused, mainly sentence-initial
  *Additionally*, *Consequently* and *Notably*. *However* is not among them.
- **Fix:** narrow the check to that sentence-initial set and to density. Add
  "a lone However / Therefore" to the false-positive table.

### A4. #20 knowledge-cutoff example invents a fact

- **Where:** `patterns-en.md:426`, `patterns-zh.md:474`.
- **Problem:** the Before says the founding date is unknown ("sometime in the
  1990s"). The After resolves it with "founded in 1994, according to its
  registration documents", a made-up year and a made-up source, in the one
  pattern about missing information. A commenter made exactly this critique of
  the de-ai skill ("the output invents 1911 … the scan is the useful half, the
  rewrite is where it bites"). It also contradicts our own Never Invent rule.
- **Source:** §"Knowledge-cutoff disclaimers and speculation about gaps in
  sources", now expanded for retrieval-era models. New words to watch: "not
  widely available/documented/disclosed", "in the provided/available sources /
  search results", "maintains a low profile", "keeps personal details
  private". The sign includes the speculation that follows about what the
  missing information "likely" is.
- **Fix (both languages):** the After keeps only what the source knows ("The
  company was founded in the 1990s.") or uses the marker. Add the new words.
  Add the reader-facing fix from the de-ai skill: when the gap matters to the
  reader, say it once, concretely, with what to do ("Hours aren't posted; call
  ahead.").
- **Related, lower priority:** six more en After examples (#2, #4, #5, #6,
  #19, #27) and eight more zh (#2, #4, #5, #6, #19, #27, #42, #46) add numbers
  the Before never had. The "How to Read the After Examples" disclaimer covers
  them; revisit only if evals show fabrication.

---

## B. Signs on the current page that humanly lacks (small additions)

- **B1. Vague association** (en): "associated with", "in connection with",
  "connected to" in place of the actual relationship ("was associated with
  leadership of" vs "was CEO of"). Zero hits in humanly today. The Wikipedia
  examples run from March 2025 to August 2026, so current models do this.
  Append as en #42.
- **B2. #8 copula avoidance, words to watch** (en): add "functions as /
  operates as / maintains / refers to", plus the elaborate forms Wikipedia
  says appear "especially in more recent AI output": "ventured into politics
  as a candidate" (was a candidate), "began his career as" (was).
- **B3. #9 negative parallelisms** (en): add "no X, no Y, just Z" and
  "Y rather than X" (per Wikipedia, especially common in Grok output). In
  `protected-list.md:150`, replace the "at most once" test with Wikipedia's
  framing: keep a contrast only if a reader would actually assume the
  opposite; otherwise it corrects a misconception nobody raised.
- **B4. #34 excessive structure** (en): add 2-3 row tables that should be a
  sentence, `---` between every section, and paired "X and Y" headings
  ("Awards and recognition", "Challenges and Opportunities").
- **B5. #13 dashes** (en + zh): add "don't swap in an en dash or a spaced
  hyphen; the aside keeps its rhythm, so rewrite the sentence" (the de-ai
  skill's rule). Keep #13 at full strength even though Wikipedia is weighing a
  move of em dashes to Historical: the same section cites a July 2026 study in
  which, of contemporary models, only Claude used em dashes more than
  professional writers.

---

## C. Self-consistency: the prewrite bundles break their own rules

A thread comment on the de-ai skill: "This skill contains 10 AI tells … Can a
skill work if it's using the very language it's attempting to remove?" The
same applies here. Counted in instruction lines (quotes, code and ❌/✅
examples excluded):

| Bundle | Rule | Dashes | From the index separator |
|---|---|---|---|
| `generated/prewrite-en.md` | line 82: em dashes, "Target: zero" | 53 | 41 |
| `generated/prewrite-zh.md` | line 82: 破折號 banned | 71 | 50 |

- The separator comes from `scripts/build-prewrite.py:298`, which joins title
  and summary with " — ". Changing that one line removes most of them.
- The remainder (~12 en, ~21 zh, a few of them mentions of the rule itself)
  lives in source prose that feeds the bundles.
- Careful: `## Tier 1 — Always Replace`, `## Tier 1 — 必換` and
  `## 禁用句型 — 看到就刪` are section keys in `build-prewrite.py:52,89`.
  Rename headers and keys together.
- Effect on output is unmeasured. Verify with the PRE cases in
  `evals/benchmark.md`. Separate PR.

---

## D. Fold into the im-human todo (same files, same PR)

See `2026-08-16_humanly-im-human-learnings.md`.

- **Step 9 read-back conventions:** person (I/we/you), spelling variety
  (UK/US), markup format, and hard length limits (title ~60, meta description
  ~155, button labels, store fields). Wikipedia lists a "sudden shift in
  English variety" as a sign and notes several LLMs default to American
  English, so an Americanizing rewrite adds a tell. Pairs with im-human #2
  (length guard).
- **Rewrite report:** list tells kept on purpose (quotes, proper nouns,
  literal uses). Pairs with im-human #3 (output modes).

---

## Not adopting

- **Regex scanner** (`check_ai_signs.py`): same verdict as the im-human todo,
  a second source of truth next to the word tables. Wikipedia's caveats also
  say pattern hits alone are unreliable.
- **Detector-score claims** (the author reports 70-95% lower detection):
  unverifiable, and not humanly's goal. Wikipedia: detectors have non-trivial
  error rates.
- **Cross-model second pass** (one commenter has Codex or Gemini clean
  Claude's prose): anecdote only. Could be tested against the benchmark later.
- **Voice profile from writing samples:** a separate product.

---

## Bigger, separate: re-tier the word tables against current evidence

Wikipedia now groups AI vocabulary by era (2023 to mid-2024: delve, tapestry,
…; mid-2024 to mid-2025: align with, fostering, showcasing, …; mid-2025 on:
emphasizing, enhance, highlighting, showcasing, plus notability language). It
asks readers to take the list literally: "a word being overused by AI does not
imply that its synonyms are also overused." Our tables, inherited from
avoid-ai-writing v3.3.0, carry many synonyms with no cited evidence (Tier 2:
galvanize, elucidate, juxtapose, quintessential, …). A re-tiering pass against
the page, plus a base-rate check of which patterns the current Claude still
produces without prewrite (a commenter asked exactly this), would cut prewrite
context and false flags. Needs its own eval design.

---

## Implementation notes

- A1, A2, B and C touch prewrite sources. Run
  `python3 skills/marketer/humanly/scripts/build-prewrite.py`, then `--check`.
- Everything: run `scripts/generate-plugin-packages.sh`, then the benchmark
  per `evals/run-eval.md`. Add cases for A4 (an unknown stays unknown) and B1.
- Suggested cut: A + B + D in one PR (roughly 50-70 lines), C in a second,
  re-tiering as its own item.
