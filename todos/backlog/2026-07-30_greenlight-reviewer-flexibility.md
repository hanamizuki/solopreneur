# greenlight external reviewer 改成偵測驅動 + 可選 gate

把 external reviewer 從「硬編碼 login 白名單 + 序列 fallback」改成「通用偵測 +
registry 已驗證 login + per-repo 觀測快取 + 使用者選定 gate」。留下 review 形狀
證據的新 bot 不必改 skill 就能貢獻意見；registry 只保留廠商知識（觸發指令一行，
已驗證的全域 login 也算廠商知識）。local-cli 在 PR mode 的既有角色保留。

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
`REVIEWER_BOT_LOGINS`（`SKILL.md:1517`）這個三筆的硬編碼清單過濾
（`SKILL.md:1577-1582`），不認識的 login 一律丟棄。

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

三件事從 repo 外面看不到或過去分類錯誤，處理方式如下：

| 看不到的事 | 過去做法 | 改成 |
|---|---|---|
| 某個工具用哪個 GitHub login 發言 | 硬編碼白名單當**過濾器** | GitHub App 的 bot login 是**全域事實**（app-scoped，非 per-repo）：已驗證的記在 registry `knownLogins`，偵測到就自動識別；未驗證的工具由偵測收意見、attended 時使用者 identify 一次 |
| 使用者有沒有開 auto-review | 無（假設 passive/active 是固定分類） | 沒被觸發卻留言 = auto |
| 使用者的方案等級（能不能主動叫） | 無 | 發一次指令，有回應就是能叫 |

白名單的錯不在「記錄 login」，在兩點：拿**猜的** login（cursor 有三個候選帳號，
見〈查證紀錄〉），以及拿它當**過濾器**（不在清單就不存在）。`knownLogins` 只收
已驗證的、只用來**識別**（對上就免學習）；過濾一律走 `type == "Bot"` + 證據門檻。

第三項解掉一個原本不可能的判斷：CodeRabbit 在 private repo 是 Free plan（PR
review 叫不動，只有 summary）、public repo 走 Open Source plan（Pro+ 功能全開）；
Bugbot 是用量計費。從外部無從得知使用者買了什麼，但觀測不需要知道。

### 觸發身分與輪詢身分必須分開

如果把「發指令」和「等回應」都掛在同一個 login 上，就會鎖死——要有 login 才能
觸發，要觸發才能學到 login。拆開就沒有循環：

| 動作 | 需要什麼 | 不需要什麼 |
|---|---|---|
| 發觸發指令 | recipe（指令字串） | login |
| 等待與歸屬回應 | login | — |

所以一個 `knownLogins` 為空的工具照樣觸發得出去；回應者若是 registry 已驗證的
login 直接對上，否則以未識別 bot 的身分收意見，等 attended identify（見〈識別〉）。

### 兩份資料的分工

**Registry — 廠商知識，含已驗證的全域 login。** `kind` 從三類縮成兩類，
`passive-bot` 這個分類消失——「會自動跑」現在是觀測狀態而非種類。

| recipe_id | aliases | kind | trigger | handshake | poll policy | known login |
|---|---|---|---|---|---|---|
| `codex-bot` | codex bot | github-bot | `@codex review` | 👀 reaction | 1min × 20 | `chatgpt-codex-connector[bot]` |
| `gemini` | gemini | github-bot | `/gemini review` | none | 3min, 2min × 2 | `gemini-code-assist[bot]` |
| `coderabbit` | coderabbit | github-bot | `@coderabbitai review` | 預設 | 預設 | `coderabbitai[bot]` |
| `bugbot` | bugbot, cursor | github-bot | `bugbot run` | 預設 | 預設 | —（未驗證） |
| `greptile` | greptile | github-bot | `@greptileai` | 預設 | 預設 | —（未驗證） |
| `codex-cli` | codex cli | local-cli | `codex review --base` | stdout | n/a | n/a |
| `agy` | agy | local-cli | `agy --print` | stdout + marker | n/a | n/a |

