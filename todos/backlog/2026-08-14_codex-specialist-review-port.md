# 把 specialist-review 移植到 Codex

目標：讓 `$solopreneur:specialist-review` 在 Codex 上是**真的** stack-aware review，
而不是掛著專家名字的泛用審查。

## 已查證的事實

### child 讀得到 plugin cache（2026-08-14 實測，可收掉 journal §13 的 open item）

Codex CLI 0.147.0，`read-only` sandbox，cwd 在 worktree，目標檔在 `$CODEX_HOME`
（**workspace 之外**）：

- parent thread `019ffbda-ceef-7292-9bc6-7732f3ef2d08` 有真正的 `spawn_agent`
  （`agent_type="explorer"`、`fork_turns="none"`）與 `wait_agent`
- child rollout `019ffbda-ec3d-7f80-bb0d-659ea937b324` 的 `parent_thread_id`
  反指回 parent，是真 depth-1 child，不是敘述
- child 回傳指定行**逐字吻合**、總行數吻合

結論：**custom agent TOML 不是移植前提**。built-in `explorer` 加上 prompt 裡的
discovery 指示就能讀到 skill 內容。

### 真正的擋路石是 skill 本身沒發

Codex marketplace 目前只發 `solopreneur` 一個 plugin：

| plugin | 總 skill | Codex 已發 |
|---|---:|---:|
| ios-dev | 26 | 0 |
| android-dev | 38 | 0 |
| ai-engineer | 3 | 0 |
| neo4j-dev | 4 | 0 |
| designer | 10 | 0 |
| marketer | 8 | 0 |
| solopreneur | 17 | 7 |

先寫 agent TOML 會做出四個沒有知識庫的專家——child 讀得到 cache，但 cache 裡沒東西。

### skill-index 是選用增強，不是必要條件

`src/ios-dev/agents/ios-dev.md:110` 把 extended index 路徑寫死成
`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur/skill-index/ios.md`，是 Claude 專屬
路徑。但那個 index 是使用者用 `/rebuild-skill-index` 自建的產物，**不是** plugin 內容；
agent md 本身也寫明檔案不存在時「proceed with curated list + built-in knowledge，
do not block」。

所以 Codex V1 走 curated 路線即可：child 直接讀 installed plugin cache 裡的 skill 目錄。
host-aware 的 index 路徑與 `rebuild-skill-index` 移植留到之後，不擋這條。

## 依賴順序

```
Phase 1  發 specialist 的知識型 skills      ← 真正的前提
Phase 2  specialist-review 的 Codex profile
Phase 3  agent TOML                        ← 優化，不是前提
```

## Phase 1：發知識型 specialist skills

範圍：4 個 specialist plugin，排除 `asc-*`（22 支）與 `gplay-*`（16 支）兩個
release-automation 家族——那些會真的打 App Store Connect / Google Play API，
side effect 要各自驗收，且 review 用不到。

共 **33 支**：

| plugin | 支數 | skills |
|---|---:|---|
| ios-dev | 4 | `apple-design`、`ios-app-templates`、`ios-patterns`、`iphone-apps` |
| android-dev | 22 | `accessibility`、`agp-9-upgrade`、`android-patterns`、`architecture`、`compose-navigation`、`compose-performance-audit`、`compose-ui`、`coroutines`、`data-layer`、`edge-to-edge`、`gradle-build-performance`、`gradle-logic`、`jetpack-compose`、`kotlin-concurrency-expert`、`migrate-xml-views-to-jetpack-compose`、`mobile-android-design`、`navigation-3`、`play-billing-library-version-upgrade`、`r8-analyzer`、`testing`、`viewmodel`、`xml-to-compose-migration` |
| ai-engineer | 3 | `ai-app-templates`、`langgraph`、`senior-prompt-engineer` |
| neo4j-dev | 4 | `neo4j-cli-tools`、`neo4j-cypher`、`neo4j-cypher-guide`、`neo4j-migration` |

### 先做 side-effect triage，不要整包放行

33 支全是 `shared` shape，但 **shared 是維護形狀、不是安全結論**
（`docs/spec/2026-08-09-codex-skill-portability.md`：support status is independent
of source shape）。初掃已看到會執行東西的：

