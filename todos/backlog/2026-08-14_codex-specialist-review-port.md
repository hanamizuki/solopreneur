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

## Phase 1 grading 結果（2026-08-14，33 支全數評完）

標準沿用：**模型不可靠回憶的資訊才算數**（版本 pin、新 API 文件、裝置/專案 bug 機制）；
通用 best-practice 出局。以下是建議清單，正式裁決待 Hana。

### 建議發佈（17 支）

- **android-dev（12）**
  - Tier B：`agp-9-upgrade`、`navigation-3`、`edge-to-edge`、`viewmodel`、
    `r8-analyzer`（發前先驗 PR #178 的 script 完整性）、
    `play-billing-library-version-upgrade`、`migrate-xml-views-to-jetpack-compose`
  - Tier C：`android-patterns`（逐檔定案見下）
  - Tier D（程序價值，進不進 V1 待裁決）：`compose-performance-audit`、
    `kotlin-concurrency-expert`、`gradle-build-performance`、`testing`
- **ios-dev（1）**：`ios-patterns`（C；iOS 18 keyboard-toolbar 首次 focus bug ＋
  safeAreaInset workaround、`JSONDecoder .iso8601` 不吃小數秒的 flexible decoder、
  Form/List 展開 reflow fix、zh-Hant 日期 template 規則）
- **ai-engineer（1）**：`senior-prompt-engineer`（D；3 支 stdlib scripts 只讀
  prompt 檔、寫本機 JSON，無網路/DB）
- **neo4j-dev（3）**：`neo4j-cypher`（B，全場最強：2025.01–2026.06 version gates、
  DISJOINT BY/SEARCH/ACYCLIC 含 fallback、neo4j#13519）、`neo4j-migration`（B，
  driver 5→6 五語言 removed-API 表、版本相容矩陣）、`neo4j-cli-tools`（B，
  neo4j-cli 是 2025/26 新工具鏈；破壞性指令自帶 AGENT GATE）

### 不發（16 支）

- **Tier A 模型已知（9）**：android `compose-ui`、`architecture`、`data-layer`、
  `accessibility`、`jetpack-compose`、`mobile-android-design`、`coroutines`、
  `xml-to-compose-migration`；ios `apple-design`（WWDC 原則的 **web 平台**譯本
  ——CSS/Pointer Events/Framer Motion，對 Swift review 錯域；若要留位置應屬 designer）
- **有害（3）**：android `gradle-logic`、`compose-navigation`（先前已判）；
  **新增 ai-engineer `langgraph`**——兩處教「`interrupt()` 不回傳值」，官方 v1 文件
  明文相反（"The resume payload becomes the return value of the interrupt function"，
  docs.langchain.com/oss/python/langgraph/interrupts；canonical 範例就是
  `answer = interrupt(...)`）；「NEVER ADD A CHECKPOINTER」無條件化會弄壞非
  Platform 部署的 HITL（interrupt 需要 checkpointer，官方範例 compile 時掛
  InMemorySaver）；model pin 全是 2024 舊款（claude-3-5-sonnet-20241022 / gpt-4o /
  gemini-1.5-pro）。另 provenance 未追蹤：2026-04-26 PR #11 bundle 進來、無
  `_VENDOR.md`、不在 manifest。
- **License 阻擋（1）**：`neo4j-cypher-guide`——upstream tomasonjo/blogs 無 LICENSE
  （manifest 記 Unspecified），不可再發佈；內容亦被 `neo4j-cypher` 全面涵蓋
  （elementId/QPP/COLLECT subqueries/null-sort，第 5 組 overlap）
- **範本/框架類，review 用不到（3）**：`ios-app-templates`、`ai-app-templates`
  （in-house scaffold catalog，同 asc-*/gplay-* 的排除理由；Claude 端照留）、
  `iphone-apps`（taches 的 interactive intake 框架＋約 9,500 行 curriculum，19 個
  ref 有 9 個零版本錨點，iOS 26 內容太稀薄；若之後要 iOS 版本知識，抽 delta 進
  `ios-patterns` 比整包發划算）

### android-patterns 逐檔定案（9 refs：留 5 砍 4）

- 留：`bottomsheet-scroll`、`date-format-localization`（先前已判）、
  `swipe-to-dismiss-transparent`（讀 dismissDirection 的誘人錯解首幀閃爍——機制級）、
  `compose-preview-overview`（Vico 2.1.0+ pin、discussion #795、Paparazzi 下
  runBlocking deadlock caveat）、`compose-preview-debugging`（quirk 集：
  LocalWindowInfo=0、Vico 拒空 series、Layoutlib 中 snapshotFlow 永久 suspend）
