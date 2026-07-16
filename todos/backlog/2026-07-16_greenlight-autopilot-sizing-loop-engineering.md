# Greenlight / Autopilot 分級（S/M/L）與 loop engineering

Status: backlog
目標：autopilot / greenlight 流程太重，對 typo PR 和核心邏輯 PR 跑同一套。引入以風險為軸的 S/M/L 分級，並用 loop engineering 五要素（目標 / Verifier / Feedback / Stopping / Escalation）補上流程的結構性缺口。

## 已查證的現狀事實（2026-07-16，免重新考古）

- **greenlight 完全沒有客觀驗證**：SKILL.md 1430 行內無任何 test/lint/typecheck 步驟；fix subagent 指令只有 fix → commit → push；CI 結果 greenlight 從頭到尾不看。
- **merge-pr 也不看 CI**：無 `gh pr checks`。
- **autopilot 路徑前後有、中間裸奔**：pr-subagent-template Step 3 在 implement 後跑 spec test（自修 ×3），Step 6 在 greenlight 後 poll CI（60s × 10、fail 只修一次且不再過 review）。中間 greenlight N 輪 fix 每輪直接 push、零驗證。
- **獨立跑 `/greenlight` 時前後兩道都不存在**（除非 repo 有 branch protection required checks）。
- 真正貴的三塊：Phase 1 的 5 個 internal reviewer subagent（各吃完整 diff）、verification gate（每 finding 3 skeptics）、Phase 3 external loop（每輪 poll 最多 20 分鐘、max 10 rounds）。
- 現有的手動降級先例：greenlight `external` argument、autopilot single-PR fast path。escalation 規則已散落五六條（fix >20 行要討論、suggestions 矛盾要問、reviewer 全掛、max rounds、invariant abort），缺統一框架。

## 已拍板決策

### 1. S/M/L 三級（不是五級），軸是風險不是難度

一行 auth 改動比 300 行 docs 重寫更需要重審——判定訊號以 path 為主、diff 大小為輔。

**判定用 cascade 規則表**（機械、bash 可算，不用 AI 主觀評估）：

```
1. L 判定（any-match，命中任一即 L）：
   - path 碰到：migrations/、auth·payment·crypto 相關、.github/workflows/、
     Dockerfile/infra、dependency manifest 實質變更
   - diff > ~400 行（排除 lockfile / generated）
   - 跨多個 module/plugin 邊界
2. S 判定（all-match，全部成立才 S）：
   - 所有檔案 ∈ 白名單：docs/**、todos/**、README.md、LICENSE、.gitignore
   - 白名單必須位置限定，**不可用全域 `*.md` glob**——skill 型 repo（如
     solopreneur 自己）的核心邏輯就是 markdown，改 SKILL.md 必須留在 M
3. 其餘 → M
```

不對稱是刻意的：L 是 OR（任一危險訊號就升）、S 是 AND（全部無害才降）——含糊時升級不降級。**config 檔不進 S**（config 錯誤是靜默的 runtime 行為改變，留在 M）。

Override：`/greenlight size=l` token；autopilot 在 plan.yaml 加 `size:` 欄位往下傳（pr-subagent-template 呼叫 greenlight 時帶 token）。greenlight 獨立被呼叫時才自己跑 heuristic。unattended 模式不問人直接用。

**Profile 表**：

| Dial | S (light) | M (standard, 預設) | L (deep) |
|---|---|---|---|
| Phase 1 internal | 跳過 | 挑 2 個（如 specialist + ponytail） | 全 5 個 |
| Verification gate | 跳過 | 跳過 | 開（Workflow 可用時） |
| External loop | **codex only，但照樣 loop 到 clean** | 標準循環 max 5 | 全套 max 10 |
| Verifier（客觀） | lint/build | + unit tests | + E2E / security |
| autopilot tech-vetting | 跳過 | 跑 | 跑 |
| autopilot spec | 極簡 | 標準 | 標準 |

（S 也要 loop 直到 clean——Hana 拍板，不是跑一次就收。Uncommitted mode 不分級——本地互動流程，維持現狀，明確豁免。）

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

Verify 命令來源：solopreneur.json 加 `verify` feature key（`read_solopreneur_config verify` 機制現成），per-size 命令集。沒設定就 skip 並在 final report 誠實標註「本 loop 無客觀 verifier」。

時序注意：verify 一律跑在 **commit 前**（test/lint/typecheck 都是 working-tree
操作，不需要 committed state）——post-commit mode 也一樣，所以不存在「壞 commit
+ 修復 commit」序列問題。Uncommitted mode 不適用本節（本地互動流程，不 commit
不 push，明確豁免）。

