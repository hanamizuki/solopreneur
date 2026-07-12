# Gemini consumer 產品線落日：清理 greenlight / naming 的失效依賴

目標：Google consumer 版 Gemini Code Assist（GitHub bot）2026-07-17 停止 code review，consumer 版 Gemini CLI 登入 2026-06-18 已停，greenlight 硬編的 `gemini-3-pro-preview` 模型 2026-03-09 已 shutdown。移除或修正 marketplace 中所有因此失效的 Gemini 路徑，並讓舊 config / 舊參數安全降級。

⏰ 死線：2026-07-17（bot 硬停日）。CLI 與模型**現在就已失效**。

## 已驗證事實（2026-07-12，全部有一手證據）

- **Bot sunset 僅限 consumer 版**：6/18 deprecated（擋新安裝）、7/17 shutdown（review 全停）。**Enterprise 版不受影響**，且與 consumer 共用同一個 `gemini-code-assist[bot]` 帳號和 `/gemini review` 指令。來源：https://developers.google.com/gemini-code-assist/docs/deprecations/consumer-code-review
- **7/17 前 bot 仍間歇運作**：本 repo PR #108 於 2026-07-12T10:16:51Z 有 gemini formal review（0 inline comments）。同日一次 `/gemini review` 重觸發無回應——單次失敗不等於服務已停，硬停日是 7/17。
- **Gemini CLI consumer 登入已死**：本機（gemini CLI 0.42.0）實測 `gemini -m gemini-3-pro-preview -p ...` 回 `IneligibleTierError: UNSUPPORTED_CLIENT (free-tier)`，官方遷移路徑是 Antigravity。Standard/Enterprise 訂閱不受影響。來源：https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals
- **`gemini-3-pro-preview` 模型已於 2026-03-09 shutdown**（後繼 `gemini-3.1-pro-preview`）——即使有合法 auth，greenlight 與 naming 硬編的這個模型也打不到。來源：https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-preview

## 受影響盤點

| 位置 | 內容 | 狀態 |
|---|---|---|
| `plugins/solopreneur/skills/greenlight/SKILL.md` PR mode | reviewer 表、`external gemini` 參數、wizard 選項與 config 寫入範例、fallback、Gemini polling cadence、`GEMINI_BOT`、frontmatter ×2 | 7/17 起死（consumer） |
| 同檔 post-commit mode Phase 3 | `gemini -m gemini-3-pro-preview` 並行 reviewer | **已死**（auth + 模型雙重失效；有 graceful degradation 所以目前是每輪靜默空跑） |
| `plugins/marketer/skills/naming/SKILL.md:478` | 同模型產名 | **已死**（有 `models_available` gate 會 degrade，但 gemini 分支永遠失敗） |
| `plugins/solopreneur/shared/config.md` | 範例 config ×3、helper 註解 ×1 | 文件過期 |
| 6 份 inline copy（merge-pr / todos-babysit / todos-cleanup / worktree-handoff / preview 的 SKILL.md + todos-babysit Phase 3 描述） | `fallback_order:["codex-bot","gemini"]` 註解 | 文件過期 |
| `README.md:81,98,246,285` | 4 處 greenlight-facing 提及 | 文件過期 |

**Inline copy 的更新方式**（勘誤：不是 `sync-vendored.sh`——那支只做 third-party vendoring、要 `vendor/manifest.json`）：照 `shared/config.md` 的既有指引，`grep -rl "# --- solopreneur config helpers" plugins/solopreneur/skills/` 找出 marker 副本後手動同步、逐一 diff 驗證。

**不受影響**：`ai-app-templates` 的 Gemini **API** provider（API key 路徑，非 Code Assist auth）；`impeccable` 的 gemini provider tag（設計 antipattern 分類用）；歷史文件（`docs/loops/`、`docs/solopreneur/plans/` 的舊範例為不可變歷史，intentionally unchanged）。

## 決策點（實作前 Hana 拍板）

1. **Enterprise Gemini bot 保留與否**：建議**整個移除**——solopreneur 受眾是個人開發者（consumer tier），保留等於維護一條自己無法測試的 enterprise-only 路徑。移除要在 README / CHANGELOG 明寫是產品取捨（enterprise 版服務仍存在），不是「Gemini 全死了」。
2. **post-commit mode 第二 reviewer**：建議先收斂成 **Codex CLI only**（最小改動）。Antigravity CLI（官方 consumer 遷移路徑）或 `gemini-3.1-pro-preview`（需付費訂閱）要不要接回來，另開 todo 評估——headless 行為與輸出格式都未驗證，不在死線內硬塞。

## 相容處理（必做）

- **舊 config 含 `"gemini"`**：read-time 過濾 retired/unknown reviewer 值（不得硬壞）；過濾後 `fallback_order` 為空 → 走無 config 流程；首次過濾時提示一句。
- **舊參數 `/greenlight external gemini`**：明確錯誤訊息（consumer 版已於 2026-07-17 停止服務）+ 列出目前可用 reviewer，不得靜默 fallback。
- **無人值守 caller**（todos-babysit auto mode、autopilot）：reviewer 耗盡時不得進互動 wizard——fail fast + 寫進 run log。

## Tasks

- [ ] greenlight SKILL.md：移除 PR mode 的 Gemini bot 全部表面（表、參數、wizard、fallback、polling、bot 定義、frontmatter）
- [ ] greenlight SKILL.md：post-commit mode Phase 3 移除 Gemini CLI 分支（含「兩 CLI 並行」措辭改單 CLI）
- [ ] greenlight SKILL.md：三項相容處理（config 過濾、舊參數錯誤訊息、無人值守 fail fast）
- [ ] naming SKILL.md：gemini 分支處理（移除或至少修掉死模型；跟 marketer plugin 的 bump 一起走）
- [ ] `shared/config.md`：範例與註解更新 → marker grep 手動同步 6 份 inline copy，逐一 diff
- [ ] README.md：4 處更新，含 enterprise 取捨說明
- [ ] 驗收：舊 config 含 gemini／只含 gemini、`external gemini` 參數、todos-babysit auto 呼叫路徑，各走一次確認降級行為

Operator note（repo 外、非 PR 驗收項）：builder 機 `~/Agents/claude/builder/solopreneur.json` 的 `fallback_order` 清掉 `"gemini"`。

## 相關

- 後續 feature：[[2026-07-12_greenlight-reviewer-detection]]（reviewer 活動偵測，依賴本項先落地）
