---
name: neo4j-cypher
description: Generates, optimizes, and validates Cypher 25 queries for Neo4j 2025.x
  and 2026.x. Use when writing new Cypher queries, optimizing slow queries, graph
  pattern matching, vector or fulltext search, subqueries, or batch writes. Covers
  MATCH, MERGE, CREATE, WITH, RETURN, CALL, UNWIND, FOREACH, LOAD CSV, SEARCH,
  expressions, functions, indexes, and subqueries. Not for driver migration or DB
  administration.
compatibility: Neo4j >= 2025.01 (safe baseline); Cypher 25
---

## When NOT to Use This Skill

- **Cypher and Driver code Migration** -> use `neo4j-migration-skill`
- **DB administration** -> use `neo4j-cli-tools-skill`
- **GQL-only clauses**: never emit `LET`, `FINISH`, `FILTER`, `NEXT`, `INSERT` -- use `WITH`, `RETURN`, `WHERE`, `CREATE`

---

## Pre-flight Decision Protocol

Answer these questions before generating any query. Follow the fallback action when the answer is unknown.

| Question | Known -> action | Unknown -> fallback |
|---|---|---|
| Schema (labels, rel-types, properties)? | Use directly; skip inspection | Run schema inspection queries OR produce a **draft** (see below) |
| Neo4j minor version? | Use version-appropriate features (see Version Gates) | Restrict to 2025.01 safe features only; omit anything marked `2026.x+` |
| Is this for production/application code? | Use `$parameters` always | Still use `$parameters` -- literals only for inline teaching examples |
| Is a Cypher execution tool available? | Use it for schema inspection AND `EXPLAIN`/`PROFILE` validation (MCP query tool, `cypher-shell`, or Query API v2 via `curl` all work -- see below) | State explicitly that the query is unvalidated |

**Schema-unknown fallback** -- when schema is unavailable, do NOT generate executable Cypher. Instead:

1. Run the schema inspection queries (see Schema-First Protocol), or
2. Ask the user to provide the schema, or
3. If the user explicitly asks for a structural sketch, provide a **non-executable pattern** outside a Cypher code block:

```
(<SOURCE_LABEL> {<KEY_PROPERTY>: $value})-[:<REL_TYPE>]->(<TARGET_LABEL>)
```

This is a placeholder sketch only -- not runnable Cypher. Never fill placeholders with guessed names (`:Person`, `:KNOWS`, `name`, etc.) even as defaults. Realistic-looking guesses are indistinguishable from authoritative schema and will be copied blindly.

**Rule**: if schema is completely unavailable and inspection is impossible, state that explicitly and ask for schema before writing any query.

---

## Non-Negotiable Defaults

Apply these before writing any query:

1. **`CYPHER 25` always** -- first token of every query; never repeat it after `UNION`/`UNION ALL` or inside subqueries
2. **Schema first** -- inspect schema before writing any Cypher statement; if schema is provided in the prompt, use it directly
3. **MERGE safety** -- for nodes `MERGE` on constrained key properties only; relationship `MERGE` only on already bound start and end nodes
4. **Label-free `MATCH (n)` is forbidden** unless the variable is already bound OR an immediate dynamic-label predicate follows: `MATCH (n) WHERE n:$($label)` is the only valid exception
5. **Comments use `//` only** -- `--` (SQL-style) is not valid Cypher
6. **`REPEATABLE ELEMENTS` / `DIFFERENT RELATIONSHIPS`** go immediately after `MATCH`, never at the end of the pattern
7. **`SHOW` commands**: `YIELD` must come before `WHERE`; cannot be combined with `UNION`
8. **Inline node predicates** (`(:Label WHERE prop = x)`) are only valid in a `MATCH` clause -- not in `WHERE` pattern expressions
9. **`WHERE` cannot follow bare `UNWIND`** -- use `WITH x WHERE` to filter after UNWIND
10. **Undirected relationships match both directions** -- `(a)-[:R]-(b)` finds connections in either direction and double-counts pairs; use directed `(a)-[:R]->(b)` unless direction is genuinely unknown
11. **`DETACH DELETE` for nodes** -- plain `DELETE n` throws if the node has relationships; use `DETACH DELETE n` to remove a node and its relationships atomically

---

## Style Conventions

| Element | Convention | Example |
|---|---|---|
| Node labels | PascalCase | `:Person`, `:VehicleOwner` |
| Relationship types | SCREAMING_SNAKE_CASE | `:KNOWS`, `:OWNS_VEHICLE` |
| Properties / variables | camelCase | `firstName`, `createdAt`, `person` |
| Clauses / keywords | UPPERCASE | `MATCH`, `WHERE`, `RETURN` |
| Boolean / null literals | lowercase | `true`, `false`, `null` |
| String literals | single-quoted | `'Alice'`; double only when string contains `'` |

One clause per line; 80-char soft limit; break long `WHERE` at `AND`/`OR`; chain patterns `(a)-->(b)-->(c)` rather than repeating variables.

> **Schema is the source of truth.** Label names (`:Person`), relationship types (`:KNOWS`), and property names (`name`) used throughout this skill are illustrative only. Never copy them into generated queries — always substitute the actual names from the inspected schema.

---

## Schema-First Protocol

**If schema is available in context** -- use it directly. Do NOT run inspection queries.

**If no schema information is available** -- load schema into context first:

```cypher
CALL db.schema.visualization() YIELD nodes, relationships RETURN nodes, relationships;
SHOW INDEXES YIELD name, type, labelsOrTypes, properties, state WHERE state = 'ONLINE' RETURN name, type, labelsOrTypes;
SHOW CONSTRAINTS YIELD name, type, labelsOrTypes, properties RETURN name, type, labelsOrTypes, properties;
SHOW PROCEDURES YIELD name RETURN split(name,'.')[0] as namespace, count(*) as procedures;
```

To inspect property types and which properties exist per label/rel-type:

```cypher
CALL db.schema.nodeTypeProperties()
YIELD nodeType, propertyName, propertyTypes, mandatory;
CALL db.schema.relTypeProperties()
YIELD relType, propertyName, propertyTypes, mandatory;
```

