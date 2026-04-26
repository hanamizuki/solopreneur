# neo4j-mcp Reference

## Overview

The Neo4j Model Context Protocol (MCP) server is an official tool that enables AI agents (like Claude) to interact with Neo4j graph databases. It implements the Model Context Protocol, providing tools for query execution, schema inspection, and graph operations.

## What is MCP?

The Model Context Protocol (MCP) is a standardized way for AI agents to:
- **Tools**: Execute functions with defined schemas and predictable outputs
- **Resources**: Access read-only context (database views, schemas, etc.)
- **Prompts**: Use pre-defined templates for common operations

## Installation

### Download Binary

Visit the [official repository](https://github.com/neo4j/mcp) and download the binary for your platform:

```bash
# macOS/Linux
curl -L https://github.com/neo4j/mcp/releases/latest/download/neo4j-mcp-<platform> -o neo4j-mcp
chmod +x neo4j-mcp
sudo mv neo4j-mcp /usr/local/bin/

# Verify installation
neo4j-mcp --version
```

### System Requirements

- **Neo4j Database**: Any deployment type (Aura, Self-Managed, Docker, Desktop, Sandbox)
- **APOC Plugin**: Required for full functionality
- **Network Access**: Connection to Neo4j instance

## Basic Syntax

```bash
neo4j-mcp [OPTIONS]
```

## Configuration Options

### Connection Settings (Required)

**Neo4j URI**:
```bash
neo4j-mcp --neo4j-uri bolt://localhost:7687
# or
export NEO4J_URI=bolt://localhost:7687
neo4j-mcp
```

**Username**:
```bash
neo4j-mcp --neo4j-username neo4j
# or
export NEO4J_USERNAME=neo4j
neo4j-mcp
```

**Password**:
```bash
neo4j-mcp --neo4j-password password
# or
export NEO4J_PASSWORD=password
neo4j-mcp
```

**Database Name** (optional):
```bash
neo4j-mcp --neo4j-database mydb
# or
export NEO4J_DATABASE=mydb  # default: neo4j
neo4j-mcp
```

### Operational Settings (Optional)

**Read-Only Mode**:
```bash
neo4j-mcp --neo4j-read-only true
# or
export NEO4J_READ_ONLY=true
neo4j-mcp
```

Disables write tools when enabled.

**Telemetry**:
```bash
neo4j-mcp --neo4j-telemetry false
# or
export NEO4J_TELEMETRY=false  # default: true
neo4j-mcp
```

**Schema Sample Size**:
```bash
neo4j-mcp --neo4j-schema-sample-size 200
# or
export NEO4J_SCHEMA_SAMPLE_SIZE=200  # default: 100
neo4j-mcp
```

Number of nodes to sample for schema inference.

### Transport Modes

**STDIO Mode** (default):
```bash
neo4j-mcp --neo4j-transport-mode stdio
# or
export NEO4J_TRANSPORT_MODE=stdio
neo4j-mcp
```

Used for direct integration with AI agents.

**HTTP Mode**:
```bash
neo4j-mcp --neo4j-transport-mode http \
  --neo4j-http-port 8080 \
  --neo4j-http-host 0.0.0.0
# or
export NEO4J_TRANSPORT_MODE=http
export NEO4J_MCP_HTTP_PORT=8080
export NEO4J_MCP_HTTP_HOST=0.0.0.0
neo4j-mcp
```

Used for remote access via HTTP.

### HTTP-Specific Settings

**Port Configuration**:
```bash
neo4j-mcp --neo4j-http-port 8443
# or
export NEO4J_MCP_HTTP_PORT=8443  # default: 443 (TLS) or 80 (no TLS)
```

**Host Binding**:
```bash
neo4j-mcp --neo4j-http-host 127.0.0.1
# or
export NEO4J_MCP_HTTP_HOST=127.0.0.1  # default: 127.0.0.1
```

**CORS Origins**:
```bash
neo4j-mcp --neo4j-http-allowed-origins "https://example.com,https://app.example.com"
# or
export NEO4J_MCP_HTTP_ALLOWED_ORIGINS="https://example.com,https://app.example.com"
```

**TLS/HTTPS**:
```bash
neo4j-mcp --neo4j-http-tls-enabled true \
  --neo4j-http-tls-cert-file /path/to/cert.pem \
  --neo4j-http-tls-key-file /path/to/key.pem
# or
export NEO4J_MCP_HTTP_TLS_ENABLED=true
export NEO4J_MCP_HTTP_TLS_CERT_FILE=/path/to/cert.pem
export NEO4J_MCP_HTTP_TLS_KEY_FILE=/path/to/key.pem
```

**Authentication Header**:
```bash
neo4j-mcp --neo4j-http-auth-header-name X-API-Key
# or
export NEO4J_HTTP_AUTH_HEADER_NAME=X-API-Key  # default: Authorization
```

## Environment Variables Reference

### Required
- `NEO4J_URI` - Database connection URI
- `NEO4J_USERNAME` - Database username
- `NEO4J_PASSWORD` - Database password

### Optional
- `NEO4J_DATABASE` - Database name (default: `neo4j`)
- `NEO4J_READ_ONLY` - Enable read-only mode (default: `false`)
- `NEO4J_TELEMETRY` - Enable telemetry (default: `true`)
- `NEO4J_SCHEMA_SAMPLE_SIZE` - Schema sampling size (default: `100`)
- `NEO4J_TRANSPORT_MODE` - Transport mode: `stdio` or `http` (default: `stdio`)

### HTTP Transport (when `NEO4J_TRANSPORT_MODE=http`)
- `NEO4J_MCP_HTTP_PORT` - HTTP server port (default: `443` with TLS, `80` without)
- `NEO4J_MCP_HTTP_HOST` - HTTP server host (default: `127.0.0.1`)
- `NEO4J_MCP_HTTP_ALLOWED_ORIGINS` - CORS origins (comma-separated)
- `NEO4J_MCP_HTTP_TLS_ENABLED` - Enable TLS (default: `false`)
- `NEO4J_MCP_HTTP_TLS_CERT_FILE` - TLS certificate file path
- `NEO4J_MCP_HTTP_TLS_KEY_FILE` - TLS private key file path
- `NEO4J_HTTP_AUTH_HEADER_NAME` - Auth header name (default: `Authorization`)

### Deprecated
- `NEO4J_MCP_TRANSPORT` - Use `NEO4J_TRANSPORT_MODE` instead

## Common Use Cases

### Local Development with Claude Desktop

**Configuration for Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "neo4j": {
      "command": "neo4j-mcp",
      "env": {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "password",
        "NEO4J_DATABASE": "neo4j"
      }
    }
  }
}
```

### Read-Only Access

```bash
NEO4J_URI=bolt://localhost:7687 \
NEO4J_USERNAME=neo4j \
NEO4J_PASSWORD=password \
NEO4J_READ_ONLY=true \
neo4j-mcp
```

**Use Case**: Provide safe access to production databases for AI analysis.

### Neo4j Aura Integration

```bash
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io \
NEO4J_USERNAME=neo4j \
NEO4J_PASSWORD=your-aura-password \
NEO4J_DATABASE=neo4j \
neo4j-mcp
```

### HTTP Server Mode

```bash
NEO4J_URI=bolt://localhost:7687 \
NEO4J_USERNAME=neo4j \
NEO4J_PASSWORD=password \
NEO4J_TRANSPORT_MODE=http \
NEO4J_MCP_HTTP_PORT=8080 \
NEO4J_MCP_HTTP_HOST=0.0.0.0 \
neo4j-mcp
```

**Use Case**: Remote access from web applications or multiple clients.

### Secure HTTP with TLS

```bash
NEO4J_URI=bolt://localhost:7687 \
NEO4J_USERNAME=neo4j \
NEO4J_PASSWORD=password \
NEO4J_TRANSPORT_MODE=http \
NEO4J_MCP_HTTP_PORT=8443 \
NEO4J_MCP_HTTP_TLS_ENABLED=true \
NEO4J_MCP_HTTP_TLS_CERT_FILE=/path/to/cert.pem \
NEO4J_MCP_HTTP_TLS_KEY_FILE=/path/to/key.pem \
neo4j-mcp
```

### Docker Deployment

```bash
docker run -d \
  --name neo4j-mcp \
  -e NEO4J_URI=bolt://neo4j:7687 \
  -e NEO4J_USERNAME=neo4j \
  -e NEO4J_PASSWORD=password \
  -e NEO4J_TRANSPORT_MODE=http \
  -e NEO4J_MCP_HTTP_PORT=8080 \
  -e NEO4J_MCP_HTTP_HOST=0.0.0.0 \
  -p 8080:8080 \
  neo4j/mcp:latest
