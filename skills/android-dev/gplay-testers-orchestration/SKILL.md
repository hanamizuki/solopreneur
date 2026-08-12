---
name: gplay-testers-orchestration
description: Manage testers for Google Play testing tracks (internal, closed alpha/beta, custom) using edit sessions. Use when assigning testers, creating closed tracks, or promoting builds between tracks.
---

# Testers Orchestration for Google Play

Use this skill to assign testers to a track and promote builds through the
testing funnel. All tester changes happen inside an **edit session** and take
effect only after `gplay edits commit`.

## Testing tracks

| Track | Type | Max testers | Review | Access |
|-------|------|-------------|--------|--------|
| `internal` | Internal | 100 | No | Instant |
| `alpha` | **Closed** testing | Unlimited | No | Minutes |
| `beta` | Open or closed testing | Unlimited | No/Yes | Minutes |
| custom track | Closed testing | Unlimited | No | Minutes |
| `production` | Public | Unlimited | Yes | Days |

`alpha` is a **closed** track (invite-only), not public. Testers on internal
and closed tracks are managed by email address or by Google Group.

## Tester commands

`gplay testers` has only three subcommands. There is **no `testers list`** — to
list the testers on a track, use `testers get`.

- `gplay testers get` — read the testers on a track.
- `gplay testers update` — **replace** the entire tester set (emails/groups not
  included are removed).
- `gplay testers patch` — **merge** with the existing set (preserves fields you
  omit).

### List (get) testers for a track

```bash
gplay testers get \
  --package com.example.app \
  --edit $EDIT_ID \
  --track alpha
```

### Assign testers (replace the whole set)

```bash
gplay testers update \
  --package com.example.app \
  --edit $EDIT_ID \
  --track alpha \
  --emails "tester1@example.com,tester2@example.com"
```

By Google Group instead of individual emails:

```bash
gplay testers update \
  --package com.example.app \
  --edit $EDIT_ID \
  --track alpha \
  --google-groups "beta-testers@example.com,qa-team@example.com"
```

### Add testers without dropping existing ones (patch)

```bash
gplay testers patch \
  --package com.example.app \
  --edit $EDIT_ID \
  --track alpha \
  --emails "newtester@example.com"
```

### Remove a tester (update = replace with the reduced set)

`update` replaces the resource, so re-send only the testers you want to keep:

```bash
CURRENT=$(gplay testers get --package com.example.app --edit $EDIT_ID --track alpha \
  | jq -r '.testers[]?')
KEEP=$(echo "$CURRENT" | grep -v "user@example.com" | paste -sd "," -)

gplay testers update \
  --package com.example.app \
  --edit $EDIT_ID \
  --track alpha \
  --emails "$KEEP"
```

## Assign testers inside an edit session (canonical flow)

Tester assignment is **not** a flag on `gplay release`. There is no `--testers`
flag anywhere. The real flow is an edit session:

```bash
# 1. Create an edit
EDIT_ID=$(gplay edits create --package com.example.app | jq -r '.id')

# 2. Upload the build
gplay bundles upload \
  --package com.example.app \
  --edit $EDIT_ID \
  --file app-release.aab

# 3. Assign the release to the track
gplay tracks update \
  --package com.example.app \
  --edit $EDIT_ID \
  --track alpha \
  --releases '[{"versionCodes":["123"],"status":"completed"}]'

# 4. Assign testers to the track
gplay testers update \
  --package com.example.app \
  --edit $EDIT_ID \
  --track alpha \
  --emails "tester1@example.com,tester2@example.com"

# 5. Commit (nothing applies until this succeeds)
gplay edits commit --package com.example.app --edit $EDIT_ID
```

## Create a closed testing track

Custom closed tracks are created inside an edit, then get testers assigned the
same way:

```bash
EDIT_ID=$(gplay edits create --package com.example.app | jq -r '.id')

gplay tracks create \
  --package com.example.app \
  --edit $EDIT_ID \
  --track qa-ring

gplay testers update \
  --package com.example.app \
  --edit $EDIT_ID \
  --track qa-ring \
  --emails "qa1@example.com,qa2@example.com"

gplay edits commit --package com.example.app --edit $EDIT_ID
```

## Promote a build between tracks

Promotion copies the source track's version codes to a destination track.
`--rollout` is a **fraction** (0.0–1.0), not a percentage:

```bash
# Internal -> closed alpha
gplay promote --package com.example.app --from internal --to alpha

# Closed beta -> production at 10% staged rollout
gplay promote --package com.example.app --from beta --to production --rollout 0.1
```

## Agent behavior

- There is no `testers list` subcommand; use `gplay testers get --track <track>` to read a track's testers.
- Never pass `--testers` to `gplay release`; assign testers via `testers
  update`/`patch` inside an edit, then commit.
- Use `update` to set the exact tester set, `patch` to add without removing.
- `--rollout` values are fractions (0.1 = 10%), range 0.0–1.0.
- Always `gplay edits commit` — tester changes are inert until committed.
- Confirm flags with `--help` before running.
