---
name: neo4j-migration
description: Migrates Neo4j driver code and Cypher queries from older versions (4.x, 5.x)
  to current (2025.x/2026.x, Cypher 25). Covers Python, JavaScript/Node.js, Java, .NET,
  and Go drivers — package renames, removed APIs, version requirements, diff-ready fixes.
  Also handles Cypher syntax migration: QPE paths, CALL subqueries, id() → elementId(),
  PERIODIC COMMIT → CALL IN TRANSACTIONS, and all Cypher 25 removals.
  Does NOT write new Cypher queries — use neo4j-cypher-skill.
  Does NOT cover DB administration or server ops — use neo4j-cli-tools-skill.
  Does NOT provision new Neo4j instances — use neo4j-getting-started-skill.
allowed-tools: WebFetch Bash
version: 1.0.1
---

## When to Use
- Upgrading driver dependency from 4.x or 5.x to 6.x
- Migrating Cypher queries to Cypher 25 syntax
- Fixing deprecated API warnings after a driver or Neo4j version bump
- Auditing a codebase for removed/deprecated Neo4j APIs before upgrading

## When NOT to Use
- **Writing new Cypher queries** → `neo4j-cypher-skill`
- **DB admin** (backup, restore, import, cypher-shell) → `neo4j-cli-tools-skill`
- **Starting fresh** → `neo4j-getting-started-skill`
- **GDS algorithm migration** — not covered here; consult GDS release notes

---

## Entry Criteria

Before starting, ask:
1. **Target Neo4j version** — needed to select Cypher dialect and driver version
2. **Languages in use** — scan `package.json`, `requirements.txt`, `pom.xml`, `*.csproj`, `go.mod`
3. **Current driver versions** — read from dependency files; do NOT guess

If target is >= 2025.06: ask whether Cypher 5 or Cypher 25 dialect will be used (both supported; Cypher 25 is the new default).

---

## Step 1 — Scan Codebase

```bash
# Find Cypher strings (queries embedded in source)
grep -rn "MATCH\|MERGE\|CREATE\|CALL\|RETURN" --include="*.py" --include="*.js" \
  --include="*.ts" --include="*.java" --include="*.cs" --include="*.go" \
  --include="*.cypher" --include="*.cql" . | grep -v ".git"

# Find dependency files
find . -name "requirements*.txt" -o -name "package.json" -o -name "pom.xml" \
  -o -name "*.csproj" -o -name "go.mod" | grep -v ".git" | grep -v node_modules
```

Collect findings before modifying anything. List all deprecated patterns found.

---

## Step 2 — Cypher Migration (4.x / 5.x → Cypher 25)

Apply to every Cypher string, `.cypher` file, OGM/SDN `@Query` annotation, and template literal.

### Complete Substitution Table

| Old syntax | Cypher 25 replacement | Notes |
|---|---|---|
| `[:REL*1..5]` | `(()-[:REL]->()){1,5}` | QPE quantifier group |
| `[:REL*]` | `(()-[:REL]->()){1,}` | Unbounded QPE |
| `[:REL*0..5]` | `(()-[:REL]->()){0,5}` | Zero-hop allowed |
| `shortestPath((a)-[*]->(b))` | `SHORTEST 1 (a)(()-[]->()){1,}(b)` | QPE shortest path |
| `allShortestPaths((a)-[*]->(b))` | `ALL SHORTEST (a)(()-[]->()){1,}(b)` | QPE all-shortest |
| `id(n)` | `elementId(n)` | Returns string, not int |
| `CALL { WITH x ... }` | `CALL (x) { ... }` | Explicit import syntax |
| `PERIODIC COMMIT` | `CALL (...) { ... } IN TRANSACTIONS OF 1000 ROWS` | Batched writes |
| `-- comment` | `// comment` | SQL comment invalid |
| `SET n = r` (structural val) | `SET n = properties(r)` | Extract map first |
| `MERGE (a {x:1})-[:T]->(b {x:a.x})` | Rewrite — cross-entity MERGE refs disallowed | Split into MATCH+MERGE |
| `CREATE INDEX ... OPTIONS { indexProvider: ... }` | Remove `indexProvider` from OPTIONS | Provider selection removed |
| `db.create.setVectorProperty(...)` | Use native VECTOR property type | Procedure removed |
| `dbms.upgrade()` / `dbms.upgradeStatus()` | Use `cypher-shell :sysinfo` | Procedures removed |
| `USE composite.'1'` | `` USE `composite.1` `` | Backtick entire qualified name |
| `RETURN 1 as my$Identifier` | `` RETURN 1 as `my$Identifier` `` | `$` removed from unescaped ids |

### Vector Index Queries (version-branched)