```

## MCP Capabilities

### Tools

AI agents can execute Neo4j operations through tools:

- **Query Execution**: Run Cypher queries
- **Schema Inspection**: Get graph schema information
- **Node Operations**: Create, read, update, delete nodes
- **Relationship Operations**: Manage relationships
- **Graph Algorithms**: Execute graph algorithms (via APOC)

**Example Tool Usage** (conceptual):
```
Agent: "Show me the database schema"
MCP Tool: schema_inspection()
Result: Returns node labels, relationships, properties
```

### Resources

Read-only access to database context:

- **Database Schema**: Current graph schema
- **Statistics**: Node/relationship counts
- **Constraints**: Defined constraints and indexes
- **Procedures**: Available APOC procedures

### Prompts

Pre-defined templates for common operations:

- Natural language to Cypher translation
- Schema exploration queries
- Common graph patterns
- Data analysis templates

## Integration Examples

### Claude Code Integration

Add to your project's `.claude/mcp_servers.json`:

```json
{
  "neo4j": {
    "command": "/usr/local/bin/neo4j-mcp",
    "env": {
      "NEO4J_URI": "bolt://localhost:7687",
      "NEO4J_USERNAME": "neo4j",
      "NEO4J_PASSWORD": "password"
    }
  }
}
```

### Python Script Integration

```python
import subprocess
import json

