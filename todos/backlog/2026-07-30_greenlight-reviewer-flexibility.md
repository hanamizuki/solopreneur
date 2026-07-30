# greenlight external reviewer 改成偵測驅動 + 可選 gate

把 external reviewer 從「硬編碼 login 白名單 + 序列 fallback」改成「通用偵測 +
per-repo 觀測快取 + 使用者選定 gate」。新裝的 review bot 不必改 skill 就能貢獻
意見；registry 只保留廠商知識（觸發指令一行）。

## 動機

### 1. CodeRabbit 被錯誤標記成不可觸發

`greenlight/SKILL.md:1494` 把 `coderabbit` 標成 passive-bot，理由寫
`auto-triggers on push (no manual trigger)`、`never offered as a trigger — shown
as informational only`。

這個前提是錯的。CodeRabbit 官方支援 `@coderabbitai review`（增量）與
`@coderabbitai full review`（完整重跑），跟 `@codex review` / `/gemini review`
是同一種東西，完全符合 registry 自己對 active-bot 的定義。

代價是實質的。掃 `hanamizuki/solopreneur` 最近活動：

| Bot | issue comments | PR review comments | formal reviews |
|---|---|---|---|
| `coderabbitai[bot]` | 27 | 48 | 18 |
| `chatgpt-codex-connector[bot]` | 9 | 28 | 14 |
| `gemini-code-assist[bot]` | 15 | 11 | 1 |

CodeRabbit 是這個 repo 上最活躍的 reviewer（93 則），而 greenlight 主動把它的
意見全部丟掉。

### 2. login 白名單讓新 bot 進不來

detection（`SKILL.md:1549`）已經把三個來源的活動資料全撈回來，但最後一步拿
`REVIEWER_BOT_LOGINS` 這個三筆的硬編碼清單過濾（`SKILL.md:1577-1582`），不認識
的 login 一律丟棄。

結果是裝了 Cursor Bugbot 或 Greptile，偵測明明看得到它們留言，卻因為不在清單裡
而被視為不存在。要納入就得改 skill 原始碼——config 完全無能為力，因為
`fallback_order` 只吃既有的 `config_id`，沒有任何欄位可以描述一個新 reviewer
需要的 trigger / login / poll 行為。

而且白名單本身也不可靠。`SKILL.md:1574` 的註解斷言「REST `.user.login` already
carries the `[bot]` suffix」，但 GitHub Copilot code review 的 login 是
`Copilot`，沒有 `[bot]` 後綴，`type` 仍是 `Bot`。

### 3. 多 reviewer 沒有選擇與收斂機制

現有 `fallback_order` 是序列語意：一次只叫一個，失敗才換下一個。同時有三、四個
reviewer 在這個 repo 上活動時，沒有任何機制讓使用者決定這次要用哪些、以誰的
clean pass 當終點。

## 設計

### 觀測取代推斷

三件事從 repo 外面看不到，過去都靠猜或硬編碼，一律改成「做一次看結果」：

| 看不到的事 | 過去做法 | 改成 |
|---|---|---|
| 某個工具用哪個 GitHub login 發言 | 硬編碼白名單 | 觸發後窗口內出現的新 Bot login 自動綁定 |
| 使用者有沒有開 auto-review | 無（假設 passive/active 是固定分類） | 沒被觸發卻留言 = auto |
| 使用者的方案等級（能不能主動叫） | 無 | 發一次指令，有回應就是能叫 |

第三項解掉一個原本不可能的判斷：CodeRabbit 在 private repo 是 Free plan（PR
review 叫不動，只有 summary）、public repo 走 Open Source plan（Pro+ 功能全開）；
Bugbot 是用量計費。從外部無從得知使用者買了什麼，但觀測不需要知道。

### 兩份資料的分工

**Registry — 只留廠商知識。** 刪掉 `bot login` 欄（那是 per-repo 觀測值）。`kind`
從三類縮成兩類，`passive-bot` 這個分類消失——「會自動跑」現在是觀測狀態而非種類。

| recipe_id | aliases | kind | trigger | handshake | poll policy |
|---|---|---|---|---|---|
| `codex-bot` | codex bot | github-bot | `@codex review` | 👀 reaction | 1min × 20 |
| `gemini` | gemini | github-bot | `/gemini review` | none | 3min, 2min × 2 |
| `coderabbit` | coderabbit | github-bot | `@coderabbitai review` | 預設 | 預設 |
| `bugbot` | bugbot, cursor | github-bot | `bugbot run` | 預設 | 預設 |
| `greptile` | greptile | github-bot | `@greptileai` | 預設 | 預設 |
| `codex-cli` | codex cli | local-cli | `codex review --base` | stdout | n/a |
| `agy` | agy | local-cli | `agy --print` | stdout + marker | n/a |