「預設」= `handshake: none`（靠 response vs timeout 判定，沿用 `gemini` 那列已
驗證的做法）+ 通用 poll（3min 首等，2min × 3）。**新增一個 bot 的成本因此是一行
trigger 指令**，handshake 與 poll 都有安全預設，`knownLogins` 留空即可——工具
照樣可用，login 之後由 identify 補上。

`knownLogins` 收錄標準：GitHub App 的 bot login 是 app-scoped——同一個 App 在
所有 repo 用同一個帳號發言，符合 registry「facts identical for every user of a
tool」的收錄標準。但**只收已驗證的**（三個既有 bot 有本 repo 數月的觀測紀錄）；
未驗證絕不猜（〈查證紀錄〉證明猜不得）。

**Config — 存 per-repo 觀測值**，落在 **`repos[<repo-key>].greenlight_reviewers`**，
一個與 `greenlight` 並列的**獨立 feature key**：

```json
"greenlight_reviewers": {
  "observed": {
    "gemini-code-assist[bot]": { "auto": false, "triggerable": false },
    "some-new-bot[bot]":       { "recipe": null, "auto": true },
    "another-tool[bot]":       { "recipe": "bugbot" }
  }
}
```

| 欄位 | 來源 | 意義 |
|---|---|---|
| `observed` key | 偵測（`.user.type == "Bot"`） | 這個 repo 上活動過的 bot |
| `recipe` | attended identify | 對到 registry 哪一列；`null` = 未識別。**registry `knownLogins` 對得上的 login 不需要此欄**——resolve 自動識別 |
| `auto` | 觀測 | 沒被觸發也會留言 |
| `triggerable: false` | 自我修復 | 發過指令但無回應（僅當窗口涵蓋其自身 poll 預算才寫，見流程第 9 步）；attended 重選該 reviewer 即清除 |

**為什麼是獨立 feature key 而不是 `greenlight.reviewers`。** config 的五層讀取是
**per-feature、整棵 subtree、層間不合併**（`shared/config.md:93-96`），而現有
`fallback_order` 的 writer 落在 `.default.greenlight`（`greenlight/SKILL.md:1656`）。
若觀測值寫進 `repos[<key>].greenlight`，layer 1 就會命中一棵沒有 `fallback_order`
的 subtree，把 user-global 的設定永久遮蔽——破壞一條這次根本沒碰的程式碼路徑。
`write_solopreneur_repo_config` 也是整棵替換（`config.md:303` 的 jq 是 `.[$fk] = $v`，
只承諾保留 sibling **features**，不保留 subtree 內的 key），所以存 gate 選擇會把
`reviewers` 整個刪掉。拆成獨立 feature key 同時避開這兩個問題。

**因此 `fallback_order` 不由腳本讀。** 它由 SKILL.md 用現成的
`read_solopreneur_config greenlight` 走完整五層取得後傳入——腳本不重新實作那五層，
也永遠不寫 `greenlight` 這個 key。單一 writer 原則：腳本獨佔
`greenlight_reviewers`，shell helper 獨佔 `greenlight`。

### 兩層彈性

- **第一層（零維護）**：任何 `.user.type == "Bot"` 且**留下 review 形狀證據**的新
  bot，finding 立刻被收進 loop。`recipe: null` 也照收。裝了新工具什麼都不用設定就
  開始有用。
- **第二層（需要 recipe）**：只有「主動催它」才需要對到 registry 那行 trigger。
  已驗證 login 的工具開箱即用；未驗證的第一次留言後由使用者 identify 一次。

**「review 形狀證據」是必要的門檻，不是額外嚴格。** `.user.type == "Bot"` 認的是
自動化，不是 review 能力——dependabot、release bot、CI bot、deployment bot 全都是
`Bot`。而預設選取是「所有 available」，所以若只看 type，dependabot 的 PR 描述會被
當成 review finding 送進處理流程。

門檻的判準剛好落在現有三個採樣來源的分工上，不需要新資料：

| 來源 | 內容 | 算 reviewer 證據？ |
|---|---|---|
| Source 1 `issues/comments` | PR 對話留言（摘要、配額通知、dependabot 的說明） | ❌ 不算 |
| Source 2 `pulls/comments` | inline review comment（逐行意見） | ✅ 算 |
| Source 3 `pulls/<n>/reviews` | formal review | ✅ 算 |

