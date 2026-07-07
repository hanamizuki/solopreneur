---
name: humanly
description: "Remove AI writing patterns from text. Three modes: (1) prewrite — read before writing to internalize anti-AI-slop rules, (2) rewrite — full post-writing audit with severity tiers and two-pass rewrite, (3) review — flag-only audit without rewriting. Use when: editing drafts for AI tells, cleaning up AI writing, auditing copy, making text sound human, 去 AI 味, 潤稿, 檢查 AI 味. Also use as a prewrite reference before composing any public-facing text."
---

# Humanly — AI Writing Pattern Removal

Remove signs of AI-generated writing. Based on Wikipedia's "Signs of AI writing" and the avoid-ai-writing skill.

**Core principle:** If you wouldn't say it, don't write it. Write like a smart friend talking.

---

## Mode Detection

| Mode | Trigger | Behavior |
|---|---|---|
| **prewrite** | Before writing; other skills reference this skill | Read `generated/prewrite-{lang}.md`, internalize, do not run the pipeline |
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

### Step 3: Detect Context Profile

Auto-detect from content cues (see context-profiles.md), or accept user hint:
- `social` / `social-zh` / `blog` / `technical-blog` / `investor-email` / `docs` / `support-email` / `casual`

Apply the tolerance matrix — some rules are relaxed or skipped per profile.

### Step 4: First Pass — Scan by Severity

**P0 — Credibility killers (fix immediately):**
- Cutoff disclaimers ("As of my last update")
- Chatbot artifacts ("I hope this helps!", "Great question!")
- Vague attributions without sources ("Experts believe")
- Significance inflation on routine events

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

### Step 5: Cross-Language Checklist

Run through these checks regardless of language:

- Three consecutive sentences same length? Break one up
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

### Step 6: Quality Scoring

Score on 5 dimensions (1-10 each, total 50):

| Dimension | Criteria |
|-----------|----------|
| Directness | States facts or announces them with buildup? |
| Rhythm | Sentence length varies? |
| Trust | Respects reader intelligence? |
| Authenticity | Sounds like a real person? |
| Conciseness | Anything left to cut? |

Thresholds: 45-50 excellent, 35-44 good, below 35 needs another pass.

### Step 7: Second Pass Audit

Re-read the rewritten version:
1. Identify any remaining AI tells that survived the first pass
2. Check for recycled transitions, lingering inflation, copula swaps
3. Fix and note what changed
4. If score was below 35, repeat from Step 4

### Step 8: Output

**Rewrite mode** — return 4 sections:
1. **Issues found**: every AI-ism identified, quoted, with severity (P0/P1/P2)
2. **Rewritten version**: clean version
3. **What changed**: brief summary of major edits
4. **Second-pass audit**: surviving tells fixed, or "clean"

**Review mode** — return 2 sections:
1. **Issues found**: grouped by severity (P0/P1/P2)
2. **Assessment**: which flags are clear problems vs. judgment calls

---

## Self-Reference Escape Hatch

When writing *about* AI patterns (blog posts, tutorials, documentation): quoted examples, code blocks, and text explicitly marked as illustrative are exempt from flagging. Only flag patterns in the author's own prose.

---

## Maintenance

Five source files, two generated files (built from four of them), one build script:

| File | Role |
|------|------|
| `references/patterns-{zh,en}.md` | **Source** — pattern catalog. Each entry has a one-line `摘要：` / `Summary:` under its title; a `prewrite` flag marks entries whose full text gets extracted into the prewrite file. zh/en numbering is independent. |
| `references/word-table-{zh,en}.md` | **Source** — banned words (3 tiers); zh also holds banned sentence patterns. |
| `references/context-profiles.md` | **Source** — tolerance matrix, shared across languages. |
| `references/generated/prewrite-{zh,en}.md` | **Generated — never hand-edit.** Built from patterns + word-table. |

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

Sources: [blader/humanizer](https://github.com/blader/humanizer), [brandonwise/humanizer](https://github.com/brandonwise/humanizer), [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop), [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh)
