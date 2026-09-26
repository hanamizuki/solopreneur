# Humanly: Prewrite Dash Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Plan-Branch: feat/humanly-prewrite-dash-hygiene

**Goal:** Make the humanly prewrite bundles stop using the em dash they tell the model never to use, so the skill's own instruction prose obeys the rule it teaches.

**Architecture:** One script change and a set of punctuation-only prose edits. `scripts/build-prewrite.py` stops writing " — " into the banner and the appendix index (the index becomes a table) and follows renamed section headings. The source prose that feeds the bundles is rewritten without dashes. The bundles and the Claude package are regenerated at the end.

**Tech Stack:** Python 3 stdlib (`build-prewrite.py`), Markdown sources, Claude Code subagents for the benchmark.

**Spec:** `todos/backlog/2026-09-26_humanly-wikipedia-signs-refresh.md`, section C.

## What the evidence says before starting

The three prewrite-mode outputs from the #195 eval (PRE-01 zh, PRE-02 en, P-PRE-B1 en) were composed from the current dash-heavy bundles. Counted directly, they contain no em dash, no en dash and no Chinese 「——」. Three samples cannot prove a base rate, but they give no sign that the bundles' own dashes leak into output, and a small before/after run could not show an effect either. So this PR claims consistency, not a behavior change. A skill that breaks its own punctuation rule in every index line invites the critique the Reddit thread made, and it would confuse the next maintainer.

## Scope

