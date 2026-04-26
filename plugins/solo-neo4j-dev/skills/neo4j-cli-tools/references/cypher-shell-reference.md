# cypher-shell Reference

## Overview

Cypher Shell is a command-line tool for running Cypher queries and performing administrative tasks against a Neo4j instance. It operates via the Bolt protocol and supports both interactive REPL mode and scripting.

## Installation

### Bundled with Neo4j
Cypher Shell is included with Neo4j installations and located in the `bin/` directory.

### Standalone Installation

**Download from Neo4j Deployment Center**:
```bash
# Visit https://neo4j.com/deployment-center/
# Download cypher-shell package for your platform
```

**Using Homebrew (macOS)**:
```bash
brew install cypher-shell
```

**Verify Installation**:
```bash
cypher-shell --version
```

## Requirements

- **Java 21** (required)
- Network access to Neo4j instance (via Bolt port, default 7687)

## Basic Syntax

```bash
cypher-shell [OPTIONS] [cypher-statement]
```

## Connection Options

### Basic Connection
```bash
cypher-shell -a neo4j://localhost:7687 -u neo4j -p password
```

### Connection Arguments

- `-a ADDRESS`, `--address ADDRESS`, `--uri ADDRESS`
  - Database URI (default: `neo4j://localhost:7687`)
  - Environment variable: `NEO4J_ADDRESS` or `NEO4J_URI`

- `-u USERNAME`, `--username USERNAME`
  - Username for authentication
  - Environment variable: `NEO4J_USERNAME`

- `-p PASSWORD`, `--password PASSWORD`
  - Password for authentication
  - Environment variable: `NEO4J_PASSWORD`

- `-d DATABASE`, `--database DATABASE`
  - Target database name
  - Environment variable: `NEO4J_DATABASE`

- `--encryption {true,false,default}`
  - Connection encryption setting
  - `default` deduces from URI scheme (e.g., `neo4j+ssc` uses encryption)

- `--impersonate IMPERSONATE`
  - User to impersonate

- `--access-mode {read,write}`
  - Access mode (default: `write`)

### Using Environment Variables

```bash
export NEO4J_URI=neo4j://localhost:7687
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=MySecurePassword
export NEO4J_DATABASE=mydb

cypher-shell
```

## Interactive Mode

### Starting Interactive Shell

```bash
cypher-shell -a neo4j://localhost:7687 -u neo4j -p password
```

**Prompt Example**:
```
Connected to Neo4j 2026.01.3 at neo4j://localhost:7687
neo4j@neo4j>
```

### Interactive Commands

- `:help` - Display available commands
- `:exit` - Exit the shell
- `:param <name> => <value>` - Set query parameter
- `:params` - List all parameters
- `:begin` - Start explicit transaction
- `:commit` - Commit current transaction
- `:rollback` - Rollback current transaction
- `:source <file>` - Execute statements from file
- `:use <database>` - Switch to different database
- `:access-mode read|write` - Switch access mode

### Interactive Features

**Command History**:
- Up/Down arrows navigate history
- History stored in `~/.neo4j/.cypher_shell_history`
- Configure with `--history` option

**Auto-completion** (Neo4j 5+):
```bash
cypher-shell --enable-autocompletions
```
- Tab key triggers completions
- Completes Cypher keywords, functions, procedures

**Multi-line Queries**:
```cypher
neo4j@neo4j> MATCH (n:Person)
... WHERE n.age > 25
... RETURN n.name, n.age;
```

## Scripting Mode

### Execute Inline Cypher

```bash
cypher-shell -u neo4j -p password "MATCH (n) RETURN count(n);"
```

### Execute from File

```bash
cypher-shell -u neo4j -p password -f queries.cypher
```

### Piping Input

```bash
cat queries.cypher | cypher-shell -u neo4j -p password
```

```bash
echo "MATCH (n:Person) RETURN n.name LIMIT 5;" | cypher-shell -u neo4j -p password
```