This reveals the stored type (`STRING`, `INTEGER`, `ZONED DATETIME`, etc.) -- critical for correct comparisons and casting.

**Vocabulary discipline**: never infer label/rel-type names from question wording. "company" != `:Company` -- always look up the actual label from the schema.

**Checklist** (validate against schema before returning any query):

- Node label `(n:Label)` exists
- Relationship type and direction `(:Source)-[:TYPE]->(:Target)` is correct
- Property `n.propName` is listed for that label or relationship type
- Any index or constraint referenced (e.g. for vector/fulltext search) exists and is ONLINE

---

## Output Mode

Default to **parameterized** mode for all generated queries -- prevents injection, enables plan caching, and produces production-ready code. Use literal values only for inline teaching examples or when explicitly asked for interactive exploration.

```cypher
// parametrized (default for all generated queries)
CYPHER 25 MATCH (n:Organization {name: $name}) RETURN n.name LIMIT 10
// parameters: {name: "Apple"}

// literal / interactive (teaching examples only)
CYPHER 25 MATCH (n:Organization {name: 'Apple'}) RETURN n.name LIMIT 10
```

**Validation workflow:**

1. Run `EXPLAIN` before any write -- catches syntax errors, wrong labels, missing indexes, required parameters without executing
2. For new read patterns, test with `LIMIT 1` first to confirm the pattern matches expected data
3. For writes, write the read half as `RETURN` first to verify what would be affected, then replace with `SET`/`CREATE`/`DELETE`
4. Use `PROFILE` to measure actual db hits; re-run after rewrites to compare
5. Red flags in EXPLAIN/PROFILE output: `AllNodesScan`, `CartesianProduct`, `NodeByLabelScan`, `Eager`

**Executing queries via the Query API v2** (works for both schema inspection and EXPLAIN -- no driver needed):

```bash
# Run any Cypher statement (schema inspection, EXPLAIN, reads, writes)
curl -X POST https://<instance>.databases.neo4j.io/db/<database|neo4j>/query/v2 \
  -u <username|neo4j>:<password> \
  -H "Content-Type: application/json" \
  -d '{"statement": "EXPLAIN MATCH (n:Person {name: $name}) RETURN n", "parameters": {"name": "Alice"}}'

# Local instance
curl -X POST http://localhost:7474/db/<database|neo4j>/query/v2 \
  -u <username|neo4j>:<password> \
  -H "Content-Type: application/json" \
  -d '{"statement": "CALL db.schema.visualization() YIELD nodes, relationships RETURN nodes, relationships"}'
```

Response: `200 OK` with `{"data": {"fields": [...], "values": [...]}}`. Prefix any query with `EXPLAIN` to get the plan without executing.

---

## Version Gates

When server version is unknown, restrict to 2025.01-safe features only. Do not use any `2026.x` feature without confirming the version first.

| Feature | Min. version | Fallback if older |
|---|---|---|
| `CYPHER 25` parser, QPEs, `CALL (x) {}` | 2025.01 | -- (no fallback; require 2025+) |
| Match modes: `DIFFERENT RELATIONSHIPS`, `REPEATABLE ELEMENTS` | 2025.01 | -- (Cypher 25 syntax; require 2025+) |
| Dynamic labels `$($expr)`, `coll.sort()` | 2025.01 | Use APOC or application-side logic |
| `CONCURRENT TRANSACTIONS`, `REPORT STATUS` | 2025.01 | Drop `CONCURRENT`; omit status reporting |
| `SEARCH` clause (node and relationship indexes) | 2026.01 | `CALL db.index.vector.queryNodes/queryRelationships(...)` |

---

## Core Patterns

### MERGE Safety

```cypher
// DO: MERGE on constrained key only; set other properties in ON CREATE / ON MATCH
CYPHER 25
MATCH (a:Person {id: $a}) MATCH (b:Person {id: $b})
MERGE (a)-[r:KNOWS]->(b)
  ON CREATE SET r.since = date()
  ON MATCH SET r.lastSeen = date()

// DON'T: MERGE on multiple non-constrained properties -- can create duplicates
// DON'T: MERGE a full path with unbound endpoints -- creates ghost nodes
// DON'T: MERGE key properties that are not in a constraint -- slow and creates duplicates
```

---

### Property Updates

`SET n = {}` **replaces all properties** (destructive). `SET n += {}` **merges** (additive -- unmentioned properties are preserved).

```cypher
// SET = replaces -- wipes all other properties not in the map
CYPHER 25
MATCH (n:Person {id: $id})
SET n = {name: $name, age: $age}         // every other property is removed

// SET += merges -- safe partial update
CYPHER 25
MATCH (n:Person {id: $id})
SET n += {name: $name}                   // other properties preserved

// Set individual property
SET n.updatedAt = datetime()

// Bulk import with parameter map -- set all map keys onto node
CYPHER 25
UNWIND $rows AS row
MERGE (n:Person {id: row.id})
SET n += row
```

---

### DELETE and REMOVE

```cypher
// DETACH DELETE -- removes node AND all its relationships
CYPHER 25
MATCH (n:TempNode {id: $id})
DETACH DELETE n

// DELETE relationship only
CYPHER 25
MATCH (a:Person {id: $a})-[r:KNOWS]->(b:Person {id: $b})
DELETE r

// Plain DELETE on a node with relationships -> runtime error; always DETACH DELETE nodes

// REMOVE a property (sets it absent -- not null, absent)
CYPHER 25
MATCH (n:Person {id: $id})
REMOVE n.nickname

// REMOVE a label
CYPHER 25
MATCH (n:Person {id: $id})
REMOVE n:VIPMember

// Remove ALL properties -- SET to empty map (REMOVE cannot do this)
CYPHER 25
MATCH (n:Person {id: $id})
SET n = {}
```

---

### WITH Scope and Aggregation

`WITH` defines a new scope. **Every variable not listed is dropped.** Use `WITH *` to carry all variables forward.

```cypher
// Variable 'b' dropped after WITH -- count(*) is correct here, count(b) would be a SyntaxError
CYPHER 25
MATCH (a:Person)-[:KNOWS]->(b:Person)
WITH a, count(*) AS friends         // 'b' is out of scope after this line
WHERE friends > 5
RETURN a.name, friends
ORDER BY friends DESC
```

