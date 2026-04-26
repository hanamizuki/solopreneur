# neo4j-admin Reference

## Overview

`neo4j-admin` is the comprehensive command-line tool for Neo4j database administration. It provides commands for database management, backup operations, server configuration, and DBMS-wide tasks.

## Installation

neo4j-admin is installed automatically with Neo4j and located in the `bin/` directory of your Neo4j installation.

**Verify Installation**:
```bash
neo4j-admin --version
```

## Basic Syntax

```bash
neo4j-admin [OPTIONS] [COMMAND]
```

**Global Options**:
- `--help`, `-h` - Show help message
- `--version`, `-V` - Print version information
- `--verbose` - Print additional information
- `--expand-commands` - Allow command expansion in config value evaluation

## Command Categories

### 1. DBMS Commands (`dbms`)

System-wide administration tasks for single and clustered environments.

#### set-default-admin
Sets the default admin user when no roles exist.

```bash
neo4j-admin dbms set-default-admin <username>
```

#### set-initial-password
Configures the initial password for the `neo4j` user.

```bash
neo4j-admin dbms set-initial-password <password>
```

**Example**:
```bash
neo4j-admin dbms set-initial-password MySecureP@ssw0rd
```

#### unbind-system-db
Removes cluster state to enable rebinding to a different cluster.

```bash
neo4j-admin dbms unbind-system-db
```

### 2. Server Commands (`server`)

Server-level management tasks.

#### memory-recommendation
Prints recommendations for Neo4j heap and page cache memory usage based on system resources.

```bash
neo4j-admin server memory-recommendation
```

**Example Output**:
```
# Recommended memory settings:
server.memory.heap.initial_size=4g
server.memory.heap.max_size=4g
server.memory.pagecache.size=8g
```

#### report
Generates a diagnostic archive for Neo4j support team.

```bash
neo4j-admin server report
```

**Options**:
- `--to=<path>` - Output directory for the report archive
- `--list` - List available classifiers
- `--filter=<classifier>` - Filter specific data to include

#### license
Accepts commercial or evaluation license agreements.

```bash
neo4j-admin server license --accept-commercial
neo4j-admin server license --accept-evaluation
```

### 3. Database Commands (`database`)

Database-specific operations including backup, restore, import, and migration.

#### backup
Creates a backup of a Neo4j database.

```bash
neo4j-admin database backup <database-name> --to-path=<backup-directory>
```

**Example**:
```bash
neo4j-admin database backup neo4j --to-path=/backups/$(date +%Y%m%d)
```

**Options**:
- `--to-path=<path>` - Destination directory (required)
- `--type=<type>` - Backup type: `full` or `differential`
- `--keep-failed` - Keep failed backup attempts
- `--verbose` - Print detailed progress

#### restore
Restores a database from backup.

```bash
neo4j-admin database restore <database-name> --from-path=<backup-directory>
```

**Example**:
```bash
neo4j-admin database restore neo4j --from-path=/backups/20260216
```

**Important**: Database must be stopped before restore.

#### dump
Creates a database dump file for export.

```bash
neo4j-admin database dump <database-name> --to-path=<dump-file>
```

**Example**:
```bash
neo4j-admin database dump mydb --to-path=/exports/mydb.dump
```

#### load
Loads a database from a dump file.

```bash
neo4j-admin database load <database-name> --from-path=<dump-file>
```

**Example**:
```bash
neo4j-admin database load newdb --from-path=/exports/mydb.dump --overwrite-destination=true
```

**Options**:
- `--from-path=<path>` - Source dump file (required)
- `--overwrite-destination` - Allow overwriting existing database

#### import
Imports data from CSV files into a new database.

```bash
neo4j-admin database import \
  --nodes=<node-files> \
  --relationships=<relationship-files> \
  --database=<database-name>
```

**Example**:
```bash
neo4j-admin database import \
  --nodes=Person=persons.csv \
  --relationships=KNOWS=knows.csv \
  --database=socialnetwork \
  --delimiter=","
```

**Options**:
- `--nodes=<Label>=<file>` - Node CSV files with optional labels
- `--relationships=<TYPE>=<file>` - Relationship CSV files with types
- `--delimiter=<char>` - CSV field delimiter (default: comma)
- `--array-delimiter=<char>` - Array value delimiter (default: semicolon)
- `--skip-duplicate-nodes` - Skip duplicate node IDs
- `--skip-bad-relationships` - Skip relationships with invalid nodes

#### check
Checks database consistency and reports issues.

