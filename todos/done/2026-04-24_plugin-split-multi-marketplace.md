# Plugin Split：拆成 6 個 sub-plugin

## Final Status

Completed and superseded by the current seven-plugin layout:
`solopreneur`, `designer`, `marketer`, `ios-dev`, `android-dev`,
`ai-engineer`, and `neo4j-dev`.

This file is kept as historical dogfood output. The concrete plugin names and
PR breakdown below reflect the April 2026 plan, not the current repo state.

把 `solopreneur` 從單一 plugin（22 skills + 7 agents）拆成 6 個 sub-plugin，放在同一個 repo、同一個 `marketplace.json`。目的：使用者只載入需要的 tech stack，context 乾淨；plugin update / uninstall 顆粒更細。

## 動機

- 不同使用者 tech stack 不同（iOS / Android / Web / Python / LLM），一個大 plugin 把所有 agent + skill 全載入是浪費 context
- 官方 `anthropics/claude-plugins-official` marketplace 有 500+ plugin 就是這樣組織，確認這是標準做法
- 一個 repo 多 plugin 比 "setup skill 動態開關" 乾淨：沒裝的 plugin 連 description 都不進 context

## 提案結構

```
solopreneur/
├── .claude-plugin/
│   └── marketplace.json         # 管 6 個 plugin
├── plugins/
│   ├── core/                    # 所有人都用
│   ├── ios/
│   ├── android/
│   ├── nextjs/
│   ├── python/
│   └── llm/
└── README.md
```

### Skill / Agent 歸屬（待確認）

| Plugin | Skills | Agents |
|---|---|---|
| **core** | autopilot, greenlight, gtm, humanly, linkedin-growth, naming, perspective, post-mortem, preflight, rebuild-skill-index, second-opinion, session-retro, slide-design, **specialist-review**, todos-babysit, todos-cleanup, **todos-review**, worktree-handoff, x-growth, x-writing | designer |
| **ios** | ios-patterns | ios-dev |
| **android** | android-patterns | android-dev |
| **nextjs** | — | nextjs-dev |
| **python** | — | python-dev |
| **llm** | — | llm-dev |

**`ios-patterns` / `android-patterns` 放 stack plugin**（而非 core），因為只有做那個 stack 的人會用。

## ⚠️ 關鍵發現：Path 引用已壞（拆 plugin 前必修）

### 現況

所有 dev agent（`ios-dev.md` 等）都硬編碼：

```
~/.claude/plugins/cache/solopreneur/solopreneur/<version>/skills/<name>/SKILL.md
```

並要求 subagent 在 runtime 用 `ls ~/.claude/plugins/cache/.../ | sort -V | tail -1` 解析版本號。

### 為什麼壞了

