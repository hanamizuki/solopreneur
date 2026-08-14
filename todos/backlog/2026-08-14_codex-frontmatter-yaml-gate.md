# 三支 skill 的 frontmatter 過不了嚴格 YAML

2026-08-14 Phase 1 的 A4 驗收發現：Codex 嚴格解析 frontmatter，解不開就**靜默**
不列出該 skill（裝得起來、但 `skills/list` 沒有它、也沒有任何錯誤訊息）。
Claude Code 的 loader 寬鬆，所以這缺陷在 Claude 端一直看不出來。

## 根因

`description` 是多行 **plain**（未加引號）scalar，續行裡出現 `": "`：

```yaml
description: Migrates Neo4j driver code and Cypher queries from older versions
  Also handles Cypher syntax migration: QPE paths, CALL subqueries, ...
```

嚴格 YAML 會把 `migration: QPE paths...` 讀成巢狀 mapping key，報
`mapping values are not allowed here`。

## 受影響（全 repo 掃描，103 支中的 3 支）

| skill | 來源 | 現況 |
|---|---|---|
| `neo4j-dev:neo4j-migration` | vendored（`neo4j-contrib/neo4j-skills`） | 已從 Phase 1 發佈集移除 |
| `neo4j-dev:neo4j-cli-tools` | vendored（同上） | 已從 Phase 1 發佈集移除 |
| `ai-engineer:ai-app-templates` | **in-house** | 未發佈到 Codex，不擋事；但同樣壞 |

兩支 neo4j 都是 grading 判定「值得發」的（B 級版本事實），純粹被這個缺陷卡住。

## 已經做的

`scripts/validate-skills-compatibility.py` 加了閘門：任何 `publication.codex`
= include 的 skill，frontmatter 解不開就 CI 失敗，訊息指出行號與原因。
實作是 stdlib（repo 不帶 YAML 依賴，連 tomli 都自帶），已與 PyYAML 在 103 支上
交叉比對，結果完全一致；並做過負向測試確認會咬人。

## 待決定：怎麼修那兩支 vendored

1. **上游 PR**（最乾淨）：把 description 改成 quoted 或 block scalar（`>-`），
   送 `neo4j-contrib/neo4j-skills`。修好後下一次 sync 自動生效。
2. **generator 端正規化**：產 Codex 包時重新序列化 frontmatter、把 description
   正確引號化。能擋所有未來的 vendored 破損，但會破壞「cache 與 canonical
   byte-identical」這條現行驗收保證，要一併改驗收語意。
3. 兩者都做：先送上游解眼前，正規化當長期防線。

`ai-app-templates` 是自家檔，直接改就好（一行），但它沒發 Codex，優先度低。

## 驗證方式

```bash
python3 - <<'PY'
import pathlib, yaml
for p in sorted(pathlib.Path("skills").glob("*/*/SKILL.md")):
    try: yaml.safe_load(p.read_text().split("---",2)[1])
    except Exception as e: print(p, "→", str(e).split("\n")[0])
PY
```

修好後把該 skill 加回 `skills-compatibility.json`（entry 形狀照
`neo4j-dev:neo4j-cypher`，degraded + WebFetch limitation），跑 generator、
validator、publication fixture，並補一次 A4 確認 `skills/list` 真的看得到。
