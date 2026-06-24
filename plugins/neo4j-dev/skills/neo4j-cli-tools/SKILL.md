---
name: neo4j-cli-tools
description: Use when working with Neo4j command-line tools — neo4j-cli (modern unified
  CLI: Cypher via Bolt, schema inspection, Aura management, Docker containers, credential
  management, agent skill catalog install; install with curl -sSfL https://neo4j.sh/install.sh | bash),
  neo4j-admin (backup, restore, import, memory sizing), cypher-shell (ad-hoc queries,
  scripting, CI/CD), or neo4j-mcp (quick MCP server install).
  Does NOT cover Cypher query authoring — use neo4j-cypher-skill.
  Does NOT cover driver upgrades — use neo4j-migration-skill.
  Does NOT cover full MCP editor configuration — use neo4j-mcp-skill.
allowed-tools: WebFetch, Bash
version: 1.0.1
---

# Neo4j CLI Tools skill

## When to Use

- Cypher queries, schema inspection, Aura, Docker, credentials, agent skills → `neo4j-cli` (**preferred**)
- Admin tasks: backup, restore, import, memory sizing → `neo4j-admin`
- Ad-hoc queries, scripting, CI/CD (Java required) → `cypher-shell`
- MCP server install → `neo4j-mcp`

## When NOT to Use

- **Writing or optimizing Cypher queries** → `neo4j-cypher-skill`
- **Upgrading Neo4j drivers or migrating Cypher syntax** → `neo4j-migration-skill`
- **Starting a new Neo4j project from scratch** → `neo4j-getting-started-skill`

## Available CLI Tools

### 1. neo4j-cli

Modern unified CLI. Bolt-native Cypher, schema inspection, Aura management, local Docker, credential storage, agent skill catalog install. Single binary — no Java required.

**Install:**
```bash
curl -sSfL https://neo4j.sh/install.sh | bash   # recommended
brew install neo4j-labs/tap/neo4j-cli            # Homebrew
pip install neo4j-cli / pipx install neo4j-cli   # PyPI
npm i -g @neo4j-labs/cli                         # npm
```

**Self-update:** `neo4j-cli update` (also refreshes installed skills automatically)

**Key subcommands:**

| Subcommand | Purpose |
|---|---|
| `neo4j-cli query [cypher]` | Run Cypher via Bolt — auto-rewrites HTTP URIs |
| `neo4j-cli query :schema` | Inspect labels, rel types, indexes, constraints |
| `neo4j-cli query :embed [text]` | Compute embedding vector standalone |
| `neo4j-cli aura instance ...` | Provision and manage Aura instances |
| `neo4j-cli aura agent ...` | Manage Aura Agents (list/get/create/invoke) |
| `neo4j-cli docker create/start/stop/delete` | Manage local Neo4j Docker containers |
| `neo4j-cli credential aura-client ...` | Store Aura API credentials |
| `neo4j-cli credential dbms ...` | Store Neo4j connection profiles (URI + auth) |
| `neo4j-cli credential embed ...` | Store embedding provider credentials |
| `neo4j-cli skill install [skill-name]` | Install self-skill or any catalog skill |
| `neo4j-cli skill list / check / remove` | Manage installed agent skills |
| `neo4j-cli update` | Self-update binary + refresh installed skills |

**Key patterns:**
```bash
# Schema-first workflow: always inspect schema before writing Cypher
neo4j-cli query :schema --format toon

# Run Cypher (bolt URIs auto-rewritten; HTTP URIs rewritten to Bolt)
neo4j-cli query "MATCH (n:Person) RETURN n.name LIMIT 5" \
  --uri neo4j+s://xxx.databases.neo4j.io --username neo4j --password $PASS

# Inline embedding parameter (text → vector; $q bound to []float32)
neo4j-cli query "MATCH (c) SEARCH c IN (VECTOR INDEX chunk_embedding FOR \$q LIMIT 5) SCORE AS score RETURN c.text, score" \
  --param q:embed="graph database performance"

# Store a connection profile, then query without flags
neo4j-cli credential dbms add --name prod \
  --uri neo4j+s://xxx.databases.neo4j.io --username neo4j --password $PASS
neo4j-cli query --credential prod "MATCH (n) RETURN count(n)"

# Local Docker: persistent or ephemeral
neo4j-cli docker create --name dev --wait --rw
neo4j-cli query --credential dev 'RETURN 1 AS n'
neo4j-cli docker create --name tmp --ephemeral --env-out-file /tmp/n.env --wait --rw
neo4j-cli query --env /tmp/n.env 'RETURN 1 AS n'

# Install skills from catalog (neo4j-contrib/neo4j-skills)
neo4j-cli skill install                          # self-skill into all detected agents
neo4j-cli skill install neo4j-cypher-skill       # one catalog skill, all agents
neo4j-cli skill install --all                    # self-skill + every catalog skill
neo4j-cli skill install --agent claude-code      # scope to one agent
neo4j-cli skill check                            # detect drift after upgrades
```

**Agent output:** Always use `--format toon` — ~40% fewer tokens than JSON. Set as default: `neo4j-cli config set format toon`.

**Write gate:** Write operations require `--rw` under agent harnesses. Do NOT add it preemptively — if a command fails with "this command writes; pass --rw to allow it", surface the error and ask the user once.

**Async operations:** `instance create/resize/destroy` and `docker create` accept `--wait` to block until terminal state.

**Credentials precedence:** flag > OS env (`NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`) > `.env` walk-up > stored credential.

**Supported agents:** Claude Code, Cursor, Windsurf, Copilot, Gemini CLI, Cline, Codex, OpenCode, Junie, and more.

Full reference: `neo4j-cli skill install` keeps an always-in-sync skill in your agent.

---

### 2. neo4j-admin

Included with Neo4j. Backup, restore, dump/load, CSV import, memory sizing, password reset. Run as Neo4j system user.

Reference: [neo4j-admin-reference.md](references/neo4j-admin-reference.md)

### 3. cypher-shell

Interactive Cypher REPL. Requires Java 21. Included with Neo4j. Use for ad-hoc queries, file-based batch scripting, CI/CD pipelines.

Reference: [cypher-shell-reference.md](references/cypher-shell-reference.md)

### 4. aura-cli

Legacy Aura cloud CLI. **Prefer `neo4j-cli aura` for new work** — covers all aura-cli operations plus credential storage, Docker, and agent skills.

Reference: [aura-cli-reference.md](references/aura-cli-reference.md)

### 5. neo4j-mcp

MCP server for AI agent integration. For full install + editor config → use `neo4j-mcp-skill` (covers Claude Code, Desktop, Cursor, Windsurf, VS Code, Kiro, stdio vs HTTP transport, troubleshooting).

```bash
pip install neo4j-mcp-server && neo4j-mcp --version
```

Reference: [neo4j-mcp-reference.md](references/neo4j-mcp-reference.md)

## Backup and Recovery

### Edition gate

Online backup requires **Enterprise Edition**. Community Edition users must use dump/load only (database must be offline).

### Backup (Enterprise — database stays online)

```bash
# Full online backup — database stays online during backup
neo4j-admin database backup \
  --to-path=/backups/ \
  --database=neo4j \
  --compress

# Differential backup — only changes since last full backup (faster)
neo4j-admin database backup \
  --to-path=/backups/ \
  --database=neo4j \
  --type=DIFF \
  --compress

# Backup to cloud storage (S3, GCS, or HTTPS)
neo4j-admin database backup \
  --to-path=s3://my-bucket/neo4j-backups/ \
  --database=neo4j
```

### Restore (Enterprise)

**AGENT GATE — destructive operation**: Before running restore, show the user the exact command and target database name, and wait for explicit confirmation. A restore overwrites the existing database.

```bash
# Restore from a full or differential backup
# Requires DB to be stopped, or use --force-offline for a running instance
neo4j-admin database restore \
  --from-path=/backups/neo4j-2026-01-15T10-00-00/ \
  --database=neo4j \
  --overwrite-destination=true

# Restore to a new database name (non-destructive path)
neo4j-admin database restore \
  --from-path=/backups/neo4j-2026-01-15T10-00-00/ \
  --database=neo4j-restored
```

### Dump / Load (all editions — database must be offline)

Use for migrations, dev/test data transfers, and Community Edition backups.

```bash
# Dump — stop the database first, or pass --force-offline
neo4j-admin database dump --to-path=/exports/ neo4j

# Load — overwrites if target DB exists
neo4j-admin database load \
  --from-path=/exports/neo4j.dump \
  --database=neo4j \
  --overwrite-destination=true
```

**AGENT GATE — destructive operation**: Before running load with `--overwrite-destination=true`, confirm target database name and path with the user.

### Key flags

| Flag | Notes |
|---|---|
| `--compress` | Zstd compression on backup archives |
| `--type=DIFF` | Differential: only changes since last full backup |
| `--to-path` | Local path or `s3://`, `gs://`, `https://` |
| `--overwrite-destination=true` | Required if target database already exists |
| `--force-offline` | Allow backup/restore of a running database in some scenarios |

### Point-in-time restore strategy

- **Full backup**: weekly (e.g. every Sunday)
- **Differential backup**: daily (captures only changes since last full)
- **Naming convention**: include timestamp in path — e.g. `/backups/neo4j-2026-01-19T02-00-00/`
- **Restore sequence**: apply full backup first, then each differential in chronological order

```bash
# Example: restore Sunday full + Monday + Tuesday differentials
neo4j-admin database restore \
  --from-path=/backups/neo4j-2026-01-19T02-00-00/ \
  --database=neo4j --overwrite-destination=true

neo4j-admin database restore \
  --from-path=/backups/neo4j-2026-01-20T02-00-00/ \
  --database=neo4j --overwrite-destination=true

neo4j-admin database restore \
  --from-path=/backups/neo4j-2026-01-21T02-00-00/ \
  --database=neo4j --overwrite-destination=true
```

---

## Environment Variables (neo4j-admin / cypher-shell)

- `NEO4J_URI` / `NEO4J_ADDRESS` — connection URI
- `NEO4J_USERNAME` / `NEO4J_PASSWORD` / `NEO4J_DATABASE`
- `NEO4J_CONF` — path to neo4j.conf directory
- `NEO4J_HOME` — Neo4j installation directory

Precedence: flags > env vars > config files. neo4j-cli uses its own credential store — see `neo4j-cli credential dbms`.

## Resources

- [Neo4j Operations Manual](https://neo4j.com/docs/operations-manual/current/)
- [Cypher Shell Documentation](https://neo4j.com/docs/operations-manual/current/cypher-shell/)
- [Aura CLI GitHub](https://github.com/neo4j/aura-cli)
- [Neo4j MCP Documentation](https://neo4j.com/docs/mcp/current/)
- [Neo4j Developer Portal](https://neo4j.com/developer/)

---

## Checklist

- [ ] Correct tool selected: neo4j-cli (preferred) / neo4j-admin / cypher-shell / neo4j-mcp
- [ ] If using neo4j-cli: `neo4j-cli skill install` run after install or upgrade (keeps skill in sync)
- [ ] Credentials via env or `credential dbms`; not hardcoded
- [ ] Using `--format toon` for agent-facing neo4j-cli output
- [ ] Destructive ops confirmed before execution
- [ ] Post-op verify: connect + `SHOW INDEXES` + count
- [ ] Backup taken before restore or schema change
