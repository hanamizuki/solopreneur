# 收斂 spec/plan 階段的 review 流程成 `plan-review`

把 `tech-vetting` 改名擴充成 `plan-review`（三段 + 共用收尾），並讓 `second-opinion`
退役。規劃階段的 review 從「手動串三個工具」變成一支 skill。

## 動機

規劃 spec/plan 時實際上每次都要手動跑三件事：`tech-vetting`（技術驗證）→ 手動叫
ponytail（挑 over-engineering）→ `second-opinion`（Codex 外部意見）。這三步沒有
被任何東西串起來，全靠人記得。

除了「要記三個名字」之外，現況有三個實質問題：

### 1. 觸發詞打架

三支 skill 的 description 都含「review this plan / review this spec / evaluate
this spec」：

- `tech-vetting/SKILL.md:7` — `"review the plan"`
- `second-opinion/SKILL.md:8` — `"review this spec"`
- `todos-review/SKILL.md:6` — `"evaluate this spec"`

說「review 一下這個 plan」時選中哪支基本是擲骰子。這比名字難記更實質——**改名
救不了這個，只有收斂數量可以**。

### 2. ponytail 在規劃階段是空的

ponytail plugin 全家沒有一支吃 plan：

| Skill | 吃什麼 |
|---|---|
| `ponytail-review` | diff（`ponytail-review/SKILL.md:13`） |
| `ponytail-audit` | 整個 repo |
| `ponytail-debt` | 原始碼裡的 `ponytail:` 註解 |

所以規劃階段要 ponytail 觀點，只能靠 `/ponytail ultra` 這個行為 mode，或把 plan
硬塞給一支為 diff 設計的 skill。

`second-opinion` 的維度 4（Scope — over-engineering / simpler way，見
`second-opinion/SKILL.md:76-78`）名義上蓋了這塊，但 Codex 不吃 ponytail 的 tag
體系（`delete:` / `stdlib:` / `native:` / `yagni:` / `shrink:`），產出是散文而非
可執行的刪除清單。這是「已經跑了 second-opinion 卻還要另外叫 ponytail」的真正原因。

### 3. subagent prompt 重複三份

`tech-vetting/SKILL.md:67-86` 和 `todos-review/SKILL.md:99-115` 的 expert
subagent 提示詞幾乎逐字相同；tech stack detection 表在 `tech-vetting:31`、
`todos-review:64`、`specialist-review:41` 各有一份。

## 決策

### 三段 + 共用收尾

`tech-vetting/` 目錄原地改名成 `plan-review/`，內容擴成三段，**三段都只產出
findings、都不改檔**，回寫統一在收尾階段：

| 段 | 內容 | 來源 |
|---|---|---|
| 1 技術驗證 | stack detection → context7 查官方文件 → platform expert subagent | `tech-vetting` 現有內容 |
| 2 精簡檢查 | ponytail tag 體系吃 plan，產出可執行的刪除清單 | 新寫（ponytail 沒有這支）；tag 直接沿用 `ponytail-review` 五個，不重新定義 |
| 3 外部意見 | Codex CLI 5 維度 adversarial review；Codex 不可用時走 subagent fallback | `second-opinion` Path A / Path B |
| 收尾 | 彙整三段 findings → 逐條裁決（adopt / skip / discuss）→ 回寫 plan | `second-opinion` Step 5–6 |

**三段都讀原版 plan**，跑完才進收尾。findings 在使用者逐條核可前一律是資訊性的
（承接 `second-opinion/SKILL.md:139`）。

段 3 的外部 reviewer 一律禁止改檔（`second-opinion/SKILL.md:92`、`:134` 現有約束），
呼叫時加 read-only sandbox。

### 兩種模式

用不分順序的 keyword token 分流，與 `greenlight` 既有做法一致
（`greenlight/SKILL.md:44-48` 的 `external` / `unattended` / `size=`，解析規則見
`:810-823`）。**不加 `mode=` 前綴**——greenlight 的裸 token 已證可行。

