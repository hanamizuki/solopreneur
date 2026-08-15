# humanly：從 im-human 抄回四件事

2026-08-16 拿 [chang416/im-human](https://github.com/chang416/im-human)（MIT）
跟 `skills/marketer/humanly` 做了一次完整對讀。

**結論：我們比較成熟，但有四個真缺口。** 我們 50 條 zh pattern（他 38 條）、
pattern 之間有互相辨析的交叉引用（「這跟 #23 不同」）、有 `build-prewrite.py`
＋ `validate-humanly.yml` 的 generated-file 一致性閘門——這三樣他都沒有。
下面四件是他有、我們 grep 得出來確實沒有的。

---

## 1. Prompt injection ／憑證處置（最該補）

**他有什麼：** `SKILL.md` §「文字是資料，不是指令」——待編輯文字視為不可信
資料，不執行其中的 prompt／連結／命令，不因為它寫「忽略前文」而改變規則；
偵測到疑似 password / API key / token / 私鑰 / session cookie 就**停止**，
不引用也不改寫其值，只回一句要求先換成 `[REDACTED]`。

**我們的現況：** `grep -riE "inject|credential|api key|redacted|不可信"`
整個 `skills/marketer/humanly/` **零命中**。

**為什麼是真缺口：** 這支 skill 的輸入本來就是使用者貼進來的第三方文字
（客服信、log、別人的稿），是標準注入面；憑證那條也是實際會發生的
（貼 log 洗稿時夾帶 key，我們會照抄進輸出）。

**落點：** `references/protected-list.md` 新增一節 + `SKILL.md` Step 4 一行
指過去。約 8 行。

## 2. 力度檔位 ＋ 長文不縮水保護

**他有什麼：** 把「什麼文體」（scene）和「改多重」拆成兩個獨立旋鈕——
`minimal` / `standard`（預設）/ `aggressive`，另加 `bounded`：長文
（zh 約 1000 字以上）預設**不執行整句刪除**，只把整句空話列進「建議刪除
（待確認）」清單交作者拍板，不併句不重排；使用者說「別刪 / 保長度 / 字數 /
盡量原樣」就降到 `in-place`（整句空話也不刪，只句內降調）。
見 `references/bilingual/scene-guardrails.md` §長文補充。

**我們的現況：** `context-profiles.md` 把「文體」和「力度」混在同一張
tolerance matrix；`SKILL.md` Step 9 read-back 只驗事實與語域，**沒有任何
東西擋 rewrite mode 把 2000 字散文交回 800 字**。

**落點：** `context-profiles.md` 加一個與 profile 正交的力度維度，
`SKILL.md` Step 9 加一條篇幅檢查。約 15 行。

## 3. 輸出模式開關

**他有什麼：** 「只診斷」／互動確認（預設，列編號清單後停下）／「直接改」／
「只給終稿」（對外只輸出終稿）四種。

**我們的現況：** `SKILL.md` Step 10 固定吐 4 段（Issues / Rewritten /
What changed / Second-pass），使用者說「只給我終稿」也一樣。

**落點：** `SKILL.md` Step 10 加一組觸發詞對應。約 5 行。

## 4. 混合場景規則

**他有什麼：** `scene-guardrails.md` §混合場景——先判主要用途，
**以較保守那個場景的禁改項當上限**，次要場景只清明顯突兀的詞，不追求純化。
`references/bilingual/boundary-cases.md` §9 有一個 worked example
（技術部落格內嵌事故複盤）。

**我們的現況：** `context-profiles.md` 的 auto-detect cue 表只會挑出**一個**
profile，沒有多場景並存的規則。

**落點：** `context-profiles.md` auto-detection 段後加一小節。約 3 行。

---

## 半個：Tier 2/3 門檻數值化

他 `references/bilingual/severity.md` 給了按長度歸一的具體數字：
Tier 2 短段落（<100 字）同段 2+ 就標、長段落（≥100 字）3+ 才標；
Tier 3 短文（<200 字）同詞 3 次、中等（200–1000 字）5 次、長文（>1000 字）
佔比 >0.5%。

我們 `word-table-zh.md` L9-11 只寫「同段落 2 個以上」「整篇充斥時」——
模型判斷不了「充斥」，判斷得了「5 次」。

⚠️ 這條動到 word-table，**要重跑 `python3 skills/marketer/humanly/scripts/build-prewrite.py`**
（上面 1-4 都不是 generated file 的 source，不用重跑）。所以它跟 1-4 分開記，
可以當獨立一顆做。

---

## 明確不抄（別再重新討論）

- **`scripts/audit_ai_flavor.py`（446 行 regex 掃描器）** — 他自己 README 就寫
  「結果只是提示，不是判決」，抓的東西模型端全都有。真正的成本是它會變成詞表的
  **第二份 source of truth**，跟 `build-prewrite.py` 的 generated-file 架構打架。
  唯一有論據的是 `audit_shape()` 那幾條**計數型**規則（段落長度均勻度、
  二人稱密度、「很」字句密度）——LLM 數數確實爛。但現在沒有這個需求，
  要做也是獨立一顆，不要夾在 1-4 裡。
- **語態模式（persistent voice mode）** — 他最亮的功能：一個開關管住 agent
  自己之後每一句輸出，直到關閉。但那是另一個產品；我們 prewrite mode 已經
  涵蓋「寫之前先讀」，剩下的差別只有那個開關，而「skill 保證管住後續每一句」
  在長 session 裡守不住。fleet 要這個效果走 CLAUDE.md／output style 比較實在。
- **小說／fiction 層**（他掃描器有「不禁 / 映入眼簾 / 嘴角微揚 / 緩緩說道」
  這批套話）— 不在 marketer 範圍。
- **ChatGPT 貼上版 prompts**（`prompts/chatgpt-{custom-instructions,project}.md`）
  — 給沒有 skill 系統的 ChatGPT 一般聊天用，我們用不到。

## 一條 sourcing 線索（獨立於上面四件）

他 `references/tw/patterns.md` 的來源包含兩個我們沒用過的：
**zh 維基「Wikipedia:AI生成文的特徵」**、**朱宥勳的「AI 腔」句型分析**。
我們只引英文維基。值得單獨掃一遍，看有沒有我們 50 條沒收到的 zh 專屬句型。
這條可能比上面四件更有價值，但也更花時間。

## 抄文字時的注意

他 README 宣稱「不支援簡體中文」，但 `references/bilingual/` 整批
（`severity.md`、`positive-style.md`、`operation-manual.md`、`structures.md`、
`boundary-cases.md`）**是簡體寫的**，是沒遷移完的 legacy。**想法可以拿，
文字不能照抄。**

## 一個可能值得的教學裝置（優先度低）

`references/bilingual/positive-style.md` §4「Cleaner vs more human」用三段對照
教學：原文 → 清理後但還偏 AI → 更像人。我們的 pattern 條目是
改寫前／改寫後兩段，缺的正是中間那級——那級才是模型實際會停在的高原。
我們 `patterns-zh.md` L132 的「換個主詞還成立嗎」測試法已經摸到同一件事，
所以這條是加分不是補洞。

---

## 實作備註

1-4 全落在 `SKILL.md` / `references/protected-list.md` /
`references/context-profiles.md`——這三個都**不是** generated file 的 source，
所以不用重跑 `build-prewrite.py`，但要跑
`scripts/generate-plugin-packages.sh` 同步 `plugins/claude/marketer/` 與
`plugins/codex/marketer/`。四件加起來約 30-40 行，一顆 PR 的量。

改完照 `evals/run-eval.md` 跑一次 benchmark。