「預設」= `handshake: none`（靠 response vs timeout 判定，沿用 `gemini` 那列已
驗證的做法）+ 通用 poll（3min 首等，2min × 3）。**新增一個 bot 的成本因此是一行
trigger 指令**，handshake 與 poll 都有安全預設，不需要預先知道。

**Config — 存所有觀測值**，落在 `repos[<repo-key>].greenlight`（現有 config
layering 第 1 層，不需新增機制）：

```json
"reviewers": {
  "coderabbitai[bot]":            { "recipe": "coderabbit", "auto": true },
  "chatgpt-codex-connector[bot]": { "recipe": "codex-bot",  "auto": false },
  "gemini-code-assist[bot]":      { "recipe": "gemini", "auto": false, "triggerable": false },
  "some-new-bot[bot]":            { "recipe": null, "auto": true }
}
```

| 欄位 | 來源 | 意義 |
|---|---|---|
| key | 偵測（`.user.type == "Bot"`） | 唯一無法預知的資訊 |
| `recipe` | 觸發後自動綁定 | 對到 registry 哪一列；`null` = 未識別出工具身分 |
| `auto` | 觀測 | 沒被觸發也會留言 |
| `triggerable: false` | 自我修復 | 發過指令但無回應 |

### 兩層彈性

- **第一層（零維護）**：任何 `.user.type == "Bot"` 的新 bot，只要它自己會在 PR 上
  留意見，finding 立刻被收進 loop。`recipe: null` 也照收。裝了新工具什麼都不用設定
  就開始有用。
- **第二層（需要 recipe）**：只有「主動催它」才需要 registry 那行 trigger。

detection 的改動因此只有一處：過濾條件從比對 `REVIEWER_BOT_LOGINS` 改成
`.user.type == "Bot"`。三個來源的採樣邏輯與 all-or-nothing 降級行為不變。

### Reviewer 選擇與 gate

可用 reviewer 超過 2 個時停下來問兩件事：這次用哪些（多選）、哪個的 clean pass
當 gate（單選）。清單附各自的 `last_seen`，並提供「還有其他嗎」的開口讓使用者從
recipe 清單手動補（見〈偵測不到的情況〉）。

「可用」= 偵測到且 `triggerable != false` 的，加上 config 裡手動補進來的。
`recipe: null`（未識別工具身分）的 bot **可以**被選入——它們的 finding 照收——但
**不能當 gate**：沒有 recipe 就無法主動觸發，也就無從判定它這輪是否已經講完。

gate 語意：

| | 行為 |
|---|---|
| gate reviewer | 它這輪沒有新 finding → loop 結束 |
| 其他 reviewer | finding 照收照修，但它們沒 clean 不阻擋結束 |
| 收尾 | 結束時把非 gate reviewer 尚未處理的意見列進報告，交使用者判斷 |

沒有 gate 概念的話「四個都要」會變成「四個都得閉嘴才算過」，實務上收斂不了。

`fallback_order` 的角色隨之從「唯一 reviewer 的候補順序」變成「gate 的候補順序」。

### 一輪 loop 的流程

1. push 修好的 commit
2. 決定這輪要主動觸發誰：選定的 reviewer 中 `auto != true` 且
   `triggerable != false` 的
3. 發觸發指令（多個時並行）
4. 開 poll 窗口：記錄各來源當下的 comment id 上界
5. 窗口內收集**所有**選定 reviewer 的新 comment（不只被觸發的那些）
6. 關窗條件：gate reviewer 出現新 comment，或逾時。gate 本身是 `auto` 時同樣適用
   ——判定看的是「它有沒有出現新 comment」，不是「它有沒有回應觸發」，所以 gate
   選 auto bot（例如 CodeRabbit）也成立
7. 觀測回寫：窗口內未被觸發卻留言的標 `auto: true`；被觸發卻無回應的標
   `triggerable: false`
8. finding 合併去重 → 進現有處理流程（含 adversarial verify）
9. gate reviewer 這輪無新 finding → clean，結束；否則修完回到第 1 步

關鍵取捨：**不為 auto bot 額外等待**。gate 回應就關窗，auto bot 那時沒講完就算
了——comment id 上界遞增，遲到的意見下一輪自然被撿到，一則都不會漏，只是延後
一輪。

`SIZE_MAX_ROUNDS`（S=3 / M=5 / L=10）沿用。S 是 external-only 單一 reviewer，
那個唯一 reviewer 就是 gate，「超過 2 個要問」在 S 下不觸發。

### 偵測不到的情況

偵測是回溯的：第一次啟用某個 bot、還沒有任何 PR 被它處理過時，掃不到。三條
程式化替代路徑都試過，沒有可用的：

