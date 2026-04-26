# aura-cli Reference

## Overview

The Neo4j Aura CLI is a powerful command-line tool for managing Neo4j Aura cloud resources. It provides programmatic access to provision, configure, and manage AuraDB and AuraDS instances, tenants, and related cloud infrastructure.

## Installation

### Download Binary

1. Visit the [releases page](https://github.com/neo4j/aura-cli/releases/latest)
2. Download the appropriate archive for your platform and architecture
3. Extract the executable

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

### Verify Installation

```bash
aura-cli --version
```

## Initial Setup

### Create API Credentials

1. Log in to [Neo4j Console](https://console.neo4j.io/)
2. Navigate to Account Settings
3. Generate API credentials (Client ID and Client Secret)

### Add Credentials to CLI

```bash
aura-cli credential add \
  --name "Aura API Credentials" \
  --client-id <your-client-id> \
  --client-secret <your-client-secret>
```

This command adds the credential and sets it as the default for subsequent operations.

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

### 1. Credential Management (`credential`)

Manage API credentials for authentication.

#### add
Add new API credentials.

```bash
aura-cli credential add \
  --name "Production Credentials" \
  --client-id <client-id> \
  --client-secret <client-secret>
```

#### list
List all stored credentials.

```bash
aura-cli credential list
```

#### use
Set default credential to use.

```bash
aura-cli credential use "Production Credentials"
```

#### remove
Remove stored credentials.

```bash
aura-cli credential remove "Old Credentials"
```

### 2. Instance Management (`instance`)

Manage AuraDB and AuraDS instances.

#### create
Create a new Neo4j Aura instance.

```bash
aura-cli instance create \
  --name "production-db" \
  --type "enterprise-db" \
  --region "us-east-1" \
  --memory "8GB" \
  --cloud-provider "gcp"
```

**Common Options**:
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

#### list
List all instances.

```bash
# Default output
aura-cli instance list

# Table format
aura-cli instance list --output table

# JSON output
aura-cli instance list --output json
```

#### get
Get details for a specific instance.

```bash
aura-cli instance get <instance-id>
```

**Example**:
```bash
aura-cli instance get abc123def456 --output json
```

#### update
Update instance configuration.

```bash
aura-cli instance update <instance-id> \
  --name "new-name" \
  --memory "16GB"
```

#### pause
Pause a running instance (stops billing).

```bash
aura-cli instance pause <instance-id>
```

**Example**:
```bash
aura-cli instance pause abc123def456
```

#### resume
Resume a paused instance.

```bash
aura-cli instance resume <instance-id>
```

#### delete
Delete an instance permanently.

```bash
aura-cli instance delete <instance-id>
```

**Example with confirmation**:
```bash
aura-cli instance delete abc123def456 --confirm
```

#### overwrite
Overwrite instance data with data from another instance.

```bash
aura-cli instance overwrite <target-instance-id> \
  --source-instance-id <source-instance-id>
```

**Use Case**: Refresh staging environment from production.

#### snapshot
Manage instance snapshots.

```bash
# List snapshots
aura-cli instance snapshot list <instance-id>

# Create snapshot
aura-cli instance snapshot create <instance-id> --name "backup-2026-02-16"

# Restore from snapshot
aura-cli instance snapshot restore <instance-id> --snapshot-id <snapshot-id>
```

### 3. Tenant Management (`tenant`)

Manage Aura tenants (organizational units).

```bash
# List tenants
aura-cli tenant list

# Get tenant details
aura-cli tenant get <tenant-id>
```

### 4. Graph Analytics (`graph-analytics`)

Manage Graph Analytics instances and operations.

```bash
# List graph analytics instances
aura-cli graph-analytics list

# Get graph analytics instance details
aura-cli graph-analytics get <instance-id>
```

### 5. Customer Managed Keys (`customer-managed-key`)

Manage encryption keys for enhanced security.

```bash
# List customer-managed keys
aura-cli customer-managed-key list

# Add customer-managed key
aura-cli customer-managed-key add \
  --key-id <key-id> \
  --cloud-provider <provider>
```

## Configuration

### Config File

Credentials and configuration are stored locally in:
- **Linux/macOS**: `~/.aura-cli/config.json`
- **Windows**: `%USERPROFILE%\.aura-cli\config.json`

### Environment Variables

- `AURA_CLI_AUTH_URL` - Override authentication URL
- `AURA_CLI_BASE_URL` - Override API base URL
- `AURA_CLI_CLIENT_ID` - Client ID for authentication
- `AURA_CLI_CLIENT_SECRET` - Client secret for authentication
- `AURA_CLI_CONFIG_PATH` - Custom config file location

### Output Format

**Default** (human-readable):
```bash
aura-cli instance list
```

**JSON** (for scripting):
```bash
aura-cli instance list --output json
```

**Table** (formatted view):
```bash
aura-cli instance list --output table
```

## Common Workflows

### Provision New Instance

```bash
# 1. Add credentials (if not already done)
aura-cli credential add \
  --name "Aura Credentials" \
  --client-id $CLIENT_ID \
  --client-secret $CLIENT_SECRET

# 2. Create instance
aura-cli instance create \
  --name "my-app-db" \
  --type "enterprise-db" \
  --region "us-east-1" \
  --memory "8GB" \
  --cloud-provider "aws"

# 3. Get connection details
aura-cli instance get <instance-id>
```

### Backup and Restore

```bash
# Create snapshot
aura-cli instance snapshot create abc123def456 \
  --name "pre-migration-backup"

# List snapshots
aura-cli instance snapshot list abc123def456

# Restore if needed
aura-cli instance snapshot restore abc123def456 \
  --snapshot-id snapshot-xyz789
```

### Cost Management

```bash
# Pause unused development instances
aura-cli instance pause dev-instance-id

# Resume when needed
aura-cli instance resume dev-instance-id

# Delete unused instances
aura-cli instance delete old-instance-id
```

### CI/CD Integration

```bash
#!/bin/bash
# Create ephemeral test instance

INSTANCE_ID=$(aura-cli instance create \
  --name "test-$CI_BUILD_ID" \
  --type "professional-db" \
  --region "us-east-1" \
  --memory "4GB" \
  --output json | jq -r '.id')

echo "Created instance: $INSTANCE_ID"

# Run tests...

# Cleanup
aura-cli instance delete $INSTANCE_ID
```

### Multi-Environment Management

```bash
# Switch between credentials
aura-cli credential use "Production Credentials"
aura-cli instance list

aura-cli credential use "Development Credentials"
aura-cli instance list
```

### Refresh Staging from Production

```bash
# Overwrite staging with production data
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

### Bash Script: List All Instances

```bash
#!/bin/bash
set -e

echo "Fetching all Aura instances..."
aura-cli instance list --output json | jq -r '.[] | "\(.name) (\(.status)) - \(.connection_url)"'
```

### Python Script: Create and Monitor Instance

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

# Create instance
instance = create_instance("test-db")
instance_id = instance["id"]
print(f"Created instance: {instance_id}")

# Wait for instance to be ready
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

**Solution**:
1. Verify credentials in Neo4j Console
2. Re-add credentials:
```bash
aura-cli credential add --name "Aura Credentials" \
  --client-id <id> --client-secret <secret>
```

### No Default Credential

```
Error: no default credential set
```

**Solution**:
```bash
aura-cli credential use "Credential Name"
```

### Instance Creation Failed

```
Error: instance creation failed - insufficient quota
```

**Check**:
- Account quota limits in Neo4j Console
- Billing status
- Region availability

### API Rate Limiting

```
Error: rate limit exceeded
```

**Solution**:
- Add delays between API calls
- Use `--output json` and parse results to minimize calls

### Connection Issues

```
Error: unable to connect to Aura API
```

**Check**:
- Internet connectivity
- Corporate firewall/proxy settings
- API endpoint status: https://status.neo4j.io/

## Best Practices

1. **Secure Credentials**: Store credentials securely, never commit to version control
2. **Use Environment Variables**: Set credentials via environment variables in CI/CD
3. **Tag Instances**: Use descriptive names for easy identification
4. **Automate Backups**: Schedule regular snapshots via cron/scheduled tasks
5. **Pause Unused Instances**: Reduce costs by pausing development/staging instances
6. **JSON Output for Scripts**: Always use `--output json` in automation scripts
7. **Error Handling**: Check exit codes in scripts (`$?` in bash)
8. **Multi-Credential Setup**: Use separate credentials for different environments
9. **Monitor Costs**: Regularly audit instance list and delete unused instances
10. **Version Control**: Document aura-cli version in deployment scripts

## Additional Resources

- [Aura CLI GitHub Repository](https://github.com/neo4j/aura-cli)
- [Aura CLI Releases](https://github.com/neo4j/aura-cli/releases)
- [Neo4j Aura Documentation](https://neo4j.com/docs/aura/)
- [Neo4j Console](https://console.neo4j.io/)
- [Aura API Documentation](https://neo4j.com/docs/aura/aura-api/)
- [Neo4j Status Page](https://status.neo4j.io/)
