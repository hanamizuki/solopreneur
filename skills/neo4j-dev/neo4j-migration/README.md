# neo4j-migration-skill

Skill for upgrading Neo4j driver code and Cypher queries from older versions (4.x, 5.x) to Neo4j 2025.x / 2026.x.

**Covers:**
- **Cypher 25 migration**: `elementId()` replaces `id()`, `SHORTEST 1` replaces `shortestPath()`, `SHORTEST k` / QPP patterns replace variable-length paths, `SHOW INDEXES` → `SHOW VECTOR INDEXES` etc.
- **Driver API changes** across all five official drivers:
  - Python: `neo4j-driver` package deprecated → use `neo4j`; `execute_query` patterns; Python ≥ 3.10
  - JavaScript/TypeScript: v6 breaking changes, integer handling, `executeQuery`
  - Java: `ExecutableQuery` fluent API, reactive API changes
  - .NET: `ExecuteReadAsync`/`ExecuteWriteAsync`, async patterns
  - Go: v6 `ExecuteQuery`, generic helpers
- **Deprecated Cypher functions**: `id()`, `shortestPath()`, `allShortestPaths()`, `genai.vector.*`, `labels()` usage patterns
- **Relational-to-graph migration**: entity/junction/lookup table patterns, FK→relationship mapping
- Step-by-step migration checklist per driver

**Version / compatibility:**
- Source: Neo4j 4.x / 5.x
- Target: Neo4j 2025.x / 2026.x (Cypher 25)

**Not covered:**
- Writing new Cypher queries → `neo4j-cypher-skill`
- Driver usage patterns (post-migration) → `neo4j-driver-*-skill`

**Install:**
```bash
npx skills add https://github.com/neo4j-contrib/neo4j-skills --skill neo4j-migration-skill
```

Or paste this link into your coding assistant:
https://github.com/neo4j-contrib/neo4j-skills/tree/main/neo4j-migration-skill
