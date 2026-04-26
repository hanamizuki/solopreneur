---
name: neo4j-cli-tools
description: Use when working with Neo4j command-line tools including neo4j-admin, cypher-shell, aura-cli, and neo4j-mcp
allowed-tools: WebFetch, Bash
---

# Neo4j CLI Tools skill

This skill provides comprehensive guidance on Neo4j command-line tools for database administration, query execution, cloud management, and AI agent integration.

## When to use

Use this skill when:
- Setting up or configuring Neo4j databases via command line
- Running administrative tasks with neo4j-admin
- Executing Cypher queries from the command line
- Managing Neo4j Aura cloud instances
- Setting up the Neo4j MCP server for AI agents
- Troubleshooting Neo4j CLI tool issues
- Migrating or backing up databases using CLI tools

## When NOT to use this skill

- **Writing or optimizing Cypher queries** → use `neo4j-cypher-skill`
- **Upgrading Neo4j drivers or migrating Cypher syntax** → use `neo4j-migration-skill`
- **Starting a new Neo4j project from scratch** → use `neo4j-getting-started-skill`

## Available CLI Tools

### 1. neo4j-admin
**Purpose**: Comprehensive database administration tool

**Categories**:
- `dbms` - System-wide administration for single and clustered environments
- `server` - Server-level management tasks
- `database` - Database-specific operations (backup, restore, import, migrate)
- `backup` - Backup and restore operations

**Common Use Cases**:
- Database backup and restore
- Data import and export
- Server memory recommendations
- Initial password setup
- Database health checks

**Reference**: [neo4j-admin-reference.md](references/neo4j-admin-reference.md)

### 2. cypher-shell
**Purpose**: Interactive command-line tool for executing Cypher queries

**Key Features**:
- Interactive REPL for ad-hoc queries
- Script execution from files
- Parameterized query support
- Multiple output formats (verbose, plain, auto)
- Remote database connections

**Common Use Cases**:
- Running Cypher queries from terminal
- Batch processing with query files
- Database exploration and debugging
- CI/CD pipeline integration
- Scripted data operations

**Requirements**: Java 21

**Reference**: [cypher-shell-reference.md](references/cypher-shell-reference.md)

### 3. aura-cli
**Purpose**: Command-line interface for managing Neo4j Aura cloud resources

**Key Features**:
- Instance provisioning and management
- Tenant administration
- Credential management
- Graph Analytics operations
- Customer-managed keys

**Common Use Cases**:
- Automating Aura instance creation
- Managing cloud database lifecycles
- CI/CD integration for cloud deployments
- Programmatic resource provisioning

**Reference**: [aura-cli-reference.md](references/aura-cli-reference.md)

### 4. neo4j-mcp
**Purpose**: Model Context Protocol server for Neo4j integration with AI agents

**Key Features**:
- Enables AI agents to interact with Neo4j
- Tools for query execution and schema inspection
- Read-only and read-write modes
- Multiple transport modes (stdio, http)
- Works with all Neo4j deployment types

**Common Use Cases**:
- Integrating Neo4j with Claude or other AI agents
- Building AI-powered graph applications
- Natural language to Cypher translation
- Automated data analysis workflows

**Requirements**: Neo4j instance with APOC plugin

**Reference**: [neo4j-mcp-reference.md](references/neo4j-mcp-reference.md)

## Instructions

When a user asks about Neo4j CLI tools:

1. **Identify the appropriate tool** based on the use case:
   - Administration tasks → neo4j-admin
   - Query execution → cypher-shell
   - Cloud management → aura-cli
   - AI agent integration → neo4j-mcp

2. **Check prerequisites**:
   - For cypher-shell: Verify Java 21 is installed
   - For neo4j-mcp: Verify APOC plugin is available
   - For aura-cli: Verify credentials are configured

3. **Provide practical examples**:
   - Always include actual command syntax
   - Show common parameter combinations
   - Include environment variable alternatives
   - Demonstrate error handling where relevant

4. **Reference detailed documentation**:
   - Include the appropriate reference file from `references/` directory
   - Point to official Neo4j documentation for latest updates
   - Mention version-specific considerations

5. **Installation guidance**:
   - neo4j-admin and cypher-shell: Included with Neo4j installation
   - aura-cli: Download from GitHub releases
   - neo4j-mcp: Download binary from official repository
   - Include installation verification steps

## Important Notes

- All commands support `--help` for detailed usage information
- Configuration priority: CLI flags > environment variables > config files
- Neo4j 2026.01 is the current version (as of documentation date)
- Always execute neo4j-admin commands as the Neo4j system user
- Exit code 0 indicates success; non-zero indicates errors

## Environment Variables

Common environment variables across tools:
- `NEO4J_URI` / `NEO4J_ADDRESS` - Database connection URI
- `NEO4J_USERNAME` - Database username
- `NEO4J_PASSWORD` - Database password
- `NEO4J_DATABASE` - Target database name
- `NEO4J_CONF` - Path to neo4j.conf directory
- `NEO4J_HOME` - Neo4j installation directory

## Resources

- [Neo4j Operations Manual](https://neo4j.com/docs/operations-manual/current/)
- [Cypher Shell Documentation](https://neo4j.com/docs/operations-manual/current/cypher-shell/)
- [Aura CLI GitHub](https://github.com/neo4j/aura-cli)
- [Neo4j MCP Documentation](https://neo4j.com/docs/mcp/current/)
- [Neo4j Developer Portal](https://neo4j.com/developer/)