| 呼叫 | 段 1 | 段 2 | 段 3 | 收尾 |
|---|:-:|:-:|:-:|---|
| `/plan-review [<file>]` | ✓ | ✓ | ✓ | 逐條裁決 → 回寫 |
| `/plan-review [<file>] internal` | ✓ | ✓ | — | **只回報 findings，不裁決不回寫** |

選 `internal` 而非 `quick` / `unattended`：與 greenlight 的 `external`（跳過內部
review 直接找外部 reviewer）語意成對。**不可借用 `unattended`**——greenlight 那個字
的語意是「遇到問題不問人、直接 fail fast」（`greenlight/SKILL.md:46`），跟「跑哪幾段」
是不同維度，同 repo 同名 token 不同義比不借用更糟。

沒有任何模式跳過段 2。只有段 3（Codex，約 240K token/次）會被跳過。

分流理由：`autopilot` 每個 PR 都跑，是高頻路徑，不能每次燒 Codex；但段 2 是 inline
的（不呼叫外部模型），成本近乎零，而且無人值守時沒人擋 over-engineered plan，價值
反而比人手打時更高。

### 輸入：檔案路徑可選

**`<file>` 是選用的**。沒給時從 conversation 取得 plan，承接 `tech-vetting/SKILL.md:21-25`
的現有三種來源（檔案路徑 / conversation / 問使用者）。

這是硬需求，不是彈性：兩個機器 caller 傳進來的 plan **都沒有落盤**——

- `autopilot/references/pr-subagent-template.md:48-57` — plan 在 Plan Mode 中形成，
  直接以「Step 1 implementation plan」交給 skill
- `todos-babysit/SKILL.md:474-480` — 「create an implementation plan」後直接 invoke

若新 skill 強制要求檔案參數，這兩條路徑都會壞。

`internal` 模式沒有檔案時不回寫（本來就不回寫），findings 原樣回報給 caller，由
caller 決定是否調整 plan——承接 `pr-subagent-template.md:60` 的現有行為。

### 段 3 前置確認

段 3 開始前印一行成本確認（約 240K token）再繼續。

理由：合併後 description 會廣泛接受 spec / plan / design doc，一次普通的「review
this plan」**auto-trigger** 就可能直接跑 Codex。現有 `second-opinion` 因為是明確
獨立命令，自帶使用者意圖訊號並提醒「Use judiciously」（`second-opinion/SKILL.md:158`），
合併後這個訊號消失。

確認只擋 auto-trigger 的意外開銷，不改變「人手打預設含段 3」這個決定。

### 段 2 規格

- **tag**：沿用 `ponytail-review/SKILL.md:21-25` 的五個（`delete:` / `stdlib:` /
  `native:` / `yagni:` / `shrink:`），不重新定義
- **location**：plan 檔的行號或章節標題（plan 是 markdown，兩者皆可定位）
- **淨效果**：`net: -N lines` 不適用（code 尚未存在），改為結構性淨效果，
  例如「-1 個模式、-1 支 skill」
- **邊界**：沿用 `ponytail-review/SKILL.md:50` — 只管 over-engineering，
  correctness / security 是段 1 的事
- **與段 1 對撞**（段 1 說加防禦、段 2 說刪）：沿用 `greenlight/SKILL.md:337`
  的既有裁決規則（兩者都不做 + flag），不重新發明

### spec 與 plan 都吃，不分岔

現有兩支本來就同時收兩種：

- `second-opinion/SKILL.md:27-30` 明列 `todos/doing/*.md`（plans）**和** `docs/spec/*.md`
- `tech-vetting/SKILL.md:23` 明列 `todos/backlog/xxx.md`、`docs/spec/xxx.md`