| 路徑 | 結果 |
|---|---|
| `/user/installations` | 403 — 需要 GitHub App 授權的 access token，`gh` 的 token 不足 |
| `/repos/{owner}/{repo}/installation` | 401 — 需要 App JWT |
| check-runs 的 `.app.slug` | 只回 `github-actions`；CodeRabbit / codex / gemini 都不建 check run |

GitHub 不讓一般 token 查「這個 repo 裝了哪些 App」，所以只能問使用者。這剛好跟
上面的 reviewer 選擇合併成同一次互動，不額外增加打擾。

手動補的 bot 只需要挑工具名，login 不必填：第一次觸發後窗口內冒出的新 Bot login
自動綁定。之後偵測就看得到，不會再問第二次。

窗口內同時出現多個未綁定的新 login 時（罕見）才問是哪一個；unattended 模式下不
猜，留 `recipe: null` 只收 finding。

## 錯誤處理與降級

| 情境 | 行為 |
|---|---|
| gate reviewer 觸發無回應 | 標 `triggerable: false`，落到 `fallback_order` 下一個當 gate，通知使用者 |
| 選定的 reviewer 全部失敗 | 沿用現有 halt（`reason_class: transient-dependency`） |
| detection 失敗 | 沿用「enhancement, never a gate」：改用 config 快取；快取也沒有則走現有預設流程 |
| config 快取過期（bot 已移除） | 觸發逾時 → 就地標 `triggerable: false` 寫回 config，下次不再叫 |
| unattended 且 config 無選擇紀錄 | 不問也不 halt：gate = `fallback_order` 第一個，auto bot 的 finding 照收，降級跑完 |

快取一律走「用到時自我修復」，不做 TTL、不做背景重掃——錯的資料在下次被使用時
就被打掉。現況已有活例子可驗：`~/Agents/claude/builder/solopreneur.json` 的
`fallback_order` 仍含 `gemini`，該 bot 的 consumer 方案已於 2026-07-17 sunset，
每次跑都白等一次逾時。

autopilot 的互動規劃階段負責問 reviewer 選擇並寫進 plan/spec，cron dispatch 的
unattended 執行階段只讀不問。

## 範圍

只動 **PR mode**。post-commit mode（Codex CLI + agy 並行）與 uncommitted mode
（Codex CLI 單獨）不變。

不做：
- GitHub Copilot code review。它的觸發形態是「加為 reviewer」（`gh pr edit
  --add-reviewer`）而非 PR 留言，registry 的 trigger 欄位容納不了。等真的要用再
  處理，不預先抽象。
- CodeRabbit CLI（免費層 3 次/小時）當 post-commit 的第三個 local reviewer。另案。

## 驗證方式

SKILL.md 是 prompt 而非可執行碼，只能實跑驗證。四項各對應一個設計主張：

1. 在真 PR 上發 `@coderabbitai review` 並確認有回應 → 驗證動機 1（CodeRabbit
   可觸發），同時驗證 OSS 方案下 chat 指令可用
2. 把未安裝的 `greptile` 加進選定清單 → 觸發後應逾時並自動寫入
   `triggerable: false` → 驗證自我修復
3. 一輪 loop 後檢查 config 的 `reviewers` 是否正確寫入 login / `auto` 觀測值 →
   驗證觀測回寫
4. 以 `unattended` 跑一次多 reviewer 的 repo → 確認不等待輸入、gate 落在
   `fallback_order` 第一個

## 查證紀錄

觸發指令（官方文件）：

| 工具 | 觸發 | 備註 |
|---|---|---|
| CodeRabbit | `@coderabbitai review` / `full review` | 另有 `resolve` / `pause` / `summary`；`resolve` 與 `approve` 必須是 top-level 留言 |
| Cursor Bugbot | `bugbot run` 或 `cursor review` | 限 top-level 留言；預設每次 PR update 自動跑，可在 Cursor 個人設定改成「只在被 mention 時」 |
| Greptile | `@greptileai` | 回覆留言中再 mention 可要求修正建議 |
| GitHub Copilot | 加為 reviewer，非留言 | 本次不納入 |

CodeRabbit 方案差異：Free（私有 / 個人）僅 PR summary，GitHub PR review 與 chat
指令都不可用；Open Source（公開 repo）免費取得 Pro+ 功能，review/hr 1–10 浮動。
`hanamizuki/solopreneur` 是 public，走 Open Source 方案——PR #111 上有 7 則
`coderabbitai[bot]` 的 inline review comment 可證。

bot login 不可由名稱推測。探測結果：`cursor[bot]`、`cursor-com[bot]`、
`bugbot[bot]`、`greptile[bot]`、`greptile-apps[bot]` 全都是實際存在的 Bot 帳號，
`greptileai[bot]` 為 404。「存在」不等於「是該工具實際發言用的帳號」，這是 login
必須靠觀測綁定而非硬編碼的直接理由。
