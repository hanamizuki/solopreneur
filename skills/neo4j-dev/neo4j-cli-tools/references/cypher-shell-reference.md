# cypher-shell Reference

## Installation

Cypher Shell is included with Neo4j installations in the `bin/` directory.

**Standalone**:
```bash
# Visit https://neo4j.com/deployment-center/
# Download cypher-shell package for your platform
```

**Homebrew (macOS)**:
```bash
brew install cypher-shell
```

```bash
cypher-shell --version
```

## Requirements

- **Java 21** (required)
- Network access to Neo4j instance (Bolt port, default 7687)

## Basic Syntax

```bash
cypher-shell [OPTIONS] [cypher-statement]
```

## Connection Options

```bash
cypher-shell -a neo4j://localhost:7687 -u neo4j -p password
```

- `-a ADDRESS`, `--address ADDRESS`, `--uri ADDRESS`
  - Database URI (default: `neo4j://localhost:7687`)
  - Environment variable: `NEO4J_ADDRESS` or `NEO4J_URI`

- `-u USERNAME`, `--username USERNAME`
  - Environment variable: `NEO4J_USERNAME`

- `-p PASSWORD`, `--password PASSWORD`
  - Environment variable: `NEO4J_PASSWORD`

- `-d DATABASE`, `--database DATABASE`
  - Environment variable: `NEO4J_DATABASE`

- `--encryption {true,false,default}`
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

```bash
cypher-shell -a neo4j://localhost:7687 -u neo4j -p password
```

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

```bash
cypher-shell -u neo4j -p password "MATCH (n) RETURN count(n);"

cypher-shell -u neo4j -p password -f queries.cypher

cat queries.cypher | cypher-shell -u neo4j -p password

echo "MATCH (n:Person) RETURN n.name LIMIT 5;" | cypher-shell -u neo4j -p password
```

**Fail Fast** (default — exits on first error):
```bash
cypher-shell -f script.cypher --fail-fast
```

**Fail at End** (continues and reports all errors):
```bash
cypher-shell -f script.cypher --fail-at-end
```

## Output Formats

- `--format auto` - Tabular in interactive, plain in scripting (default)
- `--format verbose` - Tabular with statistics
- `--format plain` - Minimal formatting

```bash
cypher-shell --format verbose -u neo4j -p password "MATCH (n) RETURN n LIMIT 3;"
```

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

```bash
cypher-shell --format plain -u neo4j -p password "MATCH (n:Person) RETURN n.name;"
```

```
"Alice"
"Bob"
"Charlie"
```

**Output Options**:
- `--sample-rows SAMPLE-ROWS` - Rows sampled for table width calculation (default: 1000; `verbose` only)
- `--wrap {true,false}` - Wrap column values if too narrow (default: true; `verbose` only)

## Parameters

```bash
cypher-shell -P '{name: "Alice", minAge: 25}'

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

**Using Parameters in Queries**:
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

Each statement executes in its own implicit transaction by default.

**Explicit Transactions (Interactive)**:
```cypher
neo4j@neo4j> :begin
neo4j@neo4j# CREATE (n:Person {name: "Alice"});
neo4j@neo4j# CREATE (m:Person {name: "Bob"});
neo4j@neo4j# :commit
```

```cypher
neo4j@neo4j> :begin
neo4j@neo4j# CREATE (n:Test);
neo4j@neo4j# :rollback
```

## Advanced Options

```bash
cypher-shell --log /var/log/cypher-shell.log
cypher-shell --log  # Logs to stderr

cypher-shell --change-password  # Prompts for current and new passwords

cypher-shell --notifications  # Enable procedure and query notifications

cypher-shell --idle-timeout 30m  # Auto-close after inactivity
```

Idle timeout format: `<hours>h<minutes>m<seconds>s` (e.g., `1h`, `1h30m`, `30m`)

```bash
cypher-shell --error-format {gql,legacy,stacktrace}
```
- `gql` - GQL standard format
- `legacy` - Traditional Neo4j format (default)
- `stacktrace` - Full stack traces

```bash
cypher-shell --non-interactive -f script.cypher  # Force non-interactive (useful on Windows)
```

## Common Use Cases

### Database Exploration

```bash
cypher-shell -u neo4j -p password "CALL db.labels();"

cypher-shell -u neo4j -p password "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count;"

cypher-shell -u neo4j -p password "CALL db.schema.visualization();"
```

### Data Export

```bash
cypher-shell --format plain -u neo4j -p password \
  "MATCH (p:Person) RETURN p.name, p.age;" > people.csv
```

### Batch Operations

```bash
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
cypher-shell -P '{minAge: 30}' \
  "MATCH (p:Person) WHERE p.age >= \$minAge RETURN p.name, p.age;"
```

### Read-Only Queries

```bash
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

```bash
brew install openjdk@21
export JAVA_HOME=/path/to/java21
```

### Connection Refused

```
Unable to connect to localhost:7687
```

1. Neo4j is running: `neo4j status`
2. Bolt port is correct (default 7687)
3. Firewall allows connection

### Authentication Failed

```
The client is unauthorized due to authentication failure.
```

```bash
neo4j-admin dbms set-initial-password newpassword
```

### SSL/TLS Errors

```
Connection failed with SSL error
```

```bash
cypher-shell --encryption false -a neo4j://localhost:7687
```

## Best Practices

1. **Use environment variables** for credentials in scripts
2. **Enable auto-completion** for interactive work (Neo4j 5+)
3. **Use parameters** to prevent Cypher injection
4. **Use explicit transactions** for multi-statement operations
5. **Use --fail-at-end** for data migration scripts
6. **Verify Java 21** before deployment

## Additional Resources

- [Cypher Shell Documentation](https://neo4j.com/docs/operations-manual/current/cypher-shell/)
- [Cypher Query Language Reference](https://neo4j.com/docs/cypher-manual/current/)
- [Bolt Protocol Specification](https://neo4j.com/docs/bolt/current/)
- [Neo4j Deployment Center](https://neo4j.com/deployment-center/)
