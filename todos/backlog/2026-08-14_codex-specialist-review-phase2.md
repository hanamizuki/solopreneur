# Phase 2：specialist-review 的 Codex profile（拆兩個里程碑）

前置 Phase 1 已完成（PR #188 已合）：11 支 specialist knowledge skill 已發到
Codex，四個 plugin 各有 Codex package，child 讀得到 cache。**現在沒有阻擋。**

拆兩個里程碑的理由：specialist-review 有**兩個使用者**——使用者直接打指令，
以及 greenlight Phase 1 自動派工。後者價值更高但牽動 greenlight 的降級語意，
混在一起做會讓驗收失敗時分不清是誰的問題。

---

## 里程碑 A：`/specialist-review` 自己在 Codex 跑通

### A-1. Step 2.25 換成已驗收過的 reviewer ladder

現況（`skills/solopreneur/specialist-review/SKILL.md:59-84`）假設 Claude：
「直接嘗試 Agent dispatch，遇到 unknown-subagent-type 就 inline」。Codex 上
**四個 specialist agent 一個都不存在**（agent TOML 是 Phase 3），所以這段在
Codex 等於必定走 inline，等於白發了 Phase 1 的知識庫。

改成沿用 `plan-review/SKILL.md:32-38` 已驗收的階梯，**不要發明新機制**：

1. 有對應 custom agent 就用（目前四個都沒有）
2. 否則 built-in `explorer`，起手 `fork_turns="none"`
   （Codex 拒絕繼承完整 parent history 的具名 agent）
3. spawn 不了（depth limit 等）→ inline，並在報告標明降級；
   **絕不敘述一個沒發生的 dispatch**

### A-2. discovery 指示從 agent system prompt 搬進 dispatch prompt

`SKILL.md:111-113` 寫「Your subagent system prompt (`agents/<platform>-dev.md`)
lists curated skills」——`explorer` **沒有那份 system prompt**，這句在 Codex 上
是空指令，child 會兩手空空。

Codex 分支要改成明確叫 child 自己去 installed plugin cache 列出 `skills/` 並挑
3–5 支相關的。**路徑要 discover 不要寫死**：cache 形狀是
`$CODEX_HOME/plugins/cache/<marketplace>/<plugin>/<version>/skills/`，其中
`<marketplace>` 是使用者自己取的名字（現行 SKILL.md:82-84 已經有這條警告，
理由一樣）。Phase 1 的 A1/A4 已證實這個路徑讀得到、內容與 canonical 一致。

### A-3. Step 2.5 的 context7 偵測改 host-neutral

現況寫「via ToolSearch or by checking deferred tools list」——ToolSearch 是
Claude 專屬。context7 在 Codex 走 MCP 是可用的，偵測方式要改成不綁 harness。

### A-4. V1 明確不支援（寫進 limitations，不要假裝可用）

- **stack 偵測表有兩列在 Codex 永遠不會命中**：`*.css` → `designer`、
  `docs/gtm/` → `marketer`，因為那兩個 plugin 沒發 Codex（Hana 已裁決先不進）。
- **extended skill index** 未移植（`rebuild-skill-index` 是 Claude 專屬路徑），
  只走 curated discovery。
- `general-purpose` 路由（Python backend / Web frontend 兩列）在 Codex 的對應物
  是 built-in `explorer`，要講清楚。

### A-5. registry + spec

- `skills-compatibility.json` 加 `solopreneur:specialist-review` entry，形狀照
  `solopreneur:plan-review`（degraded ×3、include、limitations 指向新 spec）。
- 新 spec `docs/spec/2026-08-<dd>-codex-specialist-review.md`，A1–A4 照
  `docs/spec/2026-08-14-codex-specialist-skills.md` 的格式。

### A 的驗收（三個 surface 都要，且必須拿真 diff 跑）

沿用 Phase 1 已證明有效的手法：

- child **真的被建立**——rollout 有 `spawn_agent` ＋ child 的 `parent_thread_id`
  反指 parent。**不接受敘述**。
- child 報告裡引用的 skill 名稱與內容，能對回 cache 裡真實檔案（Phase 1 用
  「複述第 N 行」證明有讀，這裡可以要求 child 回報它讀了哪幾支 SKILL.md 的
  絕對路徑，再逐一核對存在且在 cache 底下）。
- specialist agent 不可用時，降級橫幅**有出現**，且沒有假裝派工。
- 真 diff 建議用 android 或 neo4j 的改動（那兩個 plugin 的知識庫最厚），
  才驗得出「有沒有真的用到 Phase 1 發的知識」。

### A 的結果（2026-08-14，已完成）

A-1～A-5 全部落地，三個 surface 都拿到真證據，紀錄在
`docs/spec/2026-08-14-codex-specialist-review.md`。registry 的 Codex
included 從 18 變 19。

實測改掉了兩處原本的設計假設：

- **`agent_type="explorer"` 是真的存在**（直接指示的 probe 拿到
  `agent_role: explorer` 的 child），但四次驗收 run 裡模型每次都只設
  `fork_turns="none"`、省略 `agent_type`。SKILL.md 因此寫成「偏好」而不是
  保證，唯讀邊界靠 sandbox ＋ prompt 撐。
