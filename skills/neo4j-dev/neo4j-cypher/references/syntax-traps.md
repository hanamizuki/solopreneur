# Common Syntax Traps

Load this when debugging a syntax error or validating a query before returning it.

| Invalid | Correct |
|---|---|
| `ORDER BY n.prop AS alias DESC` | `ORDER BY n.prop DESC` — `AS` not allowed in ORDER BY |
| `ORDER BY n.score DESC NULLS LAST` | `ORDER BY n.score DESC` — NULLS LAST is SQL, not Cypher |
| `ORDER BY preAggVar` after aggregating RETURN | Use the RETURN alias: `RETURN count(m) AS cnt ORDER BY cnt` |
| `count(r WHERE r.rating = 5)` | `sum(CASE WHEN r.rating = 5 THEN 1 ELSE 0 END)` |
| `collect(x ORDER BY y)` | Preceding `ORDER BY y` clause, or `COLLECT { MATCH ... RETURN x ORDER BY y }` |
| `rank() OVER (PARTITION BY ...)` | Not valid — use `collect({v:v}) AS ranked UNWIND range(0, size(ranked)-1) AS idx` |
| `UNWIND list AS x WHERE x > 5` | `UNWIND list AS x WITH x WHERE x > 5` |
| `FOREACH ... RETURN` | Use `UNWIND` when you need RETURN |
| `least(a,b)` / `greatest(a,b)` | `CASE WHEN a < b THEN a ELSE b END` |
| `-- SQL comment` | `// Cypher comment` |
| `FILTER x IN list WHERE ...` | `[x IN list WHERE ...]` — `FILTER` clause exists (Cypher 25 / 2025.06) but is not a list-comprehension form |
| `LET x = expr` | `LET` clause valid in Cypher 25 (Neo4j 2025.06+); on older versions use `WITH expr AS x` |
| `INSERT (p:Person {name:'A'})` | `INSERT` is a Cypher 25 synonym for `CREATE` (Neo4j 2025.06+) but multi-labels must use `&` not `:` and dynamic labels/types are not supported; on older versions use `CREATE (p:Person {name: 'A'})` |
| `shortestPath((a)-[*]->(b))` (still valid) | Prefer `SHORTEST 1 (a)(()-[]->()){1,}(b)` |
| `allShortestPaths((a)-[*]->(b))` (still valid) | Prefer `ALL SHORTEST (a)(()-[]->()){1,}(b)` |
| `id(n)` | `elementId(n)` |
| `[:REL*1..5]` (still valid) | Prefer `(()-[:REL]->()){1,5}` |
| `CALL { WITH x ... }` | `CALL (x) { ... }` — importing WITH is deprecated |
| `apoc.coll.sort(list)` | `coll.sort(list)` — native Cypher 25 built-in |
| `n.dateProp >= date('2025-01-01')` on ZONED DATETIME | Use `.year` accessor or `datetime()` literal |
| `duration.between(d1,d2).inDays` (error) or `.days` for total days | `duration.inDays(d1,d2).days` — total days; `.days` alone is component (Jan 1 → Mar 15 = 14) |
| `WHERE n.x = null` | `WHERE n.x IS NULL` |
| `WHERE n.x <> null` | `WHERE n.x IS NOT NULL` |
| `MATCH (n:A) MATCH (m:A)` without join predicate | Causes CartesianProduct — add `WHERE` join condition |
| `COLLECT { (a)-[:R]->(b) }` | `COLLECT { MATCH (a)-[:R]->(b) RETURN b }` — bare pattern invalid |
| `COLLECT { MATCH ... RETURN x, y }` | `COLLECT {}` must return exactly one column |
| `min()` / `max()` as scalar in `range()` | Use `CASE WHEN size(l) < 3 THEN size(l)-1 ELSE 2 END` — these are aggregations |
| `(a)-[:REL]-{2,4}-(b)` bare quantifier | Wrap in node group: `(a)(()-[:REL]->()){2,4}(b)` |
| `MATCH REPEATABLE ELEMENTS ... {1,}` | `REPEATABLE ELEMENTS` requires bounded `{m,n}` |
| `2 IN [1, null, 3]` expecting `false` | Returns `null` — guard source list with IS NOT NULL |
| `SET n = r` (copy rel to node) | `SET n = properties(r)` — direct assignment transfers element reference |
| `n.$key` dynamic property | `n[$key]` — dot notation with parameter is SyntaxError |
| `MATCH (n) SET n:$label` (bare string) | `SET n:$($label)` — dynamic label requires `$()` wrapper |
| `DELETE n` on node with relationships | `DETACH DELETE n` — plain DELETE throws if node has relationships |
| `SET n = {key: val}` for partial update | `SET n += {key: val}` — `=` replaces ALL properties |
| `(a)-[:R]-(b)` expecting one direction | Returns matches in both directions — use `(a)-[:R]->(b)` |
| `RETURN DISTINCT a, b` deduplicates `a` | `RETURN DISTINCT` deduplicates complete rows, not individual columns |
| `CALL IN TRANSACTIONS` inside an explicit transaction | Requires auto-commit session |
| `PERIODIC COMMIT` in LOAD CSV | Deprecated — use `LOAD CSV ... CALL (...) { } IN TRANSACTIONS OF N ROWS` |
| `toInteger(null)` throws | `toIntegerOrNull(null)` returns `null` safely |
