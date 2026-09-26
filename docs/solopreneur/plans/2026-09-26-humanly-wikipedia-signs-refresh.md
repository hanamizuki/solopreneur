# Humanly: Wikipedia Signs Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Plan-Branch: feat/humanly-wikipedia-signs-refresh

**Goal:** Bring `skills/marketer/humanly` in line with the current Wikipedia *Signs of AI writing* page: fix four rules the page's evidence contradicts, add the signs it lists that humanly lacks, and add two fidelity/report checks.

**Architecture:** Content-only change to the humanly source files (`references/*.md`, `SKILL.md`, `evals/benchmark.md`). The generated prewrite bundles are rebuilt by `scripts/build-prewrite.py`; the plugin packages by `scripts/generate-plugin-packages.sh`. Behavior is verified the way the repo already does it: `build-prewrite.py --check` for structure, then benchmark cases run in fresh subagents and graded mechanically (`evals/run-eval.md`). New behavior gets probes that are run against a baseline snapshot first (they must be able to fail), then against the changed skill.

**Tech Stack:** Markdown sources, Python 3 stdlib (`build-prewrite.py`, a throwaway grader), Bash (`generate-plugin-packages.sh`), Claude Code subagents for eval runs.

**Spec:** `todos/backlog/2026-09-26_humanly-wikipedia-signs-refresh.md` (sections A, B and D). Evidence: [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), revision 1376815715 (2026-09-26).

## Scope