不需要為文件類型加分岔邏輯。段 1 的份量由 **Step 2 的 stack detection** 決定：純架構
spec 沒 match 任何 platform → 無 subagent 可 dispatch，該段自然空跑；提到平台的
spec 仍會跑 expert review，這是正確行為而非缺陷。

（注意 `tech-vetting/SKILL.md:53-56` 的 skip 條件**只跳過 context7**，不會讓整個段 1
退場——不要把它當成 spec 退場的依據。）

各段對兩種文件的份量自然不同，屬預期行為，不需要程式化處理：

| | spec（要做什麼） | plan（怎麼做） |
|---|---|---|
| 段 1 | 常常沒東西查 | 最有價值 |
| 段 2 | 最有價值 | 中等 |
| 段 3 | 有價值 | 有價值 |

description 首句需寫明三種文件都吃：spec / implementation plan / design doc。

### 命名

選 `plan-review`：

| 候選 | 淘汰理由 |
|---|---|
| `technical-review` | 與 code review 語意衝突（`specialist-review`、`greenlight` 都是 technical review） |
| `spec-plan-review` | 兩個名詞硬拼，長且不好記 |
| `plan-refinement` | Scrum 的 backlog refinement 已有既定含義，會誤導 |
| `spec-grooming` | grooming 在 Scrum 已被 refinement 取代，是退役詞 |
| `design-review` | 與 `designer:impeccable` 的 UI design review 撞 |

`plan-review` 符合 repo 既有的 `<對象>-review` 命名家族（`todos-review`、
`specialist-review`、`ponytail-review`）。字面偏 plan 的問題由 description 首句補
——skill 觸發靠 description 不靠名字。

### `second-opinion` 退役

- **功能零損失**——Path A / Path B / findings 裁決 / 回寫整套進段 3 與收尾
- **沒有機器呼叫者**——全 repo 6 處引用皆為文件或歷史紀錄
- **它自己聲明不吃 code diff**（`second-opinion/SKILL.md:161`），純 plan/spec 用途，
  被段 3 完全覆蓋
- 只有退役能真正解決問題 1。保留但收窄 description 是半吊子——兩支還在就還會撞

**不保留舊名 alias**。前次改名（`/preflight` → `/tech-vetting`，`MIGRATION.md:124-128`）
就是硬切，跟前例一致，靠 `MIGRATION.md` 承接。repo 內 grep 無機器 caller 不等於
repo 外沒有（前次遷移文件自己就提醒 custom scripts / cron / 肌肉記憶）。

### 已否決的替代方案

**薄 coordinator 呼叫既有三支** — coordinator 留下 4 個實體（3 支舊 skill +
coordinator），合併留下 1 個。它也不解決問題 1（三份 description 還在，仍須逐一收窄）。
搬移是一次性成本，多一層是永久成本。

## 改動清單

### A. 新 skill

- `plugins/solopreneur/skills/tech-vetting/` → `plan-review/`（`git mv`，保留歷史）
- 重寫 `SKILL.md`：三段 + 收尾 + 兩種模式 + description 收斂觸發詞
- 段 3 與收尾內容取自 `second-opinion/SKILL.md`
- 刪除 `plugins/solopreneur/skills/second-opinion/`

### B. 呼叫端（改 `internal`）

| 檔案:行 | 現況 |
|---|---|
| `autopilot/references/pr-subagent-template.md:56-61` | 「### 2. Tech Vetting」段落，含 serious issues → 調整後重跑的迴圈 |
| `todos-babysit/SKILL.md:477-481` | 「### Step 2: Tech Vetting」段落，含 wait for confirmation |

### C. 純字串引用

