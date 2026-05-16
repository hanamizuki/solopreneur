# aura-cli Reference

## Installation

### Platform-Specific Installation

**Windows**:
```bash
move aura-cli.exe c:\windows\system32
```

**macOS/Linux**:
```bash
sudo mv aura-cli /usr/local/bin/
chmod +x /usr/local/bin/aura-cli
```

```bash
aura-cli --version
```

## Initial Setup

1. Log in to [Neo4j Console](https://console.neo4j.io/)
2. Navigate to Account Settings
3. Generate API credentials (Client ID and Client Secret)

```bash
aura-cli credential add \
  --name "Aura API Credentials" \
  --client-id <your-client-id> \
  --client-secret <your-client-secret>
```

## Basic Syntax

```bash
aura-cli [command] [subcommand] [flags]
```

**Global Flags**:
- `-h, --help` - Display help for any command
- `-v, --version` - Display version information
- `--output {default,json,table}` - Output format
- `--auth-url <url>` - Authentication URL (optional)
- `--base-url <url>` - API base URL (optional)

## Command Categories

### credential

```bash
aura-cli credential add \
  --name "Production Credentials" \
  --client-id <client-id> \
  --client-secret <client-secret>

aura-cli credential list

aura-cli credential use "Production Credentials"

aura-cli credential remove "Old Credentials"
```

### instance

```bash
aura-cli instance create \
  --name "production-db" \
  --type "enterprise-db" \
  --region "us-east-1" \
  --memory "8GB" \
  --cloud-provider "gcp"
```

**Options**:
- `--name` - Instance name
- `--type` - Instance type (e.g., `enterprise-db`, `professional-db`)
- `--region` - Cloud region
- `--memory` - Memory allocation
- `--cloud-provider` - Cloud provider (`gcp`, `aws`, `azure`)
- `--tenant-id` - Tenant ID (if applicable)

**Example Output**:
```json
{
  "id": "abc123def456",
  "name": "production-db",
  "status": "creating",
  "connection_url": "neo4j+s://abc123def456.databases.neo4j.io"
}
```

```bash
aura-cli instance list
aura-cli instance list --output table
aura-cli instance list --output json

aura-cli instance get <instance-id>
aura-cli instance get abc123def456 --output json

aura-cli instance update <instance-id> \
  --name "new-name" \
  --memory "16GB"

aura-cli instance pause <instance-id>

aura-cli instance resume <instance-id>

aura-cli instance delete <instance-id>
aura-cli instance delete abc123def456 --confirm

aura-cli instance overwrite <target-instance-id> \
  --source-instance-id <source-instance-id>
```

```bash
# List snapshots
aura-cli instance snapshot list <instance-id>

# Create snapshot
aura-cli instance snapshot create <instance-id> --name "backup-2026-02-16"

# Restore from snapshot
aura-cli instance snapshot restore <instance-id> --snapshot-id <snapshot-id>
```

### tenant

```bash
aura-cli tenant list
aura-cli tenant get <tenant-id>
```

### graph-analytics

```bash
aura-cli graph-analytics list
aura-cli graph-analytics get <instance-id>
```

### customer-managed-key

```bash
aura-cli customer-managed-key list

aura-cli customer-managed-key add \
  --key-id <key-id> \
  --cloud-provider <provider>
```

## Configuration

Config file location:
- **Linux/macOS**: `~/.aura-cli/config.json`
- **Windows**: `%USERPROFILE%\.aura-cli\config.json`

**Environment Variables**:
- `AURA_CLI_AUTH_URL` - Override authentication URL
- `AURA_CLI_BASE_URL` - Override API base URL
- `AURA_CLI_CLIENT_ID` - Client ID for authentication
- `AURA_CLI_CLIENT_SECRET` - Client secret for authentication
- `AURA_CLI_CONFIG_PATH` - Custom config file location

## Common Workflows

### Provision New Instance

```bash
aura-cli credential add \
  --name "Aura Credentials" \
  --client-id $CLIENT_ID \
  --client-secret $CLIENT_SECRET

aura-cli instance create \
  --name "my-app-db" \
  --type "enterprise-db" \
  --region "us-east-1" \
  --memory "8GB" \
  --cloud-provider "aws"

aura-cli instance get <instance-id>
```

### Backup and Restore

```bash
aura-cli instance snapshot create abc123def456 \
  --name "pre-migration-backup"

aura-cli instance snapshot list abc123def456

aura-cli instance snapshot restore abc123def456 \
  --snapshot-id snapshot-xyz789
```

### Cost Management

```bash
aura-cli instance pause dev-instance-id
aura-cli instance resume dev-instance-id
aura-cli instance delete old-instance-id
```

### CI/CD Integration

```bash
#!/bin/bash
INSTANCE_ID=$(aura-cli instance create \
  --name "test-$CI_BUILD_ID" \
  --type "professional-db" \
  --region "us-east-1" \
  --memory "4GB" \
  --output json | jq -r '.id')

echo "Created instance: $INSTANCE_ID"

# Run tests...

aura-cli instance delete $INSTANCE_ID
```

### Multi-Environment Management

```bash
aura-cli credential use "Production Credentials"
aura-cli instance list

aura-cli credential use "Development Credentials"
aura-cli instance list
```

### Refresh Staging from Production

```bash
aura-cli instance overwrite staging-instance-id \
  --source-instance-id production-instance-id
```

## Output Examples

### List Instances (Table)

```bash
aura-cli instance list --output table
```

```
+------------------+------------------+----------+----------+---------------+
| ID               | NAME             | TYPE     | STATUS   | REGION        |
+------------------+------------------+----------+----------+---------------+
| abc123def456     | production-db    | enterprise| running  | us-east-1     |
| xyz789ghi012     | staging-db       | professional| running| eu-west-1     |
| mno345pqr678     | dev-db           | free     | paused   | us-west-2     |
+------------------+------------------+----------+----------+---------------+
```

### Get Instance (JSON)

```bash
aura-cli instance get abc123def456 --output json
```

```json
{
  "id": "abc123def456",
  "name": "production-db",
  "type": "enterprise-db",
  "status": "running",
  "region": "us-east-1",
  "memory": "8GB",
  "cloud_provider": "aws",
  "connection_url": "neo4j+s://abc123def456.databases.neo4j.io",
  "created_at": "2026-01-15T10:30:00Z",
  "tenant_id": "tenant-123"
}
```

## Scripting Examples

### Bash: List All Instances

```bash
#!/bin/bash
set -e

aura-cli instance list --output json | jq -r '.[] | "\(.name) (\(.status)) - \(.connection_url)"'
```

### Python: Create and Monitor Instance

```python
import subprocess
import json
import time

def create_instance(name, memory="4GB"):
    cmd = [
        "aura-cli", "instance", "create",
        "--name", name,
        "--type", "professional-db",
        "--region", "us-east-1",
        "--memory", memory,
        "--output", "json"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)

def get_instance(instance_id):
    cmd = ["aura-cli", "instance", "get", instance_id, "--output", "json"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)

instance = create_instance("test-db")
instance_id = instance["id"]
print(f"Created instance: {instance_id}")

while True:
    status = get_instance(instance_id)
    if status["status"] == "running":
        print(f"Instance ready: {status['connection_url']}")
        break
    print(f"Status: {status['status']}, waiting...")
    time.sleep(30)
```

## Troubleshooting

### Authentication Failed

```
Error: authentication failed
```

Verify credentials in Neo4j Console, then re-add:
```bash
aura-cli credential add --name "Aura Credentials" \
  --client-id <id> --client-secret <secret>
```

### No Default Credential

```
Error: no default credential set
```

```bash
aura-cli credential use "Credential Name"
```

### Instance Creation Failed

```
Error: instance creation failed - insufficient quota
```

Check account quota limits, billing status, and region availability in Neo4j Console.

### API Rate Limiting

```
Error: rate limit exceeded
```

Add delays between API calls; use `--output json` and parse results to minimize calls.

### Connection Issues

```
Error: unable to connect to Aura API
```

Check internet connectivity, corporate firewall/proxy settings, and API endpoint status: https://status.neo4j.io/

## Best Practices

1. **Secure Credentials**: Never commit to version control; use environment variables in CI/CD
2. **JSON Output for Scripts**: Always use `--output json` in automation scripts
3. **Pause Unused Instances**: Reduce costs by pausing development/staging instances
4. **Automate Backups**: Schedule regular snapshots via cron/scheduled tasks
5. **Error Handling**: Check exit codes in scripts (`$?` in bash)
6. **Multi-Credential Setup**: Use separate credentials for different environments

## Additional Resources

- [Aura CLI GitHub Repository](https://github.com/neo4j/aura-cli)
- [Aura CLI Releases](https://github.com/neo4j/aura-cli/releases)
- [Neo4j Aura Documentation](https://neo4j.com/docs/aura/)
- [Neo4j Console](https://console.neo4j.io/)
- [Aura API Documentation](https://neo4j.com/docs/aura/aura-api/)
- [Neo4j Status Page](https://status.neo4j.io/)
