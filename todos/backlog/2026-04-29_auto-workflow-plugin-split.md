# 拆 auto-workflow plugin

把 `todos-*` 和 `autopilot` 系列從 `solopreneur` 拆出來變成獨立 plugin `auto-workflow`。

## 動機

`solopreneur` 目前混了兩種性質的 skill：

1. **通用工作流自動化**（todos / autopilot / greenlight / worktree-handoff…）
2. **元工具**（perspective / second-opinion / session-retro / preflight / specialist-review…）

「自動化工作流」這組對非開發者使用情境也有用，而且演化路徑不同（會持續加多 PR 編排、scheduling、cron 整合等），拆出去能：

- 讓只想用 todo 管理 + auto PR 編排的人乾淨安裝
- `solopreneur` 退回「review / 思考工具集」更聚焦
- 各自版本獨立演進

## 候選 skill 歸屬（待確認）

| Skill | 提案歸屬 |
|---|---|
| `autopilot` | auto-workflow |
| `todos-babysit` | auto-workflow |
| `todos-cleanup` | auto-workflow |
| `todos-review` | auto-workflow |
| `greenlight` | auto-workflow（auto PR review loop） |
| `handoff` | ? 待定（偏元工具） |
| `worktree-handoff` | auto-workflow（搭配 autopilot 用） |
| `perspective` | solopreneur 留著 |
| `post-mortem` | solopreneur 留著 |
| `preflight` | solopreneur 留著 |
| `second-opinion` | solopreneur 留著 |
| `session-retro` | solopreneur 留著 |
| `specialist-review` | solopreneur 留著 |
| `rebuild-skill-index` | solopreneur 留著（基礎設施） |

## 待決定

1. `auto-workflow` 是否依賴 `solopreneur`？多數 skill 獨立，可能不需要 dependency
2. `todos-review` 會 dispatch `specialist-review`（在 solopreneur）— 拆開後跨 plugin 呼叫的 UX
3. `handoff` / `worktree-handoff` 兩者都偏 workflow，但 `handoff` 比較像通用 context export
4. 是否一起把「PR 編排」相關的 skill 收進來（merge-pr 之類，目前在 user-level skills 裡）

## 順序

不急。等下面這幾件穩定後再做：

- 多 plugin marketplace 結構穩定（已完成，七個 sub-plugin 在跑）
- `autopilot` / `greenlight` 自身行為穩定
- 確認有實際使用者要分開裝（避免 over-engineering）
