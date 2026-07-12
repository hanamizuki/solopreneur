# greenlight reviewer 體系整修：registry ＋ 活動偵測 ＋ Gemini sunset 清理 ＋ agy 遷移

目標：一次整修 greenlight 的 reviewer 選擇機制。兩個動機同時發生：(1) Google consumer 版 Gemini Code Assist 2026-07-17 停止 GitHub code review、consumer Gemini CLI 已死；(2) 既有痛點——reviewer 選項硬編，但每個 user / repo 裝的 bot 不一樣。解法一體：reviewer registry ＋ pre-flight 活動偵測（gemini bot 的呈現交給偵測，不做靜態存廢決策），死掉的 Gemini CLI 路徑換 Antigravity CLI（`agy`）。

單一 todo 的理由：wizard / fallback / reviewer 表在 SKILL.md 同幾個區塊，拆「sunset 急救」與「偵測 feature」會先寫一版過渡訊息再被偵測改寫；且 7/17 沒有硬壞點（bot 無回應有現成 timeout-fallback 兜底、CLI 早已死且被 degradation 蓋住），撐不起分段成本。實作時可拆 PR（見 Tasks 分組）。

## 已拍板決策（2026-07-12）

1. **Gemini bot 不移除，走 detection-driven**：enterprise 版不受 sunset 影響、共用同一個 `gemini-code-assist[bot]` 與 `/gemini review`。registry 保留 gemini 完整定義（trigger / polling / login），**要不要呈現由活動偵測決定**——repo 近期有該 bot 活動就列（7/17 後多半是 enterprise，能用），沒有就不出現。wizard / README 停止無條件推薦。
2. **Gemini CLI → Antigravity CLI（`agy`）**：官方 consumer 遷移路徑，本機已驗證（見下）。greenlight post-commit mode 與 `/naming` 的 gemini CLI 分支換 agy。

## 已驗證事實（2026-07-12，全部一手證據）

**Sunset 範圍：**
- Consumer 版 GitHub bot：6/18 deprecated（擋新安裝）、7/17 shutdown。**Enterprise 版不受影響**。來源：https://developers.google.com/gemini-code-assist/docs/deprecations/consumer-code-review
- 7/17 前 bot 仍間歇運作：本 repo PR #108 於 2026-07-12T10:16:51Z 有 gemini formal review（0 inline comments）；同日一次重觸發無回應——單次失敗≠服務已停。
- Gemini CLI consumer 登入已死：本機（gemini CLI 0.42.0）實測回 `IneligibleTierError: UNSUPPORTED_CLIENT (free-tier)`。來源：https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals
- `gemini-3-pro-preview` 模型 2026-03-09 已 shutdown（後繼 3.1）——即使付費 auth 也打不到。greenlight post-commit 與 naming 硬編此模型＝目前每輪靜默空跑。

**偵測可行性：**
- 安裝清單 API 走不通：`gh api /user/installations` 對 gh OAuth token 回 403（要 GitHub App user token）；org 版另需 admin。
- 活動偵測可行，但**單靠 comment endpoints 不夠**：bot 痕跡分三處——issue comments、inline review comments（皆可 repo 級一次撈，實測一 call 抓到三個 bot + last_seen）、**formal reviews（per-PR）**。實證：PR #108 的 gemini review 只以 formal review 存在（0 comments），前兩個 endpoint 看不到。完整偵測要含「最近 N 個 PR」的 reviews 掃描；GraphQL 可批次抓但 bot login 不含 `[bot]` 後綴，比對前要正規化。

**agy 用法（agy 1.1.1 @ macOS，本機實測）：**

```bash
# headless 單發，stdout 可 capture（實測 exit=0、輸出正常）
agy --dangerously-skip-permissions --print "<prompt>"
# 指定模型：--model 吃 `agy models` 印出的 display name 原字串
agy --model "Gemini 3.1 Pro (High)" --print "<prompt>"
```

- 模型單：Gemini 3.5 Flash（Low/Medium/High）、Gemini 3.1 Pro（Low/High）、Claude Sonnet/Opus 4.6、GPT-OSS 120B。**reviewer 用途釘 `"Gemini 3.1 Pro (High)"`**——主迴圈 Claude、Codex 是 GPT 系，選 Gemini 系才有模型家族多樣性。
- **print mode 不讀 stdin**（實測）→ 內容嵌 prompt 參數（greenlight 的 `$(cat <<EOF ...)` 模式可沿用；naming 的 `< brief.md` 要改）。
- **non-TTY 風險**：社群回報 `--print` 在 non-TTY 可能靜默掉 stdout（exit 0 但空白），版本相依；本機未重現，但 skill 照防——驗證「輸出非空＋含預期 marker」，失敗視同 CLI 失敗。`--output-format json` 不存在，解析純文字。參考：https://antigravitylab.net/en/articles/integrations/antigravity-cli-agy-headless-non-tty-stdout-ci
- `--print-timeout` 預設 5m，大 diff 可調。Auth 走 Google 登入（consumer 可用）；headless 未登入會印 authorization URL——availability gate 要辨識。
- SKILL.md 寫裸 `agy` + 仿 Codex CLI 的 availability gate；`HOME=~/Agents/gemini/<config>` 隔離是 Hana 家內慣例，不進公開 skill。

## 設計需求

