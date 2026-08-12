---
name: gplay-user-management
description: User and grant management for Google Play Console via gplay users and gplay grants commands. Use when asked to manage developer account users, account-wide permissions, or per-app access grants.
---

# User & Grant Management

Manage team members and their permissions in Google Play Console. Two layers:

- **Users** (`gplay users`) — account-wide members. Permissions here (`*_GLOBAL`, `CAN_SEE_ALL_APPS`) apply across the whole developer account.
- **Grants** (`gplay grants`) — per-app access for a user. Permissions here apply to a single package only.

Use **users** to add someone to the account (optionally with account-wide powers). Use **grants** to give an existing user access to specific apps without granting account-wide reach. Least privilege: prefer per-app grants over global permissions.

## Preconditions

- Credentials set (`gplay auth login` or `GPLAY_SERVICE_ACCOUNT`).
- Service account needs permission to manage users (`CAN_MANAGE_PERMISSIONS_GLOBAL`).
- **Developer ID** is required for every command. Pass it with `--developer`. Find it in the Play Console URL (`play.google.com/console/u/0/developers/<DEVELOPER_ID>/...`).

## Key concepts

- The flag is `--developer` (Developer ID), **not** `--developer-id`.
- There is **no** `--role` or `--permissions` flag. Permissions are supplied as a JSON body via `--json`.
- `--json` accepts an inline JSON string **or** `@path/to/file.json`.
- Users JSON key: `developerAccountPermissions` (account-wide). Grants JSON key: `appLevelPermissions` (per-app).
- `delete` requires `--confirm` — it is a no-op safety guard, and the deletion is irreversible.

## Users (account-wide)

```bash
# List users
gplay users list --developer DEVELOPER_ID
gplay users list --developer DEVELOPER_ID --paginate --page-size 50
gplay users list --developer DEVELOPER_ID --output table

# Create a user (inline JSON)
gplay users create \
  --developer DEVELOPER_ID \
  --email user@example.com \
  --json '{"developerAccountPermissions":["CAN_SEE_ALL_APPS"]}'

# Create with an expiration and JSON from a file
gplay users create \
  --developer DEVELOPER_ID \
  --email contractor@example.com \
  --json @perms.json

# Update a user's account-wide permissions
gplay users update \
  --developer DEVELOPER_ID \
  --email user@example.com \
  --json '{"developerAccountPermissions":["CAN_SEE_ALL_APPS","CAN_VIEW_FINANCIAL_DATA_GLOBAL"]}'

# Delete a user (requires --confirm)
gplay users delete \
  --developer DEVELOPER_ID \
  --email user@example.com \
  --confirm
```

Users JSON body (`expirationTime` is optional, RFC 3339):

```json
{
  "developerAccountPermissions": [
    "CAN_SEE_ALL_APPS",
    "CAN_VIEW_FINANCIAL_DATA_GLOBAL"
  ],
  "expirationTime": "2025-12-31T23:59:59Z"
}
```

`update` also accepts `--update-mask` (comma-separated fields) to update only specific fields; if omitted, all fields in the body are applied.

### Account-level permissions (users)

`CAN_SEE_ALL_APPS`, `CAN_VIEW_FINANCIAL_DATA_GLOBAL`, `CAN_MANAGE_PERMISSIONS_GLOBAL`,
`CAN_EDIT_GAMES_GLOBAL`, `CAN_PUBLISH_GAMES_GLOBAL`, `CAN_REPLY_TO_REVIEWS_GLOBAL`,
`CAN_MANAGE_PUBLIC_APKS_GLOBAL`, `CAN_MANAGE_TRACK_APKS_GLOBAL`, `CAN_MANAGE_TRACK_USERS_GLOBAL`,
`CAN_MANAGE_PUBLIC_LISTING_GLOBAL`, `CAN_MANAGE_DRAFT_APPS_GLOBAL`,
`CAN_CREATE_MANAGED_PLAY_APPS_GLOBAL`, `CAN_CHANGE_MANAGED_PLAY_SETTING_GLOBAL`,
`CAN_MANAGE_ORDERS_GLOBAL`

## Grants (per-app)

```bash
# Grant a user access to one app
gplay grants create \
  --developer DEVELOPER_ID \
  --email user@example.com \
  --package com.example.app \
  --json '{"appLevelPermissions":["CAN_ACCESS_APP","CAN_MANAGE_PUBLIC_APKS"]}'

# Update an app grant
gplay grants update \
  --developer DEVELOPER_ID \
  --email user@example.com \
  --package com.example.app \
  --json '{"appLevelPermissions":["CAN_ACCESS_APP","CAN_MANAGE_PUBLIC_LISTING"]}'

# Revoke an app grant (requires --confirm)
gplay grants delete \
  --developer DEVELOPER_ID \
  --email user@example.com \
  --package com.example.app \
  --confirm
```

Grants JSON body:

```json
{
  "appLevelPermissions": [
    "CAN_ACCESS_APP",
    "CAN_MANAGE_PUBLIC_APKS"
  ]
}
```

`update` also accepts `--update-mask`.

### App-level permissions (grants)

`CAN_ACCESS_APP` (basic access), `CAN_VIEW_FINANCIAL_DATA`, `CAN_MANAGE_PERMISSIONS`,
`CAN_REPLY_TO_REVIEWS`, `CAN_MANAGE_PUBLIC_APKS` (production releases),
`CAN_MANAGE_TRACK_APKS` (test tracks), `CAN_MANAGE_TRACK_USERS` (testers),
`CAN_MANAGE_PUBLIC_LISTING`, `CAN_MANAGE_DRAFT_APPS`, `CAN_MANAGE_ORDERS`

## Permission recipes

Build the JSON body from the constants above. `CAN_ACCESS_APP` is the base for any app grant.

**Read-only viewer (per app):**
```json
{"appLevelPermissions":["CAN_ACCESS_APP"]}
```

**Release manager (per app):**
```json
{"appLevelPermissions":["CAN_ACCESS_APP","CAN_MANAGE_PUBLIC_APKS","CAN_MANAGE_TRACK_APKS","CAN_MANAGE_TRACK_USERS","CAN_MANAGE_DRAFT_APPS"]}
```

**Finance (per app):**
```json
{"appLevelPermissions":["CAN_ACCESS_APP","CAN_VIEW_FINANCIAL_DATA","CAN_MANAGE_ORDERS"]}
```

**Account-wide finance (user):**
```json
{"developerAccountPermissions":["CAN_SEE_ALL_APPS","CAN_VIEW_FINANCIAL_DATA_GLOBAL"]}
```

## Workflows

**Onboard a member scoped to specific apps** — create the user with minimal (or no) account-wide permissions, then add per-app grants:
```bash
gplay users create --developer DEVELOPER_ID --email dev@example.com \
  --json '{"developerAccountPermissions":[]}'
gplay grants create --developer DEVELOPER_ID --email dev@example.com \
  --package com.example.app --json '{"appLevelPermissions":["CAN_ACCESS_APP","CAN_MANAGE_PUBLIC_APKS"]}'
```

**Offboard** — delete the user to revoke all access at once:
```bash
gplay users delete --developer DEVELOPER_ID --email departed@example.com --confirm
```

**Audit** — list everyone as a table:
```bash
gplay users list --developer DEVELOPER_ID --paginate --output table
```
