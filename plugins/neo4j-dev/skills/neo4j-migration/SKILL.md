---
name: neo4j-migration
description: Use when upgrading Neo4j drivers or Cypher queries from older versions
  (4.x, 5.x) to 2025.x/2026.x. Handles driver upgrades for .NET, Go, Java,
  Javascript, and Python, as well as Cypher syntax migration to Cypher 25.
allowed-tools: WebFetch
---

# Neo4j migration skill

This skill uses online guides to upgrade old Neo4j codebases and Cypher queries. It handles all official Neo4j drivers and Cypher syntax migration.

## When to use

Use this skill when:
- a user asks to upgrade a Neo4j driver in languages: .NET, Go, Java, Javascript, Python
- a user wants to upgrade Cypher queries from 4.x or 5.x syntax to 2025.x/2026.x (Cypher 25)

## When NOT to use this skill

- **Writing new Cypher queries** → use `neo4j-cypher-skill`
- **Database administration or CLI tasks** (backup, restore, import, cypher-shell) → use `neo4j-cli-tools-skill`
- **Starting a new Neo4j project from scratch** → use `neo4j-getting-started-skill`

## Instructions

1. At the beginning, ALWAYS ask a user what Neo4j version is going to be used after the upgrade. Note, the Neo4j database's version is not upgraded as part of this skill, we just need that information
    a) If the user says that most recent, fetch the version from the [supported version list](https://neo4j.com/developer/kb/neo4j-supported-versions/) along with the most recent driver version
    b) Otherwise, analyze the [supported versions list](https://neo4j.com/developer/kb/neo4j-supported-versions/) and choose the most recent driver version for given Neo4j version

2. Analyze the codebase in order to determine what additional documentation to include, focus only on dependencies' files (e.g. `package.json`, `requirements.txt`, `pom.xml` etc.). If the codebase uses Neo4j driver for:
    - .NET then include [.NET migration guide](references/dotnet-driver.md)
    - Go then include [Go migration guide](references/go-driver.md)
    - Java then include [Java migration guide](references/java-driver.md)
    - Javascript/Node.JS then include [Javascript migration guide](references/javascript-driver.md)
    - Python then include [Python migration guide](references/python-driver.md)

Important: when you plan the upgrade, always include replacement of deprecated functions in the plan

---

## Cypher Query Migration (4.x / 5.x → Cypher 25)

1. Ask the user what target Neo4j version will be used after the upgrade
2. Scan the codebase for Cypher query strings (look in `.cypher` files, string literals in driver code, OGM/SDN `@Query` annotations, etc.)
3. Apply these substitutions to every query found:

| Old syntax | Cypher 25 replacement |
|---|---|
| `[:REL*1..5]` | `-[:REL]-{1,5}` |
| `[:REL*]` | `-[:REL]-{1,}` |
| `shortestPath((a)-[*]->(b))` | `SHORTEST 1 (a)(()-[]->()){1,}(b)` |
| `allShortestPaths((a)-[*]->(b))` | `ALL SHORTEST (a)(()-[]->()){1,}(b)` |
| `id(n)` | `elementId(n)` |
| `CALL { WITH x ... }` | `CALL (x) { ... }` |
| `-- SQL comment` | `// Cypher comment` |
| `CALL db.index.vector.queryNodes(...)` | `SEARCH n IN (VECTOR INDEX idx FOR $emb LIMIT k) SCORE AS score` (2026.01+; keep procedure for older) |

4. Prepend `CYPHER 25` to every query
5. Fetch the migration guide for any syntax not covered above:
   `https://neo4j.com/docs/cypher-manual/25/deprecations-additions-removals-compatibility/`
