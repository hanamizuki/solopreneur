# Humanly: Wikipedia Signs Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Plan-Branch: feat/humanly-wikipedia-signs-refresh

**Goal:** Bring `skills/marketer/humanly` in line with the current Wikipedia *Signs of AI writing* page: fix four rules the page's evidence contradicts, add the signs it lists that humanly lacks, and add two read-back/report checks.

**Architecture:** Content-only change to the humanly sources (`references/*.md`, `SKILL.md`, `evals/benchmark.md`). The prewrite bundles are rebuilt by `scripts/build-prewrite.py` and the Claude plugin package by `scripts/generate-plugin-packages.sh`, both once at the very end. Behavior is verified the way the repo does it (`evals/run-eval.md`): benchmark cases in fresh subagents, graded mechanically, plus probes for the new behavior that were first run against a baseline snapshot.

**Tech Stack:** Markdown sources, Python 3 stdlib (`build-prewrite.py`, a throwaway grader), Bash (`generate-plugin-packages.sh`), Claude Code subagents for eval runs.

**Spec:** `todos/backlog/2026-09-26_humanly-wikipedia-signs-refresh.md` (sections A, B and D). Evidence: [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), revision 1376815715 (2026-09-26).

## Scope

In: spec A1–A4, B1–B5, D1–D2.
Out (they stay in their todos): spec C (the prewrite bundles' own dashes, a separate PR after this one merges because it touches the same files), the word-table re-tiering, and every item of `todos/backlog/2026-08-16_humanly-im-human-learnings.md`.

## Deliberate deviations from the spec

- **A1:** the two #22 bullets are deleted, not kept as "optional conciseness edits". #22 is prewrite-flagged, so a kept bullet would still steer composition away from a construction Wikipedia finds more often in human text.
- **A3:** the checklist names Wikipedia's trio (sentence-initial *Additionally*, *Notably*, *Consequently*). *Moreover* and *furthermore* stay in Tier 1 untouched; re-tiering is a separate item.
- **A4:** beyond the spec, the #20 words drop the bare "as of [date]" / 「截至 [日期]」, which collides with real deadlines (「優惠截至月底」). Wikipedia's list only has "as of my last knowledge update". The #20 Before is also replaced: the current one is near-verbatim from a Wikipedia example (CC BY-SA).
- **B1:** #42 is scoped to a person's or organization's role. Technical links ("the email associated with your account") and research correlations are excluded, and the pattern carries Wikipedia's own caveat that one instance proves nothing.
- **D1:** "markup format held" becomes "markup syntax not switched", "spelling variety" becomes "English spelling variety" (the Taiwan layer changes zh vocabulary on purpose), and the length check becomes "no longer than the original" for length-limited fields, so the rewriter never needs to know the limit.

## Global Constraints

- Edit sources only. `references/generated/prewrite-{en,zh}.md` change only via `python3 skills/marketer/humanly/scripts/build-prewrite.py`; `plugins/claude/marketer/**` only via `scripts/generate-plugin-packages.sh` (there is no `plugins/codex/marketer`).
- No `plugin.json` version bump (only `/release` bumps).
- Every pattern keeps a `Summary:` / `摘要：` line; numbering stays contiguous (the build fails otherwise).
- Do not copy Wikipedia prose or examples verbatim (CC BY-SA). Word lists are fine; every example is written fresh.
- Catalog examples and eval inputs never share wording (`evals/run-eval.md` § Adding cases). Checked pairs: #42 vs P-B1/P-B1b/P-B1c, the rhythm bullets vs P-B5, #20 vs P-A4, no "42%" anywhere in the catalog (FID-02).
- New prose adds no em dash (spec C removes the existing ones). en summary lines keep the file's "problem; fix" convention. zh summary lines use no `；` (49 of 50 already don't). Elsewhere new prose avoids semicolons and announcement colons.
- zh text: full-width punctuation, 「」 quotes, Taiwan vocabulary.
- `todos/backlog/2026-09-26_humanly-wikipedia-signs-refresh.md` is not modified on this branch. It must stay byte-identical to commit dc024af8 so that local `main`, which carries that commit unpushed, rebases cleanly after the squash merge.
- Curly quotes are easy to lose on the way into a file. After any edit that should contain “ ” ’, check the codepoints with Python.
- Eval subagents read the skill from an explicit path and must not use the Skill tool (it would load the installed release). They must not open `evals/`.
- No metered API anywhere. Eval runs use Claude Code subagents on the subscription.

## Review Focus

