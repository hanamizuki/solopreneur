# neo4j-cypher-skill

A Claude Code skill for generating, optimizing, and validating Cypher 25 queries against
Neo4j 2025.x and 2026.x databases. Covers the full Cypher language surface: reads, writes,
subqueries, batch operations, vector/fulltext search, quantified path patterns, and more.

## Prerequisites

- **Claude Code** (CLI or IDE extension)
- **Neo4j 2025.01+** (Cypher 25 parser required; some features need 2026.x — see Version Gates)
- A way to execute Cypher for schema inspection and EXPLAIN validation (any one of):
  - An MCP server connected to the target database
  - `cypher-shell` available in PATH
  - HTTP access to the Neo4j Query API v2 via `curl`

## Installation

```bash
cp -R neo4j-cypher-skill/ ~/.claude/skills/neo4j-cypher-skill/
```

## Usage

Invoke the skill in any Claude Code session:

```
/neo4j-cypher-skill
```

With a task:

```
/neo4j-cypher-skill Write a query to find all people within 3 hops of Alice who worked at the same company
```

```
/neo4j-cypher-skill Optimize this slow query: MATCH (n) WHERE n.email = $e RETURN n
```

```
/neo4j-cypher-skill Bulk-import 50k rows from a CSV into :Person nodes, handle errors gracefully
```

## What it covers

### Query generation
- Full Cypher 25 syntax with `CYPHER 25` prefix on every query
- Schema-first protocol: inspects labels, relationship types, properties, and indexes before writing
- Parameterized output by default (production-safe); literal values for teaching examples only
- Pre-flight decision protocol: draft queries with explicit assumptions when schema or version is unknown

### Read patterns
- `MATCH`, `OPTIONAL MATCH`, `WHERE`, `RETURN`, `WITH`, `ORDER BY`, `SKIP`/`LIMIT`
- `UNION` / `UNION ALL` with column alignment enforcement
- Subqueries: `EXISTS {}`, `COUNT {}`, `COLLECT {}`, `CALL (x) { }`, `OPTIONAL CALL`
- Quantified Path Expressions (QPEs): `(a)(()-[:R]->()){1,3}(b)` with match modes
- Shortest path: `MATCH SHORTEST 1 ...` (replaces deprecated `shortestPath()`)
- Pattern comprehensions: `[(n)-[:R]->(m) | m.name]`
- List comprehensions, predicate functions (`ANY`, `ALL`, `NONE`, `SINGLE`)

### Write patterns
- `CREATE`, `MERGE` (constrained-key-only rule enforced), `SET`, `DELETE`, `DETACH DELETE`, `REMOVE`
- Property update modes: `SET n = {}` (replace all) vs `SET n += {}` (merge additively)
- `FOREACH` for side-effect writes; `UNWIND` for readable batch processing
- `LOAD CSV` with header handling, type coercion, and `CALL IN TRANSACTIONS` for large files
- `CALL IN TRANSACTIONS` with `ON ERROR`, `REPORT STATUS`, and `CONCURRENT` batching

### Schema and indexes
- Schema inspection queries (`db.schema.visualization`, `nodeTypeProperties`, `relTypeProperties`)
- Vector search: `SEARCH` clause (Neo4j 2026.02.1 GA, node indexes only) + procedure fallback
- Fulltext search: `db.index.fulltext.queryNodes` / `queryRelationships`
- Dynamic labels: `SET n:$($expr)`, `MATCH (n) WHERE n:$($label)`
- Dynamic property keys: `n[$key]` bracket notation

### Performance and correctness
- Eager operator detection and fixes (collect-then-write pattern)
- Parallel runtime: `CYPHER runtime=parallel` for analytical workloads
- EXPLAIN/PROFILE workflow with Query API v2 curl fallback
- Index hint syntax: `USING INDEX`, `USING TEXT INDEX`
- Performance anti-patterns table with severity levels: `[ALWAYS]` / `[USUALLY]` / `[SITUATIONAL]`

### Language coverage
- Null handling, type predicates (`IS :: INTEGER NOT NULL`), `OrNull` casting variants
- Date/time: `date()`, `datetime()`, `localdatetime()`, `duration()`, truncation, arithmetic
- String functions, introspection functions (`labels()`, `type()`, `keys()`, `properties()`)
- Conditional expressions (`CASE WHEN`), aggregation grouping key rules
- 50+ Common Syntax Traps table (GQL-illegal clauses, SQL-isms, deprecated syntax)

## Version gates

| Feature | Min. version |
|---|---|
| `CYPHER 25`, QPEs, `CALL (x) {}` | 2025.01 |
| Dynamic labels `$($expr)`, `coll.sort()` | 2025.01 |
| `CONCURRENT TRANSACTIONS`, `REPORT STATUS` | 2025.01 |
| `SEARCH` clause (GA, node indexes only) | 2026.02.1 |

When the server version is unknown, the skill defaults to 2025.01-safe features only and labels
any 2026.x feature with `// requires Neo4j 2026.x+`.

## Query validation

The skill runs `EXPLAIN` before returning any write query. Three execution paths are supported:

```bash
# Query API v2 (no driver needed -- works on Aura and self-managed)
curl -X POST https://<instance>.databases.neo4j.io/db/<database>/query/v2 \
  -u neo4j:<password> \
  -H "Content-Type: application/json" \
  -d '{"statement": "EXPLAIN MATCH (n:Person {name: $name}) RETURN n", "parameters": {"name": "Alice"}}'

# Local instance
curl -X POST http://localhost:7474/db/neo4j/query/v2 \
  -u neo4j:<password> \
  -H "Content-Type: application/json" \
  -d '{"statement": "CALL db.schema.visualization() YIELD nodes, relationships RETURN nodes, relationships"}'
```

Prefix any statement with `EXPLAIN` to get the query plan without executing.

## What this skill does NOT cover

- Driver migration or version upgrade → use `neo4j-migration-skill`
- Database administration (user management, config, backups) → use `neo4j-cli-tools-skill`
- GQL clauses: `LET`, `FINISH`, `FILTER`, `NEXT`, `INSERT` are parse errors in Cypher 25

## Related skills

| Skill | Purpose |
|---|---|
| `neo4j-getting-started-skill` | Zero-to-app journey: provision, model, load, explore, build |
| `neo4j-migration-skill` | Upgrade Cypher syntax and drivers across major versions |
| `neo4j-cli-tools-skill` | DB administration via `neo4j-admin`, `cypher-shell`, Aura CLI |