`WITH` resets aggregation scope -- use it to filter on aggregates before further traversal:

```cypher
CYPHER 25
MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
WITH p, count(m) AS movieCount
WHERE movieCount > 3
MATCH (p)-[:KNOWS]->(f:Person)       // second MATCH uses filtered 'p'
RETURN p.name, f.name
```

**`count(*)` vs `count(expr)`**: `count(*)` counts all rows including nulls; `count(n)` counts only non-null values of `n`. Use `count(DISTINCT n.prop)` to deduplicate.

```cypher
MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
RETURN count(*) AS totalRows,           // all matched rows
       count(m.rating) AS ratedMovies,  // only rows where rating is not null
       count(DISTINCT m.genre) AS genres
```

**Aggregation grouping keys**: in any `RETURN` or `WITH` containing aggregation, every non-aggregating expression is implicitly a grouping key. All non-grouped variables are out of scope.

```cypher
// p.name is the grouping key; count(m) is the aggregate -- valid
MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
RETURN p.name, count(m) AS movies

// Multiple grouping levels -- chain WITH
CYPHER 25
MATCH (p:Person)-[:ACTED_IN]->(m:Movie)-[:IN_GENRE]->(g:Genre)
WITH g, count(DISTINCT p) AS actors, count(DISTINCT m) AS movies
RETURN g.name, actors, movies
ORDER BY movies DESC
```

---

### ORDER BY

`ORDER BY` is a sub-clause of `RETURN` or `WITH`. Key rules:

- **No `AS alias`** in ORDER BY items -- `ORDER BY n.prop DESC` (correct), `ORDER BY n.prop AS p DESC` (SyntaxError)
- **No `NULLS LAST` / `NULLS FIRST`** -- SQL syntax, not valid in Cypher; nulls sort last ascending / first descending by default
- **After aggregation**, sort by the **RETURN alias**, not the pre-aggregation variable

```cypher
// DO:
CYPHER 25
MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
RETURN p.name, count(m) AS movies
ORDER BY movies DESC, p.name ASC
LIMIT 10

// DON'T: p is out of scope after aggregating RETURN -- use the alias 'movies'
ORDER BY count(m) DESC   // count(m) not in scope after RETURN
```

---

### Conditional Expressions

**CASE WHEN** is the only branching expression. Two forms:

```cypher
// Generic CASE (if-elseif-else)
CYPHER 25
MATCH (n:Movie)
RETURN n.title,
  CASE
    WHEN n.rating >= 8 THEN 'great'
    WHEN n.rating >= 6 THEN 'good'
    ELSE 'skip'
  END AS verdict

// Simple CASE (switch on one expression)
RETURN n.status,
  CASE n.status
    WHEN 'A' THEN 'Active'
    WHEN 'I' THEN 'Inactive'
    ELSE 'Unknown'
  END AS label
```

**No `least()` / `greatest()`** -- SQL functions that do not exist in Cypher:
```cypher
// DO:
CASE WHEN a < b THEN a ELSE b END   // scalar minimum

// DON'T:
least(a, b)    // SyntaxError
```

**Conditional counting** -- `count(x WHERE ...)` is SQL syntax, not valid:
```cypher
// DO:
sum(CASE WHEN r.rating = 5 THEN 1 ELSE 0 END) AS fiveStarCount
COUNT { MATCH (r:Review) WHERE r.rating = 5 } AS fiveStarCount  // subquery form

// DON'T:
count(r WHERE r.rating = 5)    // SyntaxError
```

---

### Null Handling

`null` represents a missing/unknown value. Most expressions propagate `null`.

```cypher
// NEVER use = null or <> null -- they always return null, rows are filtered out
WHERE n.email IS NOT NULL     // correct
WHERE n.email = null          // always null, never matches

// coalesce() -- returns first non-null argument
RETURN coalesce(n.nickname, n.name) AS displayName
```

**NULL propagation key facts:**
- Arithmetic/comparison with `null` returns `null`
- Missing property access (`n.missingProp`) returns `null`
- `null = null` is `null` (not `true`)
- `WHERE` treats `null` as `false` -- rows with null predicates are filtered out
- `collect()` and aggregation functions **ignore** null values

---

### Type Coercion

Prefer **OrNull variants** over base casting -- they return `null` on unconvertible input instead of throwing:

```cypher
// Safe -- returns null if n.score is a STRING that can't be parsed
toIntegerOrNull(n.score)
toFloatOrNull(n.score)
toBooleanOrNull(n.flag)
toStringOrNull(n.value)
```

**Type predicates** (`IS :: TYPE`) for mixed-type properties:
```cypher
MATCH (n:Event)
WHERE n.value IS :: INTEGER NOT NULL   // true only for non-null INTEGER values
RETURN n.name, n.value
```

**DateTime vs date() mismatch**: `datetime_prop >= date('2025-01-01')` returns 0 rows -- use `.year` accessor or `datetime()` literals for `ZONED DATETIME` properties.

---

### List Expressions

```cypher
// List comprehension -- filter and/or transform
[x IN list WHERE x > 0]                    // filter only
[x IN list | x * 2]                        // transform only
[x IN list WHERE x > 0 | x * 2]           // filter + transform

// Predicate functions
ANY(x IN list WHERE x > 0)                 // true if at least one element matches
ALL(x IN list WHERE x > 0)                 // true if all elements match
NONE(x IN list WHERE x > 0)               // true if no element matches
SINGLE(x IN list WHERE x > 0)             // true if exactly one element matches

// Useful list functions
size(list)                                  // number of elements
head(list) / tail(list) / last(list)       // first / all-but-first / last element (null if empty)
list[0..3]                                  // slice (indices 0,1,2)
list + [newElement]                         // append
reverse(list)                               // reverse order
coll.sort(list)                             // sort (native Cypher 25; no APOC needed)
```

**Null in lists**: `2 IN [1, null, 3]` returns `null` (not `false`) -- null membership is unknown. Guard with `IS NOT NULL` before testing membership if the list may contain nulls.