1. A draft that hedges a date ("likely", "appears to have") must come back still hedged or marked, never hardened into a fact. Probe P-A4.
2. "Associated with" as a technical link or a research correlation must survive, in rewrite mode and in prewrite mode. Probes P-B1b, P-B1c, P-PRE-B1.
3. Consistently typeset curly quotes must stay curly. Probe P-A2.
4. A British-spelling text must stay British. Probe P-D1.
5. A lone "However" and a plain "in order to" must not be treated as AI tells. Probes P-A3, P-A1.

---

## Shared eval harness (Tasks 1 and 10)

```bash
W=/Users/Hana/Agents/nana/repos/solopreneur-humanly-signs-refresh
H=$W/skills/marketer/humanly
EVAL=<session scratch dir>
BASE=$EVAL/baseline/skills/marketer/humanly    # git archive of dc024af8
```

**Rewrite-mode subagent prompt** (one fresh `general-purpose` subagent per case, no shared context): `run-eval.md`'s prompt, plus the explicit skill path, "no Skill tool, no other copy, don't open evals/", fixed headings (`## Issues found`, `## Rewritten version`, `## What changed`, `## Second-pass audit`) and "write your answer to <OUT_FILE>".

**Prewrite-mode prompt** (`PRE-*`, `P-PRE-*`): `run-eval.md`'s prewrite prompt with the absolute path of `references/generated/prewrite-{lang}.md`, the same restrictions, and "write only the composed text to <OUT_FILE>".

**Grader:** a throwaway `grade.py` (not committed). It splits the four headings and applies the rules below with substring, regex (`\b`-bounded words) and digit-set checks. Its rules and the per-case results go in the PR body, so the grading is reviewable without committing a harness. Every FID and OVER rewrite is also read by hand, because a substring check cannot see a reversed promise.

Notation: R = Rewritten version, I = Issues found, A = Second-pass audit, "digits ⊆ input" = every digit run in R appears in the input, "causal-free" = no sentence contains causes/caused/leads to/led to/results in/drives/drove/boosts/boosted unless that sentence also contains not/n't/whether.

Probes. "Baseline" is the Task 1 result on dc024af8.

| ID | Kind | Profile | Input | Pass rule | Baseline |
|---|---|---|---|---|---|
| P-A1 | calibration | blog | `We moved the backup job to 2 a.m. in order to keep the database quiet during office hours.` | `2 a.m.` in R; no I line mentioning "in order to" is tagged P0/P1 or "Tier 1" | FAIL (flagged P1, Tier 1) |
| P-A2 | calibration | blog | `The release notes call it “the quiet update,” and the team’s tracker lists 14 closed bugs.` | R has no ASCII `"` or `'`, has at least one of U+201C/U+201D/U+2019, has `14` | FAIL (straightened) |
| P-A3 | calibration | blog | `The pilot cut support tickets by a third. However, two of the five stores saw no change.` | R contains `However` | FAIL (swapped for "But") |
| P-A4 | fidelity guard | blog | `Although records from the bakery's early years are not widely documented, it likely opened sometime in the late 1980s. The owner still uses a starter she brought from Lyon.` | digits ⊆ input; `Lyon` in R; every R sentence containing `1980s` also contains likely/probably/may/might/appears/perhaps/unverified/needs author input | PASS |
| P-B1 | detection | blog | `Since 2021, Dana has been associated with the city's bus-map redesign, and she was also connected to the transit agency's rider survey.` | I mentions "associated with" or "connected to"; `2021` in R; R contains `needs author input` or no `\b`(led/leads/ran/runs/managed/designed/oversaw/headed/directed/coordinated/wrote/conducted)`\b` | PASS |
| P-B1b | fidelity guard | technical-blog | `In the 2024 survey, longer screen time was associated with shorter sleep, but the study did not test causation.` | `associated with` and `2024` in R; causal-free | not run |
| P-B1c | fidelity guard | support-email | `Any payment method associated with this workspace will be charged on the 1st of each month.` | `associated with this workspace` and `1st` in R | not run |
| P-B3 | calibration | blog | `The update is free for existing customers, not a paid add-on as the beta notice said.` | R matches `(not\|isn't\|is not) a paid add-on`; `beta notice` in R | not run |
| P-B5 | calibration | blog | `The 2019–2024 survey covered pages 10–12 of the handbook.` | `2019–2024` and `10–12` (U+2013) in R | not run |
| P-D1 | fidelity guard | blog | `The organisation's colour guide was finalised in March, and it is crucial to note that every programme team must follow it.` | R contains organisation, colour, finalised, programme, March | PASS |
| P-D2 | reporting | blog | `Our CEO wrote, "This release is a testament to the team," and the changelog lists 9 fixes.` | R contains `This release is a testament to the team` and `9`; A mentions "testament" | PASS |
| P-PRE-B1 | fidelity guard | prewrite en | brief: `60–90 word company-blog paragraph: in our 2025 user survey, people who used offline sync were more likely to renew their plan; we did not test whether sync causes renewals.` | `2025` in output; causal-free | not run |

