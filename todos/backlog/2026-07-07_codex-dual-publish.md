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
- 2026-07-08 補充查證（官方文件 + 本地實測）：
  - Codex subagents 已 GA：custom agent 為 TOML（user `~/.codex/agents/`、project `.codex/agents/`），必填 `name` / `description` / `developer_instructions`，可選 `model`、`sandbox_mode`、`mcp_servers`、`skills.config` 等；內建 `default` / `worker` / `explorer`
  - Codex **不會**依 description 主動委派 subagent（官方明言 only spawns when explicitly asked）；skills 則自動進初始 context（上限 2% context window 或 8000 字元）並依 description 觸發 → 主動路由要靠 skill 補
  - Codex plugin 只能帶 skills / apps / MCP servers，**不能帶 custom agents** → agent TOML 需另行落地（bootstrap）
  - Claude 端機制修正：plugin 安裝後 skills 一律進主 session（無綁定 subagent／對主 session 隱藏的機制；agent frontmatter `skills` 是 preload 非 restrict）；主動委派靠 agent `description`
  - Claude 專屬語彙散布面：33 檔提及 `Skill tool` / `Agent tool` / `CLAUDE_CONFIG_DIR` / `AskUserQuestion` 等（~13 檔 vendored 手改會被 sync 蓋掉、~20 檔 native 可直接改寫）

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

## 已拍板決策（2026-07-08）

1. **Codex 結構：鏡像 7 個 sub-plugin**（不做 suite）。rollout 先拿 `marketer` 當 pilot（dry-run 已過 validator），驗證安裝 UX 再鋪滿。
2. **Dependencies：文件要求**。README／描述註明「建議先裝 solopreneur（skill-index / workflow 基座）」；保持現有軟依賴 + graceful degradation（實際耦合僅 5 個 agent 對 skill-index artifact 的可選讀取），Codex 出 dependency schema 再補宣告。
3. **非 skill 目錄：`skills/_vendored` → `plugins/<n>/vendor/`、`skills/_shared` → `plugins/solopreneur/shared/`**。同 PR 連動 `sync-vendored.sh`、兩個 vendored workflow、5 個 agent 引用、7 個 config.md 引用；排在 backlog 的 `$N escape` todo 之後（共用 sync-vendored.sh）。
4. **Agents：TOML + router skill 都做**。6 個 agent 轉 Codex TOML（repo 放 `.codex/agents/`；另做 bootstrap skill 幫安裝者複製到 `~/.codex/agents/`，因 Codex plugin 帶不了 agents）；每個 plugin 加一個平台中立措辭的 router/entrypoint skill 放 `skills/`（Codex 端創造主動路由、Claude 端與 description 路由同向）。pilot 必測：skill 指示 spawn agent 在 Codex 是否真的觸發委派。
5. **語彙：混合式**。native ~20 檔改寫平台中立（寫動作不寫工具名）；vendored ~13 檔不動、用 per-harness mapping reference（掛 bootstrap／router skill 的 references）；`CLAUDE_CONFIG_DIR` 等 config path 收斂到 shared helper 單點解析。
6. **Local dev：`.agents/plugins/marketplace.json` local marketplace 直裝**，不做 package artifact（Codex 安裝模型即 marketplace snapshot，無 package 格式）；發佈驗證於 pilot 時用 git `@ref` 實裝一次。
7. **Release：同號同 commit**。`.codex-plugin/plugin.json` 由 generator 從 `.claude-plugin/plugin.json` 生成（含 `interface` overlay），`/release` 加跑 generator、CI 加 drift check（仿 validate-vendored 模式）；tag 沿用 `<plugin>--v<version>` double-dash（Codex 使用者可 `@tag` pin）；CHANGELOG 維持單一份。
8. **Skills 檔案結構：不搬**。skills 留在 `plugins/<name>/skills/`——雙平台共用同一份內容已由「兩平台 manifest 同住 plugin 目錄」達成；安裝單位即 plugin 目錄（外部路徑裝不進去）；跨 plugin 零重名、無去重收益。「好找」問題以生成式總覽解決：script 產 `docs/skills-catalog.md` + CI 防過期。
9. **Router skill 形態：router + 使用指引、建議式委派**。實作／多步驟 → 派 agent；快查 → 直接用該 plugin 的 skill；不內嵌 skill 清單（清單同步交給 skill-index 機制）。
10. **Router skill 命名：`using-<plugin>`**（如 `ios-dev:using-ios-dev`），沿 superpowers `using-superpowers` 先例，7 個 plugin 一致。

## 建議第一個 PR

先做 docs/spec，不動大量 skill：

- [x] 新增 `docs/spec/2026-07-08-codex-dual-publish.md`
- [x] 定義 shared vs platform-specific file ownership
- [x] 定義 Codex manifest / marketplace shape（含 `interface` 區塊：displayName / category / capabilities / logo 等 Claude manifest 沒有的欄位，superpowers 的 `.codex-plugin/plugin.json` 有完整範例）
- [x] 定義 dependency audit matrix（欄位定義 + 已驗證 seed rows；完整盤點仍在 migration tasks）
- [x] 定義 validation commands（三道 gate；確切指令實作時釘死）

## 後續 migration tasks（依拍板決策更新）

- [ ] Write the `.codex-plugin/plugin.json` generator (from `.claude-plugin/plugin.json` + `interface` overlay), generate all 7 manifests, and wire a CI drift check (mirror the validate-vendored pattern).
- [ ] Add `.agents/plugins/marketplace.json` for Codex local/dev marketplace installation.
- [ ] Move `skills/_vendored` → `plugins/<n>/vendor/` and `skills/_shared` → `plugins/solopreneur/shared/` — update `plugins/solopreneur/scripts/sync-vendored.sh`, `.github/workflows/{sync,validate}-vendored.yml`, 5 agent references, and 7 config.md references in the same change. Land AFTER the `$N escape` backlog todo (both touch sync-vendored.sh).
- [ ] Add Codex validation script for plugin manifests and skill directories.
- [ ] Add dependency matrix for plugin deps, skill deps, agents/subagents, MCP/apps, external CLIs, env vars, sandbox/network assumptions.
- [ ] Convert 6 Claude agents into Codex custom agent TOML (in-repo `.codex/agents/`) plus a bootstrap skill that installs them into `~/.codex/agents/`.
- [ ] Add one platform-neutral `using-<plugin>` router skill per plugin — router + usage guide, advisory delegation (implementation/multi-step → dispatch the agent; quick lookup → invoke the skill directly), no embedded skill list.
- [ ] Add a generated `docs/skills-catalog.md` (script + CI staleness check) listing every skill across plugins — platform-independent, can land before any Codex work.
- [ ] Pilot with `marketer`: install via local marketplace, then via git `@ref`; verify skill-triggered agent spawning actually works on Codex.
- [ ] Rewrite Claude-specific vocabulary in ~20 native skill files (actions, not tool names); add a per-harness mapping reference covering the ~13 vendored files.
- [ ] Extend `/release`: run the manifest generator inside the bump commit; keep a single CHANGELOG; no new tag namespace.
- [ ] Audit high-level workflow skills: `autopilot`, `greenlight`, `preview`, `mvp`, `tech-vetting`, `todos-*`.
- [ ] Add README install instructions for both Claude Code and Codex (document `@tag` pinning for Codex).

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