- **降級橫幅本來掛在 parent 的彙總樣板上，App surface 會整段不寫**（skill-only
  的 turn 直接以 reviewer 的區段收尾）。改成由 reviewer 自己印在區段開頭後，
  三個 surface 都有橫幅。

---

## 里程碑 B：解鎖 greenlight 在 Codex 的 Phase 1

**先確認 A 綠了再開始。**

### 現況

greenlight 已發 Codex，但 profile 表（`greenlight/SKILL.md:49`）寫死：

> PR mode via `external` only. Codex can spawn subagents, but **Phase 1 and
> Phase 2 still depend on reviewer-specific agent definitions and routing
> coverage that are not shipped.**

所以 Codex 上的 greenlight 只跑 Phase 3，從不呼叫 specialist-review——這也是
它 registry `dependencies: []` 之所以誠實的原因。

### 要改什麼

- **sizing 語意**：M（預設）的 Phase 1 是 `/specialist-review` ＋
  `ponytail:ponytail-review`。ponytail 是**第三方 plugin、不在我們手上**，
  Codex 上大機率沒有。好消息是 greenlight 已有降級規則（`SKILL.md:1418-1420`）：
  「至少 1 支成功就進 Phase 2；全掛才跳過 Phase 1+2」——所以 specialist-review
  一支到位，M 檔位的 Phase 1 就能開始有東西，不需要等 ponytail。
- 更新 profile 表第 49 行的敘述（Phase 1 不再是全面不可用，而是「可用的子集」）。
- registry 的 `dependencies` 可以加 `solopreneur:specialist-review`
  （validator 要求 dependency 必須同 plugin ＋ 已 include，兩條都滿足）。
- L 檔位仍不可用（要 5 支 reviewer，其中 3 支是別人的 plugin 或 Claude 專屬）
  ——寫進 limitations。

### B 的驗收

- Codex 上跑 greenlight M 檔位，Phase 1 **真的派出 specialist-review**
  並拿回報告（不是敘述）。
- ponytail 缺席時，log 有記錄「哪支不可用、為什麼」，流程不中斷。
- 全部 reviewer 都不可用時，仍照原規則跳到 Phase 3，不會假裝跑過。

### B 的結果（2026-08-15，Codex exec 已驗收）

改動比預估小：Phase 1 的降級規則本來就 host-neutral（每支 reviewer 都
optional、≥1 成功就進 Phase 2），所以是**拿掉一刀切的 skip**，不是加機制。
證據與環境細節在 `docs/spec/2026-08-15-codex-greenlight-phase1.md`。

三條驗收裡兩條一次過、一條第一次沒過：

- **Phase 1 真的派出 specialist-review** ✅ child `01a0016e-fc15`，
  `agent_path: /root/phase1_specialist`、`depth: 1`、`parent_thread_id` 反指
  greenlight root，回報後 root 記「Phase 1 is clean」。
- **ponytail 缺席要有記錄** ❌→✅ 第一次跑整份 rollout 搜 `ponytail` **0 次
  命中**（只有展開的 skill 原文有）——流程沒斷，但缺席是靜默的。肇因是我寫的
  seam 說「run each **available** reviewer skill」，模型於是在派工前先過濾，
  而「記錄哪支不可用」那條規則是寫給**失敗**用的，從沒被嘗試的 row 觸發不到。
  共用規則與 seam 兩邊都補（`aefba26b`），第二次跑就報了兩次。
- **全掛時跳 Phase 3** ⏸ 未單獨驗——本次環境永遠有 specialist-review 可用。

順帶推翻／補充兩件事：

- **`agent_type` 這次模型自己設了**（child `agent_role: explorer`），是六次
  run 裡第一次沒被直接命令就設。仍不改變 A 段的結論——explorer 不是權限邊界。
- **驗收環境不能沿用 A 段那個乾淨盒子**：read-only sandbox 連網路一起擋，`gh`
  連不到 GitHub；拋棄式 HOME 拿不到 `claude auth status`，而 Codex host 的獨立
  gate 硬性要求它過，否則 `authority-boundary` 直接 halt。兩者各花掉一次 run。

TUI / App 未跑，spec 的 Limitations 有寫明不宣稱。

---

## 共通紀律（Phase 1 踩過的坑，不要重踩）

- **`skills/` 與 `src/` 是唯一手維護來源**；改完跑
  `scripts/generate-plugin-packages.sh`，**絕不手改 `plugins/`**。
- 新發佈的 skill 會被 validator 的 **frontmatter 嚴格 YAML 閘門**擋——
  Phase 1 新加的，理由見 `2026-08-14_codex-frontmatter-yaml-gate.md`。
- Codex **一旦 include 就三個 surface 都不能 unsupported**，所以 exec / TUI /
  App 三份驗收證據都得有，少一個就發不出去。
- 驗收要在**拋棄式 CODEX_HOME**跑，證明受測的是生成包而非本機既有安裝；
  隔離 home 要先 `mkdir`（不存在會直接 Error），auth 從
  `~/Agents/codex/builder/auth.json` 複製。
- 版本不 bump——`/release` 的事。
