---
name: humanly
description: "Remove AI writing patterns from text. Three modes: (1) prewrite — read before writing to internalize anti-AI-slop rules, (2) rewrite — full post-writing audit with severity tiers and two-pass rewrite, (3) review — flag-only audit without rewriting. Use when: editing drafts for AI tells, cleaning up AI writing, auditing copy, making text sound human, 去 AI 味, 潤稿, 檢查 AI 味. Also use as a prewrite reference before composing any public-facing text."
---

# Humanly — AI Writing Pattern Removal

Remove signs of AI-generated writing. Based on Wikipedia's "Signs of AI writing" and the avoid-ai-writing skill.

**Core principle:** If you wouldn't say it, don't write it. Write like a smart friend talking.

**Order of operations:** protect the facts, *then* strip the AI patterns, *then* add voice. In that order. A sentence with a point of view that broke a fact is worse than a boring sentence that is correct. And **never invent** a number, a source, or the author's memories to fill a hole you just made — leave a placeholder and hand it back. See `references/protected-list.md`.

---

## Mode Detection

| Mode | Trigger | Behavior |
|---|---|---|
| **prewrite** | Before writing; other skills reference this skill | Read `references/generated/prewrite-{lang}.md`, internalize, do not run the pipeline |
| **rewrite** | "rewrite", "clean up", "fix", "去 AI 味", "潤稿", "幫我改" | Full pipeline + rewrite; output 4 sections |
| **review** | "review", "audit", "scan", "check", "檢查" | Same pipeline but flag-only; output 2 sections (Issues found / Assessment) |

---

## Prewrite Mode

When invoked before writing:

1. Detect target language from context
2. Read the corresponding generated prewrite file (path relative to this SKILL.md):
   - 中文 → `references/generated/prewrite-zh.md`
   - English → `references/generated/prewrite-en.md`
3. Internalize the principles and examples, then proceed with the writing task

The prewrite file already bundles the core principles, the highest-frequency
patterns with before/after examples, the Tier 1 word table (plus banned
sentence patterns for zh), and a one-line index of every pattern. Do NOT
additionally load the full patterns file — it is for rewrite / review mode.

---

## Rewrite / Review Mode Pipeline

### Step 1: Detect Language

Determine the primary language of the input text.

### Step 2: Load References

Read these files (paths relative to this SKILL.md):

| File | Purpose |
|------|---------|
| `references/patterns-{lang}.md` | Pattern categories with before/after examples |
| `references/word-table-{lang}.md` | 3-tier word replacement table (+ banned sentence patterns for zh) |
| `references/context-profiles.md` | Tolerance matrix by content type |
| `references/protected-list.md` | What a rewrite may never touch, and what it may never invent |
| `references/taiwan-localization.md` | **zh only, loaded by default.** Mainland→Taiwan vocabulary, full-width punctuation, register. Skip the layer only if the user says the audience is mainland China — never infer it |

### Step 3: Detect Context Profile

Auto-detect from content cues (see context-profiles.md), or accept user hint:
- `social` / `social-zh` / `blog` / `technical-blog` / `investor-email` / `docs` / `support-email` / `casual`

Apply the tolerance matrix — some rules are relaxed or skipped per profile.

### Step 4: Lock the Protected List

Before touching a word, circle what may not move: prices and numbers, proper
nouns, links and anchor text, real names and directly quoted speech, commitments
(refund policy, warranty, disclaimers, legal wording), and code — commands,
paths, API routes, version strings. Count them — you will verify the same count
in Step 9.

Quotation marks alone are not protection: scare quotes and emphasis quotes stay
editable. The test is attribution — can you name who said it?

Full definitions, the false-positive table, and the never-invent rule:
`references/protected-list.md`.

### Step 5: First Pass — Scan by Severity

**P0 — Credibility killers (fix immediately):**
- Cutoff disclaimers ("As of my last update")
- Chatbot artifacts ("I hope this helps!", "Great question!")
- Vague attributions without sources ("Experts believe")
- Significance inflation on routine events
- Hallucinated citations — decimal-precise studies, misattributed quotes. Mark `[source unverified]` / 〔需查證來源〕, keep the sentence verbatim, never verify or invent
- AI tool residue — `utm_source=chatgpt.com`, `turn0search0`, `citeturn`. Grep for these; it is the one class you can catch mechanically
- Unfilled template placeholders — `[Product Name]`, `[insert case study]`. Flag them, never fill them in. Not merge tags in an actual template, and not deliberate anonymization — see the boundary on the catalog entry

**P1 — Obvious AI smell (fix before output):**
- Tier 1 word violations
- Template phrases and slot-fill constructions
- "Let's" transition openers
- Synonym cycling within a paragraph
- Formulaic openings
- Bold overuse, em dash frequency

**P2 — Stylistic polish (fix when possible):**
- Generic conclusions
- Rule of three
- Uniform paragraph length
- Copula avoidance
- Transition phrases

### Step 6: Cross-Language Checklist

Run through these checks regardless of language:

