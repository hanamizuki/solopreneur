<!--
Plan-Branch: refactor/per-repo-config
-->

## Handoff Context (2026-05-20, branch: refactor/per-repo-config)

### Problem Background

Solopreneur skill 的設定目前是全域單一檔（`$CLAUDE_CONFIG_DIR/solopreneur.json` + `~/.claude/solopreneur.json` cascade），無法表達「不同 repo 用不同 config」的需求。

具體 case：使用者的 `todos.{backlog,doing,done,later}` 指向 `~/Agents/mojo/repos/mojo-apps/todos/`——但這只該對 mojo-apps repo 有效。在 solopreneur repo（這個 plugin marketplace）跑 worktree-handoff / merge-pr 時，會被誤判為 state-machine mode 然後想把 plan 寫進 mojo-apps 的 todos 目錄。目前的 workaround 是 skill 自己手動覆寫成 flat mode。不持久、不直覺。

### Root Cause

`_shared/config.md` 定義的 `read_solopreneur_config` / `write_solopreneur_config` 只讀寫 JSON 的 top-level key。schema 沒有 per-repo 的概念，所有 key 都被當「全域」對待。Preview skill 自己造了 `preview.paths.<repo-key>` 的 sub-schema 處理 per-repo，但這是孤兒模式，其他 skill 沒有跟進。

### Items to Fix / Implement

**新 schema（最終長相）**

```jsonc
{
  "default": {
    "greenlight": { "fallback_order": ["codex-bot", "gemini"] },
    "plans":      { "dir": "docs/plans" }
    // 沒 todos → 預設 flat mode
  },
  "repos": {
    "github.com/hanamizuki/mojo-apps": {
      "todos": { "backlog": "...", "doing": "...", "done": "...", "later": "..." }
    },
    "github.com/hanamizuki/solopreneur": {
      "plans": { "dir": "docs/solopreneur/plans" }
    }
  }
}
```

讀取邏輯：`repos[<repo-key>].<feature>` → `default.<feature>` → 舊 top-level `<feature>`（legacy fallback）。第一個非 null 命中即返回。

**主要改動**

- [ ] `_shared/config.md`
  - 改寫 `read_solopreneur_config` 為三層 lookup（per-repo / default / legacy top-level）
  - 加 `solopreneur_repo_key()` helper（origin URL normalize → `host/owner/repo`；無 origin → git toplevel 絕對路徑；無 git → `$PWD`）
  - 加 `write_solopreneur_repo_config <key> <expr>` 寫到 `repos[<repo-key>].<key>`
  - `write_solopreneur_config` 保留 API，但內部改寫到 `default.<key>`
  - 文件：cascade 順序、四層精細度（per-repo → default → legacy）、何時用 global vs repo write
- [ ] 同步 6 個 inline 該 helper 的 skill 的 helper block：
  - `greenlight`, `merge-pr`, `preview`, `todos-babysit`, `todos-cleanup`, `worktree-handoff`
  - 多數 caller 不用動（API surface backward-compat）
  - `preview` 的 `write_solopreneur_config preview "$MERGED"` 改用 `write_solopreneur_repo_config preview '{path: ...}'`——這 simplification 順便做掉
  - `todos-cleanup` 的 `write_solopreneur_config todos` 維持寫到 `default`（todos discovery 偏向全域行為，但可選改成 per-repo——待討論）
- [ ] CLAUDE.md（repo 根）加一段 "Config layering" 說明
- [ ] Migration 範例：在 `_shared/config.md` 文件區附使用者可以拿來改自己 JSON 的 sample diff

**故意不做**

- 不自動改寫使用者的 `solopreneur.json`（讀邊兼容舊格式，使用者自己決定何時手動 migrate）
- 不加 `extends` / profile 機制（YAGNI）
- 不破壞 `preview.paths.<repo-key>` 的 v1 schema——讀端兼容兩種

### Key Files

| path | description |
|------|-------------|
| `plugins/solopreneur/skills/_shared/config.md` | 主邏輯：helper 定義、文件、migration guide |
| `plugins/solopreneur/skills/greenlight/SKILL.md` | sync inlined helper block；`write greenlight` 改寫到 default |
| `plugins/solopreneur/skills/merge-pr/SKILL.md` | sync inlined helper block；caller 不變 |
| `plugins/solopreneur/skills/preview/SKILL.md` | sync inlined helper block；改用 per-repo write API |
| `plugins/solopreneur/skills/todos-babysit/SKILL.md` | sync inlined helper block |
| `plugins/solopreneur/skills/todos-cleanup/SKILL.md` | sync inlined helper block |
| `plugins/solopreneur/skills/worktree-handoff/SKILL.md` | sync inlined helper block |
| `plugins/solopreneur/skills/todos-review/SKILL.md` | 引用 todos-cleanup 的 helper，只看一下文字描述要不要更新 |
| `CLAUDE.md` | 加 config layering 一節（可選） |

### Test Plan

- [ ] Helper 函式本身：用 `/tmp/test-config-*.json` 模擬幾種狀態跑 read/write，驗證
  - new schema（`default` + `repos`）讀法正確
  - legacy top-level 讀法仍然 work
  - missing key 三層都沒有 → 返回 empty
  - write 寫進正確的 nested path、不破壞既存的 sibling key
- [ ] 跑這個 worktree 的 worktree-handoff 自己（dogfood）——確認 flat mode 仍正常
- [ ] 摸 user's 實際 config（read-only）確認沒 regression：`read_solopreneur_config preview`、`read_solopreneur_config greenlight`、`read_solopreneur_config todos` 與 refactor 前同值

### Current Progress

Plan written, scope surveyed. Pending：跟使用者確認 scope（一次做完 vs 拆兩個 PR：helper + sync 一個 PR、preview write API 重構另一個 PR）。