In: spec A1–A4, B1–B5, D1–D2.
Out (stay in their todos): spec C (the prewrite bundles' own dashes, a separate PR after this one merges because it touches the same files), the word-table re-tiering, and every item of `todos/backlog/2026-08-16_humanly-im-human-learnings.md` (strength knob, output modes, mixed scenes, injection handling, Tier 2/3 thresholds).

## Global Constraints

- Edit sources only. `references/generated/prewrite-{en,zh}.md` change only by running `python3 skills/marketer/humanly/scripts/build-prewrite.py`; `plugins/claude/**` and `plugins/codex/**` only by `scripts/generate-plugin-packages.sh`.
- No `plugin.json` version bump (only `/release` bumps).
- Every pattern keeps a `Summary:` / `摘要：` line; numbering stays contiguous (the build fails otherwise).
- Do not copy Wikipedia prose or examples verbatim (CC BY-SA). Word lists are fine; every example is written fresh.
- Catalog examples must not reuse benchmark inputs, and new benchmark inputs must not reuse catalog examples (`evals/run-eval.md` § Adding cases). Concretely: no "42%" example in the catalog (FID-02 uses 大約 42%).
- New prose adds no em dash (spec C will remove the existing ones). Summary lines keep each file's existing "problem; fix" convention; everywhere else, new prose avoids semicolons and announcement colons, which most profiles flag.
- zh text: full-width punctuation, 「」 quotes, Taiwan vocabulary.
- Do not modify `todos/backlog/2026-09-26_humanly-wikipedia-signs-refresh.md` on this branch. It must stay byte-identical to commit dc024af8 so that local `main`, which carries that commit unpushed, rebases cleanly after the squash merge.
- Eval subagents read the skill from an explicit path. They must not use the Skill tool, which would load the installed release instead of the branch.
- No metered API anywhere (eval runs use Claude Code subagents on the subscription).

## Review Focus

1. A draft that hedges ("likely", "appears to have been") about a date must come back still hedged or marked. Hardening the guess into a fact is a fidelity failure. Probe P-A4 (Task 5).
2. Research text that uses "associated with" for a correlation must keep it. Turning it into "causes" changes the finding. Probe P-B1b (Task 6).
3. A consistently typeset text with curly quotes must keep them. Probe P-A2 (Task 3).
4. A British-spelling text must stay British. Several models default to American English. Probe P-D1 (Task 8).
5. A lone "However" and a plain "in order to" must not be reported as AI tells. Probes P-A3 (Task 4) and P-A1 (Task 2).

---

## Shared eval harness (used by Tasks 1, 10)

Paths used below:

```bash
W=/Users/Hana/Agents/nana/repos/solopreneur-humanly-signs-refresh
H=$W/skills/marketer/humanly
EVAL=<any scratch dir>          # e.g. the session scratchpad
BASE=$EVAL/baseline/skills/marketer/humanly
```

**Rewrite-mode subagent prompt** (one fresh `general-purpose` subagent per case, no shared context). This is `run-eval.md`'s prompt plus an explicit skill path and fixed headings so the grader can split sections:

```text
You are running one benchmark case for a writing skill. Read <SKILL_DIR>/SKILL.md and
follow it exactly. Load the reference files it names from <SKILL_DIR>/references/.
Relative paths inside SKILL.md resolve against <SKILL_DIR>. Do NOT use the Skill tool
and do not read any other copy of this skill.

Apply the skill in rewrite mode to the text below.
Context profile: `<profile>`.
Return the four sections the skill specifies, under exactly these headings:
## Issues found
## Rewritten version
## What changed
## Second-pass audit

Write your complete answer to <OUT_FILE> with the Write tool, then reply "done".

Text:
<input text>
```

**Prewrite-mode subagent prompt** (`PRE-*`): `run-eval.md`'s prewrite prompt with `references/generated/prewrite-{lang}.md` given as an absolute path under `<SKILL_DIR>`, the same "no Skill tool, no other copy" line, and "write only the composed text to <OUT_FILE>".

**Grader:** a throwaway `grade.py` in `$EVAL` (not committed). For each case it extracts `## Issues found` and `## Rewritten version` (or the whole file for `PRE-*`) and applies the case's rule from the tables below. It prints `PASS`/`FAIL` with the failing condition. Checks are substring, regex and digit-set checks only.

Probe cases (new in this plan; each can fail on the baseline):

| ID | Profile | Input | Pass rule |
|---|---|---|---|
| P-A1 | blog | `We moved the backup job to 2 a.m. in order to keep the database quiet during office hours.` | `2 a.m.` in Rewritten; no Issues line that mentions "in order to" is tagged `P0` or `P1` |
| P-A2 | blog | `The release notes call it “the quiet update,” and the team’s tracker lists 14 closed bugs.` | Rewritten has no ASCII `"` and no ASCII `'`, has at least one of `“ ” ’`, has `14` |
| P-A3 | blog | `The pilot cut support tickets by a third. However, two of the five stores saw no change.` | No Issues line mentions `However` |
| P-A4 | blog | `Although records from the bakery's early years are not widely documented, it likely opened sometime in the late 1980s. The owner still uses a starter she brought from Lyon.` | Every digit run in Rewritten appears in the input; `Lyon` in Rewritten; Rewritten contains `needs author input`, or has no `1980s`, or the sentence holding `1980s` also holds one of likely/probably/may/might/appears |
| P-B1 | blog | `Since 2021, Dana has been associated with the city's bus-map redesign, and she was also connected to the transit agency's rider survey.` | Issues mention `associated with` or `connected to`; `2021` in Rewritten; Rewritten contains `needs author input` or none of led/leads/ran/runs/managed/designed/oversaw/headed/directed/coordinated/wrote/conducted |
| P-B1b | technical-blog | `In the 2024 survey, longer screen time was associated with shorter sleep, but the study did not test causation.` | Rewritten contains `associated with` and `2024`, and none of causes/caused/leads to/led to/results in |
| P-D1 | blog | `The organisation's colour guide was finalised in March, and it is crucial to note that every programme team must follow it.` | Rewritten contains `organisation`, `colour`, `finalised`, `programme`, `March` |

Existing suite rules (from `evals/benchmark.md`, made mechanical; "R" = Rewritten, "I" = Issues found, "digits ⊆ input" = every digit run in R appears in the input):

| Case | Rule |
|---|---|
| NEW-01 | I mentions `#41` or `立場`; R contains `需作者補充`; digits ⊆ input |
| NEW-02 | I mentions `#42` or `開場`; R lacks `數位轉型的浪潮`; digits ⊆ input |
| NEW-03 | I mentions `#43` or `金句`; digits ⊆ input |
| NEW-04 | I mentions `#44`; R lacks `老實說` and `講白了`; digits ⊆ input |
| NEW-05 | I mentions `#45`; digits ⊆ input (manual read: no invented cause) |
| NEW-06 | I mentions `#46`; R lacks `不是嗎`; digits ⊆ input |
| NEW-07 | R contains `〔需查證來源〕`, `遠端工作者的產出高出 23.7%`, `「文化能把策略當早餐吃掉。」` |
| NEW-08 | R lacks `utm_source=chatgpt.com`; R contains `https://example.com/guide` |
| NEW-09 | I mentions `#49`; digits ⊆ input (manual read: no invented name) |
| NEW-10 | R has no `**` and no line starting with `- ` |
| TW-01 | R contains 影片 品質 資訊 螢幕; lacks 視頻 質量 信息 屏幕 |
| TW-02 | R contains `40`, `800`, `，`; no ASCII `,` or `.` next to a CJK character |
| TW-03 | R contains 小紅書 and 公眾號 |
| TW-04 | R contains `說：「這個視頻的質量真的不行。」` |
| TW-05 | R contains 內卷 |
| FID-01 | R contains `4,800`, `EARLY500`, `3/31` |
| FID-02 | R contains `大約 42%` |
| FID-03 | R contains `《超級個體工作術》` at least twice |
| FID-04 | R contains `utm_source=newsletter` |
| FID-05 | R contains `14 天內`, `全額`, `不需要任何理由` |
| FID-06 | R contains `小美說：「我上完課的第三個月接到第一個案子。」` (or `小美` plus that quoted sentence with its colon) |
| FID-07 | R contains `立即報名` and `12` |
| FID-08 | R contains `python3 build-prewrite.py --check`, `gpt-5.4-mini`, `/v1/users` |
| FID-09 | R lacks `「無縫」`, `「前所未有」`, `賦能` |
| FID-10 | R contains all three quoted sentences and 小美, 阿哲, 小圓 |
| OVER-01 | R lacks `我以前` and `錯了`; digits ⊆ input |
| OVER-02 | R lacks `說真的` and `老實說` |
| OVER-03 | R contains `大概兩個月`; lacks `一切都變了` |
| OVER-04 | R has no ASCII digit and no `元` |
| OVER-05 | R has no ASCII digit and none of 大學 研究院 學會 協會 期刊 |
| PRE-01 | output lacks 視頻 質量 信息 屏幕 軟件 默認 支持 用戶; no ASCII `,` `.` `?` `!` next to a CJK character |
| PRE-02 | output lacks every Tier 1 word PRE-02 names and lacks `—` |

---

## Task 1: Baseline snapshot and red run of the probes

**Files:** none in the repo. Creates `$EVAL/baseline/`, `$EVAL/out/baseline/`, `$EVAL/grade.py`.

**Interfaces:** Produces the baseline verdict per probe, which decides in Task 10 which probes become benchmark cases ("a case earns its place by having failed once", `run-eval.md`).

- [ ] **Step 1: Snapshot the unchanged skill**

```bash
mkdir -p "$EVAL/baseline" && git -C "$W" archive HEAD skills/marketer/humanly | tar -x -C "$EVAL/baseline"
test -f "$BASE/SKILL.md" && echo ok
```

- [ ] **Step 2: Write `grade.py`** implementing the probe table and the suite table above (section split on the four fixed headings; `digits ⊆ input` = `set(re.findall(r"\d+", R)) <= set(re.findall(r"\d+", input))`).

- [ ] **Step 3: Run the seven probes against `$BASE`**, one fresh subagent each, in parallel, outputs to `$EVAL/out/baseline/<ID>.md`.

- [ ] **Step 4: Grade.** `python3 "$EVAL/grade.py" "$EVAL/out/baseline"`. Record which probes FAIL. Expected: P-A1, P-A2, P-A3 fail (the current rules say to flag or convert). P-A4, P-B1, P-D1 may pass or fail. P-B1b is expected to pass (it guards the new pattern, not the old one).

---

## Task 2: A1 — take `in order to` / `due to the fact that` out of Tier 1

**Files:**
- Modify: `skills/marketer/humanly/references/word-table-en.md` (Tier 1 rows `| in order to | to |` and `| due to the fact that | because |`)
- Modify: `skills/marketer/humanly/references/patterns-en.md` (#22 Filler Phrases bullets)
- Modify: `skills/marketer/humanly/references/protected-list.md` (Likely False Positives table)

- [ ] **Step 1: Delete the two Tier 1 rows** from `word-table-en.md`:

```text
| in order to | to |
| due to the fact that | because |
```

- [ ] **Step 2: Delete the two #22 bullets** from `patterns-en.md`:

```text
- "In order to achieve this goal" → "To achieve this"
- "Due to the fact that it was raining" → "Because it was raining"
```

- [ ] **Step 3: Add a false-positive row** to `protected-list.md`, directly after the `| Stiff officialese | … |` row:

```text
| Plain or wordy phrasing: "in order to", "the fact that", "very", "perhaps", "tends to", "is the only" | Ordinary human writing. Wikipedia's *Signs of AI writing* finds these more often in human text than in AI text | Tighten them for length if the piece needs it, never as an AI tell. A definite claim ("was the first") stays whenever the source supports it |
```

- [ ] **Step 4: Verify**

```bash
grep -nE "^\| (in order to|due to the fact that) \|" "$H/references/word-table-en.md" && echo FAIL || echo ok
python3 "$H/scripts/build-prewrite.py" && grep -c "in order to" "$H/references/generated/prewrite-en.md"   # expect 0
```

- [ ] **Step 5: Commit** `fix(humanly): stop flagging "in order to" as an AI tell`

---

## Task 3: A2 — #18 flags mixed quotes, not curly quotes

**Files:** Modify `skills/marketer/humanly/references/patterns-en.md` (entry `### 18. Curly Quotation Marks`, everything up to the next `---`)

- [ ] **Step 1: Replace the entry body** (keep the `### 18. Curly Quotation Marks` heading) with:

```markdown
Summary: mixed curly and straight quotes in one piece is the tell; consistent curly quotes are typography, keep them

**Problem:** ChatGPT and DeepSeek tend to emit curly quotes (“…”) and curly apostrophes (’), sometimes mixed with straight ones in the same text. Curly quotes on their own prove nothing. Word, macOS and iOS smart punctuation, and professional typesetting all produce them, and Claude and Gemini rarely use them.

**Action:** Flag only a piece that mixes curly and straight quotes or apostrophes, then normalize to the convention the rest of the text (or the house style) already uses. Never convert consistently curly text to straight quotes as an AI fix.

**Before** (curly quotes, straight apostrophe):
> The team called it “a small release,” but the changelog's first line says otherwise.

**After:**
> The team called it “a small release,” but the changelog’s first line says otherwise.
```

- [ ] **Step 2: Verify** `grep -n "u201c" "$H/references/patterns-en.md"` returns nothing (the old entry carried literal `“` escapes); `python3 "$H/scripts/build-prewrite.py"` succeeds.

- [ ] **Step 3: Commit** `fix(humanly): flag mixed quotes, not curly typography`

---

## Task 4: A3 — a lone "However" is not a tell

**Files:**
- Modify: `skills/marketer/humanly/SKILL.md` (Step 6 checklist line `- Conjunctive adverbs (Additionally, However)? Consider removing`)
- Modify: `skills/marketer/humanly/references/protected-list.md` (Likely False Positives table)

- [ ] **Step 1: Replace the Step 6 line** with:

```text
- Sentence-initial "Additionally," or "Moreover," (Tier 1)? Cut it. A lone However, Therefore or Also is ordinary writing, so leave it
```

- [ ] **Step 2: Add a false-positive row** after the row added in Task 2:

```text
| A single transition word (However, Therefore, Also) | Ordinary connective tissue | Wikipedia lists transition words in isolation as an ineffective indicator. Only a few are AI-overused, mainly a sentence-initial "Additionally" (Tier 1). Leave the rest |
```

- [ ] **Step 3: Commit** `fix(humanly): keep ordinary transitions out of the AI-tell list`

---

## Task 5: A4 — #20 covers gap speculation and stops inventing in its own example

**Files:**
- Modify: `skills/marketer/humanly/references/patterns-en.md` (entry #20, heading through the next `---`)
- Modify: `skills/marketer/humanly/references/patterns-zh.md` (entry #20, heading through the next `---`)
- Modify: `skills/marketer/humanly/SKILL.md` (P0 bullet `- Cutoff disclaimers ("As of my last update")`)

- [ ] **Step 1: Replace en #20** (heading included) with:

```markdown
### 20. Knowledge-Cutoff Disclaimers and Gap Speculation

Summary: delete cutoff and "not widely documented" disclaimers; the guess that follows is not a fact, so don't harden it and don't fill the gap

**Words to watch:** as of [date], Up to my last training update, While specific details are limited/scarce..., based on available information..., not widely available/documented/disclosed, in the provided/available sources, in the search results, maintains a low profile, keeps personal details private

**Problem:** AI disclaimers about incomplete information get left in text. Models that search the web add a second move: they announce that a detail "isn't documented", then guess what it "likely" is. Both halves are unverified. The disclaimer may be false, and the guess is speculation dressed as a finding.

**Before:**
> While specific details about the company's founding are not extensively documented in readily available sources, it appears to have been established sometime in the 1990s.

**After:**
> (needs author input: when was the company founded? The draft only guesses "sometime in the 1990s")

**Rules:**
- The author has the fact → write the fact and nothing else.
- Nobody has it → cut the sentence. Don't turn "appears to have been" into "was". Hardening a hedge drifts the claim the same way rounding "about a third" to "a third" does.
- The gap is real and the reader needs to know → say it once, plainly, with what to do: "Parking isn't listed on the venue's site. Ask when you book."
```

- [ ] **Step 2: Replace zh #20** (heading included) with:

```markdown
### 20. 知識截止日期免責聲明與資料缺口臆測

摘要：「截至我最後更新」「資料有限」這類免責聲明直接刪；後面接的「可能」「似乎」是猜測，不能改寫成事實，作者有就寫，沒有就標（需作者補充），不代查（見 #47）

**需要注意的詞彙：** 截至 [日期]、根據我最後的訓練更新、雖然具體細節有限/稀缺……、基於可用資訊……、在公開資料中沒有詳細記載、在提供的資料或搜尋結果中找不到、為人低調、很少公開私生活

**問題：** 關於資訊不完整的 AI 免責聲明留在文本中。會上網搜尋的模型還多一步：先宣稱某個細節「沒有公開記載」，再猜它「可能」是什麼。兩半都沒有查證過，免責聲明本身可能是錯的，後面的猜測則是穿上發現外衣的臆測。

**改寫前：**
> 雖然關於公司成立的具體細節在現成資料中沒有廣泛記錄，但它似乎是在 20 世紀 90 年代的某個時候成立的。

**改寫後：**
> （需作者補充：公司哪一年成立？原文只推測「90 年代某個時候」）

**處理規則：**
- 作者有這個事實 → 只寫事實。
- 沒人知道 → 整句刪掉。不要把「似乎是」改成「是」，那跟把「大約三成」改成「三成」一樣，是在讓說法漂移。
- 缺口是真的、讀者需要知道 → 講一次、講清楚、附上怎麼辦：「場地網站沒寫停車資訊，訂位時直接問。」
```

- [ ] **Step 3: Update the SKILL.md P0 bullet** to:

```text
- Cutoff disclaimers and gap speculation ("As of my last update", "not widely documented… it likely…")
```

- [ ] **Step 4: Verify** `grep -n "1994" "$H/references/patterns-en.md" "$H/references/patterns-zh.md"` returns nothing; the build succeeds.

- [ ] **Step 5: Commit** `fix(humanly): stop #20 from inventing the fact it warns about`

---

## Task 6: B1 — new en pattern #42 Vague Association

**Files:** Modify `skills/marketer/humanly/references/patterns-en.md` (append after entry #41, before `## Full Example`)

**Interfaces:** Produces pattern number `#42` (title "Vague Association"), referenced by the Reference line in Task 9.

- [ ] **Step 1: Append the entry** (followed by `---`, like every entry):

```markdown
### 42. Vague Association

Summary: "associated with" and "in connection with" hide the actual relationship; state the role, or ask the author for it

**Words to watch:** associated with, closely/widely associated with, in connection with, connected to/with, in association with

**Problem:** Instead of saying what the relationship is ("she ran the program", "he taught there"), AI text says two things are "associated" or "connected". Wikipedia's editors keep finding it in 2025 and 2026 output, often next to promotional wording. The reader learns that a link exists and nothing about what it is.

**Before:**
> Since 2021, Chen has been associated with the library's oral-history project, and in 2023 she was connected to its grant application.

**After** (the author told you the roles):
> Chen has run the library's oral-history project since 2021 and wrote its 2023 grant application.

**After** (the draft never says):
> Since 2021, Chen has been associated with the library's oral-history project (needs author input: her role there, and what she did on the 2023 grant application).

**False-positive boundary:** In research and statistics writing, "associated with" is the precise term for a correlation that is not claimed to be causal ("longer commutes were associated with lower job satisfaction"). Keep it there. Rewriting it as "causes" or "leads to" changes the finding.
```

- [ ] **Step 2: Verify** `python3 "$H/scripts/build-prewrite.py"` reports `prewrite-en.md (42 patterns, …)`.

- [ ] **Step 3: Commit** `feat(humanly): catch vague "associated with" relationships`

---

## Task 7: B2–B5 — widen #8, #9, #13, #34 and the dash rule

**Files:**
- Modify: `skills/marketer/humanly/references/patterns-en.md` (#8, #9, #13, #34, and the `## Formatting and Rhythm Check` em dash bullet)
- Modify: `skills/marketer/humanly/references/patterns-zh.md` (#13, #34, and the `## 格式與節奏檢查` 禁用標點 bullet)
- Modify: `skills/marketer/humanly/references/protected-list.md` (the `| "Not X, but Y" | … |` row)

- [ ] **Step 1: en #8.** Replace the Words to watch line with:

```text
**Words to watch:** serves as/stands as/marks/functions as/operates as/represents [a], boasts/features/maintains/offers [a], refers to
```

and add after the `**Problem:**` paragraph:

```text
Newer output takes longer detours around the same verb: "ventured into politics as a candidate" (was a candidate), "began her career as an engineer" (was an engineer). Same fix: say "is", "was" or "has".
```

- [ ] **Step 2: en #9.** Add after the summary line:

```text
**Words to watch:** not only … but (also), it's not just X, it's Y, it's not X, it's Y, no X, no Y, just Z, Y rather than X
```

and append to its `**Problem:**` paragraph:

```text
The contrast reads as correcting a misconception nobody raised. Keep one only when a reader would really assume the opposite. The reversed form, "Y rather than X", is common in Grok output, and one in a piece is normal.
```

- [ ] **Step 3: protected-list row.** Replace `| "Not X, but Y" | The one genuine pivot in the piece | The rule is *at most once*, not zero |` with:

```text
| "Not X, but Y" | The one genuine pivot in the piece | Would a reader actually assume X? Then the contrast carries information. Keep it, once. If nobody would, it corrects a misconception nobody raised, so just say Y |
```

- [ ] **Step 4: en #13.** Add after the `**Problem:**` paragraph:

```text
**Don't swap the glyph.** Replacing the em dash with an en dash (–), a spaced hyphen ( - ) or a double hyphen (--) keeps the same dramatic aside. Rewrite the sentence. Newer models have cut back on em dashes, but Claude has not. A July 2026 comparison reported by The Economist found it was the one contemporary model that still used them more than professional writers.
```

- [ ] **Step 5: en rhythm check bullet** (feeds prewrite). Replace `- **Em dashes** (— and --): replace with commas, periods, or parentheses. Target: zero.` with:

```text
- **Em dashes** (— and --): replace with commas, periods, or parentheses. Target: zero. Swapping in an en dash (–) or a spaced hyphen keeps the same aside, so rewrite the sentence instead.
```

- [ ] **Step 6: zh #13.** Add to the end of the `**禁用的標點符號：**` list:

```text
- 不要換皮：把破折號換成 en dash（–）、全形連字號（－）或前後空格的「 - 」，句子還是同一個戲劇性插入語，整句改寫
```

- [ ] **Step 7: zh rhythm bullet** (feeds prewrite). Replace `- **禁用標點**：破折號（——／—）、分號（；）、冒號宣告（「重點是：」），直接說重點即可` with:

```text
- **禁用標點**：破折號（——／—）、分號（；）、冒號宣告（「重點是：」），直接說重點即可。換成 –、－ 或「 - 」也算破折號，要整句改寫
```

- [ ] **Step 8: en #34.** Replace the summary with `Summary: don't pack short text with headers, tiny tables or --- dividers; 3+ headers under 300 words is too many` and add before `**Before:**`:

```text
**Also watch:**
- A two- or three-row table that would read better as one sentence.
- `---` between every section when the format doesn't need dividers.
- Paired "X and Y" headings built to sound complete ("Awards and recognition", "Challenges and opportunities"). Keep a heading only if the section needs it.
```

- [ ] **Step 9: zh #34.** Replace the summary with `摘要：短文不要塞標題、迷你表格和分隔線，300 字內超過 3 個標題就太多` and add before `**改寫前：**`:

```text
**也要注意：**
- 兩三列就講完的表格，寫成一句話更好讀。
- 每一節之間都插 `---` 分隔線，但格式根本不需要。
```

- [ ] **Step 10: Verify** the build succeeds and `git diff --stat -- "$H/references/generated/"` shows both bundles moved (the rhythm bullets and summaries feed them).

- [ ] **Step 11: Commit** `feat(humanly): add current Wikipedia signs to #8, #9, #13 and #34`

---

## Task 8: D1–D2 — conventions in the read-back, deliberate keeps in the report

**Files:**
- Modify: `skills/marketer/humanly/SKILL.md` (Step 9 list, Step 10 rewrite-mode item 4)
- Modify: `skills/marketer/humanly/references/protected-list.md` (`## Fidelity Read-Back` list)

- [ ] **Step 1: SKILL.md Step 9.** Add item 5 after `4. Confirm the register held — a notice still reads as a notice`:

```text
5. Confirm the conventions held: person (I / we / you), spelling variety (a UK text stays UK), markup format, and any hard length limit the text lives under (a title tag, a meta description, a button label, a store field)
```

- [ ] **Step 2: protected-list Fidelity Read-Back.** Add item 6 after item 5:

```text
6. Confirm the conventions held: person, spelling variety, markup format, and any hard length limit. Several models default to American English, so a UK text that comes back with American spellings has gained an AI tell
```

- [ ] **Step 3: SKILL.md Step 10.** Replace `4. **Second-pass audit**: surviving tells fixed, or "clean"` with:

```text
4. **Second-pass audit**: surviving tells fixed, or "clean". Name any tell you kept on purpose (a quotation, a proper noun, a word used literally) and why
```

- [ ] **Step 4: Commit** `feat(humanly): check spelling variety and length limits in the read-back`

---

## Task 9: Reference line, rebuild, packages

**Files:**
- Modify: `skills/marketer/humanly/references/patterns-en.md` (`## Reference`)
- Regenerate: `skills/marketer/humanly/references/generated/prewrite-{en,zh}.md`, `plugins/claude/marketer/**`, `plugins/codex/marketer/**`

- [ ] **Step 1: Add to `## Reference`**, after the speak-human-tw line:

```text
Pattern #42 and the September 2026 additions to #8, #9, #13, #18, #20 and #34 follow the Wikipedia page as of revision 1376815715 (2026-09-26), including its "Signs of human writing" and "Ineffective indicators" sections, which back the matching rows in `protected-list.md`.
```

- [ ] **Step 2: Rebuild and check**

```bash
cd "$W"
python3 skills/marketer/humanly/scripts/build-prewrite.py
python3 skills/marketer/humanly/scripts/build-prewrite.py --check     # expect two OK lines
./scripts/generate-plugin-packages.sh
git status --porcelain                                                 # only intended paths
```

- [ ] **Step 3: Commit** `chore(humanly): regenerate prewrite bundles and plugin packages`

---

## Task 10: Green run — probes and full benchmark on the branch

**Files:** Modify `skills/marketer/humanly/evals/benchmark.md` only for probes that failed in Task 1 and pass now.

- [ ] **Step 1: Run the seven probes against `$H`**, fresh subagent each, outputs to `$EVAL/out/after/`.
- [ ] **Step 2: Run the full suite against `$H`**: all 32 cases (FID and OVER always; NEW because the catalog changed; TW because `patterns-zh.md` changed; PRE because both bundles moved).
- [ ] **Step 3: Grade.** `python3 "$EVAL/grade.py" "$EVAL/out/after"`. Read NEW-05 and NEW-09 by hand for invented causes or names.
- [ ] **Step 4: Triage failures.** Any FID or OVER failure blocks the PR. For a failing existing case, rerun it once against `$BASE`. Failing there too means it predates this change: record it, don't hide it. Failing only on the branch means this change caused it: fix the catalog and rerun.
- [ ] **Step 5: Promote earned probes.** Each probe that failed in Task 1 and passes now becomes a case: P-A1, P-A2, P-A3, P-A4, P-D1 go to `OVER-*` (extend that group's intro to cover "fixes something the evidence says is not a tell"); P-B1 goes to `NEW-*` (retitle the group header from "the 10 patterns added in the zh catalog (#41–#50)" to cover en #42). Update the case count and per-group counts in the header table.
- [ ] **Step 6: Commit** `test(humanly): add benchmark cases that failed before this change`

---

## Task 11: Push and open the PR

- [ ] **Step 1:** `git push -u origin feat/humanly-wikipedia-signs-refresh`
- [ ] **Step 2:** `gh pr create` with an English title `feat(humanly): refresh against the current Wikipedia signs of AI writing` and a body that lists A1–A4, B1–B5, D1–D2, the baseline and branch results per probe, the suite results, and any pre-existing failures found in Task 10.
- [ ] **Step 3:** Leave the merge to Hana. After it merges, move the backlog todo to `done/` on `main` (it is not touched on this branch, see Global Constraints).