### Error Handling

**Fail Fast (default)**:
```bash
cypher-shell -f script.cypher --fail-fast
```
Exits on first error.

**Fail at End**:
```bash
cypher-shell -f script.cypher --fail-at-end
```
Continues execution and reports all errors at the end.

## Output Formats

### Format Options

- `--format auto` - Tabular in interactive, plain in scripting (default)
- `--format verbose` - Tabular with statistics
- `--format plain` - Minimal formatting

### Examples

**Verbose Format**:
```bash
cypher-shell --format verbose -u neo4j -p password "MATCH (n) RETURN n LIMIT 3;"
```

Output:
```
+---------------------------------------------+
| n                                           |
+---------------------------------------------+
| (:Person {name: "Alice", age: 30})         |
| (:Person {name: "Bob", age: 25})           |
| (:Person {name: "Charlie", age: 35})       |
+---------------------------------------------+
3 rows available after 45 ms, consumed after another 2 ms
```

**Plain Format** (for scripting):
```bash
cypher-shell --format plain -u neo4j -p password "MATCH (n:Person) RETURN n.name;"
```

Output:
```
"Alice"
"Bob"
"Charlie"
```

### Output Options

- `--sample-rows SAMPLE-ROWS`
  - Number of rows sampled for table width calculation (default: 1000)
  - Only for `verbose` format

- `--wrap {true,false}`
  - Wrap column values if too narrow (default: true)
  - Only for `verbose` format

## Parameters

### Setting Parameters

**Command Line**:
```bash
cypher-shell -P '{name: "Alice", minAge: 25}'
```

**Multiple Parameters**:
```bash
cypher-shell -P '{name: "Alice"}' -P '{minAge: 25}'
```

**In Interactive Mode**:
```cypher
neo4j@neo4j> :param name => "Alice"
neo4j@neo4j> :param minAge => 25
neo4j@neo4j> :params
{
  "name": "Alice",
  "minAge": 25
}
```

### Using Parameters in Queries

```cypher
MATCH (p:Person {name: $name})
WHERE p.age >= $minAge
RETURN p;
```

**With Complex Types**:
```bash
cypher-shell -P '{duration: duration({seconds: 3600})}'
```

## Transaction Management

### Implicit Transactions (default)
Each statement executes in its own transaction.

### Explicit Transactions

**Interactive Mode**:
```cypher
neo4j@neo4j> :begin
neo4j@neo4j# CREATE (n:Person {name: "Alice"});
neo4j@neo4j# CREATE (m:Person {name: "Bob"});
neo4j@neo4j# :commit
```

**Rollback Example**:
```cypher
neo4j@neo4j> :begin
neo4j@neo4j# CREATE (n:Test);
neo4j@neo4j# :rollback
```

## Advanced Options

### Logging

```bash
cypher-shell --log /var/log/cypher-shell.log
```

```bash
cypher-shell --log  # Logs to stderr
```

### Password Change

```bash
cypher-shell --change-password
```
Prompts for current and new passwords.

### Notifications

Enable procedure and query notifications:
```bash
cypher-shell --notifications
```

### Idle Timeout

Auto-close after inactivity:
```bash
cypher-shell --idle-timeout 30m
```

Format: `<hours>h<minutes>m<seconds>s`

Examples:
- `1h` - 1 hour
- `1h30m` - 1 hour 30 minutes
- `30m` - 30 minutes

### Error Format

```bash
cypher-shell --error-format {gql,legacy,stacktrace}
```

- `gql` - GQL standard format
- `legacy` - Traditional Neo4j format (default)
- `stacktrace` - Full stack traces

### Non-Interactive Mode

Force non-interactive mode (useful on Windows):
```bash
cypher-shell --non-interactive -f script.cypher
```

## Common Use Cases

### Database Exploration