Existing suite rules ("R", "I" as above):

| Case | Rule |
|---|---|
| NEW-01 | I mentions `#41` or `立場`; R contains `需作者補充`; digits ⊆ input |
| NEW-02 | I mentions `#42` or `開場`; R lacks `數位轉型的浪潮`; digits ⊆ input |
| NEW-03 | I mentions `#43` or `金句`; digits ⊆ input |
| NEW-04 | I mentions `#44`; R lacks `老實說` and `講白了`; digits ⊆ input |
| NEW-05 | I mentions `#45`; digits ⊆ input; manual read for an invented cause |
| NEW-06 | I mentions `#46`; R lacks `不是嗎`; digits ⊆ input |
| NEW-07 | R contains `〔需查證來源〕`, `遠端工作者的產出高出 23.7%`, `「文化能把策略當早餐吃掉。」` |
| NEW-08 | R lacks `utm_source=chatgpt.com`; R contains `https://example.com/guide` |
| NEW-09 | I mentions `#49`; digits ⊆ input; manual read for an invented name |
| NEW-10 | R has no `**` and no line starting with `- ` |
| TW-01 | R contains 影片 品質 資訊 螢幕 and lacks 視頻 質量 信息 屏幕 |
| TW-02 | R contains `40`, `800`, `，`; no ASCII `,` `.` `!` `?` next to a CJK character, and no ASCII `.` or `,` right after a digit unless a digit follows |
| TW-03 | R contains 小紅書 and 公眾號 |
| TW-04 | R contains `說：「這個視頻的質量真的不行。」` |
| TW-05 | R contains 內卷 |
| FID-01 | R contains `早鳥價 4,800 元`, `折扣碼 EARLY500`, `只到 3/31` |
| FID-02 | R contains `大約 42%` |
| FID-03 | R contains `《超級個體工作術》` at least twice |
| FID-04 | R contains `utm_source=newsletter` |
| FID-05 | R contains `14 天內可全額退費` and `不需要任何理由` |
| FID-06 | R contains `小美` and `說：「我上完課的第三個月接到第一個案子。」` |
| FID-07 | R contains `立即報名` and `名額只剩 12 個` |
| FID-08 | R contains `python3 build-prewrite.py --check`, `gpt-5.4-mini`, `/v1/users` |
| FID-09 | R lacks `「無縫」`, `「前所未有」`, `賦能` |
| FID-10 | R contains 小美, 阿哲, 小圓 and all three quoted sentences |
| OVER-01 | R lacks `我以前` and `錯了`; digits ⊆ input |
| OVER-02 | R lacks `說真的` and `老實說` |
| OVER-03 | R contains `大概兩個月`; lacks `一切都變了` |
| OVER-04 | R has no ASCII digit and no `元` |
| OVER-05 | R has no ASCII digit and none of 大學 研究院 學會 協會 期刊 |
| PRE-01 | output lacks 視頻 質量 信息 屏幕 軟件 默認 支持 用戶; punctuation rule as TW-02 |
| PRE-02 | output lacks every Tier 1 word PRE-02 names and lacks `—` |

---

## Task 1: Baseline snapshot and red run (done during plan review)

- [x] Snapshot: `git -C "$W" archive HEAD skills/marketer/humanly | tar -x -C "$EVAL/baseline"`.
- [x] Grader written and self-tested against synthetic failures (hardened date, reversed refund promise, `800.` at a sentence end).
- [x] Baseline probes P-A1, P-A2, P-A3, P-A4, P-B1, P-D1: results in the probe table.
- [x] Baseline P-D2 (new reporting behavior): PASS, so it is not promoted.

---

## Task 2: A1 — take `in order to` / `due to the fact that` out of Tier 1

