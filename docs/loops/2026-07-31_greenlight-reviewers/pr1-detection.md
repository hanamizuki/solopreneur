# feat(greenlight): detection-driven reviewers

## Requirements

- 實作 `docs/solopreneur/plans/2026-07-30-greenlight-reviewer-flexibility.md` 的 **Task 1–7**（PR 1 範圍）。該 plan 已含完整 TDD 步驟與程式碼（腳本、測試、CI yaml、SKILL.md 置換段落），**照 task 順序逐一執行、沿用其 commit 邊界**，不要重新設計。plan 與 spec（`todos/backlog/2026-07-30_greenlight-reviewer-flexibility.md`）衝突時以 spec 為準。
- 交付物：reviewer registry（純資料 + `recipeFor` / `recipeForLogin`）、`reviewer-state.mjs` 三個 subcommand（`detect` / `record` / `resolve`）、65 個 `node:test` 測試、CI workflow、SKILL.md 的 registry 表格瘦身 + detection 接上腳本 + PR-1 seam（`BOT_LOGIN` 由 `RESOLVED.gate` 供應）、`shared/config.md` 的 `greenlight_reviewers` 文件與兩處 invariant 修正。
- 約束（plan「Global Constraints」全數適用）：Node >= 20 僅 `node:` built-ins、不新增任何依賴；腳本註解與文件字串一律英文；腳本不呼叫 `gh`、不算 repo-key、不讀 `fallback_order`；單一 writer 原則（腳本只寫 `greenlight_reviewers`）；config 毀損 fail closed 且不得寫入；stale `--select`/`--gate` 是警告降級不是錯誤；測試 hermetic（env allowlist）；**loop 終止語意不變**（本 PR 只接 detection，既有單一 reviewer 流程靠 seam 繼續跑）；不動 post-commit / uncommitted mode；不碰 `plugin.json` 版本。

## Files to Read

- `docs/solopreneur/plans/2026-07-30-greenlight-reviewer-flexibility.md`（主要實作來源：Task 1–7 全文，含完整程式碼）
- `todos/backlog/2026-07-30_greenlight-reviewer-flexibility.md`（設計理由；衝突時為準）
- `plugins/solopreneur/skills/greenlight/SKILL.md:1482-1601`（要置換的 registry 與 detection 段）與 `:806-843`（PR mode parsing，本 PR 不改、僅理解）
- `plugins/solopreneur/shared/config.md`（helper 定義、`:115` 與 `:340-345` 兩處要改的 invariant）
- `plugins/solopreneur/skills/preview/scripts/config-resolve.mjs` 與 `plugins/solopreneur/skills/preview/tests/config-resolve.test.mjs`（錯誤處理與 hermetic 測試慣例的既有範本）
- `.github/workflows/validate-preview-tests.yml`（CI workflow 範本）

## Files to Create/Modify

- `plugins/solopreneur/skills/greenlight/scripts/reviewer-registry.mjs` — new，registry 純資料 + lookup
- `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs` — new，detect / record / resolve
- `plugins/solopreneur/skills/greenlight/tests/reviewer-registry.test.mjs` — new，15 tests
- `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs` — new，48 tests（11 detect + 15 record + 22 resolve）
- `plugins/solopreneur/skills/greenlight/tests/skill-sync.test.mjs` — new，2 tests
- `.github/workflows/validate-greenlight-tests.yml` — new，Node 20/24 matrix CI gate
- `plugins/solopreneur/skills/greenlight/SKILL.md` — modify，registry 表格（verified login 欄）、kinds 說明、採樣加來源欄、決策改呼叫腳本、刪 `:1509-1521` 硬編碼 login 區塊、加 seam、結果解讀表
- `plugins/solopreneur/shared/config.md` — modify，`greenlight_reviewers` 段 + 三 writer invariant + 非 bash writer 註冊清單

## Acceptance Criteria

- [ ] Test command: `cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs` — 65 pass（15 registry + 48 state + 2 sync），0 fail
- [ ] Real-repo 驗證（plan Task 7 Step 6 的指令）：三個來源採樣 → `detect` → `resolve --repo-key github.com/hanamizuki/solopreneur --fallback-order codex-bot,codex-cli` 的輸出中，`available` 恰含 `chatgpt-codex-connector[bot]` / `coderabbitai[bot]` / `gemini-code-assist[bot]` 三筆、各帶 recipe `codex-bot` / `coderabbit` / `gemini`、`canGate` 皆 true；`gate.recipe == "codex-bot"`；無 `hanamizuki`
- [ ] `grep -c "REVIEWER_BOT_LOGINS" plugins/solopreneur/skills/greenlight/SKILL.md` 回 0（硬編碼白名單已刪）
- [ ] `grep -n "BOT_LOGIN=" plugins/solopreneur/skills/greenlight/SKILL.md` 恰命中 seam 一行（`jq -r '.gate.login // empty'`）
- [ ] `grep -n "node: \['20', '24'\]" .github/workflows/validate-greenlight-tests.yml` 命中，且 `grep -n "matrix.node" .github/workflows/validate-greenlight-tests.yml` 顯示 concurrency group 帶 matrix leg
- [ ] `grep -n "greenlight_reviewers" plugins/solopreneur/shared/config.md` 命中新段落；`grep -c "Two writers" plugins/solopreneur/shared/config.md` 回 0（已改為三 writer 敘述）
- [ ] `git log --oneline origin/main..HEAD -- plugins/solopreneur/plugins 2>/dev/null; git diff origin/main --name-only | grep -c plugin.json` 回 0（未動任何 plugin.json）

## Notes

- Plan 內含逐字的測試與實作程式碼——照抄即可，只有測試失敗揭露 plan 程式碼有 bug 時才偏離，且偏離處要在 PR body 記一行。
- PR body 照 plan「PR 1 收尾」的要求撰寫：通用偵測取代白名單、三 bot 經 `knownLogins` 自動識別（附真 repo 驗證輸出）、loop 終止語意未變。
- 已知陷阱：`node --test tests/` 目錄形式在 Node >= 22.6 會壞（CI yaml 註解有解釋）；macOS tmpdir 是 `/var` symlink（測試 helper 已 `realpathSync`）；`CLAUDE_SKILL_DIR` 引號位置照 plan Global Constraints。
- Review 尺寸 hint 為 `l`（diff 約 1500+ 行，多為新測試）。
