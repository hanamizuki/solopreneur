# Gemini consumer 產品線落日：greenlight / naming 清理與 Antigravity 遷移

目標：Google consumer 版 Gemini Code Assist（GitHub bot）2026-07-17 停止 code review，consumer 版 Gemini CLI 登入 2026-06-18 已停，硬編的 `gemini-3-pro-preview` 模型 2026-03-09 已 shutdown。停止對 Gemini bot 的硬編推薦（存廢交給活動偵測，見 [[2026-07-12_greenlight-reviewer-detection]]），把已死的 Gemini CLI 路徑換成 Antigravity CLI（`agy`）。

⏰ 死線：2026-07-17（consumer bot 硬停日）。CLI 與模型**現在就已失效**。

## 已拍板決策（2026-07-12）

1. **Gemini bot 不整包移除，走 detection-driven**：enterprise 版不受 sunset 影響且共用同一個 bot 帳號與 `/gemini review` 指令——bot 的 trigger / polling / login 定義保留在 reviewer registry，**要不要呈現給 user 由活動偵測決定**（偵測 feature 見關聯 todo）。本 todo 只負責：停止無條件推薦（wizard 寫入範例、README 安裝指引）、舊 config / 舊參數的降級體驗。
2. **Gemini CLI → Antigravity CLI（`agy`）**：官方 consumer 遷移路徑，本機已驗證可用（見下方）。greenlight post-commit mode 與 naming 的 gemini CLI 分支換成 agy。

## 已驗證事實（2026-07-12，全部有一手證據）

- **Bot sunset 僅限 consumer 版**：6/18 deprecated（擋新安裝）、7/17 shutdown（review 全停）。**Enterprise 版不受影響**，同一個 `gemini-code-assist[bot]`、同 `/gemini review`。來源：https://developers.google.com/gemini-code-assist/docs/deprecations/consumer-code-review
- **7/17 前 bot 仍間歇運作**：本 repo PR #108 於 2026-07-12T10:16:51Z 有 gemini formal review（0 inline comments）。同日一次 `/gemini review` 重觸發無回應——單次失敗≠服務已停。
- **Gemini CLI consumer 登入已死**：本機（gemini CLI 0.42.0）實測回 `IneligibleTierError: UNSUPPORTED_CLIENT (free-tier)`。來源：https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals
- **`gemini-3-pro-preview` 模型 2026-03-09 已 shutdown**（後繼 `gemini-3.1-pro-preview`）——即使付費 auth 也打不到。來源：https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-preview

## Antigravity CLI（`agy`）已驗證用法（2026-07-12，agy 1.1.1 @ macOS）

```bash
# headless 單發，stdout 直接可 capture（實測 exit=0、輸出正常）
agy --dangerously-skip-permissions --print "<prompt>"

# 指定模型：--model 吃 `agy models` 印出的 display name 原字串
agy --model "Gemini 3.1 Pro (High)" --print "<prompt>"
```

- 可用模型（`agy models`）：Gemini 3.5 Flash（Low/Medium/High）、Gemini 3.1 Pro（Low/High）、Claude Sonnet 4.6、Claude Opus 4.6、GPT-OSS 120B。
- **greenlight reviewer 用途釘 `"Gemini 3.1 Pro (High)"`**：主迴圈是 Claude、Codex 是 GPT 系，第二 CLI reviewer 用 Gemini 系才有模型家族多樣性；不要選 agy 上的 Claude 模型（跟 fixer 同家族，失去第二意見價值）。
- **print mode 不讀 stdin**（實測：piped 內容收不到）→ 內容一律嵌進 prompt 參數（greenlight 現有的 `$(cat <<EOF ...)` 模式可沿用；naming 的 `agy < brief.md` 餵法必須改）。
- **non-TTY 已知風險**：社群回報 `--print` 在 non-TTY 下可能靜默掉 stdout（exit 0 但無輸出），版本相依；本機 1.1.1 重導檔案未重現，但 skill 要照防：驗證「輸出非空 + 含預期 marker」，失敗視同 CLI 失敗走 degradation。`--output-format json` 不存在，解析純文字。參考：https://antigravitylab.net/en/articles/integrations/antigravity-cli-agy-headless-non-tty-stdout-ci
- `--print-timeout` 預設 5m，大 diff review 可調。
- Auth：Google 帳號登入（consumer 可用，即官方遷移路徑）；headless 未登入時會印 authorization URL + one-time code，skill 的 availability gate 要能辨識這種失敗。
- SKILL.md 寫法用裸 `agy`（使用者自己的安裝與 auth），availability gate 仿現有 Codex CLI gate（installed + authenticated 檢查）。house 內部的 per-config `HOME=~/Agents/gemini/<config>` 隔離是 Hana 環境慣例，不進公開 skill。