- Three consecutive sentences same length? Break one up
- Three consecutive sentences all *short*, hammering for drama? Merge them back — that is the same metronome, just faster
- The piece takes no position at all ("both have their merits", "it depends on the person")? Ask the author which one they picked and why. Never pick for them
- Opens with an era-hat ("In today's rapidly evolving landscape")? Delete the first paragraph and ask whether the piece lost any information. If it didn't, the paragraph was warm-up. If it did, keep it — some era-openings are the argument
- Paragraph ends with a tidy one-liner? Vary the ending
- Em dash before a reveal? Remove it
- Explaining a metaphor? Trust the reader
- Conjunctive adverbs (Additionally, However)? Consider removing
- Rule of three? Use two items or four
- Symmetrical slogans ("Not X, but Y")? Just say Y
- Contrast adds no new information (surface/deeper, "the real problem is")? Cut the frame, state the point with evidence
- Ends with a life lesson or quotable line? Delete or replace with a concrete fact
- More than 1 quoted term? Keep only the most essential one
- Announcement filler ("You won't believe...")? Just say the content

### Step 7: Quality Scoring

Score on 5 dimensions (1-10 each, total 50):

| Dimension | Criteria |
|-----------|----------|
| Directness | States facts or announces them with buildup? |
| Rhythm | Sentence length varies? |
| Trust | Respects reader intelligence? |
| Authenticity | Sounds like a real person? |
| Conciseness | Anything left to cut? |

Thresholds: 45-50 excellent, 35-44 good, below 35 needs another pass.

### Step 8: Second Pass Audit

Re-read the rewritten version:
1. Identify any remaining AI tells that survived the first pass
2. Check for recycled transitions, lingering inflation, copula swaps
3. Check what *you* introduced: fake-candor hooks ("honestly,"「說真的」), staccato drama, manufactured aphorisms, an invented anecdote or change of heart. Removing slop by adding a different slop is the most common failure of this pipeline
4. Fix and note what changed
5. If score was below 35, repeat from Step 5

### Step 9: Fidelity Read-Back

Not optional. Run it even in automated pipelines.

1. Re-count the items locked in Step 4 and confirm each one survives verbatim
2. Confirm no fact, number or source appears that was not in the source text
3. Confirm the author's position did not flip or soften
4. Confirm the register held — a notice still reads as a notice

Any check fails: fix it, don't ship it.

### Step 10: Output

**Rewrite mode** — return 4 sections:
1. **Issues found**: every AI-ism identified, quoted, with severity (P0/P1/P2)
2. **Rewritten version**: clean version
3. **What changed**: brief summary of major edits
4. **Second-pass audit**: surviving tells fixed, or "clean"

**Review mode** — return 2 sections:
1. **Issues found**: grouped by severity (P0/P1/P2)
2. **Assessment**: which flags are clear problems vs. judgment calls

**Markers, in the target language.** When cutting the filler leaves a hole only
the author can fill, mark it in place and move on:

| | 中文 | English |
|---|---|---|
| Fact only the author has | `（需作者補充：具體教什麼／來了多少人）` | `(needs author input: which feature, how many users)` |
| Citation that needs checking | `〔需查證來源〕` **before** the original sentence, which stays verbatim | `[source unverified]` **before** the original sentence, which stays verbatim |

A rewrite that comes back mostly markers is **not a failure**. For a draft that
was all air, it is the correct result — the ball goes back to the author.

---

## Self-Reference Escape Hatch

When writing *about* AI patterns (blog posts, tutorials, documentation): quoted examples, code blocks, and text explicitly marked as illustrative are exempt from flagging. Only flag patterns in the author's own prose.

---

## Maintenance

Seven source files, two generated files (built from four of them), one build script:

| File | Role |
|------|------|
| `references/patterns-{zh,en}.md` | **Source** — pattern catalog. Each entry has a one-line `摘要：` / `Summary:` under its title; a `prewrite` flag marks entries whose full text gets extracted into the prewrite file. zh/en numbering is independent. |
| `references/word-table-{zh,en}.md` | **Source** — banned words (3 tiers); zh also holds banned sentence patterns. |
| `references/context-profiles.md` | **Source** — tolerance matrix, shared across languages. |
| `references/protected-list.md` | **Source** — fidelity: protected categories, never-invent rules, false positives. Shared across languages. |
| `references/taiwan-localization.md` | **Source** — zh only: mainland→Taiwan vocabulary, punctuation, register. Not part of the prewrite build. |
| `references/generated/prewrite-{zh,en}.md` | **Generated — never hand-edit.** Built from patterns + word-table. |
| `evals/benchmark.md` | Test cases guarding the pattern catalog and the fidelity layer. Run per `evals/run-eval.md` after changing any source file. |

To change anything: edit the source file, then run

```bash
python3 plugins/marketer/skills/humanly/scripts/build-prewrite.py
```

`--check` verifies the generated files are current (the script also fails on
missing summary lines or non-contiguous numbering). Each source file's header
comment says exactly where new content belongs.

---

## Reference

Based on [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) and [avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing) v3.3.0 (MIT License).

The fidelity layer (`protected-list.md`), the Taiwan localization layer, zh
patterns #41–#50, and en patterns #39–#41 are adapted from
[Raymondhou0917/speak-human-tw](https://github.com/Raymondhou0917/speak-human-tw)
(MIT License).

Sources: [blader/humanizer](https://github.com/blader/humanizer), [brandonwise/humanizer](https://github.com/brandonwise/humanizer), [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop), [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh)