```bash
neo4j-admin database check <database-name>
```

**Example**:
```bash
neo4j-admin database check neo4j --verbose
```

**Options**:
- `--report-dir=<path>` - Directory for consistency report
- `--verbose` - Detailed output

#### copy
Creates a copy of a database.

```bash
neo4j-admin database copy <source-db> <target-db>
```

**Example**:
```bash
neo4j-admin database copy production staging
```

#### migrate
Migrates a database to the current Neo4j version format.

```bash
neo4j-admin database migrate <database-name>
```

**Example**:
```bash
neo4j-admin database migrate legacydb --force-btree-indexes-to-range
```

### 4. Backup Commands (`backup`)

Specialized backup operations.

```bash
neo4j-admin backup --backup-dir=<path> --database=<name>
```

## Configuration

### Configuration Priority

Commands resolve settings in this order (highest to lowest priority):
1. `--additional-config` flag
2. Command-specific configuration files
3. `neo4j-admin.conf`
4. `neo4j.conf`

### Using Configuration Files

Pass additional configuration via file:
```bash
neo4j-admin database backup mydb --to-path=/backups @/path/to/options.conf
```

**Example options.conf**:
```
--verbose
--keep-failed=true
```

## Environment Variables

- `NEO4J_CONF` - Path to directory containing neo4j.conf
- `NEO4J_DEBUG` - Enable debug output (set to any value)
- `NEO4J_HOME` - Neo4j installation directory
- `HEAP_SIZE` - JVM maximum heap size (e.g., `512m`, `4g`)
- `JAVA_OPTS` - Custom JVM settings (takes precedence over HEAP_SIZE)

## Common Workflows

### Initial Setup
```bash
# Set initial password
neo4j-admin dbms set-initial-password MySecurePassword

# Get memory recommendations
neo4j-admin server memory-recommendation

# Start the database (use neo4j command)
```

### Backup and Restore
```bash
# Create full backup
neo4j-admin database backup neo4j --to-path=/backups/full

# Create differential backup
neo4j-admin database backup neo4j --to-path=/backups/diff --type=differential

# Restore from backup
neo4j stop
neo4j-admin database restore neo4j --from-path=/backups/full
neo4j start
```

### Data Migration
```bash
# Export database
neo4j-admin database dump production --to-path=/exports/prod.dump

# Import to new instance
neo4j-admin database load production-copy --from-path=/exports/prod.dump

# Check consistency
neo4j-admin database check production-copy
```

### CSV Import
```bash
# Import nodes and relationships
neo4j-admin database import \
  --nodes=User=users.csv \
  --nodes=Product=products.csv \
  --relationships=PURCHASED=purchases.csv \
  --database=ecommerce \
  --skip-bad-relationships
```

## Exit Codes

- `0` - Success
- Non-zero - Error occurred (check error message for details)

## Best Practices

1. **Always run as Neo4j user**: Execute commands as the system user that owns the Neo4j installation
2. **Stop database for restore**: Always stop the database before running restore operations
3. **Verify backups**: Use `check` command to verify backup integrity
4. **Use full paths**: Specify absolute paths for backup and dump locations
5. **Test in non-production**: Test migration and import commands in development first
6. **Monitor disk space**: Ensure sufficient disk space for backups and dumps
7. **Use verbose mode**: Enable `--verbose` for debugging and monitoring progress
8. **Automate backups**: Schedule regular backups using cron or system schedulers

## Troubleshooting

### Permission Denied
```bash
# Ensure running as neo4j user
sudo -u neo4j neo4j-admin database backup mydb --to-path=/backups
```

### Database Must Be Stopped
```bash
# Stop database before restore
neo4j stop
neo4j-admin database restore mydb --from-path=/backup
neo4j start
```

### Insufficient Memory
```bash
# Increase heap size
HEAP_SIZE=4g neo4j-admin database import --nodes=large.csv --database=bigdb
```

### Configuration Not Found
```bash
# Specify NEO4J_CONF explicitly
NEO4J_CONF=/path/to/conf neo4j-admin database backup mydb --to-path=/backup
```

## Additional Resources

- [Neo4j Operations Manual - neo4j-admin](https://neo4j.com/docs/operations-manual/current/neo4j-admin-neo4j-cli/)
- [Database Backup Documentation](https://neo4j.com/docs/operations-manual/current/backup-restore/)
- [CSV Import Guide](https://neo4j.com/docs/operations-manual/current/import/)
- [Configuration Reference](https://neo4j.com/docs/operations-manual/current/configuration/)