- `neo4j-dev/neo4j-cypher`、`ai-engineer/senior-prompt-engineer` 帶 `scripts/`
- `neo4j-dev/neo4j-cli-tools`（`neo4j-admin` / `cypher-shell` / `aura`）、
  `neo4j-dev/neo4j-cypher`（`CREATE` / `MERGE` / `DELETE`）、
  `ios-dev/iphone-apps`（`xcodebuild` / `xcrun`）有 mutating fence

review 的 child 只**讀**這些檔，不執行；但一旦 include，Codex 使用者就能直接
invoke。所以每支要各自判定 `full` / `degraded`，會動遠端或本機狀態的要在 SKILL.md
標清邊界。

### 這階段會踩到的結構問題

- 這 4 個 plugin 目前沒有任何 Codex package root。第一支 include 會讓 generator
  新建 `plugins/codex/<plugin>/`，並讓 Codex marketplace 從 1 個 plugin 變 5 個。
- `.codex-plugin/plugin.json` 需要 `scripts/codex-manifest-overlays.json` 補
  interface 欄位（displayName / category / capabilities），目前只有 solopreneur 有。
- 大多數是 vendored skill（`src/<plugin>/vendor/`）。要確認 `sync-vendored.sh`
  重跑後 Codex package 不會 drift——這是 CI drift gate 會抓、但值得先想的。

### 驗收

- registry validator 通過，included 數字對得上
- `scripts/tests/test-codex-filtered-publication.sh` 的斷言更新
- 乾淨 CODEX_HOME 裝得到 5 個 plugin，且每個 plugin 只含 include set
- explorer child 從 cache 讀到其中一支 skill 的 byte-level 內容（沿用上面那個 probe 手法）

## Phase 2：specialist-review 的 Codex profile

沿用 `plan-review/SKILL.md:32-38` 已驗收過的 reviewer ladder，不發明新機制：

1. 有對應 custom agent 就用（目前只有 `marketer`）
2. 否則 built-in `explorer`，`fork_turns="none"`
3. spawn 不了（depth limit 等）就 inline，並在報告標明降級

必要改動：

- **discovery 指示要從 agent system prompt 搬進 dispatch prompt**。現在 Step 3 的
  template 寫「Your subagent system prompt (`agents/<platform>-dev.md`) lists curated
  skills」——`explorer` 沒有那份 system prompt，這句在 Codex 上是空指令。改成明確叫
  child 去 installed plugin cache 列出 `skills/` 並挑 3–5 支相關的。
- Step 2.25 的「plugin not installed → 泛用審查」橫幅保留，Codex 上語意不變。
- context7 在 Codex 可用（MCP），Step 2.5 的偵測方式要改成不依賴 Claude 的 ToolSearch。

### V1 明確不支援（寫進 limitations）

- extended skill index（`rebuild-skill-index` 未移植）→ 只走 curated discovery
- `general-purpose` / `marketer` / `designer` 這幾個 stack 的路由（Phase 1 沒發
  designer / marketer 的 skills）

### 驗收

三個 surface 都要，且必須拿真 diff 跑：

- child **真的被建立**（rollout 有 `spawn_agent` + child `parent_thread_id`），不接受敘述
- child 報告裡引用的 skill 名稱與內容，能對回 cache 裡真實檔案
- specialist agent 不可用時，降級橫幅有出現，且沒有假裝派工

## Phase 3：agent TOML（優化）

4 支 `ios-dev` / `android-dev` / `ai-engineer` / `neo4j-dev` 的 TOML，照
`src/marketer/agents/marketer.toml`（25 行）的形狀。這階段才需要處理：

- Codex plugin 帶不了 agent → 靠 `codex-agents-bootstrap` 安裝，使用者多一步
- agent md 裡的 `CLAUDE_CONFIG_DIR` skill-index 路徑要 host-aware
  （比照 PR #158/#161 的 config home 處理）

沒有 Phase 3 也能有 Phase 2 的完整 review 契約——這是 Phase 1 實驗證明的。

## 開放問題

- Phase 1 的 33 支要不要拆成多個 PR？android-dev 22 支自己就佔三分之二。
- `designer` / `marketer` 的 skills 要不要一起發？發了 specialist-review 的
  stack 偵測表才能完整覆蓋（`*.css` → designer、`docs/gtm/` → marketer）。
- `r8-analyzer` 引用的 script 曾在 PR #178 出過「upstream 說要跑但沒 vendored」的
  問題，發之前要確認現在是完整的。