**Pattern comprehension** -- traverse and collect in one inline expression; no separate MATCH clause needed:

```cypher
MATCH (n:Person {id: $id})
RETURN [(n)-[:KNOWS]->(f:Person) | f.name] AS friends,
       [(n)-[:ACTED_IN]->(m:Movie) WHERE m.year > 2020 | m.title] AS recentFilms
```

Use pattern comprehensions for simple one-hop inline collections. For multi-step traversals or complex filtering, prefer `COLLECT { MATCH ... RETURN ... }`.

---

### String Functions

```cypher
toLower(s) / toUpper(s)                    // case conversion (lower/upper are GQL aliases)
trim(s) / ltrim(s) / rtrim(s)             // strip whitespace; btrim(s, 'xy') strips custom chars
split(s, delimiter)                         // returns LIST<STRING>
substring(s, start, length)                // 0-indexed; length optional
left(s, n) / right(s, n)                   // first/last n characters
replace(s, search, replacement)            // replace all occurrences
size(s)                                     // character count (same as char_length)
reverse(s)                                  // reverse string
toString(x) / toStringOrNull(x)            // convert any type to STRING
```

All string functions return `null` when any argument is `null`.

---

### Introspection Functions

```cypher
labels(n)            // LIST<STRING> of all labels on node n
type(r)              // STRING relationship type name
keys(n)              // LIST<STRING> of property keys present on n or r
properties(n)        // MAP of all properties (use to copy: SET m = properties(n))
elementId(n)         // STRING internal ID (replaces deprecated id(n))
```

Common uses:

```cypher
// Check for a specific label
WHERE 'VIPMember' IN labels(n)

// Iterate over all properties dynamically
UNWIND keys(n) AS k
RETURN k, n[k]

// Copy all properties from one node to another
MATCH (src:Template {name: 'default'}), (dst:Entity {id: $id})
SET dst = properties(src)
```

---

### FOREACH vs UNWIND

| Use | When |
|---|---|
| `FOREACH (x IN list \| write-clause)` | Side-effect writes only -- no RETURN needed |
| `UNWIND list AS x` | Need to read, filter, or return list items |

`FOREACH` cannot be followed by `RETURN` or `WITH`. When in doubt, use `UNWIND`.

```cypher
// FOREACH -- side-effect only
CYPHER 25
MATCH p = (a:Person {name:'Alice'})-[:KNOWS*1..3]->(b:Person)
FOREACH (n IN nodes(p) | SET n.visited = true)

// UNWIND -- when you need to process and return
CYPHER 25
UNWIND $items AS item
WITH item WHERE item.active = true     // WHERE needs WITH after UNWIND
MERGE (n:Item {id: item.id})
  ON CREATE SET n.name = item.name
RETURN count(n) AS created
```

---

### OPTIONAL MATCH

Returns `null` columns for the optional pattern rather than eliminating the row entirely.

```cypher
// Nullable join -- keep person even if they manage no department
CYPHER 25
MATCH (p:Person {id: $id})
OPTIONAL MATCH (p)-[:MANAGES]->(d:Department)
RETURN p.name, d.name AS department    // d.name is null when no match

// Boolean check (does not null-pad rows) -- use EXISTS instead
RETURN p.name, EXISTS { (p)-[:MANAGES]->() } AS isManager
```

Use `OPTIONAL MATCH` when you need the matched node/relationship as a variable in later clauses. Do NOT chain multiple `OPTIONAL MATCH` clauses to build nested optional data -- each additional `OPTIONAL MATCH` fan-out multiplies row count; use `COLLECT {}` subqueries instead.

---

### UNION and UNION ALL

`UNION` deduplicates rows (slow for large sets). `UNION ALL` keeps all rows (fast). Both branches must return **identical column names and identical column count** -- any mismatch is a SyntaxError.

```cypher
CYPHER 25                              // prefix only on first branch
MATCH (n:Employee) RETURN n.name AS name, n.email AS email
UNION ALL
MATCH (n:Contractor) RETURN n.name AS name, n.email AS email

// DON'T: column count mismatch
MATCH (n:Employee) RETURN n.name, n.email
UNION ALL
MATCH (n:Contractor) RETURN n.name    // SyntaxError: 1 vs 2 columns
```

`SHOW` commands cannot be combined with `UNION`. `CYPHER 25` prefix applies to the whole combined query -- never repeat it on subsequent branches.

---

### Date and Time

```cypher
// Current temporal values
date()                               // DATE (e.g. 2025-11-03)
datetime()                           // ZONED DATETIME (with timezone)
localdatetime()                      // LOCAL DATETIME (no timezone)
localtime()                          // LOCAL TIME

// Parse from ISO 8601 string
date('2025-01-15')
datetime('2025-01-15T10:30:00')
datetime('2025-01-15T10:30:00+02:00')

// Duration literals
duration({days: 7, hours: 2})
duration('P7DT2H')

// Property accessors
n.birthDate.year / .month / .day
n.createdAt.hour / .minute / .second / .timezone

// Arithmetic
date() + duration({months: 3})        // add 3 months to today
duration.between(date1, date2)        // returns DURATION

// Truncate (round down to boundary)
date.truncate('month', date())        // first day of current month
datetime.truncate('day', datetime())  // midnight today
```

**Type selection rule:**
- `date()` for calendar dates only
- `datetime()` for event timestamps requiring timezone (most common)
- `localdatetime()` when timezone is irrelevant
- `ZONED DATETIME` properties must be compared with `datetime()` literals, NOT `date()` -- mixing types silently returns 0 rows

**Duration components**: `.years`, `.months`, `.days`, `.hours`, `.minutes`, `.seconds` -- never `.inDays`, `.inMonths`, `.inSeconds` (these do not exist).

---

### LOAD CSV

```cypher
// With headers -- column names become map keys
CYPHER 25
LOAD CSV WITH HEADERS FROM 'file:///persons.csv' AS row
MERGE (p:Person {id: toInteger(row.id)})
SET p.name = row.name, p.score = toFloat(row.score)

// Without headers -- access by index row[0], row[1] ...
LOAD CSV FROM 'file:///data.csv' AS row
RETURN row[0], row[1]

// Large files -- always wrap in CALL IN TRANSACTIONS
CYPHER 25
LOAD CSV WITH HEADERS FROM 'file:///large.csv' AS row
CALL (row) {
  MERGE (p:Person {id: row.id})
  SET p += row
} IN TRANSACTIONS OF 1000 ROWS ON ERROR CONTINUE
```

