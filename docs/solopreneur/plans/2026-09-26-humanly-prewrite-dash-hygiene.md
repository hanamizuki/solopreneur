# Humanly: Prewrite Dash Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Plan-Branch: feat/humanly-prewrite-dash-hygiene

**Goal:** Make the humanly prewrite bundles stop using the em dash they tell the model never to use, so the skill's own instruction prose obeys the rule it teaches.

**Architecture:** One script change and a set of punctuation-only prose edits. `scripts/build-prewrite.py` stops writing " — " into the banner and the appendix index (the index becomes a table) and follows renamed section headings. The source prose that feeds the bundles is rewritten without dashes. The bundles and the Claude package are regenerated at the end.

**Tech Stack:** Python 3 stdlib (`build-prewrite.py`), Markdown sources, Claude Code subagents for the benchmark.

**Spec:** `todos/backlog/2026-09-26_humanly-wikipedia-signs-refresh.md`, section C.

## What the evidence says before starting

The three prewrite-mode outputs from the #195 eval (PRE-01 zh, PRE-02 en, P-PRE-B1 en) were composed from the current dash-heavy bundles and contain **zero** em dashes, en dashes or Chinese 「——」. The bundles' explicit "target zero" rule already suppresses them. So this change is not expected to move PRE results, and no before/after output experiment is planned: at a base rate of zero it could not show an effect. The value is consistency. A skill that breaks its own punctuation rule in every index line invites the critique the Reddit thread made, and it would confuse the next maintainer.

## Scope

In: every em dash in text that reaches `references/generated/prewrite-{en,zh}.md`, except where the dash is the subject being discussed.
Kept on purpose (mentions, not uses): the en rhythm bullet's "(— and --)" and "(–)", the zh rhythm bullet's 「破折號（——／—）」「–、－」, `taiwan-localization.md`'s 「破折號在中文裡本來就該是全形「——」」, and en dash ranges such as "9:00–17:00".
Out: semicolons (the zh bundle also bans 「；」, but the en summary lines use ";" by convention across all 42 entries, so fixing one language alone would be inconsistent; recorded as a follow-up), dashes in files that do not reach the bundles (`SKILL.md`, the rest of the pattern catalogs, `protected-list.md`), the word-table re-tiering.

## Global Constraints

- `references/generated/**` and `plugins/claude/**` change only through `build-prewrite.py` and `scripts/generate-plugin-packages.sh`.
- No meaning changes. Each rewrite swaps the dash for a period, comma or parentheses and keeps every other word. zh keeps full-width punctuation.
- No new semicolons or announcement colons in rewritten sentences.
- No version bump.
- Code comments in English (the repo has a LICENSE).
- No metered API. Eval runs use Claude Code subagents, at most 20 at a time.

## Review Focus

1. The bundle must still build and `--check` must pass after the section headings are renamed. Keys and headings change in the same commit.
2. A pattern title or summary containing `|` would break the new index table. The builder escapes it.
3. zh rewrites must read as natural Taiwan Chinese, not as sentences with a dash deleted.
4. A rewrite must not flip or soften an instruction (for example "do not invent one" must stay as strong).
5. The generated index must still list every pattern, in order, with its summary.

---

### Task 1: Builder — banner, section keys, index table

**Files:** `skills/marketer/humanly/scripts/build-prewrite.py`

- [ ] **Step 1:** `CONFIGS["zh"]["word_sections"]` becomes `["## Tier 1（必換）", "## 禁用句型（看到就刪）"]`; `CONFIGS["en"]["word_sections"]` becomes `["## Tier 1 (Always Replace)"]`.
- [ ] **Step 2:** add `"appendix_table_header": "| # | Pattern | 摘要 |"` to the zh config and `"appendix_table_header": "| # | Pattern | Summary |"` to the en config.
- [ ] **Step 3:** `BANNER` first line becomes `"<!-- AUTO-GENERATED. DO NOT EDIT.\n"`.
- [ ] **Step 4:** replace the index loop

```python
    for entry in entries:
        out.append(f"- #{entry['num']} {entry['title']} — {entry['summary']}")
```

with

```python
    # A table, not "- #N Title — summary": the bundles tell the model never to
    # use an em dash, and a "Label: text" list would be the inline-header
    # pattern (#15). Pipes inside a cell are escaped so a summary cannot split it.
    out.append(cfg["appendix_table_header"])
    out.append("|---|---|---|")
    for entry in entries:
        title = entry["title"].replace("|", "\\|")
        summary = entry["summary"].replace("|", "\\|")
        out.append(f"| {entry['num']} | {title} | {summary} |")
```

- [ ] **Step 5:** the build is verified in Task 3, after the headings it reads have been renamed.

### Task 2: Source prose

**Files:** `references/word-table-en.md`, `references/word-table-zh.md`, `references/patterns-en.md`, `references/patterns-zh.md`, `references/taiwan-localization.md`

Each row: exact text to replace → replacement.

**word-table-en.md**