In: every em dash in text that reaches `references/generated/prewrite-{en,zh}.md`, except where the dash is the subject being discussed. That includes five summary lines whose own text carries a dash (en #39, #41, zh #44, #47, #49), not only the builder's separator. The word tables' Tier 2/3 headings and tier intro bullets do not reach the bundles; they change only so each file stays consistent with its renamed Tier 1 heading.
Kept on purpose (mentions, not uses): the en rhythm bullet's "(— and --)" and "(–)", the zh rhythm bullet's 「破折號（——／—）」「–、－」, `taiwan-localization.md`'s 「破折號在中文裡本來就該是全形「——」」, and en dash ranges such as "9:00–17:00".
Out: semicolons (the zh bundle also bans 「；」, but the en summary lines use ";" by convention across all 42 entries, so fixing one language alone would be inconsistent; recorded as a follow-up), dashes in files that do not reach the bundles (`SKILL.md`, the rest of the pattern catalogs, `protected-list.md`), the word-table re-tiering.

## Global Constraints

- `references/generated/**` and `plugins/claude/**` change only through `build-prewrite.py` and `scripts/generate-plugin-packages.sh`.
- Meaning, strength and scope stay the same. A rewrite may make the smallest grammatical change a dash-free sentence needs (a period, a comma, a joining word). zh keeps full-width punctuation.
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
- [ ] **Step 2:** (removed in plan review: one shared table header, no per-language config key.)
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
    out.append("| # | Pattern | Summary |")
    out.append("|---|---|---|")
    for entry in entries:
        title = entry["title"].replace("|", "\\|")
        summary = entry["summary"].replace("|", "\\|")
        out.append(f"| #{entry['num']} | {title} | {summary} |")
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
| `(cut — say something specific or nothing)` (2 rows) | `(cut, or say something specific instead)` |
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
| `你就不准替他寫——那是捏造經歷，` | `你就不准替他寫。那是捏造經歷，` |
| `#33「讓我們」句型不同——那兩種是廣播` | `#33「讓我們」句型不同。那兩種是廣播` |
| `講起？）」——**不要為了滿足` | `講起？）」。**不要為了滿足` |
| `**需要注意的詞彙：** 說真的、老實說、講白了、其實吧、不騙你、跟你說個秘密、我就直說了——當成獨立的開場鉤子用` | `**需要注意的詞彙（當成獨立的開場鉤子用時）：** 說真的、老實說、講白了、其實吧、不騙你、跟你說個秘密、我就直說了` |

**Summary lines** (reach the bundle through the appendix index)

| File | Old | New |
|---|---|---|
| patterns-en.md #39 | `Summary: a decimal-precise study that doesn't exist, a quote pinned on the wrong person — mark` … | `Summary: for a decimal-precise study that doesn't exist or a quote pinned on the wrong person, mark` … (rest unchanged) |
| patterns-en.md #41 | ``Summary: `[Product Name]`, `[Company]`, `{{name}}` — flag each one for the author, never fill them in`` | ``Summary: flag each `[Product Name]`, `[Company]` or `{{name}}` for the author, never fill them in`` |
| patterns-zh.md #44 | `後面卻只接一句普通的話——去 AI 味時` | `後面卻只接一句普通的話，這是去 AI 味時` (the `｜prewrite` flag stays) |
| patterns-zh.md #47 | `摘要：精確到小數點卻查無此研究、張冠李戴的語錄——標「〔需查證來源〕」交回作者` | `摘要：遇到精確到小數點卻查無此研究、張冠李戴的語錄，就標「〔需查證來源〕」交回作者` |
| patterns-zh.md #49 | `摘要：（此處填入品牌名）、[產品名稱]、XX 公司——逐一標出請作者填` | `摘要：（此處填入品牌名）、[產品名稱]、XX 公司這類空位，逐一標出請作者填` |

**taiwan-localization.md**

| Old | New |
|---|---|
| `即使裡面有左欄的詞——引用一個中國受訪者說` | `即使裡面有左欄的詞也一樣。例如引用一個中國受訪者說` |
| `這類詞不在表上就是放行——要禁請改這個檔` | `這類詞不在表上就是放行。要禁請改這個檔` |
| `引句冒號不在其列——規則寫在` | `引句冒號不在其列。規則寫在` |

- [ ] **Step 1:** apply every row with an exact-match edit that asserts one match per row (two for the duplicated en Tier 1 row).
- [ ] **Step 2:** the todo that cites the old headings (`todos/backlog/2026-09-26_humanly-wikipedia-signs-refresh.md`) is not edited on this branch; its status note is updated on `main` after merge.

### Task 3: Rebuild and verify

- [ ] **Step 1:** `python3 skills/marketer/humanly/scripts/build-prewrite.py`, then `--check`. Expect `prewrite-zh.md (50 patterns, 11 prewrite)` and `prewrite-en.md (42 patterns, 7 prewrite)`. A drop in the prewrite count means a `｜prewrite` flag was damaged (zh #44 carries one).
- [ ] **Step 2:** mechanical check: in both bundles, every remaining `—` or `–` sits on one of the kept mention lines listed in Scope. Print any other line and fail.
- [ ] **Step 3:** compare the appendix table with the builder's own parse: import `parse_patterns` from the script, and assert that the table rows equal `(#num, title, summary)` for every entry, in order. Also render one synthetic entry whose summary contains `|` and assert the cell round-trips (escaped in the file, intact when unescaped).
- [ ] **Step 4:** commit the script, sources and bundles together (`refactor(humanly): drop em dashes from the prewrite bundles`), since the headings and the keys must change in one commit.

### Task 4: Benchmark run

Subagents read `/Users/Hana/Agents/nana/repos/solopreneur-humanly-dash-hygiene/skills/marketer/humanly`. The baseline for any failure comparison is `f43f0011` (after #195, before this cleanup), snapshotted with `git archive`. Per `evals/run-eval.md`: FID and OVER always; NEW, TW and CAL because catalog and word-table text changed; PRE because both bundles moved. That is all 35 cases, one fresh subagent each, graded with the rules in the #195 plan (`docs/solopreneur/plans/2026-09-26-humanly-wikipedia-signs-refresh.md` § Shared eval harness), with FID and OVER rewrites read by hand. Same pass and block rules as #195.

### Task 5: Package, push, PR

- [ ] `scripts/generate-plugin-packages.sh`, confirm `git status --porcelain` shows only `plugins/claude/marketer/skills/humanly/**`, commit, push, open the PR with the evidence note above and the benchmark result.

---

## Plan review disposition (2026-09-26)

Reviewers: Codex CLI (read-only), a `marketer` subagent, and an inline lean pass. No user was available for R3, so the author adjudicated as the caller.

| Finding | Source | Severity | Disposition |
|---|---|---|---|
| Five summary lines carry their own dash (en #39, #41, zh #44, #47, #49) | Codex, marketer (independently) | Critical | Adopted: five rows added |
| Eval harness must name this worktree and baseline `f43f0011` | Codex | Important | Adopted |
| "Keep every other word" contradicts rows that add a joining word | Codex, marketer | Important | Adopted: minimal rewrites allowed, meaning and scope fixed |
| #44 word list: the condition must cover the whole list | Codex, marketer | Important | Adopted: condition moved into the label |
| Check the prewrite count, not only the pattern count | marketer | Important | Adopted |
| Verify table content against the parse, including a `\|` case | Codex | Suggestion | Adopted |
| Tier 2/3 edits do not reach the bundles | Codex | Suggestion | Kept, with the reason stated in Scope |
| "Base rate of zero" overclaims from three samples | Codex | Suggestion | Adopted: reworded |
| zh row 6 period, en "cut" row wording, `#N` in the table | marketer | Suggestion | Adopted |
| Per-language table header config | lean | Suggestion | Adopted: one shared header |