### 3. 與 CI 三層分工（不打架）

| 層 | 時機 | 職責 |
|---|---|---|
| 本地 verify | 每輪 fix 後、push 前 | fast-fail，壞的 fix 不出門（新增） |
| CI | push 後背景跑 | 權威 gate、完整環境（現有） |
| merge gate | 合併前 | 確認 CI 綠才 merge（autopilot Step 6 有；**merge-pr 要補 `gh pr checks`**） |

有 CI 的 repo 本地跑快子集（lint + typecheck + 受影響 tests）、full suite 交給 CI；沒 CI 的 repo 本地 verify 是唯一客觀 gate。greenlight 不等 CI（CI 是 merge 的事，不是 review 的事）。

### 4. Escalation：兩問判準 + 三級機制

判準兩問：
1. **還能繼續嗎？** 機械 blocked（工具全掛、環境壞、輪數用完）→ halt，沒得商量。
2. **該由我決定嗎？** 三個檢查：**可逆性**（錯了能便宜撤銷嗎）、**範圍**（在 spec / size 授權內嗎）、**可裁決性**（有 test/spec 能機械判對錯嗎）。

一句話：錯了很貴、或對錯無法機械裁決的決定 → 回報人類；其餘自主做、留痕跡。

三級機制（unattended 模式的關鍵是 flag 中間層——沒有它，unattended 只能在「動不動全停」和「全自主無人知曉」二選一）：

| 級 | 行為 | 例子 |
|---|---|---|
| **halt** | 停下、打包 payload、回報（unattended = exit non-zero） | **external** reviewer 全掛（Phase 1 internal 全掛照現狀 skip → 繼續 Phase 3，不 halt——別退步）、invariant 壞、fix 要碰授權外危險 path（S/M loop 中途發現要動 auth = size 前提變了） |
| **flag** | 繼續跑，決定記入 report 醒目區，人類事後裁決 | push back P1、fix >20 行、無 verifier 配置下跑完的 loop |
| **note** | 正常統計 | fixed / pushed-back 計數 |

**halt payload**：最後一輪 findings + verify 失敗 log + 已嘗試 fix 摘要 + push-back 理由 + 建議下一步，落成檔案（`docs/loops/` 該 run 目錄；獨立跑 `/greenlight` 沒有 run 目錄——fallback 自建 `docs/loops/<date>_greenlight-<branch>/`），report 引用路徑。

### 5. autopilot spec 品質 gate

acceptance criteria 每條必須是可執行命令或可驗證斷言，「功能正常運作」這種寫不出 verifier 的句子打回——autopilot Step 3 是把模糊目標編譯成 loop contract 的地方。`type: docs` 的 PR 豁免（docs 的 criteria 本來就寫不成可執行命令，允許 checklist 斷言由 reviewer 判）。

### 6. 文件結構

greenlight 每個 mode 開頭放一張五要素 contract 表（S/M/L 只是填不同值）。填不出 Verifier 欄的 loop = 還沒設計完。

## 實作切法（4 PRs，依價值排序）

0. **PR 0：merge-pr 補 `gh pr checks`**（~10 行、零依賴、堵現在就存在的「CI 紅照樣 merge」真洞——最先 land）。
1. **PR 1：verifier 內迴圈**（價值最高——唯一改變 loop 收斂性質的改動，也是 escalation payload 的前置）：config `verify` key + fix 後 gate（verify 在 commit 前）+ verify log 回餵 + inner max 3。
2. **PR 2：S/M/L 判定 + profile gate**：greenlight pre-flight 加 cascade 判定、各 phase 加 size 條件、autopilot 傳 `size:`、pr-subagent-template 帶 token。
3. **PR 3：escalation 三級 + halt payload + spec 品質 gate**。

## 開放問題（動工前要跟 Hana 確認）

- **flag 觸發清單**要再斟酌（Hana 尚未確認上表的 flag 例子；特別是「findings 矛盾且無 test 可裁決」在 unattended 下 halt 還是挑保守方 + flag）。
- **M 檔 external max 5 = 把現狀 PR mode 的 max 10 砍半**——實務很少跑滿、應該沒差，但這是預設檔的行為改變，確認是刻意再寫死。
- S 級 external loop 的 max rounds 給多少（傾向 5，反正 docs 改動很快收斂）。
- verify 快子集怎麼定義「受影響的 tests」（第一版可以就是跑 config 寫死的命令，不做影響分析）。

（已收掉：post-commit verify 時序——verify 跑在 commit 前即無壞 commit 問題，見第 2 節時序注意。）