## 受影響盤點

| 位置 | 內容 | 動作 |
|---|---|---|
| `plugins/solopreneur/skills/greenlight/SKILL.md` PR mode | wizard config 寫入範例、README 式推薦、`external gemini` 參數說明 | 停止硬編推薦；bot 定義保留給 registry/偵測 |
| 同檔 post-commit mode Phase 3 | `gemini -m gemini-3-pro-preview`（已死，靜默空跑中） | 換 `agy --model "Gemini 3.1 Pro (High)"` + marker 驗證 |
| `plugins/marketer/skills/naming/SKILL.md:478` | 同死模型 + stdin 餵法 | 換 agy + prompt 參數嵌入；availability gate（:397）同步改 agy 檢查 |
| `plugins/solopreneur/shared/config.md` | 範例 config ×3、helper 註解 ×1 | 範例改 codex 系；gemini 僅在說明偵測時提及 |
| 6 份 inline copy（merge-pr / todos-babysit / todos-cleanup / worktree-handoff / preview + todos-babysit Phase 3 描述） | 同上範例註解 | **marker grep 手動同步**（`grep -rl "# --- solopreneur config helpers" plugins/solopreneur/skills/`），逐一 diff；不是 `sync-vendored.sh`（那支只做 third-party vendoring） |
| `README.md:81,98,246,285` | 4 處 greenlight-facing 提及 | 更新：consumer sunset 說明、enterprise 仍可用（偵測決定）、CLI 改 agy |

**不受影響**：`ai-app-templates` 的 Gemini **API** provider（API key 路徑）；`impeccable` 的 gemini provider tag；歷史文件（`docs/loops/`、`docs/solopreneur/plans/` 舊範例為不可變歷史，intentionally unchanged）。

## 相容處理（必做）

- **舊 config 含 `"gemini"`**：不做 retired 清單（bot 對 enterprise 仍有效）。fallback 到 gemini 而 bot 無回應時，timeout 訊息附一句 consumer sunset 提示（2026-07-17）再切下一個 reviewer；偵測 feature 落地後由觸發前提示接手。
- **`/greenlight external gemini`**：參數保留（enterprise 用戶合法），但觸發失敗訊息同上帶 sunset 提示。
- **無人值守 caller**（todos-babysit auto mode、autopilot）：reviewer 耗盡時不得進互動 wizard——fail fast + 寫進 run log。

## Tasks

- [ ] greenlight SKILL.md：wizard 寫入範例與推薦文字去掉硬編 gemini；`external gemini` 失敗訊息帶 consumer sunset 提示
- [ ] greenlight SKILL.md：post-commit mode Phase 3 gemini CLI → agy（模型釘 Gemini 3.1 Pro (High)、marker 驗證、availability gate 仿 Codex CLI gate）
- [ ] greenlight SKILL.md：無人值守 fail fast（不進互動 wizard）
- [ ] naming SKILL.md：gemini CLI → agy（stdin 餵法改 prompt 參數；`models_available` gate 改 agy 檢查；跟 marketer plugin 的 bump 一起走）
- [ ] `shared/config.md`：範例與註解更新 → marker grep 手動同步 6 份 inline copy，逐一 diff
- [ ] README.md：4 處更新（consumer sunset、enterprise + 偵測、agy）
- [ ] 驗收：舊 config 含 gemini 的 timeout 降級訊息、`external gemini` 失敗訊息、post-commit agy 路徑跑通（真 diff 一輪）、agy 未安裝/未登入時 gate 正確跳過、todos-babysit auto 呼叫不卡互動

Operator note（repo 外、非 PR 驗收項）：builder 機 `~/Agents/claude/builder/solopreneur.json` 的 `fallback_order` 清掉 `"gemini"`（Hana 是 consumer tier，7/17 後必死；或留著等偵測提示也行，僅浪費一次 timeout）。

## 相關

- 後續 feature：[[2026-07-12_greenlight-reviewer-detection]]（活動偵測；gemini bot 的存廢呈現由它接手）