| 檔案:行 | 性質 |
|---|---|
| `README.md:54` | `/second-opinion` skill 主表列 — **刪除** |
| `README.md:55` | `/tech-vetting` skill 主表列 — 改名 |
| `README.md:93,95,236-237,305-307` | 依賴說明 + lifecycle 圖 + 段落標題 |
| `autopilot/SKILL.md:47,357` | skill 清單 + lifecycle 圖 |
| `autopilot/SKILL.md:273,281` | 輸出樣板裡的「Tech Vetting」字樣 |
| `autopilot/references/schemas.md:189` | 註解提及 |
| `todos-babysit/SKILL.md:478,481,552` | heading + 回報措辭 + 「Tech Vetting gate」 |
| `todos-review/SKILL.md:4-8` | **description 需移除泛用 spec trigger**（劃清邊界，見〈不做什麼〉） |
| `rebuild-skill-index/SKILL.md:22` | 消費者清單 |
| `session-retro/SKILL.md:166` | 舉例 |
| `todos/backlog/2026-04-29_auto-workflow-plugin-split.md:10,31-32` | 活躍規劃文件的歸屬表 |
| `todos/backlog/2026-07-07_codex-dual-publish.md:95` | 活躍規劃文件的 skill 清單 |
| `marketer/skills/slide-design/references/components.md:844` | 投影片範例（可留，非真呼叫） |

**不改 `todos/done/**` 與 `CHANGELOG.md`** — 歷史紀錄不改寫。

### D. 遷移文件

`MIGRATION.md` 加兩則：`/tech-vetting` → `/plan-review`（**第二次改名**）、
`/second-opinion` 退役。

## 不做什麼

- **`todos-review` 只改 description，不動流程**——它屬於 todos 家族：有 todos config
  discovery、>80% 完成度短路、被 `todos-babysit` 當 state machine 一環呼叫
  （`todos-babysit/SKILL.md:249,352`）。但它現在也做 best-practice、solution
  simplicity、feasibility（`todos-review/SKILL.md:94,126`），與 `plan-review` 重疊，
  必須在 description 劃清：**`todos-review` 問「該不該做」（產品決策），
  `plan-review` 問「這樣做對不對」（技術）**
- **不抽掉問題 3 的重複 prompt**——跨 `plan-review` / `todos-review` /
  `specialist-review` 三支的共用抽取列為 **deferred debt**，本次不處理
- **不新增 coordinator 層**（見〈已否決的替代方案〉）

## 驗收

**功能**

- [ ] `/plan-review <file>` 三段全跑，段 3 前有成本確認
- [ ] `/plan-review <file> internal` 跑段 1+2，**不呼叫 Codex**、不回寫
- [ ] 不帶檔案路徑呼叫，能從 conversation 取得 plan
- [ ] 丟一份純架構 spec（無平台關鍵字）進去，段 1 空跑而非報錯
- [ ] 三段 findings 彙整進同一份收尾清單，逐條可 adopt / skip / discuss
- [ ] 段 1 與段 2 對撞時，套用 `greenlight/SKILL.md:337` 的裁決規則

**降級路徑**

- [ ] Codex 未安裝 / 未登入 → 段 3 走 subagent fallback（`second-opinion` Path B）
- [ ] Codex timeout → 回報錯誤並提供重試 / 改走 Path B
- [ ] context7 不可用 → 段 1 跳過文件查詢但仍跑 expert subagent

**整合**

- [ ] `autopilot` 走完一輪 PR，plan-review 階段跑了 ponytail 且未燒 Codex
- [ ] `.github/workflows/validate-codex.yml` CI 通過（skill 目錄變更會觸發；
      `scripts/validate-codex.sh:48,56` 有 structure 與 install smoke）
- [ ] grep 無殘留 `tech-vetting` / `second-opinion`，**排除** `todos/done/**`、
      `CHANGELOG.md`、`MIGRATION.md`

## 風險

- **第二次改名**：`tech-vetting` 已從 `/preflight` 改過一次。既有 cron / 自訂腳本 /
  肌肉記憶可能仍指向舊名，只能靠 `MIGRATION.md` 承接
- **段 3 預設開啟**：人手打每次約 240K token。取捨已確認——高頻路徑走 `internal`，
  低頻路徑付得起，加上前置確認擋意外 auto-trigger