```bash
# List all node labels
cypher-shell -u neo4j -p password "CALL db.labels();"

# Count nodes by label
cypher-shell -u neo4j -p password "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count;"

# Show database schema
cypher-shell -u neo4j -p password "CALL db.schema.visualization();"
```

### Data Export

```bash
# Export to CSV-like format
cypher-shell --format plain -u neo4j -p password \
  "MATCH (p:Person) RETURN p.name, p.age;" > people.csv
```

### Batch Operations

```bash
# Create multiple nodes from file
cat << EOF > create_people.cypher
CREATE (:Person {name: "Alice", age: 30});
CREATE (:Person {name: "Bob", age: 25});
CREATE (:Person {name: "Charlie", age: 35});
EOF

cypher-shell -f create_people.cypher
```

### CI/CD Integration

```bash
#!/bin/bash
# Test database connectivity
if cypher-shell -u neo4j -p $NEO4J_PASSWORD "RETURN 1;" > /dev/null 2>&1; then
  echo "Database connection successful"
  exit 0
else
  echo "Database connection failed"
  exit 1
fi
```

### Parameterized Queries

```bash
# Query with parameters
cypher-shell -P '{minAge: 30}' \
  "MATCH (p:Person) WHERE p.age >= \$minAge RETURN p.name, p.age;"
```

### Read-Only Queries

```bash
# Connect in read-only mode
cypher-shell --access-mode read -u neo4j -p password
```

## Keyboard Shortcuts

**Navigation**:
- `Ctrl+A` - Move to beginning of line
- `Ctrl+E` - Move to end of line
- `Ctrl+U` - Clear line
- `Ctrl+K` - Delete from cursor to end
- `Ctrl+C` - Cancel current query

**History**:
- `Up Arrow` - Previous command
- `Down Arrow` - Next command
- `Ctrl+R` - Reverse search history

**Completion**:
- `Tab` - Trigger auto-completion (if enabled)

## Environment Variables

- `NEO4J_URI` or `NEO4J_ADDRESS` - Connection URI
- `NEO4J_USERNAME` - Database username
- `NEO4J_PASSWORD` - Database password
- `NEO4J_DATABASE` - Target database name
- `NEO4J_CYPHER_SHELL_HISTORY` - History file path

## Troubleshooting

### Java Version Error

```
You are using an unsupported version of the Java runtime. Please use Java(TM) 21.
```

**Solution**:
```bash
# Install Java 21
# macOS
brew install openjdk@21

# Set JAVA_HOME
export JAVA_HOME=/path/to/java21
```

### Connection Refused

```
Unable to connect to localhost:7687
```

**Check**:
1. Neo4j is running: `neo4j status`
2. Bolt port is correct (default 7687)
3. Firewall allows connection

### Authentication Failed

```
The client is unauthorized due to authentication failure.
```

**Solution**:
```bash
# Reset password using neo4j-admin
neo4j-admin dbms set-initial-password newpassword
```

### SSL/TLS Errors

```
Connection failed with SSL error
```

**Solution**:
```bash
# Disable encryption for local development
cypher-shell --encryption false -a neo4j://localhost:7687
```

## Best Practices

1. **Use environment variables** for credentials in scripts
2. **Enable auto-completion** for interactive work (Neo4j 5+)
3. **Use parameters** to prevent Cypher injection
4. **Test queries** in read-only mode first
5. **Use explicit transactions** for multi-statement operations
6. **Format output** appropriately for your use case
7. **Log errors** in production scripts with `--log`
8. **Set timeouts** for long-running operations
9. **Use --fail-at-end** for data migration scripts
10. **Verify Java 21** before deployment

## Additional Resources

- [Cypher Shell Documentation](https://neo4j.com/docs/operations-manual/current/cypher-shell/)
- [Cypher Query Language Reference](https://neo4j.com/docs/cypher-manual/current/)
- [Bolt Protocol Specification](https://neo4j.com/docs/bolt/current/)
- [Neo4j Deployment Center](https://neo4j.com/deployment-center/)
