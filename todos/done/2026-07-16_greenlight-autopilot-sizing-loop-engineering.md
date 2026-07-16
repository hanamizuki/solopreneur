# Greenlight / Autopilot 分級（S/M/L）與 loop engineering

Status: done（2026-07-16 autopilot 完成，4/4 PRs merged——見文末執行結果）
目標：autopilot / greenlight 流程太重，對 typo PR 和核心邏輯 PR 跑同一套。引入以風險為軸的 S/M/L 分級，並用 loop engineering 五要素（目標 / Verifier / Feedback / Stopping / Escalation）補上流程的結構性缺口。

## 已查證的現狀事實（2026-07-16 二輪查核，含行號，免重新考古）

- **greenlight 完全沒有客觀驗證**：SKILL.md 1430 行內無任何 test/lint/typecheck 步驟；fix subagent 指令只有 fix → commit → push（SKILL.md:882、:1370）；CI 結果 greenlight 從頭到尾不看。
- **merge-pr 不看 CI，且吞錯**：無 `gh pr checks`；merge 指令尾帶 `|| true`（merge-pr SKILL.md:489）——連被 branch protection 擋下的 merge 失敗都會被報成成功。
- **autopilot 路徑前後有、中間裸奔**：pr-subagent-template Step 3 在 implement 後跑 spec test（自修 ×3，:63-67），Step 6 在 greenlight 後 poll CI（60s × 10、fail 只修一次且不再過 review，:80-83）。中間 greenlight N 輪 fix 每輪直接 push、零驗證。**Step 6 已有 CI gate ⇒ PR 0 堵的真洞是 standalone `/merge-pr`（人直接跑的路徑），autopilot 路徑算 defense-in-depth**。
- **獨立跑 `/greenlight` 時前後兩道都不存在**（除非 repo 有 branch protection required checks）。
- 真正貴的三塊：Phase 1 的 5 個 internal reviewer subagent（各吃完整 diff，:833-839）、verification gate（每 finding 3 skeptics，:64-66）、Phase 3 external loop（每輪 poll 最多 20 分鐘，:1312）。
- **Max rounds 現狀全貌**：PR mode 10（:1417）、uncommitted 10（:474）、**post-commit 5（:621）**。orchestrator 另有自己的規則：review loop >3 輪 → blocked（orchestrator.md:218）、per-PR retry_count ≥2 → blocked（:185）——**與 greenlight 內部 max 10 不一致，PR 3 統一框架時要收攏**。
- 現有的手動降級先例：greenlight `external` argument、autopilot single-PR fast path。escalation 規則散落 6+ 條（fix >20 行 :1428、suggestions 矛盾 :865、Phase 1 全掛 → skip 到 Phase 3 :844、external fallback 耗盡 :1092、invariant abort :322-355、orchestrator blocked 規則），缺統一框架。
- **2026-07-15 剛落地 reviewer registry + 活動偵測（PR #111）**——本 todo 初稿的盲點：profile 的 reviewer 選擇必須用 registry 語彙，不可寫死 bot 名（否則把 registry 剛拆掉的硬編碼加回去）。
- 現成掛點：plan.yaml 已有 `type: code|docs`（schemas.md:50，**作者自填**）、`docs/loops/` run 目錄已存在、`read_solopreneur_config` cascade 現成但尚無 `verify` key。
- 提案實作進度：**0%**（PR 0–3 皆未動工）。

## 已拍板決策

### 1. S/M/L 三級（不是五級），軸是風險不是難度

一行 auth 改動比 300 行 docs 重寫更需要重審——判定訊號以 path 為主、diff 大小為輔。

**判定用 cascade 規則表**（機械、bash 可算，不用 AI 主觀評估）：

```
1. L 判定（any-match，命中任一即 L）：
   - path 碰到：migrations/、auth·payment·crypto 相關、.github/workflows/、
     Dockerfile/infra、dependency manifest 實質變更
   - diff > ~400 行（排除 lockfile / generated）
2. S 判定（all-match，全部成立才 S）：
   - 所有檔案 ∈ 白名單：docs/**（排除 docs/loops/**）、todos/**、
     repo root 的 README.md（僅 root）、LICENSE、.gitignore
   - 白名單必須位置限定，**不可用全域 `*.md` glob**——skill 型 repo（如
     solopreneur 自己）的核心邏輯就是 markdown，改 SKILL.md 必須留在 M
3. 其餘 → M
```

二輪 review 修訂：

