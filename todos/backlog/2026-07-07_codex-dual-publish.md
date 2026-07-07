# Codex 雙平台發佈研究：讓 solopreneur 同 repo 支援 Claude Code + Codex

目標：研究目前這個 Claude Code plugin marketplace 是否能同時製作 Codex 版本，讓使用者也能在 Codex 安裝並使用相同的 solopreneur 能力。

## 已查證結論

- Codex 目前有原生 **plugins** 和 **skills**：
  - Codex plugin manifest：`.codex-plugin/plugin.json`
  - Codex repo/local marketplace：`.agents/plugins/marketplace.json`
  - Codex skill：`SKILL.md` + `name` / `description` frontmatter + optional `scripts/` / `references/` / `assets/`
  - 已驗證（codex CLI 0.142.5，2026-07-07）：`codex plugin marketplace add` 支援 `owner/repo[@ref]` git source，`codex plugin add PLUGIN@MARKETPLACE` 可從 marketplace 挑單一 plugin 安裝——7 sub-plugin 模式在 CLI 與 marketplace schema 層面都可行
- 這個 repo 目前是 7 個 Claude Code sub-plugin：
  - `solopreneur`
  - `designer`
  - `marketer`
  - `ios-dev`
  - `android-dev`
  - `ai-engineer`
  - `neo4j-dev`
- 本地盤點：
  - 106 個 `SKILL.md`
  - 6 個 Claude agent markdown
  - 76 個 skill-local script files
  - 222 個 reference files
- 大部分 skill 內容可以共用；需要分平台 adapter 的是 manifest、marketplace、agents、config path、tool vocabulary。

## dry-run 發現

用 temporary Codex manifest 在 `/tmp` 驗證，不改 repo：

- `marketer` 補上最小 `.codex-plugin/plugin.json` 後可通過 Codex plugin validator。
- 其他 plugin 主要卡在結構問題：
  - `skills/_vendored` 被 Codex 當成 skill directory，但沒有 `SKILL.md`。2026-07-07 複查耦合面：存在於 ai-engineer / android-dev / designer / ios-dev / neo4j-dev 5 個 plugin，內容只有 `LICENSES/` + `manifest.json`；真實引用只有 5 個 `agents/*.md` + `plugins/solopreneur/scripts/sync-vendored.sh`，grep 到的其餘 77 處是自動生成的 `_VENDOR.md` 標記（隨 sync 重生，不需手改）
  - `plugins/solopreneur/skills/_shared` 被 Codex 當成 skill directory，但沒有 `SKILL.md`。2026-07-07 複查：僅 solopreneur 內 7 個檔案引用 `_shared/config.md`，自我封閉，搬移風險低
  - ~~frontmatter 未 quote 冒號~~ 2026-07-07 複查排除：106 個 SKILL.md 中 inline description 含冒號的僅 2 個且都已加引號，另 21 個用 folded/block scalar 本來就 YAML-safe。dry-run 當時的 YAML 錯誤應出自 `/tmp` 臨時 manifest 的生成過程，非 repo 現況

## superpowers 可學習的架構

參考 repo：`https://github.com/obra/superpowers`

可學：

- 共用 skill source of truth，各平台只做 manifest / adapter。
- skill 內容盡量寫「動作」而不是寫具體工具名。
- per-harness tool mapping 放進 reference 或 bootstrap adapter。
- 同 repo 同時放：
  - `.claude-plugin/plugin.json`
  - `.codex-plugin/plugin.json`
  - `.agents/plugins/marketplace.json`
- 要小心 hooks：superpowers 在 Codex manifest 設 `"hooks": {}`，避免 Codex 誤載 Claude/Cursor 用的 `hooks/hooks.json`。
- 寫 packaging / sync / validation script，避免多平台 manifest drift。

## 下次先討論的決策

- [ ] Codex 是否也保留 7 個 sub-plugin，還是做成一個 `solopreneur-suite` Codex plugin？
- [ ] Claude plugin-level `dependencies` 在 Codex 沒有 1:1 schema，Codex 要用文件要求、suite plugin、還是讓每個 plugin 自足？
- [ ] `skills/_vendored` / `skills/_shared` 要搬到哪個非 `skills/` 直層路徑？候選：`support/`、`vendor/`、`shared/`
- [ ] Claude `agents/*.md` 要轉成 Codex custom agent TOML、entrypoint skills，還是兩者都做？
- [ ] shared skills 裡的 `Skill tool` / `Agent tool` / `CLAUDE_CONFIG_DIR` 要改成平台中立語彙，還是用平台 mapping reference 隔離？
- [ ] Codex local dev 要直接用 `.agents/plugins/marketplace.json` 安裝，還是產生 package artifact 測試？
- [ ] Release / versioning 整合：本 repo 發佈由 `/release` skill + `<plugin>--v<version>` double-dash tag 驅動（Claude Code resolver 專用）；Codex 走 marketplace snapshot + `--ref` 的 git-ref 模型，且 `.codex-plugin/plugin.json` 自帶 `version` 欄位。`/release` 要不要同步 bump Codex manifest？tag 策略如何對應？CHANGELOG 是否分平台？

## 建議第一個 PR

先做 docs/spec，不動大量 skill：

- [ ] 新增 `docs/spec/2026-07-07-codex-dual-publish.md`
- [ ] 定義 shared vs platform-specific file ownership
- [ ] 定義 Codex manifest / marketplace shape（含 `interface` 區塊：displayName / category / capabilities / logo 等 Claude manifest 沒有的欄位，superpowers 的 `.codex-plugin/plugin.json` 有完整範例）
- [ ] 定義 dependency audit matrix
- [ ] 定義 validation commands

## 後續 migration tasks

- [ ] Add `.codex-plugin/plugin.json` for each of the 7 plugin directories.
- [ ] Add `.agents/plugins/marketplace.json` for Codex local/dev marketplace installation.
- [ ] Move or hide non-skill helper dirs currently under `skills/` (`_vendored`, `_shared`) — must update `plugins/solopreneur/scripts/sync-vendored.sh` and `.github/workflows/{sync,validate}-vendored.yml` in the same change.
- [ ] Add Codex validation script for plugin manifests and skill directories.
- [ ] Add dependency matrix for plugin deps, skill deps, agents/subagents, MCP/apps, external CLIs, env vars, sandbox/network assumptions.
- [ ] Convert or template 6 Claude agents into Codex-compatible custom agent TOML files if install path is acceptable.
- [ ] Audit high-level workflow skills: `autopilot`, `greenlight`, `preview`, `mvp`, `tech-vetting`, `todos-*`.
- [ ] Add README install instructions for both Claude Code and Codex.
- [ ] Consider package/sync script modeled after superpowers.

## 下次優先讀的檔案

| path | why |
| --- | --- |
| `.claude-plugin/marketplace.json` | Current Claude marketplace source |
| `plugins/*/.claude-plugin/plugin.json` | Existing plugin metadata and dependencies |
| `plugins/*/skills/` | Shared skill content and current structural blockers |
| `plugins/*/agents/*.md` | Claude agent behavior to convert or adapt |
| `plugins/solopreneur/skills/_shared/config.md` | Claude config helper that needs Codex strategy |
| `plugins/solopreneur/skills/rebuild-skill-index/SKILL.md` | Claude-specific skill discovery/indexing behavior |
| `plugins/solopreneur/skills/preview/SKILL.md` | Deep Claude workflow assumptions and deployment behavior |

## 相關 handoff

Tracked handoff also exists on branch `docs/codex-dual-publish-todos`:

`docs/loops/2026-07-07_codex-dual-publish-research/source-handoff.md`
