# feat(greenlight): selectable gate and multi-reviewer collection

## Requirements

- 實作 `docs/solopreneur/plans/2026-07-30-greenlight-reviewer-flexibility.md` 的 **Task 8–10**（PR 2 範圍），前提是 PR 1 已 merge（本 PR 消費 `resolve` 的 `trigger` / `collect` / `gate` 契約並移除 PR-1 seam）。plan 與 spec（`todos/backlog/2026-07-30_greenlight-reviewer-flexibility.md`）衝突時以 spec 為準。
- 交付物：Reviewer selection 段（預設沉默、nothing-can-gate 才問：identify / retry / 加 agy / halt）、`select=` / `gate=` invocation token（**必須**擴充 `SKILL.md:823` 既有 token-dropping 行，不加第二輪解析）、gate persist（五層 merge 後把 gate 置頂、整棵寫回 repo 層——不可截斷 `fallback_order`）、Fallback Logic 改為 gate 候補語意、一輪流程改寫（per-channel 游標、gate 恆被觸發、👀 確認梯、CLI gate 同步關窗）、**優先序判定的四個終端狀態**（findings > quota > timeout > clean，先分類再動手）、觀測回寫表（含 own-poll-budget 條件與 `triggerable: true` 平反列）、移除 PR-1 seam、autopilot 交接（schemas.md 兩個 optional 欄位、`{SELECT}` / `{GATE}` 變數、template 帶 `unattended`）。
- 硬性保留（plan Task 9 開頭明列，覆蓋掉即 regression）：👀 handshake 確認梯（`SKILL.md:1786-1799`）、👍-only clean（priority 2.5，`:1831-1844`）、quota 關鍵字表與「印前三行人工確認」警告（`:1846-1854`）——逐 login 參數化後保留。
- 約束：不動 post-commit / uncommitted mode；不碰 `plugin.json`；autopilot 端**不做**規劃期預解析（plan Task 10 有記錄理由）。

## Files to Read

- `docs/solopreneur/plans/2026-07-30-greenlight-reviewer-flexibility.md`（Task 8–10 全文，含要插入的 markdown 段落）
- `todos/backlog/2026-07-30_greenlight-reviewer-flexibility.md`（〈Reviewer 選擇與 gate〉〈一輪 loop 的流程〉〈識別〉〈錯誤處理與降級〉）
- `plugins/solopreneur/skills/greenlight/SKILL.md`（PR 1 合併後的現況：PR mode parsing `:806` 附近、Fallback Logic `:1613` 起、Feedback Detection `:1690` 起、poll 段 `:1786-1870` 附近——行號以 PR 1 合併後實際為準，先 grep 再改）
- `plugins/solopreneur/skills/autopilot/SKILL.md:314-322`（`{SIZE}` 變數先例）
- `plugins/solopreneur/skills/autopilot/references/schemas.md`（`size` 欄位先例，`:16` / `:52`）
- `plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md:88-95`（Step 5 invocation 現況）

## Files to Create/Modify

- `plugins/solopreneur/skills/greenlight/SKILL.md` — modify，選擇流程 / token / Fallback Logic / 一輪流程 / 終端狀態 / 觀測回寫 / 移除 seam
- `plugins/solopreneur/skills/autopilot/SKILL.md` — modify，`{SELECT}` / `{GATE}` dispatch-time 變數
- `plugins/solopreneur/skills/autopilot/references/schemas.md` — modify，`select` / `gate` optional 欄位
- `plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md` — modify，傳遞 token + 明確帶 `unattended`

## Acceptance Criteria

- [ ] Test command: `cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs` — 65 個仍全綠（skill-sync 對改寫後的 SKILL.md 仍通過）
- [ ] `grep -n "select=\|gate=" plugins/solopreneur/skills/greenlight/SKILL.md` — 命中三處以上：選擇流程、resolve 呼叫、token-dropping 行；且該丟棄行同時含 `external` / `unattended` / `size=`
- [ ] `grep -c "wizard eligibility" plugins/solopreneur/skills/greenlight/SKILL.md` 回 0
- [ ] `grep -n "| 1 | \`findings\`" plugins/solopreneur/skills/greenlight/SKILL.md` 命中（終端狀態表 findings 在優先序第 1 列）；`grep -n "Never clean" plugins/solopreneur/skills/greenlight/SKILL.md` 命中（timeout 列）
- [ ] `grep -n "👍" plugins/solopreneur/skills/greenlight/SKILL.md` 在關窗條件與 priority 2.5 都命中；`grep -n "max 2 retries" plugins/solopreneur/skills/greenlight/SKILL.md` 命中（👀 確認梯保留）
- [ ] `grep -c "BOT_LOGIN" plugins/solopreneur/skills/greenlight/SKILL.md` 回 0（PR-1 seam 已移除、消費端已逐 login 參數化）
- [ ] `grep -n "write_solopreneur_repo_config greenlight" plugins/solopreneur/skills/greenlight/SKILL.md` 命中的 persist 寫法是「merged 後置頂」（同行或鄰近行含 `fallback_order = ([$g]`），非單筆覆蓋
- [ ] `grep -n "{SELECT}\|{GATE}" plugins/solopreneur/skills/autopilot/SKILL.md` 命中；`grep -n "select=\|gate=\|unattended" plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md` 三者皆命中；`grep -n "select\|gate" plugins/solopreneur/skills/autopilot/references/schemas.md` 命中兩個 optional 欄位定義
- [ ] `git diff origin/main --name-only | grep -c plugin.json` 回 0

## Notes

- **實跑驗證（plan Task 9 Step 4 的四項）在本 PR 內不可執行**：它們需要已釋出的新版 skill（本 PR 的 review loop 跑的是已安裝的 0.5.36 舊版 greenlight，屬預期）與 attended 互動。在 PR body 列為 post-release 待辦 checklist，不要假裝有跑、也不要嘗試 attended 流程。
- 走查型驗收（plan Task 9 Step 4 的「自動化測不到的兩處」表）：在 PR body 逐列確認並記錄。
- PR 1 合併後 SKILL.md 行號會位移——所有引用先 grep 定位再改，不要盲照 plan 行號。
- Review 尺寸 hint 為 `m`。