- 砍：`compose-ripple-clipping`（先前已判）、`compose-preview-solutions`
  （internal-implementation 是通用 pattern＋大量專案碼；其 quirk 已在他檔）、
  `compose-preview-charts`（純通用 preview best practice）、`scaffold-bottom-nav`
  （inset 消耗是文件化 API 語義；只有「sheet 高度 >~85% 觸發全螢幕動畫」值得
  救回 SKILL.md 一行）
- **修正先前判斷**：「9 refs 全無版本錨點」不成立——preview 三檔有 Vico
  2.1.0/2.2.1 pin 與 issue 連結。真正無錨點的是 bottomsheet-scroll /
  date-format / scaffold / swipe 四檔，其 Compose/M3 版本仍只有 Hana 能補。

### Side-effect verdicts（handoff 指定要補的）

| skill | scripts | mutating fence | 判定 |
|---|---|---|---|
| `neo4j-cypher` | `define_schema.py`/`import_neo4j_schema.py` 離線；`generate_schema.py` 連 live DB 但唯讀（無 CREATE/MERGE/DELETE，單一 `execute_query` 做 introspection） | 教學含寫入語法；SKILL.md 自帶 write gate（EXPLAIN→等確認） | 可發 |
| `neo4j-cli-tools` | 無 | `neo4j-admin restore`/`load` 破壞性；文內已有 AGENT GATE ＋ `--rw` write gate | 可發，邊界已標 |
| `senior-prompt-engineer` | 3 支 stdlib，本機讀寫而已 | 無 | 可發 |
| `iphone-apps` | 無 | xcodebuild/xcrun/simctl（本機 build） | 已不發，moot |

### 附帶事實

- PR #179 只動 `_VENDOR.md` sync metadata，與 skills-compatibility 式發佈不衝突；
  只有 Claude 端真刪 android skill 目錄才會撞它。
### 裁決（2026-08-14，Hana）

1. 4 支 android D-tier **先不進** V1。
2. 5 組 overlap **照建議**（一組留一支）。
3. Claude 端**同步清**有害 3 支 → **PR #183**（`chore/remove-harmful-skills`：
   刪 skill 目錄、vendor manifest 去對映、agent md / README / marketplace 掃引用、
   compatibility registry + frozen baseline 縮集合並重釘 SHA、plugins/ 重生成；
   validator 103 支、46/46 tests 過）。合併後 **PR #179 會 conflict**（動到已刪
   兩支的 `_VENDOR.md`）——close 掉讓下輪 sync 對縮小後的 manifest 重跑即可。
4. designer / marketer **先不進** Phase 1。
5. PR #182 先合否：未裁決，維持 open。

**Phase 1 發佈清單定案（13 支）**：

- android-dev（8）：`agp-9-upgrade`、`navigation-3`、`edge-to-edge`、`viewmodel`、
  `r8-analyzer`（發前先驗 PR #178 script 完整性）、`play-billing-library-version-upgrade`、
  `migrate-xml-views-to-jetpack-compose`、`android-patterns`
- ios-dev（1）：`ios-patterns`
- ai-engineer（1）：`senior-prompt-engineer`
- neo4j-dev（3）：`neo4j-cypher`、`neo4j-migration`、`neo4j-cli-tools`

## Phase 1 執行結果（2026-08-14）→ PR #188

**實際發出 11 支**，非 13。Codex marketplace 1 個 plugin → 5 個，included 7 → 18。
spec：`docs/spec/2026-08-14-codex-specialist-skills.md`（A1–A4 全過，
Codex CLI 0.147.0、拋棄式 CODEX_HOME、受測的是生成包）。

- `r8-analyzer` 的 PR #178 疑慮**已解**：現行 SKILL.md 不引用任何 script，純知識。
- 少掉的 2 支是 `neo4j-migration` / `neo4j-cli-tools`——**不是判斷改變，是踩到缺陷**：
  它們裝得上 Codex 但永遠不會被列出（`skills/list` 靜默略過）。根因是 description
  多行 plain YAML scalar 的續行含 `": "`，嚴格解析當成巢狀 mapping key。Claude
  loader 寬鬆所以一直沒人發現。全 repo 只有 3 支這樣（第三支 `ai-app-templates`
  是自家的、沒發 Codex）。詳見 `todos/backlog/2026-08-14_codex-frontmatter-yaml-gate.md`。
- 已加閘門：validator 現在拒絕發佈 frontmatter 解不開的 skill（stdlib 實作、
  與 PyYAML 在 103 支上交叉比對一致、做過負向測試）。
- 新增已知限制：裝上這些 plugin 後 Codex 會截斷 skill description（context
  budget），全部仍可列出可讀，但這是「發越多、discovery 品質越差」的實際代價——
  之後要擴大 include set 前值得先秤。

**下一步**：Phase 2（specialist-review 的 Codex profile）現在沒有阻擋了。