**Rules:**
- All CSV fields are `STRING` -- coerce explicitly: `toInteger()`, `toFloat()`, `date()`, `datetime()`
- Missing fields return `null`; guard with `coalesce(row.field, 'default')`
- `PERIODIC COMMIT` is deprecated -- use `CALL IN TRANSACTIONS` for large files
- `file:///` paths resolve relative to Neo4j's import directory; `https://` for remote URLs

---

### Subqueries

**Expression subqueries** (`EXISTS {}`, `COUNT {}`, `COLLECT {}`) auto-import outer variables -- no import clause needed:

```cypher
EXISTS { (a)-[:R]->(b) }                              // bare pattern (valid)
EXISTS { MATCH (a)-[:R]->(b) WHERE a.x > 0 }          // full statement (valid)
NOT EXISTS { (a)-[:R]->(b) }                          // negation (valid)
COUNT  { (a)-[:R]->(b) WHERE a.x > 0 }                // bare with WHERE (valid)
COUNT  { MATCH (n:Label) WHERE n.active = true }       // full statement (valid)
COLLECT { MATCH (a)-[:R]->(b) RETURN b.name }          // COLLECT: full MATCH+RETURN required
COLLECT { (a)-[:R]->(b) }                              // SYNTAX ERROR -- bare pattern invalid for COLLECT
```

`COLLECT {}` returns exactly one column -- `RETURN x`, never `RETURN x, y`.

`COUNT {}` vs `count()`: `COUNT { pattern }` counts subquery rows; `count(expr)` is an aggregation over the current row stream -- not interchangeable.

**`CALL` subqueries** -- outer variables are **NOT** auto-imported; must be declared explicitly:

```cypher
CYPHER 25
MATCH (p:Person)
CALL (p) {                          // explicit import -- 'p' available inside
  MATCH (p)-[:ACTED_IN]->(m:Movie)
  RETURN count(m) AS movieCount
}
RETURN p.name, movieCount

// CALL (*) imports all outer variables; CALL () imports nothing (isolated)
// CALL { WITH x ... } is deprecated -- always use CALL (x) { ... }
```

**When to use which subquery form:**

| Goal | Use |
|---|---|
| Boolean existence check | `EXISTS { (a)-[:R]->(b) }` |
| Count matching subgraph | `COUNT { (a)-[:R]->(b) }` |
| Collect related items into a list | `COLLECT { MATCH (a)-[:R]->(b) RETURN b.name }` |
| Nullable join (keep row when no match) | `OPTIONAL MATCH` (simple) or `OPTIONAL CALL` (complex) |
| Subquery with its own aggregation or writes | `CALL (x) { ... }` |

`OPTIONAL CALL` null-pads rows where the subquery finds no match (like `OPTIONAL MATCH`):

```cypher
CYPHER 25
MATCH (p:Person)
OPTIONAL CALL (p) {
  MATCH (p)-[:PLAYS_FOR]->(t:Team)
  RETURN t
}
RETURN p.name, t   // t is null when no team found
```

---

### Quantified Path Expressions (QPEs)

```cypher
// Reachability: 1-3 hops with relationship predicate
CYPHER 25
MATCH (start:Person {name: 'Alice'})
      (()-[rel:KNOWS WHERE rel.since > date('2024-01-01')]->(:Person)){1,3}
      (end)
WITH DISTINCT end
RETURN end.name

// Inner variables become lists -- access with list comprehension
CYPHER 25
MATCH (src:Person {name: 'Alice'})
      ((n:Person)-[:KNOWS]->()){1,3}(dst:Person)
RETURN [x IN n | x.name] AS via, dst.name AS reached
```

**Syntax rules:**
- Prefer `{1,}` over `+` and `{0,}` over `*` for maximum compatibility across versions
- Quantifier goes **outside** the group: `(pattern){N,M}` -- never `(pattern{N,M})`
- Groups must start AND end with a node -- never leave a dangling relationship at the end
- Bare quantifier on a relationship without a node group is a **syntax error**: `(a)-[:REL]-{2,4}-(b)` is WRONG -- use `(a)(()-[:REL]->()){2,4}(b)`

**Match modes** (go immediately after `MATCH`, never at end of pattern):

| Mode | Semantics | Quantifier |
|---|---|---|
| `DIFFERENT RELATIONSHIPS` | Default -- each relationship traversed at most once per path; nodes may be revisited | Any |
| `REPEATABLE ELEMENTS` | Nodes AND relationships may be revisited (cyclic walks) | Bounded `{m,n}` only |

**Path selectors** (go immediately after `MATCH`, before the pattern -- separate concept from match modes):

| Selector | Semantics |
|---|---|
| `SHORTEST 1` | One shortest path (non-deterministic if tied) |
| `ALL SHORTEST` | All shortest paths of equal minimum length |
| `ANY` | Any single path (no length guarantee) |
| `SHORTEST k GROUPS` | All paths grouped by length up to k distinct lengths |

```cypher
// SHORTEST 1 -- one shortest path
CYPHER 25 MATCH SHORTEST 1 (a:Person {name:'Alice'})(()-[:KNOWS]->()){1,}(b:Person {name:'Bob'})
RETURN b.name

// ANY -- any path (fast; no length guarantee)
CYPHER 25 MATCH ANY (a:Person {name:'Alice'})(()-[:KNOWS]->()){1,5}(b:Person {name:'Bob'})
RETURN b.name
```

Path selectors and match modes can be combined: `MATCH REPEATABLE ELEMENTS SHORTEST 1 ...`