dependabot 只出現在 Source 1，自然被濾掉；三個現有 review bot 在 Source 2/3 都有
大量紀錄（見〈動機 1〉的實測表）。所以 detect 必須保留「證據來自哪個來源」，不能只
回傳 login + lastSeen。

detection 的改動因此有兩處：過濾條件從比對 `REVIEWER_BOT_LOGINS` 改成
`.user.type == "Bot"`，且每筆活動要帶來源標記以判定 reviewer 資格。三個來源的採樣
邏輯與 all-or-nothing 降級行為不變。

### Reviewer 選擇與 gate

**預設不打擾。** gate 能從 `fallback_order` 解出就直接跑，不問。只有「有候選但
沒有任何一個能當 gate」時 attended 才停下來問，選項是：identify 未識別的 bot、
重試被標 `triggerable: false` 的（重選即清除標記）、加入 `agy`、或 halt。

要指定就用 invocation token：`select=`（這輪用哪些，逗號分隔 recipe id）與
`gate=`（誰的 clean pass 結束 loop）。gate 選擇會 persist：讀出五層 merge 後的
`greenlight` subtree，把選定 gate 置頂（原順序其餘保留，`codex-cli` 等後補不會
被截掉），整棵寫回 repo 層——整棵寫回讓 repo 層的 wholesale 遮蔽變成無害快照。

候選來源與 gate 資格：

| 候選 | 來源 | 可當 gate？ |
|---|---|---|
| login 對得到 recipe（knownLogins 或 identify） | 偵測 + registry / 快取 | ✅ |
| `recipe: null` | 偵測到的未識別 bot | ❌ 沒有 recipe 就無法主動觸發，無從判定它這輪講完了 |
| local-cli（`codex-cli` / `agy`） | CLI 可用性 gate，不在 GitHub 活動裡 | ✅ 見下 |

`triggerable: false` 的一律排除在候選之外（attended 重選可平反）。

**local-cli 在 PR mode 保留，角色明確。** 它們沒有 bot login，永遠不會出現在偵測
結果裡，所以可用性由既有的 CLI gate 決定（`greenlight/SKILL.md:719`）而非活動偵測。
這不是新增能力——PR mode 的 `current_reviewer` 表本來就有 `"codex cli"` → Flow B
（`SKILL.md:1754`），且 `config.md` 三處推薦的預設 `fallback_order` 都是
`["codex-bot", "codex-cli"]`。若把 local-cli 排除在新架構外，這個文件推薦的預設會
靜默失效。兩者的處理不同：

- **`codex-cli`：codex-bot 失敗時自動接手**，不詢問。它同步跑完就是一輪結束，天然
  適合當 gate，且與 codex-bot 同模型家族，接手後 review 標準一致。
- **`agy`：不自動使用，必須詢問**。它是 Gemini 家族，換模型家族是使用者該知道的
  事，不該在 fallback 鏈上靜默發生。

gate 語意：

| | 行為 |
|---|---|
| gate reviewer | 它這輪**回應了且全場沒有新 finding** → loop 結束 |
| 其他 reviewer | finding 照收照修，但它們沒 clean 不阻擋結束 |
| 收尾 | 結束時做最後一次 sweep，把非 gate reviewer 未處理／窗外遲到的意見列進報告，交使用者判斷 |

沒有 gate 概念的話「四個都要」會變成「四個都得閉嘴才算過」，實務上收斂不了。

**gate 一律被觸發，包括 `auto` 的。** clean 訊號需要一個明確的回應對象；對 auto
bot 多發一次 review 指令無害，換來「它這輪講完了」有可靠的判定點。（`auto` 只
豁免**非 gate** reviewer 的觸發。）

**gate 的契約必須含它自己的 poll 政策。** 一輪的等待時間取決於 gate 是誰。gate 是
github-bot 時用它的 `poll` 與 `handshake`；gate 是 local-cli 時沒有 poll——同步
跑完即關窗，結束後對其他 reviewer 的 channel 做一次收集 sweep。

`fallback_order` 的角色隨之從「唯一 reviewer 的候補順序」變成「gate 的候補順序」。

### 一輪 loop 的流程