1. **硬編碼 `~/.claude/`** — 使用者用 `CLAUDE_CONFIG_DIR` 切 config 時（例如 `$HOME/Agents/claude/wrangler/`）plugin 實際裝在那裡，但 agent 指向預設路徑，**讀到錯版本或讀不到檔案**
2. **多 config 本機實測**：solopreneur 同時裝在多個 Claude config 位置（預設 config + 多個 named config），不同 session 下 agent 都指向錯位置
3. **`${CLAUDE_PLUGIN_ROOT}` 變數只在 JSON config 展開**（hooks / MCP），markdown / agent prompt 裡不展開（[Issue #9354](https://github.com/anthropics/claude-code/issues/9354)）

### 正解：**從 path 改成 name**

Plugin 安裝後 skill 自動註冊到 Claude Code 的 Skill system。Subagent 用 Skill tool 按名稱呼叫就好，不需要知道實體路徑：

```markdown
### Plugin built-in skills

These ship with `solopreneur-ios`. When relevant, invoke via the Skill tool
by name — do NOT read SKILL.md files by path.

- `ios-patterns` — SwiftUI conventions: i18n, date parsing, Previews...
  Invoke: use Skill tool with `skill: "solopreneur-ios:ios-patterns"`
```

第三方 skill（`asc-*`、`iphone-apps`、Axiom）同樣改 name。

### ❗ 需驗證的假設

**Subagent（透過 Agent tool spawn）是否能用 Skill tool 呼叫 plugin skill？**

理論上可以（Skill system 是全域的），但沒實測過。**PR 0 前必驗證**，否則 fallback 方案是把 skill 內容 inline 進 agent prompt。

## 拆分計畫（五個 PR）

### PR 0｜修 path → name（**blocker**） ✅ 完成 2026-04-24

修現有 bug，驗證 skill-by-name 模式。保持單一 plugin 結構不變。

- [x] **驗證實驗**：subagent 能看到 22 個 `solopreneur:*` skill 並成功 `Skill("solopreneur:ios-patterns")`
- [x] 改全部 7 個 agent 的 Curated Skills 區塊（v0.2.0 PR #7 squash `dea3f84`）
- [x] 跨 config 測試（wrangler 驗過；builder/creator 同 Skill tool primitive）
- [x] Bump 0.1.9 → 0.2.0 + tag
- [x] **Follow-up v0.2.1** (`b73b16d`)：`rebuild-skill-index` + 3 個 agent Extended Discovery 改成 `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`-aware
- [x] **CodeRabbit 抓到的額外 fix**（在 v0.2.0 內）：7 個 agent 的 frontmatter `tools:` 補上 `Skill`

### PR 1｜結構拆成 6 個 plugin

- [ ] 先 `git rm agents/web-dev.md`（功能被 `nextjs-dev` 吸收；加進 `MIGRATION.md`）。連帶要改的引用（grep `web-dev` 找出 8 處，跳過 `todos/` 歷史紀錄）：
  - `README.md` L96-97
  - `skills/specialist-review/SKILL.md` L6, L46
  - `skills/autopilot/SKILL.md` L73
  - `skills/autopilot/references/schemas.md` L58
  - `skills/preflight/SKILL.md` L33
  - `skills/todos-review/SKILL.md` L68
- [ ] 建 `plugins/{core,ios,android,nextjs,python,llm}/` 目錄
- [ ] 每個 plugin 建 `.claude-plugin/plugin.json`（name、version `0.2.0`、description、license）
- [ ] 非 core plugin 加 `dependencies` 欄位（**verified 2026-04-24** — 官方 docs 明確、auto-install works, 需 CC ≥ 2.1.110，本機 2.1.119 OK）。語法是 **array，不是 object**：
  ```json
  "dependencies": [{ "name": "solopreneur-core", "version": ">=0.3.0" }]
  ```
  bare-string `["solopreneur-core"]` 也可（拉 latest）；跨 marketplace 可加 `"marketplace": "..."`
- [ ] 按歸屬表搬 skills 和 agents
- [ ] 改根目錄 `.claude-plugin/marketplace.json`：6 個 plugin，source `./plugins/<name>`
- [ ] 刪根目錄舊 `.claude-plugin/plugin.json`、`skills/`、`agents/`
- [ ] Agent 裡 skill 名稱前綴改成跨 plugin 版：`solopreneur:ios-patterns` → `solopreneur-ios:ios-patterns`
- [ ] 本機測試：`claude --plugin-dir plugins/core`、`plugins/ios` 分別能載入

### PR 2｜`specialist-review` / `todos-review` 加 agent fallback

兩個 skill 都假設 agent 一定存在，沒 fallback。拆完後有人只裝 core 會斷。

- [ ] `specialist-review/SKILL.md` Step 3 加「if Agent tool returns unknown-agent error → 用自己內建專業繼續 review + 提示使用者裝對應 plugin」
- [ ] `todos-review/SKILL.md` Step 4 同樣處理
- [ ] 兩個 skill 的 output 格式多一欄：`⚠️ <agent> not installed — review done with generic expertise. Install solopreneur-<stack>.`

### PR 3｜Release rule + tooling

- [ ] 改 `CLAUDE.md` 的 release rule：
  - `git diff --name-only HEAD~` 掃出動到哪些 `plugins/X/` → 只 bump 那幾個
  - Tag 格式採 CC 官方慣例 **`{plugin-name}--v{version}`**（雙 dash，例：`solopreneur-core--v0.3.0`、`solopreneur-ios--v0.3.0`）——這是 CC 用來 resolve plugin 版本的 convention
  - 一次 push 可能有多個 tag，push 時 `git push --follow-tags`
- [ ] （可選）寫 `scripts/bump-changed-plugins.sh` 自動掃變更 + bump + tag

### PR 4｜README + migration note

- [ ] 改 `README.md`：列 6 個 plugin、安裝指令、dependencies 關係
- [ ] 加 `MIGRATION.md`：告訴 v0.1.x 使用者怎麼從單一 `solopreneur` plugin 遷移到新的 6 個
- [ ] Bump root meta version 到 `v1.0.0`（breaking change）

## 待決定事項（open questions）

開 PR 前先定：

1. **`ios-patterns` / `android-patterns` 放哪？** ✅ 已決：**放 stack plugin**（非 core）
2. **`nextjs-dev` vs `web-dev`** ✅ 已決：**砍掉 `web-dev`，只保留 `nextjs-dev`**（重疊太大，只差 model）
3. **Tag 格式** ✅ 已決：採 CC 官方慣例 `{plugin-name}--v{version}`（雙 dash），例：`solopreneur-core--v0.3.0`
4. **Migration 強度** ✅ 已決：**直接 breaking change 砍掉 root `solopreneur` plugin**。v0.2.x 使用者升級時要看 `MIGRATION.md` 手動改裝對應 sub-plugin（v1.0.0 commit）
5. **PR 1 前的驗證實驗** ✅ 兩題都通過：
   - **5a.** Subagent 能否用 Skill tool 呼叫 plugin skill？→ **YES**（2026-04-24）
   - **5b.** `plugin.json` 的 `dependencies` 欄位實際行為？→ **YES, auto-install works**（2026-04-24，官方 docs 明確，需 CC ≥ 2.1.110）

## 風險

- **`dependencies` 欄位的不確定性** ✅ 已消除（5b 驗證通過，CC 2.1.119 ≥ 2.1.110）
- **`rebuild-skill-index` skill 寫進 `~/.claude/solopreneur/skill-index/` 固定路徑** ✅ 已修 (v0.2.1)，現在 `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`-aware。拆完後仍需決定：每個 sub-plugin 各自寫 index，還是維持在 plugin 外的 per-config 層
- **Subagent 若無法用 Skill tool** ✅ 已消除（5a 驗證通過）

## 參考

- Anthropic 官方 marketplace：https://github.com/anthropics/claude-plugins-official
- `${CLAUDE_PLUGIN_ROOT}` 在 markdown 失效的 issue：[#9354](https://github.com/anthropics/claude-code/issues/9354)
- Plugin lifecycle hooks（不會實作）：[#9394](https://github.com/anthropics/claude-code/issues/9394)、[#11240](https://github.com/anthropics/claude-code/issues/11240)

## 這份 plan 的上游脈絡

起源於 2026-04-24 session：原本問「plugin 裝/更新時自動抓第三方 skills」→ 結論是官方沒 install hook，走 setup skill；接著討論 setup skill 的 tech stack 開關設計 → 結論拆多 plugin 比 setup skill 乾淨。