| Version | Syntax |
|---|---|
| Neo4j < 2026.01 | `CALL db.index.vector.queryNodes(idx, k, $emb) YIELD node, score` |
| Neo4j >= 2026.01 | `SEARCH n IN (VECTOR INDEX idx FOR $emb LIMIT k) SCORE AS score` |

### Cypher Dialect Prefix Rule

- Target >= 2025.06, dialect = Cypher 25: prepend `CYPHER 25` to every top-level query
- Target >= 2025.06, dialect = Cypher 5: prepend `CYPHER 5` (keeps deprecated forms working)
- Target 4.x or 5.x: no prefix needed; fetch changelog per [references/cypher-queries.md](references/cypher-queries.md)

### `id(n)` → `elementId(n)` Caveats

`elementId()` returns a string (e.g., `"4:abc123:0"`), not an integer. Fix downstream code that stores or compares it as `int`. Do NOT use `elementId()` values for numeric operations.

```diff
- WHERE id(n) = $nodeId   # $nodeId was integer
+ WHERE elementId(n) = $nodeId  # $nodeId must now be string
```

---

## Step 3 — Driver Migration

Pick the section(s) matching languages found in Step 1.

---

### Python Driver (5.x → 6.x)

**Min requirements**: Python >= 3.10, `neo4j` package (6.0+, released Jan 12 2026)

#### Package Rename — do this first

```diff
# requirements.txt
- neo4j-driver>=5.0.0
+ neo4j>=6.0.0
```

`neo4j-driver` package is deprecated since 6.0 and receives no further updates.

#### Removed APIs

| Old | New | Notes |
|---|---|---|
| `session.read_transaction(fn)` | `session.execute_read(fn)` | |
| `session.write_transaction(fn)` | `session.execute_write(fn)` | |
| `session.last_bookmark()` | `session.last_bookmarks()` | Returns `Bookmarks` (plural) |
| `Bookmark` class | `Bookmarks` class | |
| `TRUST_ALL_CERTIFICATES` | `trusted_certificates=TrustAll()` | |
| `TRUST_SYSTEM_CA_SIGNED_CERTIFICATES` | `trusted_certificates=TrustSystemCAs()` | |
| `neo4j.conf`, `neo4j.data` modules | Removed — use top-level `neo4j.*` | |

#### Resource Management Change

Drivers and sessions no longer auto-close on GC. Add explicit cleanup:

```diff
- driver = GraphDatabase.driver(URI, auth=(USER, PASS))
- # used without explicit close
+ with GraphDatabase.driver(URI, auth=(USER, PASS)) as driver:
+     with driver.session(database="neo4j") as session:
+         ...
```

Or call `.close()` explicitly. Repeated `.close()` is a no-op.

#### Error Handling Changes

| Old exception | New exception | Trigger |
|---|---|---|
| `ClientError` (for timeout) | `ConnectionAcquisitionTimeoutError` | Acquisition timeout |
| `AuthError` (invalid config) | `ConfigurationError` | Invalid auth params |
| `ValueError` raised for `Query` obj | `TypeError` | Passing `Query` to `Transaction.run` |

#### Key APIs Unchanged

`execute_query()`, `GraphDatabase.driver()`, `neo4j+s://` URI, `auth=(user, pw)`, session `run()`.

Full changelog: [references/python-driver.md](references/python-driver.md)

---

### JavaScript / Node.js Driver (5.x → 6.x)