1. push 修好的 commit
2. **逐 channel** 記錄當下游標上界（Source 1/2/3 各一份；不可只留一份——formal
   review 與 comment 的時間軸不可比）
3. 決定這輪要主動觸發誰：選定的 reviewer 中 `triggerable != false`，且（`auto !=
   true` 或它是 gate）的全部，並行發指令。依各 recipe 的 `handshake` 執行確認：
   `reaction` 的走既有 👀 確認梯（30 秒後查、無回應再等 30 秒、仍無則重貼，上限
   2 次）；`none` 的發一次即可
4. 開 poll 窗口：gate 是 github-bot → 用 **gate 的** `poll`；gate 是 local-cli →
   同步執行，跑完即關窗
5. 窗口內收集新活動。掃描本身**不過濾 login**（觀測回寫需要看到全場），finding
   只取自選定的 reviewer；gate 的 👍 reaction 也在檢查範圍（既有 priority 2.5：
   codex bot 有時不留言只按 👍）
6. 關窗條件：gate 出現新 item **或 gate 的 👍-only reaction**，或逾時
7. **先分類再動手**：依優先序判定終端狀態（見下表），分類完才決定要不要修
8. `findings` → 進現有處理流程（含 adversarial verify）→ 修 → 回到第 1 步；
   `clean` → 最後一次 sweep 收窗外遲到意見**列報告**（不修——修了就沒有 reviewer
   看過那個 diff）→ 結束
9. 觀測回寫：
   - 沒被觸發卻留言 → `auto: true`
   - 被觸發（因非 auto）且回應 → `auto: false`（gate 因身分被強制觸發的不改寫
     `auto`）
   - 被觸發卻整窗沉默，**且窗口長度 ≥ 它自己 recipe 的 poll 預算** →
     `triggerable: false`（gate 恆符合此條件；比 gate 慢的非 gate reviewer 只是
     這輪沒被觀測到，不是叫不動）
   - 快取標著 `triggerable: false` 的 login 卻出現新 item → `triggerable: true`
     （單向門變雙向）

關鍵取捨：**不為 auto bot 額外等待**。gate 回應就關窗，auto bot 那時沒講完就算
了——各 channel 的游標上界遞增，遲到的意見下一輪自然被撿到；**結束輪**的遲到意見
由收尾 sweep 列進報告，不會靜默消失。

**沉默不等於通過。** 一輪依下列**優先序**落在恰好一個終端狀態（逐列往下判，第一
個成立的生效）：

| 優先序 | 狀態 | 條件 | 動作 |
|---|---|---|---|
| 1 | `findings` | 任一收集對象（含 gate）有新 finding | 修，下一輪 |
| 2 | `quota` | 無新 finding，但 gate 的回應是配額／rate limit 通知 | 換下一個 gate 候補；候補用盡則 halt |
| 3 | `timeout` | 無新 finding，gate 整窗沉默（連 👍 都沒有） | 標 `triggerable: false` → 換下一個 gate 候補；用盡則 halt。**絕不當 clean** |
| 4 | `clean` | gate 回應了（item 或 👍）且全場沒有新 finding | 收尾 sweep → 結束 loop |

`findings` 排最前是刻意的：gate clean 但別人有 finding 的那輪必須再跑——先修再
宣告 clean 會讓最後的 diff 沒有任何 reviewer 看過。把「沒有新 finding」直接當成
clean 的另一個方向（掛掉的 reviewer 等於一次通過）由第 3 列擋住。

`SIZE_MAX_ROUNDS`（S=3 / M=5 / L=10）沿用，chatty reviewer 把 loop 撐長由它封頂，
到頂時未收斂的意見走收尾報告。S 是 external-only 單一 reviewer——gate 由
`fallback_order` 直接解出，「沒有 gate 才問」的條件在 S 下不成立。

### 偵測不到的情況

偵測是回溯的：第一次啟用某個 bot、還沒有任何 PR 被它處理過時，掃不到。三條
程式化替代路徑都試過，沒有可用的：

