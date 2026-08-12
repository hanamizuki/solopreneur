# neo4j-cli-tools-skill

Skill for database administration and automation using Neo4j command-line tools.

**Covers:**
- `neo4j-admin` — database management: backup/restore, imports (`neo4j-admin database import`), consistency checks, dump/load, user management, config tuning
- `cypher-shell` — interactive and scripted Cypher execution, `--format`, `--param`, piping queries from files, non-interactive mode for automation
- `aura-cli` — Aura instance management: create, pause, resume, delete, credential export, async status polling
- Neo4j MCP server setup — `mcp-neo4j-cypher` and `mcp-neo4j-memory` configuration for Claude Code, Cursor, and other MCP clients
- Common admin workflows: schema dump, user/role management, database copy, log inspection

**Version / compatibility:**
- `neo4j-admin` bundled with Neo4j 5.x / 2025.x
- `aura-cli` — install via `pip install aura-cli`
- `cypher-shell` — standalone download or bundled with Neo4j

**Not covered:**
- Cypher query authoring → `neo4j-cypher-skill`
- Aura provisioning via REST API → `neo4j-aura-provisioning-skill`
- Importing CSV/JSON data via Cypher → `neo4j-import-skill`

**Install:**
```bash
npx skills add https://github.com/neo4j-contrib/neo4j-skills --skill neo4j-cli-tools-skill
```

Or paste this link into your coding assistant:
https://github.com/neo4j-contrib/neo4j-skills/tree/main/neo4j-cli-tools-skill
