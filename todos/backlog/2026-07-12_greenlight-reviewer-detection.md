# greenlight：pre-flight reviewer 活動偵測

目標：greenlight 的 reviewer 選擇從「硬編選項盲問 user」改成「先偵測 repo 實際運作的 review bot 再呈現」，解決每個 user / repo 裝的 bot 不一樣的問題。

**這也是 Gemini bot 存廢問題的正解（2026-07-12 拍板）**：consumer 版 7/17 落日但 enterprise 版繼續活、共用同一個 bot 帳號——與其做「支不支援 enterprise」的靜態產品決策，不如讓偵測決定：repo 近期有 `gemini-code-assist[bot]` 活動就列為選項（多半是 enterprise，能用），沒有就不出現。registry 保留 gemini 完整定義（trigger / polling / login）。

前置：**依賴 [[2026-07-12_gemini-sunset-cleanup]] 先落地**——偵測與 registry 重構要疊在清乾淨的 reviewer 集合上。

## 已驗證事實（2026-07-12）

- **安裝清單 API 走不通**：`gh api /user/installations` 對 gh CLI 的 OAuth token 回 403（該 endpoint 要 GitHub App user token）；org repo 的 `/orgs/{org}/installations` 另需 admin。對「只有 gh 登入」的 plugin 使用者不可用。
- **活動偵測可行，但單靠 comment endpoints 不夠**：GitHub 把 bot 痕跡分三處——issue comments（`/issues/comments`）、inline review comments（`/pulls/comments`）、**formal reviews（`/pulls/{n}/reviews`，per-PR）**。實證：PR #108 的 gemini review 只以 formal review 存在（0 comments），只掃前兩個 endpoint 完全看不到。Codex bot 亦可能只留 👀 reaction（greenlight SKILL.md 已載明）。
- 前兩個 endpoint 可 repo 級一次撈（實測一 call 抓到三個 bot + last_seen）；formal reviews 是 per-PR → 完整偵測要「最近 N 個 PR」掃描。GraphQL 可一次抓但 bot login **不含 `[bot]` 後綴**，比對前要正規化。

## 設計需求

**1. Reviewer registry 資料模型（先做，偵測其次）**
現況三種 identifier 無 mapping：config 寫 `"codex-bot"`、runtime 參數寫 `"codex bot"`、API 回 `chatgpt-codex-connector[bot]`；`REVIEWER_BOTS` 陣列定義後全文無引用。Registry 每個 reviewer 至少定義：`config_id`（canonical）、aliases（參數寫法）、bot login、類型（`active-bot` / `passive-bot` / `local-cli`）、trigger 指令、handshake 訊號、poll policy、wizard 是否可列。增刪 reviewer 只動 registry 一處。

**2. 三類 reviewer 呈現分開**
- `active-bot`（Codex bot）：偵測得到、可觸發 → wizard 主選項
- `passive-bot`（CodeRabbit）：偵測得到、**不可觸發**（push 自動跑）→ 只標示存在，不列為可選 trigger
- `local-cli`（Codex CLI）：GitHub 活動**偵測不到**、可用性由 CLI gate 判定 → 與活動偵測結果並列，不因無 GitHub 痕跡而隱藏

**3. 活動 ≠ liveness（兩層分工）**
活動只證明「曾運作」，不證明「現在可用」——低流量 repo 的歷史紀錄會永遠看起來新鮮；當下可用性只有 trigger handshake（如 Codex 👀）與觸發後 timeout 能證明。分工：**偵測負責列選項，handshake/timeout 負責驗活**——兩層都在才算完整。具體反例（sunset 過渡期）：consumer repo 在 7/17 前的 gemini 活動會留在樣本裡，偵測會列出 gemini、觸發卻失敗——此時由現有 timeout-fallback 兜底（訊息帶 sunset 提示，見 cleanup todo），樣本隨新活動老化自然收斂。第一版不做 stale 判斷，只顯示 `last_seen_in_sample`；要做 stale 必須先寫出可執行定義（門檻、比較基準、觸發行為）＋驗收案例。

**4. 樣本窗與降級**
- 明定樣本範圍並如實標示（例：兩個 comment endpoints 各最近 100 則 + 最近 N 個 PR 的 reviews；本 repo 實測 comments 已 3～5 頁，`per_page=100` 不是「全部近期」）
- 偵測 API 失敗 / rate limit → 跳過偵測、走現行流程（偵測永遠是 enhancement，不是 gate）
- 零歷史 repo（新 repo、沒跑過 review）→ 退回現行問法

**5. 接入點與 config 範圍**
- 明定偵測改變什麼：起始 reviewer 的預設？失敗後 wizard 的選項清單？還是只加提示？（建議：不改預設起始邏輯，只過濾 wizard 選項 + config 觸發前提示不一致）
- 偏好仍寫全域 `default.greenlight`（現行 wizard 行為），觸發前用 per-repo 偵測結果過濾＋提示；不新增 repo override 層（`write_solopreneur_repo_config` 存在，但多一層 config 的維護成本大於收益）
- 無人值守（todos-babysit / autopilot）：偵測結果只進 log，不進互動

## YAGNI（需求出現再開）

- Copilot code review 等新 bot 支援——registry 單點擴充已預留
- GraphQL 批次抓取優化——REST 版證明樣本窗不夠再說
- 把偵測結果自動寫回 config

## Tasks

- [ ] greenlight SKILL.md：定義 reviewer registry（資料模型 + 現有兩個 active reviewer 填入）
- [ ] greenlight SKILL.md：pre-flight 偵測步（三來源、樣本窗標示、降級路徑）
- [ ] greenlight SKILL.md：wizard 改為三類分開呈現 + config 不一致提示
- [ ] 驗收案例：零歷史 repo、只有 passive bot、formal-review-only bot（用 PR #108 型態）、偵測 API 失敗、無人值守呼叫