| 路徑 | 結果 |
|---|---|
| `/user/installations` | 403 — 需要 GitHub App 授權的 access token，`gh` 的 token 不足 |
| `/repos/{owner}/{repo}/installation` | 401 — 需要 App JWT |
| check-runs 的 `.app.slug` | 只回 `github-actions`；CodeRabbit / codex / gemini 都不建 check run |

GitHub 不讓一般 token 查「這個 repo 裝了哪些 App」，所以只能問使用者。使用者挑了
工具名之後：**這一輪直接發該 recipe 的 trigger**（觸發只需要指令字串，不需要
login）。回應者對上 `knownLogins` 就自動識別；對不上就走 attended identify；整窗
無回應就回報「這個 repo 大概沒裝」，**不留任何狀態**——下次想再試再選一次即可。

### 識別（identify）

login ↔ recipe 的關聯有兩條路，都不猜：

1. **registry 自動識別**：偵測到的 login 對上某列的 `knownLogins` → 直接取得
   recipe，零設定、零互動。三個既有 bot 走這條，migration 當天即生效。
2. **attended identify**：`knownLogins` 對不上、但有 review 證據的 login，在
   attended 互動時列給使用者指認（「這個 login 是哪個工具？」），確認後寫進
   `observed[login].recipe`。unattended 永不識別——未識別 bot 的意見照收，僅此
   而已。

**為什麼刪掉先前設計的自動綁定（pending 佇列 + 消去法歸屬）**：消去法「窗口內新
出現的未綁定 login 就是它」有兩個致命傷——對**已經留言過**的 bot 永遠失效（回應
者不是「新」login，而 migration 場景裡三個既有 bot 全都留言過），對窗口內的雜訊
（dependabot、人類留言）會誤綁。identify 由人確認，準確、零新狀態、且是消去法
無論如何都需要的 fallback。多出的成本只是「未驗證工具每 repo 指認一次」。

## 錯誤處理與降級

| 情境 | 行為 |
|---|---|
| gate 觸發無回應 | 標 `triggerable: false`，落到 `fallback_order` 下一個當 gate，通知使用者 |
| gate 候補全部用盡 | halt（`reason_class: transient-dependency`）。`auto` reviewer 收到的 finding **不能**拯救這種情況——沒有可觸發的 gate 就無從確認一輪結束，也就沒有可辯護的 clean 訊號 |
| detection 失敗 | 沿用「enhancement, never a gate」：改用 config 快取；快取也沒有則走現有預設流程 |
| config 快取過期（bot 已移除） | 觸發逾時 → 就地標 `triggerable: false` 寫回 config，下次不再叫 |
| `triggerable: false` 誤標 | attended 重選該 reviewer 即清除（寫回 `triggerable: true`）；被標的 login 一旦出現新活動也自動平反（流程第 9 步）。unattended 不主動平反 |
| `select=` / `gate=` 指到不可用的對象 | **警告後視同未指定**，不中止——這兩個值可能來自幾天前寫的 autopilot descriptor，期間 reviewer 可能已被標掉；stale token 不該讓 unattended run 空手而歸 |
| config 檔毀損或無法讀取 | **中止，不寫入**。只有「檔案不存在」可以視為空設定；解析失敗或權限錯誤一律當致命錯誤——若把兩者都當成空設定，接著寫檔就會把使用者整個 `solopreneur.json` 換成只剩剛寫的那一筆 |
| config 快取裡有無效 recipe | 降級為未識別（只收 finding、不觸發）並回報是哪個 id 過期，不要因為一個過期字串就整個 run 崩掉 |
| unattended 且 config 無選擇紀錄 | 不問也不 halt：gate = `fallback_order` 第一個可用者，auto bot 的 finding 照收，降級跑完 |

快取一律走「用到時自我修復」，不做 TTL、不做背景重掃——錯的資料在下次被使用時
就被打掉。現況已有活例子可驗：`~/Agents/claude/builder/solopreneur.json` 的
`fallback_order` 仍含 `gemini`，該 bot 的 consumer 方案已於 2026-07-17 sunset，
每次跑都白等一次逾時。

autopilot 的互動規劃階段可以把使用者交代的 reviewer 選擇寫進 plan/spec（optional
欄位）；cron dispatch 的 unattended 執行階段只讀不問，stale 值依上表降級。

## 範圍