**1. Reviewer registry（先做，偵測疊上去）**
現況三種 identifier 無 mapping：config `"codex-bot"`、runtime 參數 `"codex bot"`、API `chatgpt-codex-connector[bot]`；`REVIEWER_BOTS` 陣列定義後全文無引用。Registry 每個 reviewer 定義：`config_id`（canonical）、aliases、bot login、類型（`active-bot` / `passive-bot` / `local-cli`）、trigger、handshake、poll policy、wizard 可列性。增刪 reviewer 只動 registry。

**2. 三類 reviewer 呈現分開**
- `active-bot`（Codex bot、Gemini bot）：偵測得到、可觸發 → wizard 主選項（gemini 僅在偵測到時出現）
- `passive-bot`（CodeRabbit）：偵測得到、不可觸發 → 只標示存在
- `local-cli`（Codex CLI、agy）：GitHub 活動偵測不到、可用性由 CLI gate 判定 → 與偵測結果並列，不因無 GitHub 痕跡而隱藏

**3. 活動 ≠ liveness（兩層分工）**
活動只證明「曾運作」——低流量 repo 歷史紀錄永遠看起來新鮮；當下可用性只有 trigger handshake（Codex 👀）與觸發後 timeout 能證明。分工：**偵測列選項，handshake/timeout 驗活**。具體反例（sunset 過渡期）：consumer repo 7/17 前的 gemini 活動留在樣本裡，偵測會列、觸發卻死——由 timeout-fallback 兜底（訊息帶 consumer sunset 提示），樣本隨新活動老化自然收斂。第一版不做 stale 判斷，只顯示 `last_seen_in_sample`。

**4. 樣本窗與降級**
- 明定樣本範圍並如實標示（例：兩個 comment endpoints 各最近 100 則＋最近 N 個 PR 的 reviews；本 repo 實測 comments 已 3～5 頁，`per_page=100` 不是「全部近期」）
- 偵測 API 失敗 / rate limit → 跳過偵測走現行流程（偵測是 enhancement 不是 gate）
- 零歷史 repo → 退回現行問法

**5. 接入點與 config**
- 偵測不改預設起始邏輯，只過濾 wizard 選項＋config 觸發前提示不一致
- 偏好仍寫全域 `default.greenlight`；不新增 repo override 層（成本大於收益）
- 舊 config 含 `"gemini"`：不做 retired 清單（enterprise 仍有效）——觸發無回應時 timeout 訊息帶 sunset 提示再切下一個
- `/greenlight external gemini` 參數保留（enterprise 合法），失敗訊息同上
- 無人值守 caller（todos-babysit auto、autopilot）：偵測結果只進 log；reviewer 耗盡 fail fast，不進互動 wizard

## 受影響盤點

| 位置 | 動作 |
|---|---|
| `plugins/solopreneur/skills/greenlight/SKILL.md` | registry 化＋偵測步＋wizard 三類呈現＋相容訊息；post-commit Phase 3 gemini CLI → agy（釘 Gemini 3.1 Pro (High)、marker 驗證、availability gate） |
| `plugins/marketer/skills/naming/SKILL.md:478` | gemini CLI → agy（stdin 改 prompt 參數；`models_available` gate（:397）改 agy 檢查） |
| `plugins/solopreneur/shared/config.md` | 範例 ×3＋註解 ×1 改 codex 系 → **marker grep 手動同步 6 份 inline copy**（`grep -rl "# --- solopreneur config helpers" plugins/solopreneur/skills/`），逐一 diff；不是 `sync-vendored.sh`（那支只做 third-party vendoring） |
| `README.md:81,98,246,285` | consumer sunset 說明、enterprise＋偵測、CLI 改 agy |

**不受影響**：`ai-app-templates` 的 Gemini **API** provider（API key 路徑）；`impeccable` 的 gemini provider tag；歷史文件（`docs/loops/`、`docs/solopreneur/plans/`）intentionally unchanged。

## Tasks（可拆 PR 的分組）

**PR A — greenlight 整修（solopreneur plugin）：**
- [ ] reviewer registry 資料模型＋現有 reviewer 填入（含 gemini 完整定義）
- [ ] pre-flight 活動偵測步（三來源、樣本窗標示、降級路徑）
- [ ] wizard 三類分開呈現＋config 不一致提示＋停止硬編推薦 gemini
- [ ] 相容：gemini timeout 訊息帶 sunset 提示；`external gemini` 失敗訊息；無人值守 fail fast
- [ ] post-commit mode Phase 3：gemini CLI → agy（模型釘死、marker 驗證、gate）
- [ ] `shared/config.md` 更新 → marker grep 手動同步 6 份 copy
- [ ] README 4 處

**PR B — naming 遷移（marketer plugin，獨立 bump）：**
- [ ] gemini CLI → agy（餵法改 prompt 參數、gate 改 agy 檢查）

**驗收（PR A）：**
- [ ] 零歷史 repo、只有 passive bot、formal-review-only bot（用 PR #108 型態）、偵測 API 失敗 → 各走一次
- [ ] 舊 config 含 gemini 的 timeout 降級訊息、`external gemini` 失敗訊息
- [ ] post-commit agy 路徑真 diff 跑一輪；agy 未裝/未登入時 gate 正確跳過
- [ ] todos-babysit auto 呼叫不卡互動

## YAGNI（需求出現再開）

- Copilot code review 等新 bot——registry 單點擴充已預留
- GraphQL 批次抓取優化——REST 樣本窗證明不夠再說
- 偵測結果自動寫回 config

Operator note（repo 外）：builder 機 `~/Agents/claude/builder/solopreneur.json` 的 `fallback_order` 清掉 `"gemini"`（Hana 是 consumer tier；留著也只是多浪費一次 timeout）。