```cypher
// DIFFERENT RELATIONSHIPS (default -- explicit for clarity)
CYPHER 25
MATCH DIFFERENT RELATIONSHIPS (a:Person)(()-[:KNOWS]->()){1,3}(b:Person)
RETURN a.name, b.name

// REPEATABLE ELEMENTS -- bounded {m,n} required
CYPHER 25 MATCH REPEATABLE ELEMENTS
  (a:Account)(()-[:TRANSACTED_TO]->()){3,3}(b:Account)
WHERE a.id <> b.id
RETURN a.id, b.id, count(*) AS walks

// DON'T -- REPEATABLE ELEMENTS with unbounded quantifier is a SYNTAX ERROR
MATCH REPEATABLE ELEMENTS (a)(()-[:R]->()){1,}(b)
```

---

### Dynamic Labels and Properties (Cypher 25)

**Dynamic labels** -- use `$(<expr>)` where the expression evaluates to a `STRING` or `LIST<STRING>`:

```cypher
// Filter by dynamic label
CYPHER 25
MATCH (n)
WHERE n:$($label)
RETURN n

// Set label dynamically (string expression)
CYPHER 25
MATCH (n:Pending)
SET n:$(n.category)     // e.g. category = 'Invoice' -> adds :Invoice label

// Multi-label from a list parameter
CYPHER 25
MATCH (n {id: $id})
SET n:$($labels)        // $labels = ['Active', 'Verified']
```

**Dynamic property keys** -- use bracket notation; dot notation with a param is a syntax error:

```cypher
// Read dynamic key
CYPHER 25
MATCH (n:Config)
RETURN n[$key]          // $key = 'timeout' -> returns n.timeout

// Write dynamic key
CYPHER 25
MATCH (n:Config {id: $id})
SET n[$key] = $value

// DON'T: dot notation with parameter is a syntax error
SET n.$key = $value     // SyntaxError
```

**Copying properties between elements** -- use `properties()` to copy; direct assignment copies a node/rel reference, not its properties:

```cypher
// DO: copy all properties from relationship to node
SET n = properties(r)

// DON'T: assigns the relationship object, not its properties
SET n = r               // TypeError
```

---

### SEARCH Clause (Vector Search -- Neo4j 2026.01+)

`SEARCH` supports both node and relationship binding variables. The index type must match the binding variable type.

```cypher
// Node vector index
CYPHER 25
MATCH (c:Chunk)
SEARCH c IN (VECTOR INDEX news FOR $embedding LIMIT 10)
SCORE AS score
WHERE score > 0.8
RETURN c.text, score
ORDER BY score DESC

// Relationship vector index (binding variable is a relationship)
CYPHER 25
MATCH (a)-[r:REVIEWED]->(b)
SEARCH r IN (VECTOR INDEX review-embeddings FOR $embedding LIMIT 10)
SCORE AS score
RETURN r.text, score

// Procedure fallback (pre-2026.01) -- nodes:
CYPHER 25 CALL db.index.vector.queryNodes('news', 10, $embedding) YIELD node AS c, score RETURN c.text, score

// Procedure fallback (pre-2026.01) -- relationships:
CYPHER 25 CALL db.index.vector.queryRelationships('review-embeddings', 10, $embedding)
YIELD relationship AS r, score RETURN r.text, score

// Fulltext -- always use procedure regardless of version:
CYPHER 25 CALL db.index.fulltext.queryNodes('entity', $query) YIELD node, score RETURN node.name, score LIMIT 20
```

SEARCH syntax: binding variable only (not `(c)`), `LIMIT` inside parens, `SCORE AS` after closing paren, `WHERE`/`RETURN` after `SCORE AS`.

---

### CALL IN TRANSACTIONS (write batching only)

The input stream (`MATCH` or `UNWIND`) must be **outside** the subquery -- filtering inside collapses everything into one transaction.

```cypher
// Basic batch update
CYPHER 25
MATCH (c:Customer)
CALL (c) {
  SET c.flag = 'done'
} IN TRANSACTIONS OF 1000 ROWS
RETURN count(c)

// With error handling and status reporting
CYPHER 25
LOAD CSV WITH HEADERS FROM 'file:///data.csv' AS row
CALL (row) {
  MERGE (p:Person {id: row.id})
    ON CREATE SET p.name = row.name
} IN TRANSACTIONS OF 500 ROWS
  ON ERROR CONTINUE
  REPORT STATUS AS s
WITH s WHERE s.errorMessage IS NOT NULL
RETURN s.transactionId, s.errorMessage

// Parallel batches (4 concurrent inner transactions)
CYPHER 25
UNWIND $rows AS row
CALL (row) {
  MERGE (:Movie {id: row.id})
} IN 4 CONCURRENT TRANSACTIONS OF 10 ROWS
  ON ERROR CONTINUE
```

`IN TRANSACTIONS` comes **after** the `{ }` block. Never use for reads -- requires auto-commit transaction.

**ON ERROR options**: `FAIL` (default, stops on error) | `CONTINUE` (skip failed batch) | `BREAK` (stop after first error, keep prior commits) | `RETRY FOR N SECS [THEN ...]`

**REPORT STATUS fields**: `started`, `committed`, `transactionId`, `errorMessage` (null on success)

---

## Common Syntax Traps