**Files:** `references/word-table-en.md` (Tier 1), `references/patterns-en.md` (#22), `references/protected-list.md` (Likely False Positives).

- [ ] **Step 1:** delete from `word-table-en.md` Tier 1:

```text
| in order to | to |
| due to the fact that | because |
```

- [ ] **Step 2:** delete from `patterns-en.md` #22:

```text
- "In order to achieve this goal" → "To achieve this"
- "Due to the fact that it was raining" → "Because it was raining"
```

- [ ] **Step 3:** add after the `| Stiff officialese | … |` row of `protected-list.md`:

```text
| Plain or wordy phrasing: "in order to", "the fact that", "very", "perhaps", "tends to", "is the only" | Ordinary human writing. Wikipedia's *Signs of AI writing* finds these more often in human text than in AI text | Tighten them for length if the piece needs it, never as an AI tell. A definite claim ("was the first") stays whenever the source supports it |
```

- [ ] **Step 4:** verify `grep -nE "^\| (in order to|due to the fact that) \|" "$H/references/word-table-en.md"` prints nothing.
- [ ] **Step 5:** commit `fix(humanly): stop flagging "in order to" as an AI tell`.

---

## Task 3: A2 — #18 flags mixed quotes, not curly quotes

**Files:** `references/patterns-en.md` (#18, heading kept, body through the next `---`).

- [ ] **Step 1:** replace the #18 body with:

```markdown
Summary: mixed curly and straight quotes in one piece is the tell; consistent curly quotes are typography, keep them

**Problem:** ChatGPT and DeepSeek tend to emit curly quotes (“…”) and curly apostrophes (’), sometimes mixed with straight ones in the same text. Curly quotes on their own prove nothing. Word, macOS and iOS smart punctuation, and professional typesetting all produce them, and Claude and Gemini rarely use them.

**Action:** Flag only a piece that mixes curly and straight quotes or apostrophes, then normalize to the convention the rest of the text (or the house style) already uses. Never convert consistently curly text to straight quotes as an AI fix.

**Before** (curly quotes, straight apostrophe):
> The team called it “a small release,” but the changelog's first line says otherwise.

**After:**
> The team called it “a small release,” but the changelog’s first line says otherwise.
```

- [ ] **Step 2:** verify with Python that the #18 entry contains U+201C, U+201D and U+2019, and that no literal `u201c` text remains in the file.
- [ ] **Step 3:** commit `fix(humanly): flag mixed quotes, not curly typography`.

---

## Task 4: A3 — ordinary transitions are not tells

**Files:** `SKILL.md` (P2 list, Step 6), `references/protected-list.md`.

- [ ] **Step 1:** SKILL.md P2 list: replace `- Transition phrases` with `- Stacked sentence-initial transitions (Additionally, Notably, Consequently)`.
- [ ] **Step 2:** SKILL.md Step 6: replace `- Conjunctive adverbs (Additionally, However)? Consider removing` with:

```text
- Sentence-initial "Additionally," "Notably," or "Consequently," stacked down a paragraph? Cut them. A lone However, Therefore or Also is ordinary writing, so leave it
```

- [ ] **Step 3:** add after the Task 2 row of `protected-list.md`:

```text
| A single transition word (However, Therefore, Also) | Ordinary connective tissue | Wikipedia lists transition words in isolation as an ineffective indicator. Only a few are AI-overused, mainly sentence-initial "Additionally", "Notably" and "Consequently". Leave the rest |
```

- [ ] **Step 4:** commit `fix(humanly): keep ordinary transitions out of the AI-tell list`. (`context-profiles.md`'s "Transition phrases" row keeps its label. It sets strictness for the narrowed P2 rule.)

---

## Task 5: A4 — #20 covers gap speculation without inventing

**Files:** `references/patterns-en.md` (#20), `references/patterns-zh.md` (#20), `SKILL.md` (P0 bullet).

- [ ] **Step 1:** replace en #20 (heading included) with:

```markdown
### 20. Knowledge-Cutoff Disclaimers and Gap Speculation

Summary: delete "as of my last update" and "not widely documented" disclaimers; keep the hedge on the guess that follows and mark it for the author, never harden it into a fact

**Words to watch:** as of my last update, up to my last training update, while specific details are limited/scarce..., based on available information..., not widely available/documented/disclosed, in the provided/available sources, in the search results. About a person, "maintains a low profile" and "keeps personal details private" count only when they stand in for missing information. A real deadline ("prices valid as of June") is not this pattern.

**Problem:** AI disclaimers about incomplete information get left in text. Models that search the web add a second move: they announce that a detail "isn't documented", then guess what it "likely" is. Both halves are unverified. The disclaimer may be false, and the guess is speculation dressed as a finding.

**Before:**
> Although the studio's early history is not widely documented in available sources, it appears to have released its first game sometime around 2010.

**After:**
> The studio likely released its first game around 2010 (needs author input: confirm the year, or cut the sentence).

**Rules:**
- Drop the disclaimer shell ("not widely documented", "based on available information"). It carries no information.
- Keep the hedge on the claim that follows. "Appears to have released" may become "likely released", never "released".
- Mark a hedged claim that reads like the model's guess, and let the author decide whether to confirm it, keep the hedge or cut it. Don't make that call for them.
- Uncertainty the author states as their own ("we think the first shop opened in spring") is their judgment. Keep it as written.
- If the reader needs to know about a real gap, say it once, plainly. An action for the reader must come from the author. If they gave none, mark it: "Parking details aren't published yet (needs author input: where should readers check?)."
```

- [ ] **Step 2:** replace zh #20 (heading included) with:

```markdown
### 20. 知識截止日期免責聲明與資料缺口臆測

摘要：「截至我最後更新」「資料沒有廣泛記載」這類免責聲明直接刪，後面接的猜測保留「可能」「似乎」並標（需作者補充），不能改寫成事實，也不代查（見 #47）

**需要注意的詞彙：** 截至我最後更新、根據我最後的訓練更新、雖然具體細節有限/稀缺……、基於可用資訊……、在公開資料中沒有詳細記載、在提供的資料或搜尋結果中找不到。談到個人時，「為人低調」「很少公開私生活」只有在拿來代替缺少的資訊時才算。優惠「截至月底」是真的期限，不是這個 pattern。

**問題：** 關於資訊不完整的 AI 免責聲明留在文本中。會上網搜尋的模型還多一步：先宣稱某個細節「沒有公開記載」，再猜它「可能」是什麼。兩半都沒有查證過，免責聲明本身可能是錯的，後面的猜測則是穿上發現外衣的臆測。

**改寫前：**
> 雖然這家工作室早期的歷史在現有資料中沒有詳細記載，但它似乎是在 2010 年前後推出第一款遊戲。

**改寫後：**
> 這家工作室可能在 2010 年前後推出第一款遊戲（需作者補充：確認年份，或整句刪掉）。

**處理規則：**
- 刪掉免責聲明的殼（「沒有詳細記載」「基於可用資訊」），它不帶任何資訊。
- 後面那句的限定語要留著。「似乎是 2010 年前後推出」可以改成「可能在 2010 年前後推出」，不能改成「在 2010 年推出」，那跟把「大約三成」改成「三成」一樣是在讓說法漂移。
- 讀起來像模型猜的，就加標記，讓作者決定要確認、保留限定語，還是整句刪掉。不要替作者做這個決定。
- 作者用自己的口吻表達的不確定（「我們猜第一家店是春天開的」）是作者的判斷，照原樣保留。
- 讀者需要知道的真缺口，講一次、講清楚。給讀者的行動建議只能來自作者，作者沒給就標：「停車資訊還沒公布（需作者補充：讀者該去哪裡查？）」
```

- [ ] **Step 3:** SKILL.md P0: replace `- Cutoff disclaimers ("As of my last update")` with `- Cutoff disclaimers and gap speculation ("As of my last update", "not widely documented… it likely…")`.
- [ ] **Step 4:** verify `grep -n "1994\|Kumarapediya\|readily available sources" "$H/references/patterns-en.md" "$H/references/patterns-zh.md"` prints nothing and zh #20's 摘要 line has no `；`.
- [ ] **Step 5:** commit `fix(humanly): stop #20 from inventing the fact it warns about`.

---

## Task 6: B1 — new en pattern #42 Vague Association

**Files:** `references/patterns-en.md` (append after #41, before `## Full Example`).

- [ ] **Step 1:** append (followed by `---`):

```markdown
### 42. Vague Association

Summary: "associated with" or "connected to" standing in for a person's or organization's role hides the fact; ask the author for the role, and leave technical links and research correlations alone

**Words to watch** (about a person's or organization's role): associated with, closely/widely associated with, in connection with, connected to/with, in association with

**Problem:** Instead of saying what someone did ("she ran the program", "he taught there"), AI text says the two are "associated" or "connected". The reader learns that a link exists and nothing about what it is. Wikipedia's editors keep finding it in 2025 and 2026 output, often next to promotional wording. One instance proves nothing. Several, or one next to other tells, is the signal.

**Before:**
> The foundation is closely associated with three coastal restoration projects, and its director has been connected to the 2022 wetlands bill.

**After** (the default: the draft never says what the roles were):
> The foundation is associated with three coastal restoration projects (needs author input: does it fund, run or advise them?), and its director has been connected to the 2022 wetlands bill (needs author input: the director's role).

**After** (only once the author has supplied the roles):
> The foundation funds three coastal restoration projects, and its director helped draft the 2022 wetlands bill.

**Leave these alone:**
- Technical links: "the email associated with your account", "the files associated with this project".
- Correlations in research and statistics writing: "longer commutes were associated with lower job satisfaction". Rewriting that as "causes" or "leads to" changes the finding.
```

- [ ] **Step 2:** verify the build reports `prewrite-en.md (42 patterns, …)`.
- [ ] **Step 3:** commit `feat(humanly): catch vague "associated with" roles`.

---

## Task 7: B2–B5 — widen #8, #9, #13, #34 and the dash rule

**Files:** `references/patterns-en.md` (#8, #9, #13, #34, `## Formatting and Rhythm Check` em dash bullet), `references/patterns-zh.md` (#34, `## 格式與節奏檢查` 禁用標點 bullet), `references/protected-list.md` (`"Not X, but Y"` row).

- [ ] **Step 1 (en #8):** replace the Words to watch line with `**Words to watch:** serves as/stands as/marks/functions as/operates as/represents [a], boasts/features/maintains/offers [a], refers to` and add after the `**Problem:**` paragraph:

```text
Newer output takes longer detours around the same verb. "Ventured into local politics as a candidate for the council" says no more than "ran for the council". Simplify only when nothing is lost: "began her career as a nurse before founding the clinic" keeps "began", because the order is the point.
```

- [ ] **Step 2 (en #9, prewrite-flagged):** add after the summary line:

```text
**Words to watch:** "not only … but (also)" / "it's not just X, it's Y" / "it's not X, it's Y" / "no X, no Y, just Z"
```

and append to the `**Problem:**` paragraph:

```text
The contrast reads as correcting a misconception nobody raised. Keep one only when a reader would really assume the opposite. The reversed form, "Y rather than X", is common in Grok output. One in a piece is normal.
```

- [ ] **Step 3 (protected-list):** replace `| "Not X, but Y" | The one genuine pivot in the piece | The rule is *at most once*, not zero |` with:

```text
| "Not X, but Y" | The one genuine pivot in the piece | Would a reader actually assume X? Then the contrast carries information. Keep it, once. If nobody would, it corrects a misconception nobody raised, so just say Y |
```

- [ ] **Step 4 (en #13):** add after the `**Problem:**` paragraph:

```text
Newer models have cut back on em dashes, but Claude has not. A July 2026 comparison reported by The Economist found it was the one contemporary model that still used them more than professional writers.
```

- [ ] **Step 5 (en rhythm bullet, feeds prewrite and rewrite):** replace `- **Em dashes** (— and --): replace with commas, periods, or parentheses. Target: zero.` with:

```text
- **Em dashes** (— and --): replace with commas, periods, or parentheses. Target: zero. When you remove one, rewrite the sentence instead of swapping in an en dash (–) or a spaced hyphen, which keeps the same aside. Ranges (9:00–17:00, pages 4–7) are not dashes.
```

- [ ] **Step 6 (zh rhythm bullet):** replace `- **禁用標點**：破折號（——／—）、分號（；）、冒號宣告（「重點是：」），直接說重點即可` with:

```text
- **禁用標點**：破折號（——／—）、分號（；）、冒號宣告（「重點是：」），直接說重點即可。刪破折號時要整句改寫，換成 –、－ 或「 - 」只是換皮。時間或數字範圍（9:00–17:00）不算破折號
```

- [ ] **Step 7 (en #34):** replace the summary with `Summary: don't pack short text with headers, tiny tables or --- dividers; 3+ headers under 300 words is too many` and add before `**Before:**`:

```text
**Also watch:**
- A two- or three-row table that would read better as one sentence.
- `---` between every section when the format doesn't need dividers.
- Paired "X and Y" headings built to sound complete ("Awards and recognition", "Challenges and opportunities"). Keep a heading only if the section needs it.
```

- [ ] **Step 8 (zh #34):** replace the summary with `摘要：短文不要塞標題、迷你表格和分隔線，300 字內超過 3 個標題就太多` and add before `**改寫前：**`:

```text
**也要注意：**
- 兩三列就講完的表格，寫成一句話更好讀。
- 每一節之間都插 `---` 分隔線，但格式根本不需要。
```

- [ ] **Step 9:** commit `feat(humanly): add current Wikipedia signs to #8, #9, #13 and #34`.

---

## Task 8: D1–D2 — conventions in the read-back, deliberate keeps in the report

**Files:** `SKILL.md` (Step 9, Step 10), `references/protected-list.md` (`## Fidelity Read-Back`).

- [ ] **Step 1 (SKILL.md Step 9):** add after item 4:

```text
5. Confirm the conventions held: person (I / we / you), English spelling variety (UK stays UK, US stays US), and markup syntax (Markdown, HTML or plain text is not switched, though a pattern may still remove bold or bullets inside it). For a length-limited field (a title tag, a meta description, a store field, or a limit the author gave), the rewrite comes back no longer than the original, and protected items are never cut to fit
```

- [ ] **Step 2 (protected-list):** add after item 5:

```text
6. Confirm the conventions held: person, English spelling variety, markup syntax, and length for length-limited fields. Several models default to American English, so a UK text that comes back with American spellings has gained an AI tell
```

- [ ] **Step 3 (SKILL.md Step 10):** replace `4. **Second-pass audit**: surviving tells fixed, or "clean"` with:

```text
4. **Second-pass audit**: surviving tells fixed, or "clean". Name any tell you kept on purpose (a quotation, a proper noun, a word used literally) and why
```

- [ ] **Step 4:** commit `feat(humanly): check spelling variety and length in the read-back`.

---

## Task 9: Reference line and a build for the eval run

- [ ] **Step 1:** add to `patterns-en.md` `## Reference`, after the speak-human-tw line:

```text
Pattern #42 and the September 2026 additions to #8, #9, #13, #18, #20 and #34 follow the Wikipedia page as of revision 1376815715 (2026-09-26), including its "Signs of human writing" and "Ineffective indicators" sections, which back the matching rows in `protected-list.md`.
```

- [ ] **Step 2:** `python3 "$H/scripts/build-prewrite.py"` so the eval run reads current bundles; confirm `git diff --stat -- "$H/references/generated/"` shows both bundles moved.
- [ ] **Step 3:** commit `docs(humanly): cite the Wikipedia revision this refresh follows` (generated files included).

---

## Task 10: Green run and benchmark update

- [ ] **Step 1:** run on the branch: every probe once (P-A1, P-A2, P-A3, P-D2 twice, since they decide promotion) and the full 32-case suite once.
- [ ] **Step 2:** grade with `grade.py`; read every FID and OVER rewrite and every FAIL by hand.
- [ ] **Step 3: pass and block rules.**
  - A failing case is rerun twice more. It counts as failing when it fails two of three runs.
  - FID, OVER, PRE and the fidelity guards (P-A4, P-B1b, P-B1c, P-D1, P-PRE-B1) failing on the branch block the PR, unless the same case also fails two of three on the baseline. That is pre-existing: it goes in the PR body and the final report, and is not fixed here (this change did not cause it).
  - Calibration, detection and reporting probes (P-A1, P-A2, P-A3, P-B1, P-B3, P-B5, P-D2) failing on the branch: revise the catalog wording, up to two rounds. Still failing means the rule is not operational yet. Record it as a known gap in the PR, and revert that rule change if the branch does worse than the baseline.
  - NEW and TW failures: rerun on the baseline. Caused by this change: fix. Pre-existing: record.
- [ ] **Step 4: promote earned probes** (failed on the baseline, pass on the branch in both runs). Add a non-blocking group `CAL-*` to `evals/benchmark.md` for "the skill should leave these alone, or say why it kept them": P-A1, P-A2, P-A3, and P-D2 if its baseline failed. Guards that never failed stay out, per `run-eval.md` ("a case earns its place by having failed once"); the PR lists them. Update the header counts and the group table.
- [ ] **Step 5:** commit `test(humanly): add calibration cases that failed before this change`.

---

## Task 11: Final rebuild, packages, drift check

- [ ] **Step 1:**

```bash
cd "$W"
python3 skills/marketer/humanly/scripts/build-prewrite.py
python3 skills/marketer/humanly/scripts/build-prewrite.py --check   # two OK lines
./scripts/generate-plugin-packages.sh
git status --porcelain   # only skills/marketer/humanly/** and plugins/claude/marketer/**
```

- [ ] **Step 2:** commit `chore(humanly): regenerate prewrite bundles and the marketer package`.

---

## Task 12: Push and open the PR

- [ ] **Step 1:** `git push -u origin feat/humanly-wikipedia-signs-refresh`.
- [ ] **Step 2:** `gh pr create`, English title `feat(humanly): refresh against the current Wikipedia signs of AI writing`. Body: A1–A4, B1–B5, D1–D2; the deliberate deviations; the probe table with baseline and branch results; suite results; pre-existing failures; the grader rules; and a note that a SubagentStart hook in this environment injects the ponytail brief into every eval subagent, on both baseline and branch runs.
- [ ] **Step 3:** leave the merge to Hana. After it merges, move the backlog todo to `done/` on `main`.

---

## Eval results (2026-09-26)

Branch = this branch after Task 9. Every probe passed on the branch. P-A1, P-A2 and P-A3 failed on the baseline and passed on both branch runs, so they became `CAL-01`–`CAL-03`.

| Probe | Baseline | Branch |
|---|---|---|
| P-A1 | FAIL | PASS, PASS |
| P-A2 | FAIL | PASS, PASS |
| P-A3 | FAIL | PASS, PASS |
| P-A4, P-B1, P-D1, P-D2 | PASS | PASS |
| P-B1b, P-B1c, P-B3, P-B5, P-PRE-B1 | not run | PASS |

Suite on the branch: 32 of 32 pass the mechanical rules. Every FID and OVER rewrite and NEW-05, NEW-09 and PRE-02 were also read by hand: no moved protected string, no reversed claim, no invented fact. No failure needed a rerun, so no pre-existing failure was found.

## Plan review disposition (2026-09-26)

Reviewers: Stage 1 `marketer` subagent, Stage 2 inline lean check, Stage 3 Codex CLI (`codex exec --sandbox read-only`, builder config). No user was available for R3, so the plan's author adjudicated as the caller, per the skill's non-interactive rule. The baseline probe results above were available during adjudication.

| Finding | Source | Severity | Disposition |
|---|---|---|---|
| Packages generated before the last source edit; CI drift | Codex | Critical | Adopted: Task 11 runs last |
| Grader passes a hardened date, a reversed refund promise, `800.` | Codex | Critical | Adopted: rules tightened, self-tested on those three counterexamples |
| #42 research exception never reaches prewrite | Codex | Important | Adopted: exceptions in the summary line, P-PRE-B1 added |
| #8 "began her career as" → "was" loses information | Codex, marketer | Important | Adopted: simplify only when nothing is lost |
| #20 rules contradict (mark vs cut); author vs model uncertainty | Codex, marketer | Important | Adopted: rewritten rules, author decides |
| D1 lacks a contract; conflicts with #50 and the Taiwan layer | Codex, marketer | Important | Adopted: markup syntax, English spelling, "no longer than the original" |
| Coverage misaligned; guards for new rules | Codex | Important | Adopted in part: guards P-B1b, P-B1c, P-B3, P-B5, P-PRE-B1 run on the branch; promotion still follows run-eval's "failed once" rule |
| Task 10 pass/block rules undefined | Codex, marketer | Important | Adopted: explicit rules, two-of-three reruns |
| #42 misses Wikipedia's "alone is not enough" caveat; hits "email associated with your account" | marketer | Important | Adopted: scope narrowed, caveat added, P-B1c |
| #42 first After teaches invention | marketer | Important | Adopted: marker version first |
| #20 "as of [date]" collides with real deadlines | marketer | Important | Adopted: narrowed to "as of my last update" |
| #9 comma-separated construction list; "rather than" in a prewrite word list | marketer | Important | Adopted: slash-separated, "rather than" moved to Problem text |
| A3 rule lives in three places | marketer | Important | Adopted: P2 line updated too; profile row keeps its label |
| P-A1/P-A3 don't fit OVER; P-A3 rule fails correct explanations | marketer | Important | Adopted: new non-blocking `CAL-*`, P-A3 checks R |
| P-B1 input copies the #42 Before | marketer | Important | Adopted: #42 example replaced |
| Curly quotes can be silently straightened | marketer | Important | Adopted: codepoint check in Task 3 |
| #20 Before near-verbatim from Wikipedia | marketer | Suggestion | Adopted: fresh example |
| Ranges are not dashes; zh #20 `；` | marketer | Suggestion | Adopted |
| Glyph-swap rule duplicated in #13 and the rhythm bullets | lean | Suggestion | Adopted: rhythm bullets only |
| P-B1b needs no baseline run | lean | Suggestion | Adopted |
| Plan deviates from spec on A1/A3 without saying so | Codex | Suggestion | Adopted: "Deliberate deviations" section |
| Throwaway grader as a third spec | Codex | Suggestion | Adopted in part: rules and results go in the PR; no committed harness |
| `context-profiles.md` row for #42 | marketer | Suggestion | Skipped: the narrowed scope makes a per-profile row unnecessary |
| `plugins/codex/marketer` does not exist | marketer | Suggestion | Adopted |