只動 **PR mode**。post-commit mode（Codex CLI + agy 並行）與 uncommitted mode
（Codex CLI 單獨）不變。

受影響檔案（本次範圍內，不得遺漏）：

| 檔案 | 為什麼 |
|---|---|
| `greenlight/SKILL.md` | registry 表格、detection、選擇與 gate、loop 流程、argument parsing 新 token |
| `greenlight/scripts/` + `tests/` | 新增決策腳本與測試 |
| `.github/workflows/` | 新增測試 gate（含 `timeout-minutes` 與 matrix-aware `concurrency`） |
| `shared/config.md` | 新增 `greenlight_reviewers` 欄位說明；更新「兩個 writer」與其他語言 writer 註冊表兩處 invariant |
| `autopilot/SKILL.md` | dispatch-time 變數 |
| `autopilot/references/pr-subagent-template.md` | 傳遞 token，並明確帶 `unattended` |
| `autopilot/references/schemas.md` | plan.yaml 的契約來源，新增 optional 欄位要在此定義 |

不做：
- GitHub Copilot code review。它的觸發形態是「加為 reviewer」（`gh pr edit
  --add-reviewer`）而非 PR 留言，registry 的 trigger 欄位容納不了。等真的要用再
  處理，不預先抽象。
- CodeRabbit CLI（免費層 3 次/小時）當 post-commit 的第三個 local reviewer。另案。
- **pending 佇列 + 自動綁定**。被 registry `knownLogins` + attended identify 取代，
  理由見〈識別〉。

## 驗證方式

決策邏輯（偵測過濾、候選合併、gate 選擇、觀測回寫）抽成腳本後可用
`node --test` 自動驗證，比照 `preview` skill 的既有架構。只有 SKILL.md 的 prompt
部分需要實跑。

自動化必須覆蓋的、光靠實跑抓不到的案例：

1. **config 毀損不得寫入** — 餵一個有多餘逗號的 config，斷言中止且原檔逐位元不變
2. **`greenlight` 與 `greenlight_reviewers` 互不影響** — 寫觀測值後，斷言
   `.default.greenlight.fallback_order` 仍被五層讀取取得
3. **未識別 bot 的門檻** — 只出現在 Source 1 的 bot（dependabot 形狀）不得成為候選；
   出現在 Source 2/3 的必須成為候選
4. **knownLogins 自動識別** — 空 config 下偵測到 `coderabbitai[bot]` 即取得
   `coderabbit` recipe 與 gate 資格；未知 login 保持 `recipe: null`；identify 寫回
   （`observed[login].recipe`）優先於 registry 對應
5. **`timeout` 不等於 `clean`** — gate 沉默的那一輪不得回報 clean；gate 的
   👍-only reaction 算回應（clean 資格）
6. **stale `select=` / `gate=` 降級** — 指到不存在的對象時警告並視同未指定，
   exit 0，而非空手失敗

實跑驗證（需要真 PR）：

7. 發 `@coderabbitai review` 確認有回應 → 驗證動機 1，同時驗證 OSS 方案下 chat
   指令可用
8. 對 `knownLogins` 為空的工具（greptile）發 trigger：無回應 → 確認**不留任何
   狀態**；有回應 → attended identify 寫入 `observed`。**不可預先塞入猜測的
   login**：那會繞過要驗證的識別路徑
9. 以 `unattended` 跑一次多 reviewer 的 repo → 確認不等待輸入

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

bot login 是 app-scoped 的全域帳號：同一個 GitHub App 在所有 repo 用同一個 login
發言，所以「已驗證的 login」是廠商知識，可進 registry。但 login 不可由名稱**推測**。
探測結果：`cursor[bot]`、`cursor-com[bot]`、`bugbot[bot]`、`greptile[bot]`、
`greptile-apps[bot]` 全都是實際存在的 Bot 帳號，`greptileai[bot]` 為 404。「存在」
不等於「是該工具實際發言用的帳號」——這是 `bugbot` / `greptile` 兩列 `knownLogins`
留空、只能靠 identify 補上的直接理由。已驗證三筆（codex / gemini / coderabbit）
來自本 repo 數月的實際留言紀錄。