| Invalid | Correct |
|---|---|
| `ORDER BY n.prop AS alias DESC` | `ORDER BY n.prop DESC` -- `AS` not allowed in ORDER BY |
| `ORDER BY n.score DESC NULLS LAST` | `ORDER BY n.score DESC` -- NULLS LAST is SQL, not Cypher |
| `ORDER BY preAggVar` after aggregating RETURN | Use the RETURN alias: `RETURN count(m) AS cnt ORDER BY cnt` |
| `count(r WHERE r.rating = 5)` | `sum(CASE WHEN r.rating = 5 THEN 1 ELSE 0 END)` |
| `collect(x ORDER BY y)` | Preceding `ORDER BY y` clause, or `COLLECT { MATCH ... RETURN x ORDER BY y }` |
| `rank() OVER (PARTITION BY ...)` | Not valid -- use `collect({v:v}) AS ranked UNWIND range(0, size(ranked)-1) AS idx` |
| `UNWIND list AS x WHERE x > 5` | `UNWIND list AS x WITH x WHERE x > 5` |
| `FOREACH ... RETURN` | Use `UNWIND` when you need RETURN |
| `least(a,b)` / `greatest(a,b)` | `CASE WHEN a < b THEN a ELSE b END` |
| `-- SQL comment` | `// Cypher comment` |
| `FILTER x IN list WHERE ...` | `[x IN list WHERE ...]` list comprehension (FILTER is GQL, illegal) |
| `LET x = expr` | `WITH expr AS x` (LET is GQL, illegal) |
| `INSERT (p:Person {name:'A'})` | `CREATE (p:Person {name: 'A'})` (INSERT is GQL, illegal) |
| `shortestPath((a)-[*]->(b))` | `SHORTEST 1 (a)(()-[]->()){1,}(b)` |
| `allShortestPaths((a)-[*]->(b))` | `ALL SHORTEST (a)(()-[]->()){1,}(b)` |
| `id(n)` | `elementId(n)` |
| `[:REL*1..5]` | `(()-[:REL]->()){1,5}` |
| `CALL { WITH x ... }` | `CALL (x) { ... }` |
| `apoc.coll.sort(list)` | `coll.sort(list)` -- native Cypher 25 built-in |
| `n.dateProp >= date('2025-01-01')` on ZONED DATETIME | Use `.year` accessor or `datetime()` literal |
| `duration.between(d1,d2).inDays` | `duration.between(d1,d2).days` -- `.inDays` does not exist |
| `WHERE n.x = null` | `WHERE n.x IS NULL` |
| `WHERE n.x <> null` | `WHERE n.x IS NOT NULL` |
| `MATCH (n:A) MATCH (m:A)` without join predicate | Causes CartesianProduct -- add `WHERE` join condition |
| `COLLECT { (a)-[:R]->(b) }` | `COLLECT { MATCH (a)-[:R]->(b) RETURN b }` -- bare pattern invalid |
| `COLLECT { MATCH ... RETURN x, y }` | `COLLECT {}` must return exactly one column |
| `min()` / `max()` as scalar in `range()` | Use `CASE WHEN size(l) < 3 THEN size(l)-1 ELSE 2 END` -- `min()`/`max()` are aggregations |
| `(a)-[:REL]-{2,4}-(b)` bare quantifier | Wrap in node group: `(a)(()-[:REL]->()){2,4}(b)` |
| `MATCH REPEATABLE ELEMENTS ... {1,}` | `REPEATABLE ELEMENTS` requires bounded `{m,n}` -- `{1,}` is unbounded |
| `MATCH ... ANY (pattern){n}` | `ANY` is a path selector, not a match-mode alias -- `MATCH ANY (a)(()-[:R]->()){1,5}(b)` is valid syntax meaning "any single path" |
| `2 IN [1, null, 3]` expecting `false` | Returns `null` -- null membership is unknown; guard source list with IS NOT NULL |
| `CALL { WITH x MATCH ... }` | `CALL (x) { MATCH ... }` -- importing WITH is deprecated |
| `SET n = r` (copy rel to node) | `SET n = properties(r)` -- direct assignment transfers the element reference, not its properties |
| `n.$key` dynamic property | `n[$key]` -- bracket notation required; dot notation with a parameter is a SyntaxError |
| `MATCH (n) SET n:$label` (bare string) | `SET n:$($label)` -- dynamic label requires `$()` wrapper around the expression |
| `DELETE n` on node with relationships | `DETACH DELETE n` -- plain DELETE throws `Cannot delete node, still has relationships` |
| `SET n = {key: val}` for partial update | `SET n += {key: val}` -- `=` replaces ALL properties; `+=` merges additively |
| `(a)-[:R]-(b)` expecting one direction | Returns matches in both directions; use `(a)-[:R]->(b)` or `WHERE elementId(a) < elementId(b)` to deduplicate |
| `RETURN DISTINCT a, b` deduplicates `a` | `RETURN DISTINCT` deduplicates complete rows, not individual columns |
| `CALL IN TRANSACTIONS` inside an explicit transaction | Requires auto-commit session -- driver must not wrap it in `beginTransaction()` |
| `PERIODIC COMMIT` in LOAD CSV | Deprecated -- use `LOAD CSV ... CALL (...) { } IN TRANSACTIONS OF N ROWS` |
| `toInteger(null)` throws | `toIntegerOrNull(null)` returns `null` safely; always prefer OrNull variants at system boundaries |

---

## Performance Anti-Patterns

Severity: **[ALWAYS]** fix unconditionally. **[USUALLY]** fix unless you have a confirmed reason not to (small data, controlled environment). **[SITUATIONAL]** profile first.

| Anti-Pattern | Severity | Problem | Fix |
|---|---|---|---|
| `MATCH (n)` label-free | [ALWAYS] | AllNodesScan | Add label: `MATCH (n:Person)` |
| `MATCH ()-[r]->()` label-free rel | [ALWAYS] | Full rel scan | `MATCH (n:User)-[r:POSTS]->()` |
| Assumed stored GDS props (`n.pageRank`) | [ALWAYS] | Property doesn't exist unless `.write` ran | Stream via `.stream` procedure |
| `CONTAINS`/`ENDS WITH` without a text index | [ALWAYS] | Range index does not support these operators; causes full label scan | Create a text index: `CREATE TEXT INDEX idx FOR (n:Label) ON (n.prop)`, then query normally with optional `USING TEXT INDEX` hint |
| `MATCH (u)-[:R]->(t1), (u)-[:R]->(t2) WHERE t1 <> t2` | [USUALLY] | O(n²) pairs | `collect(t) AS items WHERE size(items) >= 2` |
| `UNWIND list AS a UNWIND list AS b WHERE a <> b` | [USUALLY] | O(n²) pairs | `LIMIT` before pairing, or sample `list[0..10]` |
| Chained `OPTIONAL MATCH` for nested optional data | [USUALLY] | Fan-out multiplies row count | `COLLECT { MATCH (a)-[:R]->(b) RETURN b }` |
| `LIMIT` only at final `RETURN` | [USUALLY] | Full traversal runs before limit | Push `WITH n LIMIT 100` before expensive joins |
| Cartesian product (two MATCHes, no join condition) | [USUALLY] | Multiplies all rows | Add join predicate in `WHERE` |