**Min requirements**: Node.js >= 18 (check `engines` in driver's `package.json`); package `neo4j-driver`

#### Removed APIs

| Old | New | Notes |
|---|---|---|
| `session.readTransaction(fn)` | `session.executeRead(fn)` | |
| `session.writeTransaction(fn)` | `session.executeWrite(fn)` | |
| `session.lastBookmark()` | `session.lastBookmarks()` | Returns array |
| `resultSummary.updateStatistics` | `resultSummary.counters` | |
| `driver.verifyConnectivity()` → `ServerInfo` | `driver.getServerInfo()` → `ServerInfo` | `verifyConnectivity()` now returns `void` |

#### Deprecated in 6.0 (will be removed in 7.0)

| Old | New |
|---|---|
| `isRetriableError(err)` | `isRetryable(err)` |
| `neo4jError.retriable` | `neo4jError.retryable` |
| `notificationCategory` | `notificationClassification` |

#### Integer Handling

Neo4j integers map to `neo4j.Integer` (64-bit). Use `.toNumber()` or `.toInt()` for arithmetic. Large values (> 2^53) lose precision — store as string with `.toString()`.

```javascript
// Safe pattern
const count = record.get('count').toNumber()
```

Full changelog: [references/javascript-driver.md](references/javascript-driver.md)

---

### Java Driver (5.x → 6.x)

**Min requirements**: Java 21; Maven `org.neo4j.driver:neo4j-java-driver:6.x`

#### Maven Coordinates

```diff
<dependency>
  <groupId>org.neo4j.driver</groupId>
  <artifactId>neo4j-java-driver</artifactId>
- <version>5.x.x</version>
+ <version>6.0.0</version>
</dependency>
```

#### Removed APIs

| Removed | Replacement | Notes |
|---|---|---|
| `RxSession` / `RxTransaction` | Use async `AsyncSession` or sync `Session` | Reactive API removed |
| `Bookmark` multi-value constructor | `Bookmark.from(iterable)` | |
| `session.readTransaction(fn)` | `session.executeRead(fn)` | |
| `session.writeTransaction(fn)` | `session.executeWrite(fn)` | |
| `TrustStrategy.certFile()` | `TrustStrategy.trustCustomCertificateSignedBy(path)` | |
| `Notification.severity()` | `Notification.severityLevel()` | Returns typed enum |

#### Dependency Note (BOM)

`neo4j-java-driver-bom` no longer imports `netty-bom` as of 6.0.1. If using Netty native transport, add explicit `netty-bom` import.

#### Logging

Legacy `Logging` API deprecated → configure `System.Logger` instead.

Full changelog: [references/java-driver.md](references/java-driver.md)

---

### .NET Driver (5.x → 6.x)

**Min requirements**: .NET 8, 9, or 10 (.NET Standard 2.1 dropped); NuGet `Neo4j.Driver 6.x`

#### NuGet Package

```diff
- <PackageReference Include="Neo4j.Driver" Version="5.*" />
+ <PackageReference Include="Neo4j.Driver" Version="6.*" />
```

`Neo4j.Driver.Signed` no longer receives updates — switch to `Neo4j.Driver` (now signed).

#### Removed APIs

| Removed | Replacement | Notes |
|---|---|---|
| `ILogger` | `INeo4jLogger` | Interface renamed |
| `ConfigBuilder.WithIpv6Enabled()` | Remove call — IPv6 always enabled | |
| `Config.Ipv6Enabled` property | Remove — always true | |
| Simple driver | Use standard `IDriver` | Removed entirely |

Full changelog: [references/dotnet-driver.md](references/dotnet-driver.md)

---

### Go Driver (5.x → 6.x)

**Min requirements**: Go 1.24; module `github.com/neo4j/neo4j-go-driver/v6`

#### go.mod Update

```diff
- require github.com/neo4j/neo4j-go-driver/v5 v5.x.x
+ require github.com/neo4j/neo4j-go-driver/v6 v6.x.x
```

Update all imports from `/v5/` to `/v6/`.

#### Removed APIs and Replacements

| Old | New | Notes |
|---|---|---|
| `neo4j.NewDriver(...)` | `neo4j.NewDriverWithContext(...)` | Context-aware; or just use `neo4j.NewDriver` (now has context) |
| `neo4j.Config` struct | `config.Config` | Import `github.com/neo4j/neo4j-go-driver/v6/neo4j/config` |
| `neo4j.ServerAddressResolver` | `config.ServerAddressResolver` | |
| `neo4j.LogLevel` / `neo4j.ERROR` etc. | `log.Level` / `log.ERROR` | Import `neo4j/log` sub-package |
| `log.Console` | `log.ToConsole` | |
| `log.Void` | `log.ToVoid` | |
| `neo4j.Single[T]` | `neo4j.SingleT[T]` (still present; context variant preferred) | |
| `neo4j.Driver` interface | `neo4j.DriverWithContext` | `*WithContext` variants are now primary |
| `neo4j.Session` interface | `neo4j.SessionWithContext` | |
| `Config.RootCAs` field | `Config.TlsConfig` | Pass `*tls.Config` directly |
| Notification constants (old pkg) | `notifications.*` equivalents | Import `neo4j/notifications` |

#### Context API Consolidation

In v6, `neo4j.NewDriverWithContext` is the canonical constructor. The old `*WithContext` method names are deprecated (targeted for removal in v7) — base names now include context by default.

```diff
- driver, err := neo4j.NewDriver(uri, neo4j.BasicAuth(user, pass, ""))
+ driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(user, pass, ""))
```

Full migration guide: [references/go-driver.md](references/go-driver.md)

---

## Step 4 — Version Compatibility Matrix

| Neo4j version | Cypher dialect | Driver 6.x compatible | Notes |
|---|---|---|---|
| 4.4 LTS | Cypher 4 | Yes (bolt compat) | Support ended Nov 2025 |
| 5.26 LTS | Cypher 5 | Yes | Supported until Nov 2028 |
| 2025.01–2025.05 | Cypher 5 | Yes | CalVer era begins |
| 2025.06+ | Cypher 5 or 25 | Yes | Cypher 25 new default |
| 2026.01+ | Cypher 25 | Yes | `SEARCH` clause available |

Store format: no changes between 4.4 and 2026.x. `block` format default for new Enterprise dbs since 5.22. `high_limit` and `standard` deprecated in 5.23, removed after 2026 LTS.

**No downgrades supported** — take a backup before any server upgrade.

---

## Step 5 — Test After Migration

```bash
# Python: run with dev mode to surface all deprecation warnings
python -W error::DeprecationWarning -m pytest tests/

# JS: run tests
npm test

# Java
mvn test

# .NET
dotnet test

# Go
go test ./...
```

After test run: if any `DeprecationWarning` or deprecated-API log appears, treat as ERROR — fix before proceeding.

For Cypher: run each migrated query through `EXPLAIN` first:

```bash
# Via Query API v2
curl -X POST https://<host>/db/<database>/query/v2 \
  -u <user>:<password> -H "Content-Type: application/json" \
  -d '{"statement": "EXPLAIN <your query>"}'
```

---

## Common Migration Errors

| Error | Cause | Fix |
|---|---|---|
| `id(n)` returns string, int comparison fails | `elementId()` returns string | Update stored IDs to string; fix WHERE clauses |
| `Cannot merge node using null property value` | MERGE key resolved to null | Validate params before MERGE |
| `Neo4j.Driver.Exceptions.AuthenticationException` | Wrong credential config after .NET rename | Update `INeo4jLogger` usage; verify config |
| `TypeError: neo4j-driver is deprecated` | Old package installed | Replace with `neo4j>=6.0.0` in requirements |
| `AttributeError: 'Session' has no 'read_transaction'` | Python 5→6, method removed | Replace with `execute_read()` |
| `RxSession not found` | Java 6.x, Reactive API removed | Migrate to async or sync session |
| `undefined is not a function (.readTransaction)` | JS 6.x, method removed | Replace with `executeRead()` |
| Go: `undefined: neo4j.Config` | v5 import path still present | Update all imports to `/v6/` |
| `PERIODIC COMMIT not supported` | Cypher 25, clause removed | Use `CALL (...) IN TRANSACTIONS` |
| `Unknown function id()` | id() removed in Cypher 25 | Replace with `elementId()` |

---

## References

Load on demand — high discovery rate because explicitly linked:
- [references/cypher-queries.md](references/cypher-queries.md) — version-branched Cypher changelog selection (4.x, 5.x, 2025.x)
- [references/python-driver.md](references/python-driver.md) — Python changelog URLs, full version history
- [references/javascript-driver.md](references/javascript-driver.md) — JS changelog URLs by version
- [references/java-driver.md](references/java-driver.md) — Java changelog URLs by version
- [references/dotnet-driver.md](references/dotnet-driver.md) — .NET changelog URLs by version
- [references/go-driver.md](references/go-driver.md) — Go migration guide with 5.0 and 6.0 sections

For any syntax not covered above, fetch:
`https://neo4j.com/docs/cypher-manual/25/deprecations-additions-removals-compatibility/`

---

## Checklist

- [ ] Target Neo4j version confirmed; Cypher dialect selected (Cypher 5 or 25)
- [ ] Dependency files scanned; all driver versions identified
- [ ] Cypher substitution table applied to every query in codebase
- [ ] `id(n)` → `elementId(n)` and downstream int→string conversions fixed
- [ ] `PERIODIC COMMIT` → `CALL IN TRANSACTIONS` in all batch writes
- [ ] `CALL { WITH x ... }` → `CALL (x) { ... }` in all subqueries
- [ ] Package renames done (Python: `neo4j-driver` → `neo4j`)
- [ ] Deprecated session methods replaced (`read_transaction`/`readTransaction` → `execute_read`/`executeRead`)
- [ ] Resource cleanup added where missing (Python: context managers or `.close()`)
- [ ] Bookmark API updated (`last_bookmark` → `last_bookmarks`, `Bookmark` → `Bookmarks`)
- [ ] Go imports updated from `/v5/` to `/v6/`; `neo4j.Config` → `config.Config`
- [ ] Java: Java 21 confirmed; RxSession usages removed
- [ ] .NET: `ILogger` → `INeo4jLogger`; `Neo4j.Driver.Signed` → `Neo4j.Driver`
- [ ] Tests pass with no DeprecationWarnings
- [ ] `EXPLAIN` run on all migrated Cypher queries; no errors