| Old | New |
|---|---|
| `- **Tier 1 — Always flag.**` | `- **Tier 1 (always flag).**` |
| `- **Tier 2 — Flag in clusters.**` | `- **Tier 2 (flag in clusters).**` |
| `- **Tier 3 — Flag by density.**` | `- **Tier 3 (flag by density).**` |
| `## Tier 1 — Always Replace` | `## Tier 1 (Always Replace)` |
| `## Tier 2 — Flag When 2+ in Same Paragraph` | `## Tier 2 (Flag When 2+ in Same Paragraph)` |
| `## Tier 3 — Flag Only at High Density` | `## Tier 3 (Flag Only at High Density)` |
| `(cut — say something specific or nothing)` (2 rows) | `(cut it, then say something specific or nothing)` |
| `(cut — just state the thing)` | `(cut it and just state the thing)` |

**word-table-zh.md**

| Old | New |
|---|---|
| `- **Tier 1 — 必換。**` | `- **Tier 1（必換）。**` |
| `- **Tier 2 — 聚集時才換。**` | `- **Tier 2（聚集時才換）。**` |
| `- **Tier 3 — 高密度才換。**` | `- **Tier 3（高密度才換）。**` |
| `## Tier 1 — 必換` | `## Tier 1（必換）` |
| `## 禁用句型 — 看到就刪` | `## 禁用句型（看到就刪）` |
| `## Tier 2 — 同段落出現 2+ 才換` | `## Tier 2（同段落出現 2+ 才換）` |
| `## Tier 3 — 高密度才換` | `## Tier 3（高密度才換）` |

**patterns-en.md**

| Old | New |
|---|---|
| `the instruction models most often over-execute — performing humanity is just a different flavor of slop:` | `the instruction models most often over-execute, and performing humanity is just a different flavor of slop:` |
| `is the same move as bolting on "In conclusion" — just aimed the other way.` | `is the same move as bolting on "In conclusion", just aimed the other way.` |
| ``leave `(needs author input: what did you actually do here?)` — **do not invent one**.`` | ``leave `(needs author input: what did you actually do here?)`. **Do not invent one.**`` |
| `show you the **target shape** — it is` | `show you the **target shape**. It is` |

**patterns-zh.md**

| Old | New |
|---|---|
| `**不一定要補上另一個結尾**——可以停在` | `**不一定要補上另一個結尾**，可以停在` |
| `「為了有人味而演出來的人味」——那只是換一種 AI 腔：` | `「為了有人味而演出來的人味」，那只是換一種 AI 腔：` |
| `比原本那句空話糟糕得多——空話只是無聊，假故事是說謊。` | `比原本那句空話糟糕得多。空話只是無聊，假故事是說謊。` |
| `「這堂課 4,800」）——那是為了讓你看見` | `「這堂課 4,800」）。那是為了讓你看見` |
| `AI 文本像節拍器——句子長度均勻` | `AI 文本像節拍器，句子長度均勻` |
| `你就不准替他寫——那是捏造經歷，` | `你就不准替他寫，那是捏造經歷，` |
| `#33「讓我們」句型不同——那兩種是廣播` | `#33「讓我們」句型不同。那兩種是廣播` |
| `講起？）」——**不要為了滿足` | `講起？）」。**不要為了滿足` |
| `我就直說了——當成獨立的開場鉤子用` | `我就直說了（當成獨立的開場鉤子用時）` |

**taiwan-localization.md**

| Old | New |
|---|---|
| `即使裡面有左欄的詞——引用一個中國受訪者說` | `即使裡面有左欄的詞也一樣。例如引用一個中國受訪者說` |
| `這類詞不在表上就是放行——要禁請改這個檔` | `這類詞不在表上就是放行。要禁請改這個檔` |
| `引句冒號不在其列——規則寫在` | `引句冒號不在其列。規則寫在` |

- [ ] **Step 1:** apply every row with an exact-match edit that asserts one match per row (two for the duplicated en Tier 1 row).
- [ ] **Step 2:** the todo that cites the old headings (`todos/backlog/2026-09-26_humanly-wikipedia-signs-refresh.md`) is not edited on this branch; its status note is updated on `main` after merge.

### Task 3: Rebuild and verify

- [ ] **Step 1:** `python3 skills/marketer/humanly/scripts/build-prewrite.py`, then `--check` (two OK lines, 42 en and 50 zh patterns).
- [ ] **Step 2:** mechanical check: in both bundles, every remaining `—` or `–` sits on one of the kept mention lines listed in Scope. Print any other line and fail.
- [ ] **Step 3:** the appendix table has exactly one row per pattern, numbered 1..N in order.
- [ ] **Step 4:** commit the script, sources and bundles together (`refactor(humanly): drop em dashes from the prewrite bundles`), since the headings and the keys must change in one commit.

### Task 4: Benchmark run

Per `evals/run-eval.md`: FID and OVER always; NEW, TW and CAL because catalog and word-table text changed; PRE because both bundles moved. That is all 35 cases, one fresh subagent each, graded with the rules in the #195 plan (`docs/solopreneur/plans/2026-09-26-humanly-wikipedia-signs-refresh.md` § Shared eval harness), with FID and OVER rewrites read by hand. Same pass and block rules as #195.

### Task 5: Package, push, PR

- [ ] `scripts/generate-plugin-packages.sh`, confirm `git status --porcelain` shows only `plugins/claude/marketer/skills/humanly/**`, commit, push, open the PR with the evidence note above and the benchmark result.