- **砍掉「跨 module 邊界」trigger**——原七個 L trigger 裡唯一無法機械定義的（bash 算不出 module boundary，且 marketplace 改動天生跨多個 plugins/*，兩頭誤射）；>400 行 + 危險 path 已涵蓋絕大多數真正大/危的改動。
- **`docs/**` 排除 `docs/loops/**`**：那是 autopilot 會讀並執行的活編排 config（plan.yaml / state.json / spec），不是散文，不得走 S 輕審。
- **`README.md` 綁 repo root**：各 plugin 的 README 含 install 指令、被 marketplace.json 引用，不進 S。
- **分類器任何不確定一律 default M**。

不對稱是刻意的：L 是 OR（任一危險訊號就升）、S 是 AND（全部無害才降）——含糊時升級不降級。**config 檔不進 S**（config 錯誤是靜默的 runtime 行為改變，留在 M）。

Override 與新鮮度：`/greenlight size=l` token；autopilot 在 plan.yaml 加 `size:` 欄位往下傳（pr-subagent-template 呼叫 greenlight 時帶 token）。**plan-time size 只是 advisory：greenlight 一律用真實 diff 重算，取 `max(plan_size, computed_size)`**——scope creep 只升不降，也擋掉「紙上維持 S 但實際長大」的 gaming。greenlight 獨立被呼叫時自己跑 heuristic。unattended 模式不問人直接用。

**Profile 表**：

| Dial | S (light) | M (standard, 預設) | L (deep) |
|---|---|---|---|
| Phase 1 internal | 跳過 | 挑 2 個（如 specialist + ponytail） | 全 5 個 |
| Verification gate | 跳過 | 跳過 | 開（Workflow 可用時） |
| External loop | registry 第一個可用 external reviewer（偏好 codex），照樣 loop 到 clean，**max 3** | 標準循環 **max 5**（與 post-commit 現狀一致，刻意寫死） | 全套 max 10 |
| autopilot tech-vetting | 跳過 | 跑 | 跑 |
| autopilot spec | 極簡 | 標準 | 標準 |

- **Verifier（客觀）不分級**：全 size 都跑 config 的單一 `verify` 命令（見第 2 節；沒設定 → skip + flag）。E2E / security 永遠 CI-only，L 檔不例外。
- **Reviewer 選擇一律走 registry 語彙**（active-bot / local-cli 可用性由 registry + 偵測判定），不寫死 bot 名。
- S 也要 loop 直到 clean——Hana 拍板，不是跑一次就收。
- Uncommitted mode 不分級——本地互動流程，維持現狀，明確豁免。

### 2. Verifier 與 stopping criterion 角色分離

- **Verifier（客觀）**：本地 verify 命令（test/lint/typecheck）——決定這輪 fix **能不能 push**。
- **Stopping criterion（主觀）**：reviewer clean——決定 loop **能不能結束**。

codex clean 當停止條件合理，但它是靜態讀 diff（不執行程式碼，抓不到 import 錯 / 型別錯 / 行為 regression，且有隨機性），不能兼任 verifier。

**改法 = 內外雙迴圈**：

```
outer loop（貴、主觀）：trigger reviewer → findings → fix
  inner loop（便宜、客觀）：fix 後先跑 verify 命令
    → 失敗：verify log 餵回 fix subagent 重修，不進下一輪 review
      （inner max 3 次——與 pr-subagent-template Step 3 自修 ×3 先例一致；
       3 次不過 → halt，verify log 進 payload。inner loop 自己也要有 Stopping）
    → 通過：才 commit + push + re-trigger reviewer
```

二輪 review 補強（**皆屬 PR 1 範圍，不得延到 PR 3**）：

- **Anti-gaming guard**：verify 含 test 時，fix agent 最省力路徑是改測試（skip / 刪 test / hardcode 期望值）。guard：這輪 findings 沒有指向 test 檔，fix 卻動了 test／verify 定義檔 → halt/flag。S 級沒有 internal reviewer，這是唯一防線。
- **Log 截斷**：餵回 fix subagent 的只有最後一次失敗的 assertion／第一個 error + tail（比照 agy `AGY_MAX_DIFF_BYTES` 先例），完整 log 進 halt payload——否則 3 輪疊加淹掉訊號。
- **Verifier 範圍限定 deterministic**：lint / typecheck / fast-unit。E2E 有 flakiness，塞進 inner ×3 會燒光 attempt 產生假 halt、或讓 fix agent 去修沒壞的東西。
- **單一 `verify` 命令，不做 per-size 命令矩陣**：多數 repo 只有一個天然 verify 入口（Makefile target / `npm test`），per-size × per-repo 矩陣是投機彈性，且它最差異化的那層（E2E）正是不該進來的。
- **歸屬**：inner loop 住在 fix subagent 內（edit → verify → iterate → 才 commit），第 3 次失敗用 structured result 把 halt 冒出來——否則得把 commit 權收回 orchestrator。
- **Work 上界明文化**：retry 已四層疊乘（Step 3 自修 ×3、inner ×3、outer 5~10、wave retry ×2）——PR 1 文件要列出每 size 的最壞總 work，避免 sizing 省下的被 inner loop 吐回去。

Verify 命令來源：solopreneur.json 加 `verify` feature key（`read_solopreneur_config verify` 機制現成）。沒設定就 skip 並在 final report 誠實標註「本 loop 無客觀 verifier」（flag 級，見第 4 節）。

時序注意：verify 一律跑在 **commit 前**（test/lint/typecheck 都是 working-tree
操作，不需要 committed state）——post-commit mode 也一樣，所以不存在「壞 commit
+ 修復 commit」序列問題。Uncommitted mode 不適用本節（本地互動流程，不 commit
不 push，明確豁免）。

### 3. 與 CI 三層分工（不打架）

| 層 | 時機 | 職責 |
|---|---|---|
| 本地 verify | 每輪 fix 後、push 前 | fast-fail，壞的 fix 不出門（新增） |
| CI | push 後背景跑 | 權威 gate、完整環境、E2E/security（現有） |
| merge gate | 合併前 | 確認 CI 綠才 merge（autopilot Step 6 有；**merge-pr 要補 `gh pr checks`**） |

有 CI 的 repo 本地跑快子集（lint + typecheck + fast-unit）、full suite / E2E 交給 CI；沒 CI 的 repo 本地 verify 是唯一客觀 gate。greenlight 不等 CI（CI 是 merge 的事，不是 review 的事）。

**Merge gate 三個正確性細節（PR 0 的全部難度所在——gate 寫錯比沒 gate 更糟，下游會信一個說謊的 gate）**：

1. **Stale-SHA race**：greenlight 推完最後一個 fix commit 就退出，此時該 commit 的 CI 可能還沒註冊，`gh pr checks` 會回報上一個 commit 的綠或空 pending set。gate 必須確認 checks 屬於**要 merge 的 HEAD SHA**。
2. **Pending / 無 check ≠ green**：尚無任何 check 回報 → 視為 not-green（等待）。真正零 checks 的 repo（無 CI）→ 放行但 **flag**「merged with no CI signal」。
3. **移除 `|| true`**（merge-pr:489）：現在連被 branch protection 擋下的 merge 失敗都被吞成成功，一併修。

（pr-subagent-template Step 6 用 PR number polling 有同樣 stale-SHA 風險，PR 0 一併修。）

### 4. Escalation：兩問判準 + 三級機制

判準兩問：
1. **還能繼續嗎？** 機械 blocked（工具全掛、環境壞、輪數用完）→ halt，沒得商量。
2. **該由我決定嗎？** 三個檢查：**可逆性**（錯了能便宜撤銷嗎）、**範圍**（在 spec / size 授權內嗎）、**可裁決性**（有 test/spec 能機械判對錯嗎）。

一句話：錯了很貴、或對錯無法機械裁決的決定 → 回報人類；其餘自主做、留痕跡。

三級機制（unattended 模式的關鍵是 flag 中間層——沒有它，unattended 只能在「動不動全停」和「全自主無人知曉」二選一）：

| 級 | 行為 | 例子 |
|---|---|---|
| **halt** | 停下、打包 payload、回報（unattended = exit non-zero） | **external** reviewer 全掛（Phase 1 internal 全掛照現狀 skip → 繼續 Phase 3，不 halt——別退步）、invariant 壞、fix 要碰授權外危險 path（S/M loop 中途發現要動 auth = size 前提變了）、inner verify ×3 不過 |
| **flag** | 繼續跑，決定記入 report 醒目區，人類事後裁決 | push back P1、fix >20 行、無 verifier 配置下跑完的 loop、無 CI signal 下 merge、自動判 S、findings 矛盾（①②，見下方矛盾處置表） |
| **note** | 正常統計 | fixed / pushed-back 計數 |

二輪 review 補強：

- **halt payload 帶 `reason_class`**：`transient-dependency`（reviewer 全掛——可重試）／`invariant-violation`（硬停，別重試）／`authority-boundary`（refuse，必須人介入）。下游 orchestrator 本來就分「wait-retry」和「blocked」兩路（orchestrator.md:211-221），壓平的 halt 餵不了這個分流。
- **Attended 投影**：三級是 unattended-first，但 greenlight 也會被人手動跑，現存流程滿是「ask the user」分支。attended 時 halt → 問使用者再決定（不是 exit non-zero）、flag → inline 呈現、note 照舊。不寫清楚會 regress 現有互動行為。
- PR 3 統一框架時一併收攏 orchestrator 的 blocked 規則（>3 輪 blocked vs greenlight max 10 的不一致）。

**Findings 矛盾處置表（2026-07-16 與 Hana 逐條拍板）**。「挑保守方」＝維持現狀不動手，不是猜一邊執行。背景：現狀全 SKILL.md 只有一條矛盾規則（Phase 2a :865 問人，attended-only），Phase 3 零規則；verification gate 的 3 skeptics 逐條獨立驗真偽、不交叉比對，矛盾雙方都會存活。

| 型 | 例 | unattended 處置 |
|---|---|---|
| ① 同輪對撞：兩 reviewer 對同段碼開相反藥方 | ponytail 說刪防禦 check、specialist 說加 null check | 兩條都不做（no-action 是唯一不否定任一方的動作，維持已通過前輪的現狀）→ 各記 pushed-back(contradiction) + **flag** |
| ② 跨輪翻烙餅：新 finding 要求 revert 前輪已採納 fix（review loop 經典不收斂模式，現狀零偵測、只靠 max rounds 兜底） | round 1 codex 說抽 helper、round 3 說 inline 回去 | loop 維護「已採納 fix」清單、fix subagent prompt 帶上；互斥 → 不執行、pushed-back(flip-flop) + **flag**。保守方＝已採納的前輪 fix，不 thrash |
| ③ finding 撞 spec／size 授權（**可機械裁決，spec 就是裁判**，不屬「無法裁決」桶） | spec 寫全 sync、reviewer 要 async | spec 勝 → pushed-back(out-of-contract) + **note**；reviewer 理由是 correctness 級（暗示 spec 本身錯）→ 升 **flag**；fix 要碰危險 path → **halt**（authority-boundary，上表已拍板） |
| ④ reviewer 說 P1、fix subagent 判 false positive（reviewer vs fix agent，非 reviewer 互撞） | — | push back P1 → **flag**（上表已拍板，列出僅為完整） |
| ⑤ 純 style 對撞（①的低配版） | 一個要多註解、一個嫌註解吵 | no-action + **note**（不進 flag——每條都 flag 會把 flag 區灌成噪音，flag 只留 correctness 味道的矛盾） |

（attended 模式維持現狀問人；standalone `/greenlight` 無 spec 時 ③ 退化成 ①。一句話：可機械裁決的讓 spec 裁；不可裁決的一律不動手，correctness 級 flag、style 級 note；唯一 halt 是撞授權邊界。）

**halt payload**：最後一輪 findings + verify 失敗 log（完整版）+ 已嘗試 fix 摘要 + push-back 理由 + 建議下一步，落成檔案：`docs/loops/<run>/halts/` 子目錄——與 plan.yaml / state.json 活 config 分開，且 `docs/loops/**` 已排除出 S 白名單，halt 記錄不會反過來走輕審。獨立跑 `/greenlight` 沒有 run 目錄——fallback 自建 `docs/loops/<date>_greenlight-<branch>/halts/`。report 引用路徑。

### 5. autopilot spec 品質 gate

acceptance criteria 每條必須是可執行命令或可驗證斷言，「功能正常運作」這種寫不出 verifier 的句子打回——autopilot Step 3 是把模糊目標編譯成 loop contract 的地方。`type: docs` 的 PR 豁免（docs 的 criteria 本來就寫不成可執行命令，允許 checklist 斷言由 reviewer 判）。

二輪 review 補強：`type: docs` 是 plan.yaml **作者自填**（schemas.md:50），可錯填可 game——同時買到本節豁免＋第 1 節的 S 輕審。**豁免要被第 1 節的機械分類器交叉否決**：touched paths 不落在純散文白名單 → `docs` 自我宣稱 override 或至少 flag。gate 本身保持輕量（checklist prompt，不派 subagent）——真正的 enforcement 是第 2 節的 verify step，這裡只是 fast-fail。

### 6. 文件結構

二輪 review 修訂——**縮水**：SKILL.md 已 1430 行、正在跟兩份重複表格（REVIEWER_BOT_LOGINS、RESULT_SCHEMA）搏鬥，per-mode 靜態 contract 表保證跟 flow drift。五要素當**設計 lens** 用於寫 PR 1–3；交付物最多在 skill header 放一張總表，不做 per-mode 表。「填不出 Verifier 欄的 loop = 還沒設計完」這個原則保留。

## 實作切法（4 PRs，依價值排序）

二輪 review 修訂：**最小 halt/flag primitive 提前進 PR 1**——它是 PR 1（flag「無 verifier」「fix 動測試」）和 PR 2（flag「自動判 S」）共用的安全面，原順序把兩個有風險的機制 ship 在安全面之前。

0. **PR 0：merge-pr 補 `gh pr checks`**（零依賴、堵 standalone `/merge-pr` 的「CI 紅照樣 merge」真洞 + autopilot 路徑 defense-in-depth——最先 land）。行數小但正確性預算全花在第 3 節三細節：pin HEAD SHA、pending/無 check ≠ green、移除 `|| true`。acceptance criteria 必含「pending 不算綠」。
1. **PR 1：verifier 內迴圈 + 最小 halt/flag primitive**（價值最高——唯一改變 loop 收斂性質的改動）：config `verify` key + fix 後 gate（verify 在 commit 前）+ log 截斷回餵 + inner max 3 + **anti-gaming guard** + halt payload 落檔 + flag 進 report 醒目區（最小形式，完整 taxonomy 留 PR 3）+ 每 size work 上界明文。
2. **PR 2：S/M/L 判定 + profile gate**：greenlight pre-flight 加 cascade 判定（真實 diff 計算，plan size 只當 advisory 取 max）、各 phase 加 size 條件（reviewer 選擇走 registry 語彙）、autopilot 傳 `size:`、pr-subagent-template 帶 token。不確定一律 default M；自動判 S → flag。
3. **PR 3：escalation 完整 taxonomy（reason_class + attended 投影 + 收攏 orchestrator blocked 規則 + findings 矛盾處置表）+ spec 品質 gate（含 `type: docs` 交叉否決）**。

## 開放問題

（無。最後一條——flag 觸發清單含 findings 矛盾處置——2026-07-16 與 Hana 逐條確認完畢，拍板內容見第 4 節矛盾處置表。全部決策齊備，可動工。）

（先前已收掉：post-commit verify 時序——verify 跑在 commit 前即無壞 commit 問題，見第 2 節時序注意。M external max 5——與 post-commit 現狀一致，刻意寫死。S external max rounds——3，對衝 codex 對 docs PR 挑 style nit 燒輪數的風險。「受影響 tests」怎麼定義——單一 verify 命令後問題消失，第一版就是跑 config 寫死的那條命令。）

## 執行結果（2026-07-16 autopilot run，plan: docs/loops/2026-07-16_greenlight-sizing/）

4 PRs 全數 merge：

| 計畫編號 | GitHub PR | 內容 | Review 統計 |
|---|---|---|---|
| PR 0 | #124 | fix(merge-pr): CI gate pinned to head SHA（含移除 `\|\| true`、pending≠green、pr-subagent-template Step 6 stale-SHA 修正） | 3 輪、修 9、push back 1 |
| PR 1 | #123 | feat(greenlight): verifier 內迴圈 + anti-gaming guard + 最小 halt/flag primitive + config `verify` key | 2 輪、修 6、push back 4 |
| PR 2 | #125 | feat(greenlight): S/M/L cascade 判定 + per-size profile gate + plan.yaml `size` 欄位 | 4 輪、修 8、push back 2 |
| PR 3 | #126 | feat(greenlight): escalation taxonomy（reason_class + attended 投影 + 矛盾處置表）+ autopilot spec 品質 gate | 4 輪、修 11、push back 0 |

過程註記：wave 1（PR 0/1）曾整批撞 session limit，實作自殘留 worktree／已推 branch 搶救（pr2 連 PR 都已開好），零重做；pr4 撞第二輪限額後重試成功。wave dispatch 踩到 wave-workflow args 字串化 runtime 坑，以 parse-guarded script 副本繞過——模板源頭修正已有獨立 backlog 待辦（commit dbd4653）。尚未 release：版本 bump 走 `/release`，不隨 merge 觸發。