**Text indexes vs fulltext indexes** -- two different index families:

| Index type | Supports | Created with | Queried with |
|---|---|---|---|
| Text index | `CONTAINS`, `ENDS WITH` (planner-backed) | `CREATE TEXT INDEX idx FOR (n:Label) ON (n.prop)` | Standard `WHERE` clause + optional hint |
| Fulltext index | Lucene-style tokenized search with scoring | `CREATE FULLTEXT INDEX idx FOR (n:Label1\|Label2) ON EACH [n.prop1, n.prop2]` | `CALL db.index.fulltext.queryNodes('idx', $query)` |

```cypher
// Text index -- planner uses it for CONTAINS / ENDS WITH
CREATE TEXT INDEX person_bio FOR (n:Person) ON (n.bio)
MATCH (n:Person) USING TEXT INDEX n:Person(bio) WHERE n.bio CONTAINS $s RETURN n

// Fulltext index -- Lucene tokenized search, multi-label, multi-property, returns score
CREATE FULLTEXT INDEX entity FOR (n:Person|Company) ON EACH [n.name, n.description]
CALL db.index.fulltext.queryNodes('entity', $query) YIELD node, score
RETURN node.name, score ORDER BY score DESC LIMIT 20

// Range index hint (equality / range predicates)
MATCH (n:Person) USING INDEX n:Person(email) WHERE n.email = $email RETURN n
```

**EXPLAIN / PROFILE**: red flags are `AllNodesScan`, `CartesianProduct`, `NodeByLabelScan`, `Eager`. For analytics over large sets, use parallel runtime:

```cypher
CYPHER 25 runtime=parallel
MATCH (n:Article)
RETURN count(n), avg(n.sentiment)
```

Confirm with EXPLAIN -- header must show `Runtime PARALLEL`. Write queries silently ignore this hint. Only useful for large analytical scans (full label scans, high-fanout aggregations) -- adds overhead for OLTP short-hop lookups.

### Eager Operator

`Eager` materializes the **entire** intermediate result set in memory before the next operator starts. It blocks streaming and causes heap pressure at scale. The planner inserts it automatically to prevent write-then-read conflicts within a single query.

**Triggers** (patterns that force Eager):

| Pattern | Why Eager appears |
|---|---|
| `MATCH (n:A) ... MERGE (:A {...})` | MERGE on same label as MATCH could read its own writes |
| `UNWIND list MERGE (a:X) MERGE (b:X)` | Two MERGEs on same label in one row |
| `MATCH (n:A) CREATE (m:A)` | CREATE on same label as MATCH |
| `FOREACH (x IN list \| CREATE (:A))` | Write inside FOREACH visible to outer read |

**Fix: split reads from writes**

```cypher
// BEFORE -- triggers Eager (MERGE on same label as MATCH)
MATCH (u:User {status: 'active'})
MERGE (u)-[:HAS_SESSION]->(s:Session {id: randomUUID()})

// AFTER -- collect first, then write
CYPHER 25
MATCH (u:User {status: 'active'})
WITH collect(u) AS users
UNWIND users AS u
MERGE (u)-[:HAS_SESSION]->(s:Session {id: randomUUID()})
```

```cypher
// BEFORE -- two MERGEs on same label triggers double Eager
CYPHER 25
UNWIND $pairs AS pair
MERGE (a:Person {id: pair.a})
MERGE (b:Person {id: pair.b})
MERGE (a)-[:KNOWS]->(b)

// AFTER -- CALL IN TRANSACTIONS isolates writes per batch
CYPHER 25
UNWIND $pairs AS pair
CALL (pair) {
  MERGE (a:Person {id: pair.a})
  MERGE (b:Person {id: pair.b})
  MERGE (a)-[:KNOWS]->(b)
} IN TRANSACTIONS OF 500 ROWS
```

---

## Failure Recovery

- **0 results**: verify params non-null and correctly typed; remove `WHERE` predicates one by one; check label/rel-type spelling against schema; EXPLAIN to confirm index is used
- **TypeErrors**: use `toIntegerOrNull()` / `toFloatOrNull()` rather than base casting; guard with `IS NOT NULL`
- **Variable out of scope after WITH**: any variable not listed in `WITH` is dropped -- use `count(*)` not `count(droppedVar)`
- **Timeouts**: EXPLAIN -> fix AllNodesScan/CartesianProduct -> add early `LIMIT` -> switch to `CALL IN TRANSACTIONS OF 1000 ROWS`
- **DateTime mismatch**: `ZONED DATETIME >= date('2025-01-01')` returns 0 rows -- use `.year` accessor or `datetime()` literal
- **Duration total days**: use `dur.years * 365 + dur.months * 30 + dur.days`; `.inDays` / `.inMonths` / `.inSeconds` do **not** exist on `DURATION`
- **`Cannot delete node, still has relationships`**: replace `DELETE n` with `DETACH DELETE n`
- **`Type mismatch: expected Map but was Node`**: `SET n = r` copies a node/rel reference; use `SET n = properties(r)` to copy the property map
- **`Cannot merge node using null property value`**: a MERGE key property resolved to null -- validate params are non-null before the query
- **`Variable 'x' not defined`**: variable was either dropped by a `WITH` that didn't list it, or is inside a `CALL` subquery that didn't import it with `CALL (x) { ... }`
- **`IndexNotFoundError`**: vector/fulltext index name is wrong or index is offline; run `SHOW INDEXES YIELD name, state WHERE state <> 'ONLINE'` to diagnose

---

## WebFetch

Fetch docs proactively when syntax is uncertain -- don't wait until stuck:

| Need | URL |
|---|---|
| Clause semantics | `https://neo4j.com/docs/cypher-manual/25/clauses/{clause}/` |
| Function signatures | `https://neo4j.com/docs/cypher-manual/25/functions/{type}/` |
| Path / QPE details | `https://neo4j.com/docs/cypher-manual/25/patterns/` |
| Full syntax reference | `https://neo4j.com/docs/cypher-cheat-sheet/25/all/` |

High-priority pages: `merge/`, `with/`, `order-by/`, `subqueries/`, `search/`, `aggregating/`