def start_neo4j_mcp():
    env = {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "password"
    }

    process = subprocess.Popen(
        ["neo4j-mcp"],
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    return process

# Start MCP server
mcp_server = start_neo4j_mcp()
```

### Node.js Integration

```javascript
const { spawn } = require('child_process');

const neo4jMcp = spawn('neo4j-mcp', [], {
  env: {
    NEO4J_URI: 'bolt://localhost:7687',
    NEO4J_USERNAME: 'neo4j',
    NEO4J_PASSWORD: 'password',
    NEO4J_TRANSPORT_MODE: 'stdio'
  }
});

neo4jMcp.stdout.on('data', (data) => {
  console.log(`MCP: ${data}`);
});
```

## Best Practices

### Security

1. **Use Read-Only Mode** for production analysis
2. **Secure Credentials**: Use environment variables, never hardcode
3. **Enable TLS** for HTTP transport in production
4. **Restrict CORS Origins** to trusted domains only
5. **Use Strong Passwords**: Follow Neo4j security best practices
6. **Network Isolation**: Run MCP server in secure network segments

### Performance

1. **Adjust Schema Sample Size**: Balance between accuracy and performance
2. **Use APOC Procedures**: Leverage APOC for complex operations
3. **Connection Pooling**: Let the MCP server manage connections
4. **Monitor Resources**: Track memory and CPU usage

### Operational

1. **Enable Telemetry**: Help improve the MCP server (or disable for privacy)
2. **Log Management**: Capture stdout/stderr for debugging
3. **Health Checks**: Implement monitoring for MCP server availability
4. **Version Control**: Document neo4j-mcp version in deployments
5. **Test Connections**: Verify Neo4j connectivity before starting MCP

### Development

1. **Use STDIO Locally**: Simplest for desktop AI agent integration
2. **Use HTTP for Remote**: Better for web applications
3. **Test in Read-Only**: Develop queries safely before enabling writes
4. **Schema Exploration**: Start with schema inspection before complex queries

## Troubleshooting

### Connection Refused

```
Error: Unable to connect to Neo4j
```

**Check**:
1. Neo4j is running: `neo4j status`
2. URI is correct (protocol, host, port)
3. Firewall allows connection
4. Credentials are valid

### APOC Not Available

```
Warning: APOC procedures not found
```

**Solution**:
Install APOC plugin:
```bash
# For Neo4j installations
# Add to neo4j.conf:
dbms.security.procedures.unrestricted=apoc.*

# Download APOC jar to plugins directory
# Restart Neo4j
```

### Authentication Failed

```
Error: Authentication failed
```

**Solution**:
1. Verify credentials
2. Check user has appropriate permissions
3. Verify database name is correct

### Port Already in Use (HTTP mode)

```
Error: Address already in use
```

**Solution**:
```bash
# Use different port
neo4j-mcp --neo4j-transport-mode http --neo4j-http-port 8081
```

### TLS Certificate Errors

```
Error: Invalid TLS certificate
```

**Check**:
1. Certificate file path is correct
2. Certificate matches key file
3. Certificate is not expired
4. Certificate permissions are readable

## Monitoring and Logging

### Capture Logs

```bash
# Redirect to log file
neo4j-mcp 2>&1 | tee neo4j-mcp.log
```

### Systemd Service (Linux)

```ini
[Unit]
Description=Neo4j MCP Server
After=network.target neo4j.service

[Service]
Type=simple
User=neo4j
Environment="NEO4J_URI=bolt://localhost:7687"
Environment="NEO4J_USERNAME=neo4j"
Environment="NEO4J_PASSWORD=password"
ExecStart=/usr/local/bin/neo4j-mcp
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Health Check Script

```bash
#!/bin/bash
# health-check.sh

if curl -f http://localhost:8080/health > /dev/null 2>&1; then
    echo "neo4j-mcp is healthy"
    exit 0
else
    echo "neo4j-mcp is unhealthy"
    exit 1
fi
```

## Example AI Agent Interactions

### Schema Exploration

**User**: "What's in this database?"

**Agent via MCP**:
- Calls `schema_inspection` tool
- Returns: Labels, relationships, properties
- Presents summary to user

### Natural Language Query

**User**: "Show me all people over 30"

**Agent via MCP**:
- Converts to Cypher: `MATCH (p:Person) WHERE p.age > 30 RETURN p`
- Executes via `query_execution` tool
- Formats results for user

### Data Analysis

**User**: "Find the most connected person"

**Agent via MCP**:
- Uses graph algorithms
- Executes: `MATCH (p:Person)-[r]->() RETURN p.name, count(r) ORDER BY count(r) DESC LIMIT 1`
- Provides insights

## Additional Resources

- [Neo4j MCP Official Documentation](https://neo4j.com/docs/mcp/current/)
- [Neo4j MCP GitHub Repository](https://github.com/neo4j/mcp)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Neo4j Developer Guides - MCP](https://neo4j.com/developer/genai-ecosystem/model-context-protocol-mcp/)
- [Getting Started with MCP Servers Blog](https://neo4j.com/blog/developer/model-context-protocol/)
- [Neo4j APOC Documentation](https://neo4j.com/docs/apoc/current/)
