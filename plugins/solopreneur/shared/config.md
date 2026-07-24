---
name: shared/config
description: |
  Config reference for solopreneur skills, covering both config files.
  1. `solopreneur.json` (legacy, keyed by git remote): the four shell helpers
     — solopreneur_repo_key, read_solopreneur_config, write_solopreneur_config,
     write_solopreneur_repo_config — and their per-repo override cascade.
  2. `.solopreneur.json` (v2, keyed by filesystem path): the schema, the
     resolution order, and the path rules used by the preview Library and its
     config-resolve.mjs resolver.
  The two files coexist; neither reader touches the other's file.

  This file is NOT a skill — it is a reference document. Skills that need
  config access must inline these function definitions verbatim at the top of
  their bash blocks.
---

# Solopreneur Config Cascade Helper

All solopreneur skills that read or write `solopreneur.json` must use these
helpers instead of hardcoding paths or recomputing repo identity. Inline the
helper block verbatim at the top of each bash section that touches config.

## Schema

Solopreneur config has two top-level sections:

```jsonc
{
  "default": {
    // settings that apply to every repo lacking an override
    "greenlight": { "fallback_order": ["codex-bot", "codex-cli"] },
    "plans":      { "dir": "docs/plans" },
    "verify":     { "cmd": "make verify" }
  },
  "repos": {
    // per-repo overrides, keyed by normalized repo identity
    "github.com/owner/repo-a": {
      "todos": { "backlog": "todos/backlog", "doing": "todos/doing", ... }
    },
    "github.com/owner/repo-b": {
      "plans":  { "dir": "docs/proposals" },
      "verify": { "cmd": "cargo clippy -- -D warnings && cargo test --lib" }
    }
  }
}
```

A repo key (`github.com/owner/repo` style) is computed from the working repo's
`origin` remote — see `solopreneur_repo_key` below.

## The `verify` feature key

`verify` names the repo's fast, deterministic verify entry point — the single
command greenlight's inner verify loop runs against the working tree after each
fix and before committing (see `skills/greenlight/SKILL.md`, "Inner verify
loop"). Store the command inside a one-field object rather than as a bare
string, following the scalar-wrapper guidance under "Edge case" below: the
object also lets a per-repo entry override-to-disable a global default (a
non-null object wins the cascade; an empty `cmd` then means "skip").

```jsonc
{
  "default": {
    "verify": { "cmd": "make verify" }   // lint + typecheck + fast unit tests
  },
  "repos": {
    // per-repo override; empty cmd disables verify for this repo despite the default
    "github.com/owner/rust-svc": { "verify": { "cmd": "cargo clippy -- -D warnings && cargo test --lib" } },
    "github.com/owner/no-ci":    { "verify": { "cmd": "" } }
  }
}
```

Read it with the cascade helper and pull the command string out (tolerate an
unset key — jq gets empty stdin and must not abort the block):

```bash
VERIFY_CMD=$(read_solopreneur_config verify | jq -r '.cmd // empty' 2>/dev/null)
[ -z "$VERIFY_CMD" ] && echo "NO_VERIFIER" || echo "VERIFY_CMD=$VERIFY_CMD"
```

Keep the command **fast and deterministic** — lint, typecheck, and fast unit
tests only. E2E and security suites belong in CI, never in this command: they
are slow and flaky, and flakiness inside greenlight's bounded retry loop
produces false halts. It is intentionally a **single** command, not a per-size
matrix — the layer that would differ most across sizes (E2E) is exactly the
layer excluded here. A repo with no `verify` configured makes greenlight skip
the inner loop and flag the run as having no objective verifier.

## Lookup order (read)

`read_solopreneur_config <feature>` walks five layers, first non-null wins.
Each layer returns the **whole subtree** for `<feature>` (no merging across
layers):

| # | File                                                  | Path                                |
|---|-------------------------------------------------------|-------------------------------------|
| 1 | primary (`$CLAUDE_CONFIG_DIR/solopreneur.json`)       | `.repos[<repo-key>].<feature>`      |
| 2 | primary                                               | `.default.<feature>`                |
| 3 | fallback (`$HOME/.claude/solopreneur.json`) if differs| `.repos[<repo-key>].<feature>`      |
| 4 | fallback                                              | `.default.<feature>`                |
| 5 | primary, then fallback (legacy fallback)              | `.<feature>` at top level           |

Layer 5 keeps **pre-refactor configs working unchanged** — users do not need
to migrate their JSON. New writes always use the new shape, but reads honor
the old shape if that's all the file has.

`CLAUDE_CONFIG_DIR` is inherited from the parent session (see
`rebuild-skill-index/SKILL.md:30`); `:-$HOME/.claude` makes the helper safe
when the variable is unset.

## Write API

Two writers; both write to the primary file only (fallback is never touched).

- **`write_solopreneur_config <key> <jq_expr>`** — writes to
  `.default.<key>` in primary. Use for user-global preferences (e.g.
  `greenlight.fallback_order`).
- **`write_solopreneur_repo_config <key> <jq_expr>`** — writes to
  `.repos[<repo-key>].<key>` in primary. Use for repo-specific state (e.g.
  `preview.path`, `todos`).

Both helpers preserve sibling keys (atomic read-modify-write via `mktemp` +
`mv`) and create the file + parent directory if missing.

## Edge case: null vs false vs empty string

The cascade uses `| values` (jq's `select(. != null)`) to fall through on
`null` and missing keys, while preserving `false`, `0`, `""`, and empty
objects/arrays at the layer that owns them. That means a per-repo entry
storing `false` (e.g. to explicitly disable a feature for that repo) wins
over the default's truthy value — matching the documented "first non-null
wins" semantics literally.

Shell-side, the helper returns the stringified value via `jq -r`. An empty
string value would be shell-empty after capture and would erroneously fall
through; in practice feature values are objects so this case doesn't
arise in current config schema. Future bool/string features should be
stored under non-empty object wrappers (`{ "enabled": false }`) rather
than as bare scalars to dodge that one ambiguity.

## Repo identity (`solopreneur_repo_key`)

The repo key is derived from the working directory at call time:

1. `git remote get-url origin` → strip scheme (`https://`, `http://`),
   strip trailing `.git`, strip `git@host:` prefix → normalized
   `host/owner/repo`.
2. No `origin` remote → absolute path of `git rev-parse --show-toplevel`.
3. Not in a git repo → `$PWD`.

The bash parameter expansion `${var/://}` only replaces the *first* `:` — so
inputs like `git@github.com:owner/repo` correctly produce
`github.com/owner/repo` even if the path contains additional colons.

## Migration

The legacy fallback layer means **no automatic migration is needed**. Old
configs like:

```jsonc
{
  "greenlight": { "fallback_order": ["codex-bot", "codex-cli"] },
  "todos":      { "backlog": "/abs/path/backlog", ... },
  "preview":    { "paths": { "github.com/owner/repo": "docs/preview" } }
}
```

…keep working as-is via layer 5.

If you want to move into the new shape (e.g. so a per-repo override can sit
above a default), hand-edit the JSON like this:

```jsonc
{
  "default": {
    "greenlight": { "fallback_order": ["codex-bot", "codex-cli"] }
  },
  "repos": {
    "github.com/owner/mojo-apps":  { "todos":  { "backlog": "todos/backlog", ... } },
    "github.com/owner/some-repo":  { "preview": { "path": "docs/preview" } }
  }
}
```

The `preview` skill's old `preview.paths.<repo-key>` subtree migrates to
`repos[<repo-key>].preview.path` (note: singular `path`, plus the value is
the path string directly, not wrapped in another object).

## Helper block (copy verbatim into skills)

```bash
# --- solopreneur config helpers (inlined from shared/config.md) ---
# Compute the canonical repo identity used as the key under `.repos` in
# solopreneur.json. Falls back to git toplevel path, then $PWD.
solopreneur_repo_key() {
  local url root
  url=$(git remote get-url origin 2>/dev/null || true)
  if [ -n "$url" ]; then
    # Strip protocol schemes (https/http/ssh/git) and user prefixes (git@)
    # in either order — origin URLs come in many shapes:
    #   https://github.com/owner/repo.git
    #   http://github.com/owner/repo.git
    #   ssh://git@github.com/owner/repo.git
    #   git://github.com/owner/repo.git
    #   git@github.com:owner/repo.git
    url="${url#https://}"; url="${url#http://}"
    url="${url#ssh://}";   url="${url#git://}"
    url="${url#git@}"
    url="${url%.git}"
    # Replace the first `:` with `/` — the scp-style `git@host:owner/repo`
    # form. Bash `${var/pattern/replacement}` parses the second `/` as the
    # delimiter; the chars after it (`/` here) are the replacement, so this
    # produces a single slash, not double. (Tested.)
    url="${url/://}"
    printf '%s\n' "$url"
    return
  fi
  root=$(git rev-parse --show-toplevel 2>/dev/null || true)
  if [ -n "$root" ]; then
    printf '%s\n' "$root"
    return
  fi
  printf '%s\n' "$PWD"
}

# Read a feature subtree from solopreneur.json with the 5-layer cascade:
# 1. primary .repos[<repo-key>].<feature>
# 2. primary .default.<feature>
# 3. fallback .repos[<repo-key>].<feature>
# 4. fallback .default.<feature>
# 5. legacy top-level .<feature> (primary then fallback)
# First non-null wins. Each layer is checked inline (no nested helper
# function — bash function declarations are global, even nested ones, and
# would pollute the user's shell namespace).
read_solopreneur_config() {
  local key="\$1"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local fallback="$HOME/.claude/solopreneur.json"
  local repo_key; repo_key=$(solopreneur_repo_key)
  local out

  # Layer 1: primary .repos[<repo-key>].<feature>
  if [ -f "$primary" ]; then
    out=$(jq -r --arg rk "$repo_key" --arg fk "$key" '.repos[$rk][$fk] | values' "$primary" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
    # Layer 2: primary .default.<feature>
    out=$(jq -r --arg fk "$key" '.default[$fk] | values' "$primary" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  fi

  # Layers 3 + 4: fallback file, only if different from primary
  if [ "$primary" != "$fallback" ] && [ -f "$fallback" ]; then
    out=$(jq -r --arg rk "$repo_key" --arg fk "$key" '.repos[$rk][$fk] | values' "$fallback" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
    out=$(jq -r --arg fk "$key" '.default[$fk] | values' "$fallback" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  fi

  # Layer 5: legacy top-level — primary then fallback
  if [ -f "$primary" ]; then
    out=$(jq -r --arg fk "$key" '.[$fk] | values' "$primary" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  fi
  if [ "$primary" != "$fallback" ] && [ -f "$fallback" ]; then
    out=$(jq -r --arg fk "$key" '.[$fk] | values' "$fallback" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  fi
}

# Write a feature subtree to .default.<key> in the primary file.
# Sibling keys are preserved (atomic read-modify-write).
# Usage: write_solopreneur_config greenlight '{fallback_order:["codex-bot","codex-cli"]}'
write_solopreneur_config() {
  local key="\$1"
  local value_expr="\$2"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local tmp existing
  mkdir -p "$(dirname "$primary")"
  tmp=$(mktemp "${primary}.XXXXXX")
  existing=$(cat "$primary" 2>/dev/null); [ -z "$existing" ] && existing='{}'
  printf '%s\n' "$existing" \
    | jq --arg fk "$key" --argjson v "$(jq -n "$value_expr")" \
        '.default = ((.default // {}) | .[$fk] = $v)' \
    > "$tmp" || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$primary"
}

# Write a feature subtree to .repos[<repo-key>].<key> in the primary file.
# Sibling repos AND sibling features within the same repo are preserved.
# Usage: write_solopreneur_repo_config preview '{path:"docs/preview"}'
write_solopreneur_repo_config() {
  local key="\$1"
  local value_expr="\$2"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local repo_key; repo_key=$(solopreneur_repo_key)
  local tmp existing
  mkdir -p "$(dirname "$primary")"
  tmp=$(mktemp "${primary}.XXXXXX")
  existing=$(cat "$primary" 2>/dev/null); [ -z "$existing" ] && existing='{}'
  printf '%s\n' "$existing" \
    | jq --arg rk "$repo_key" --arg fk "$key" --argjson v "$(jq -n "$value_expr")" \
        '.repos = ((.repos // {}) | .[$rk] = ((.[$rk] // {}) | .[$fk] = $v))' \
    > "$tmp" || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$primary"
}
# --- end solopreneur config helpers ---
```

Skills that only read may omit the two write helpers and `solopreneur_repo_key`
is still required because `read_solopreneur_config` calls it. The cleanest
rule is: inline the **whole block** verbatim. The helper is small and
duplication keeps each skill self-contained at install time. The constraint is
specific to SKILL.md *bodies*: markdown cannot `source` a shared file, so a
bash block that needs the helpers has to carry them. A **script** shipped
beside a skill has no such limit — the plugin installs as one directory, so
`shared/` is readable at runtime (`preview/scripts/config-resolve.mjs` reads
`shared/config.schema.json` that way). Prefer that for new code; leave the
existing inlined copies alone.

When this file changes, all consuming skills must re-sync. Find the
marker-tagged verbatim copies with:

```bash
grep -rl "# --- solopreneur config helpers" plugins/solopreneur/skills/
```

One consumer carries a bespoke derivative WITHOUT the marker —
`preview/scripts/deploy.sh`'s `_preview_repo_key`, which re-copies only the
repo-key URL normalization (it anchors at `$DIR` instead of cwd, so it cannot
inline the block verbatim). The marker grep above misses it. List every
normalization copy that lacks the marker (currently just deploy.sh) with
`-F` fixed-string match — a BRE pattern silently matches nothing on BSD grep:

```bash
grep -rlF 'url="${url#git@}"' plugins/solopreneur/skills/ | while read -r f; do grep -LF '# --- solopreneur config helpers' "$f"; done
```

Neither grep can find copies written in another language, so those are
registered here by hand:

- `preview/scripts/config-resolve.mjs` — `legacyPreviewValues()` and the
  layer 4/5 file locations restate this file's legacy layout in JavaScript. It
  only ever **reads and reports** that layout; it never writes a legacy file.
- `preview/scripts/config-migrate.mjs` — its own `legacyPreviewValues()`, plus
  two readers that restate the **two different cascades** described above:
  `readAutoProtect()` mirrors `deploy.sh:read_preview_config` (file-major —
  `repos[<rk>]` then `default` *within* each file), and `readPath()` mirrors
  `read_solopreneur_config preview`
  (subtree-major — the whole `preview` subtree from the first layer that has
  one, then `.path` else `.paths[<rk>]` from that one subtree) for the preview
  path. Both treat `null` **and the empty string** as "not an answer", because
  both shell readers capture jq's output and then test `[ -n "$out" ]`; a
  literal `false` survives, which is the case `autoProtect` depends on.
  `repoKey()` mirrors `deploy.sh:_preview_repo_key`. All of it **reads only**:
  the legacy file is never written, and `--write` copies it aside before
  creating the separate v2 file. Keep these in sync when either cascade
  changes — answering the way only one of them does would migrate a setting the
  user never set.

---

# `.solopreneur.json` — the v2 path-scoped config

Everything above describes `solopreneur.json`, the **legacy** per-user feature
config read through the 4 shell helpers. This section describes
`.solopreneur.json` (note the leading dot), a **different file** introduced for
the preview Library.

**The two coexist and neither reads the other.** Nothing in this section changes
`solopreneur_repo_key`, `read_solopreneur_config`, `write_solopreneur_config` or
`write_solopreneur_repo_config`; their cascade, their `| values` semantics and
their consumers are untouched. `deploy.sh` still reads the legacy file directly,
and `PREVIEW_PROJECT` is still the highest-priority override for that legacy
per-page flow. The v2 file is never merged into, rewritten from, or synthesized
out of the legacy one.

The difference that matters: the legacy config keys settings by **git remote**,
the v2 config keys them by **filesystem path**. A path scope works in a
directory that is not a git repo, and lets one repo hold several independent
scopes — neither of which a remote-keyed config can express.

## Schema

`config.schema.json` (next to this file) is the machine-verifiable definition —
a Draft 2020-12 JSON Schema covering `.solopreneur.json` only. It deliberately
does not describe the legacy file.

```jsonc
{
  "schemaVersion": 2,
  "preview": {
    "root": "./previews",          // relative to THIS file's directory
    "defaultTarget": "private",
    "collections": {
      "active":  { "path": "active",  "label": "Previews" },
      "archive": { "path": "archive", "label": "Archive"  }
    },
    "targets": {
      "private": {
        "provider": "vercel",
        "project": "my-private-previews",
        "visibility": "private",   // omitted means private
        "include": ["active", "archive"]
      }
    }
  }
}
```

## Private target protection contract

A `private` target's protection is not a single flag — it is a recipe of Vercel
behaviors verified against a real Hobby-plan account, enforced by
`scripts/vercel-protect.mjs`, consumed by `setup.mjs` at first-run provisioning
(see "Setting up from scratch" below) and by the library deploy (a later PR). The
rules exist because the naive version leaves projects world-readable:

- **The protection value is the legacy enum `all_except_custom_domains`**, the
  one a fresh project auto-enables. The documented `prod_deployment_urls_and_all_previews`
  is **weaker** — it leaves the scope alias `<project>-<scope>.vercel.app`
  anonymously readable — so `ensureProtected` refuses to set it, or anything but
  the legacy value.
- **The bare domain `<project>.vercel.app` must be removed.** Under the legacy
  enum the immutable URL and the scope alias return anonymous 302, but the bare
  domain returns anonymous 200. `removeBareDomain` deletes it (a 404 is success).
- **Never trust a PATCH echo — GET the value back.** A rejected PATCH silently
  clears protection to `null`. `ensureProtected` GET-verifies after every PATCH,
  restores the pre-PATCH snapshot if it was nulled, and fails closed rather than
  report a success it cannot confirm.
- **Fail closed on the anonymous ENTRY probe.** `verifyEntryProtected` probes the
  protected entry (the scope alias / immutable URL) and treats only a 302/401 as
  protected, a 200 (or any unconfirmable status) as naked. It is NOT a bare-domain
  check — a removed bare domain returns 404; bare-domain removal is confirmed by
  `removeBareDomain`'s returned status instead. The durable guarantee is this entry
  probe, run after every provisioning step — not the config GET, which can be
  nulled afterwards. Full protection is the composition of all three (ensure +
  remove-bare-domain + entry probe), so `ensureProtected` resolving alone does not
  mean the deployment is unreadable.

`vercel-protect.mjs` is network-testable through an injected `deps` object; its
production `deps` reads the Vercel CLI token and talks to `api.vercel.com` the
way `deploy.sh` does. `deploy.sh`'s own inline `ssoProtection` block is the
legacy per-page flow and is unaffected.

## Resolution order

`scripts/config-resolve.mjs` in the `preview` skill walks these layers, first
hit wins:

| # | Source                                    | Mode     |
|---|-------------------------------------------|----------|
| 1 | `$SOLOPRENEUR_CONFIG`                     | `v2`     |
| 2 | nearest ancestor `.solopreneur.json` **that has a `preview` block** | `v2` |
| 3 | `~/.config/solopreneur/config.json`       | `v2`     |
| 4 | legacy `${CLAUDE_CONFIG_DIR}/solopreneur.json` | `legacy` |
| 5 | legacy `~/.claude/solopreneur.json`       | `legacy` |
| — | nothing found                             | `none`   |

Layers 4–5 are **reported, not converted**: the resolver returns
`mode: "legacy"` with the preview-related subtrees it found (both the
`default.preview.projects.*` shape and the older flat
`preview.paths.<repo-key>` shape), and leaves interpretation to the migrator.
**Both** legacy files are reported, not just the first — `deploy.sh` cascades
across them per key, so a value in the second file can be in effect and a
single-file report would let the migrator silently drop it.

## Anchor and path rules

- The anchor is `--from <path>`, else the current directory. It is resolved to
  its **physical path before the walk-up** — a symlinked path and its target
  must never resolve to different configs. A **file** anchor walks from its
  containing directory, so a content source path can be handed over as-is.
- The walk-up does **not** stop at a git toplevel. Crossing nested repo
  boundaries is deliberate: a repo with no config of its own inherits the
  enclosing scope. It stops at the filesystem root.
- A `.solopreneur.json` with no `preview` block is **skipped** and the walk
  continues — that file may configure something else. This applies to the
  walk-up only: layers 1 and 3 name one specific v2 file, so a file that is
  there but has no `preview` block is a broken config and is reported.
- A relative `root` resolves against **the directory of the config file that
  declared it**, never the git root and never the working directory. This is the
  same anchoring lesson as `deploy.sh`'s `$DIR`-anchored repo key.
- An absolute `root` is used as-is. A leading `~` inside a JSON value is **not**
  expanded.
- The nearest `preview` block **wholly replaces** any ancestor's — no deep merge.

## Failing loudly

Every one of these exits non-zero naming the offending file, and none of them
falls through to an ancestor config:

- malformed JSON, an unreadable file, or a schema validation failure
- a `.solopreneur.json` whose top level is not an object (it is broken, not a
  config for some other feature, so the walk must not step over it)
- a config that is not a regular file (a FIFO or a symlink to a device would
  otherwise block the process forever), or a dangling symlink (`stat` reports
  that as missing, but the file is there and broken)
- more than one entry under `targets` (v1 supports exactly one)
- a `defaultTarget` that is not the declared target
- any `provider` other than `"vercel"`
- an `include` entry naming a collection that is not declared
- a `--from` outside the resolved `root` (the error names both the config and
  the root)

The single-target and single-provider limits live in the **resolver**, not the
schema: `targets` stays a map and `provider` stays a field, so multi-target
support arrives without a file format change.

## Output

`--json` is the machine-readable contract, and carries `configPath`, `mode`,
`root`, `defaultTarget`, `target` (`{name, provider, project, visibility,
include}`), `collections` and `legacy` (in legacy mode, an array of
`{file, values}` — one entry per legacy file carrying preview values; `null`
otherwise). Without `--json` the same facts print as `key=value` lines for
humans; arrays are comma-joined there, so that form is not losslessly parseable
and scripts must use `--json`.

`target` is flattened to the single v1 target rather than echoing the `targets`
map. That is a **script-side** shape, versioned with these scripts and free to
grow when multi-target lands; the room for growth that matters is in the file
format, where `targets` stays a map.

```bash
node scripts/config-resolve.mjs --json --from "$DIR"
```

Tests live in the skill's `tests/` directory: `node --test` from
`skills/preview`. (A bare directory argument does not work — since Node 22.6
the positional arguments are glob patterns, so `node --test tests/` matches the
directory itself and fails; use `node --test tests/*.test.mjs` to run just that
suite.) `.github/workflows/validate-preview-tests.yml` runs that suite on every
pull request and every push to `main`, on the declared floor (Node 20) and on
the current Active LTS.

## Migrating from the legacy config

`scripts/config-migrate.mjs` in the `preview` skill turns whatever the legacy
`solopreneur.json` already says into a proposed v2 `.solopreneur.json`.

```bash
node scripts/config-migrate.mjs                                    # dry run, lists candidates
node scripts/config-migrate.mjs --target-project my-previews       # dry run, full diff
node scripts/config-migrate.mjs --target-project my-previews --write
```

**The legacy file is read-only, permanently.** The migrator never rewrites it,
never merges into it, and leaves it byte-identical — asserted by a test that
compares its bytes before and after a `--write`. That is what makes rollback
"delete the new file", and it is why the two files coexist for as long as the
user wants rather than one replacing the other.

What it reads: `${CLAUDE_CONFIG_DIR}/solopreneur.json`,
`~/.claude/solopreneur.json`, and any file named with `--legacy-config <path>`
(repeatable). There is no built-in inventory of anywhere else — looking further
always takes the flag.

An explicitly named file outranks a default location **within each cascade
layer**, not across layers: the layer order itself is the one the shell readers
use, so for the path lookup every file's `repos[<rk>]`/`default` subtree is
still consulted before any file's flat top-level `preview`. That is deliberate —
re-ordering it for named files would make the migrator answer differently from
the reader it is migrating from. The report always names the layer and file the
root came from, and says so explicitly when the winning layer carries no path.

Rules worth knowing before running it:

- **The default mode is a dry run.** It prints the legacy values it found, the
  candidate projects, the exact destination path and a full unified diff of the
  proposed file, and writes nothing.
- **The target project is never inferred.** `--target-project` is required, and
  the legacy bucket names (`default` / `keep` / `public`) are treated as opaque
  provenance — none of them implies which project to adopt. Without the flag the
  run exits non-zero listing every candidate and where it came from. A single
  candidate is still not a decision. The candidate list is **advisory, not a
  whitelist**: it is a union across every repo the file mentions, so a name
  outside it is noted in the report rather than refused — migrating to a brand
  new project is a normal reason to run this.
- **`autoProtect` maps to `visibility: "private"` in every case.** `true` and
  absent map there for the obvious reason; `false` maps there too, with a
  warning on both stdout and stderr. Turning a target `public` is never a
  migration side effect — it takes a deliberate hand edit afterwards.
- **`preview.root` follows the legacy cascades exactly**, including their
  shadowing: a `preview` subtree that wins the lookup but carries no path means
  "no configured path" even when a lower layer has one, because the legacy
  reader does not see that lower layer either. When nothing names a path, the
  root defaults to SKILL.md's documented `docs/preview`, and the report says so.
- **The new file lands at the git toplevel** (or the working directory outside a
  repo), because a legacy path is stored relative to the repo root and a v2
  relative `root` resolves against the directory of the file declaring it.
- **`--write` stages, then backs up, then installs.** The v2 file is written to
  a same-directory temp and validated with `config-resolve.mjs` first; only then
  is each legacy file copied to `<file>.backup-<UTC timestamp>` (never
  overwriting an existing backup); only then is the temp `rename`d into place.
  Validating before backing up is what makes a *failed* write leave nothing at
  all — a stray backup would otherwise block the corrected retry, since the
  stamp is second-granularity and the copy refuses to overwrite.
- **Nothing is written unless the whole thing succeeds.** That covers the
  refusals — the destination already exists, a v2 config at or above the
  destination would be shadowed, `$SOLOPRENEUR_CONFIG` is set (it outranks every
  file on disk, so a migrated file would be inert), the preview root resolves
  outside the repository (a config at the repo root would never be found by the
  walk-up) or to a regular file (it could not resolve), or there is no legacy
  preview config to migrate — and equally a write that fails validation
  part-way. The root refusals apply to the **dry run** too, so the proposal you
  review is never one that would only fail at `--write`. A user-global
  `~/.config/solopreneur/config.json` does *not* block a repo-local migration:
  it is a lower layer that a repo-local file is meant to win over.

`PREVIEW_PROJECT` is neither read nor changed by the migrator; it stays the
highest-priority override for the legacy per-page flow.

## Setting up from scratch

`scripts/setup.mjs` is the greenfield counterpart to the migrator: where
`config-migrate.mjs` converts an existing legacy config, `setup.mjs` stands up a
brand-new v2 `.solopreneur.json` with a SINGLE `private` target and — unlike the
migrator — talks to Vercel, provisioning the target project's protection before
writing a config that claims the target is private.

```bash
node scripts/setup.mjs                                  # prompts for everything
node scripts/setup.mjs --project my-private-previews    # preset the project name
node scripts/setup.mjs --root notes/previews --force    # custom root; replace an existing v2 config
```

The flow, in order:

- **First-run detection.** It resolves via `config-resolve.mjs`. `mode: "v2"` is
  an idempotent no-op — it prints the existing config path and exits 0 without
  prompting or touching anything. `mode: "legacy"` points at the migrator (which
  preserves what you already set) and exits. Only `mode: "none"` — or `--force` —
  proceeds. `--force` will replace this script's own v2 config, but never
  overwrites a `.solopreneur.json` that configures another feature.
- **Propose, then confirm.** Before anything happens it shows the config path,
  the preview `root`, the `active/` and `archive/` dirs, the single target
  (`private`, visibility `private`), and the Vercel project. **Nothing is written
  and no Vercel mutation happens until you confirm.**
- **Choose the project.** It asks whether to create a new Vercel project or link
  an existing one. Both are supported; an existing name is resolved to its
  canonical id via the same GET the protection module uses.
- **Provision FIRST, write LAST (fail closed).** The Vercel create/link and the
  applicable protection steps run before a single byte of config is written. If
  provisioning or verification fails, it exits non-zero having written nothing —
  a config that lies about protection is worse than no config. The written config
  is then proven **discoverable and effective**: it is resolved by walking up
  from a content path (not by pointing `$SOLOPRENEUR_CONFIG` at it) and must come
  back `mode: "v2"` with the expected root and target; a config that does not
  resolve is removed (schema-valid ≠ resolvable).

### Setup vs. first-publish: the protection division

A private target's full protection (see the contract above) is
`ensureProtected` + `removeBareDomain` + a 302 entry-probe. But the bare domain
`<project>.vercel.app` and the immutable entry URL **do not exist until the
project's first production deployment**, so the work is split between setup and
first-publish (`deploy-library.mjs`, a later PR):

- **`ssoProtection` is a project-level setting** — settable and GET-verifiable on
  a project with zero deployments (verified against the Vercel REST API: the
  create and update endpoints both accept it, and updating it needs no existing
  deployment). So setup ALWAYS runs `ensureProtected`, on a freshly created
  project as much as on an existing one.
- **Bare-domain removal and the entry-probe are deferred to first publish** on a
  new or linked-empty project — there is nothing for them to act on yet, and
  their absence is NOT a hard failure. Setup runs the full hardening only on a
  POPULATED existing project (and the entry-probe only when it has a production
  deployment).
- **Provisioning a populated existing project takes an EXTRA confirmation** — it
  could disrupt a real site. On confirm it runs `ensureProtected`,
  `removeBareDomain`, and then TWO SEPARATE checks: the protected entry via
  `verifyEntryProtected` (302), and bare-domain removal via `removeBareDomain`'s
  returned status (a 404 = removed). These are not conflated — a removed bare
  domain is a 404, which `verifyEntryProtected` reads as unprotected.

Both the Vercel calls and the prompting go through injected seams, so the whole
flow is covered by `node --test` with zero real network and zero real prompts.
`PREVIEW_PROJECT` is neither read nor written by setup.

## Building the Library

`scripts/build-library.mjs` turns a resolved target's collections into a
deployable staging tree. It builds; it does not deploy (that is a later script).
The CLI resolves config through `config-resolve.mjs`; the core `buildLibrary`
takes the resolved `root` / `collections` / `include` as input.

```bash
node scripts/build-library.mjs --from "$DIR"          # human report
node scripts/build-library.mjs --json --from "$DIR"   # machine-readable result
```

### `preview.json` — the per-item sidecar

Each preview item carries a `preview.json` at `<collection>/<id>/preview.json`.
This is a **different file** from `.solopreneur.json`; it is described by
`scripts/preview-schema.json` (Draft 2020-12), which the builder interprets with
the same small-interpreter discipline `config-resolve.mjs` uses over
`config.schema.json`.

```jsonc
{
  "schemaVersion": 1,
  "id": "2026-07-24-my-note",   // lowercase slug [a-z0-9-]+, == the directory name
  "title": "My note",
  "createdAt": "2026-07-24T14:30:00+08:00",
  "updatedAt": "2026-07-24T16:42:00+08:00",
  "revision": 4,                 // integer >= 1
  "project": "my-product",       // optional label
  "entry": "index.html",         // optional; v1 fixes it to index.html
  "tags": ["note"],              // optional
  "supersededBy": "…",           // optional; Archive item only, no cycles
  "provenance": { }              // optional; validated as an object, passed through
}
```

Rules the builder enforces:

- **Required**: `schemaVersion` (const 1), `id`, `title`, `createdAt`,
  `updatedAt`, `revision`.
- **`createdAt` / `updatedAt` are ISO 8601 with a mandatory timezone** (`Z` or
  `±HH:MM`) and at most millisecond precision. The catalog sorts on `updatedAt` as a
  parsed instant, so a zone-less timestamp (ambiguous, machine-timezone-dependent to
  parse), a sub-millisecond one (the sort resolves to ms), or an impossible
  calendar date (`2026-02-30`) is rejected.
- **`id` is a lowercase slug** `^[a-z0-9-]+$` — it becomes the `/p/<id>/` route
  and a staging path segment, so `/`, `\`, `.`, `..`, uppercase and URL-encoding
  are rejected. The **directory name must equal the id**.
- **`entry`** is fixed to `index.html` in v1 (any other value is an explicit
  error), and the file must exist.
- **`id` is unique across ALL included collections** — a collision aborts the
  build naming BOTH files, so two machines colliding on a slug cannot silently
  wedge it.
- **`supersededBy`**, if present, names another existing item, is only valid on an
  Archive item, and must not cycle. It folds an archived duplicate under its
  replacement.
- **`provenance`** is validated as an object and passed through. Provenance
  RESOLUTION (turning raw session data into sanitized display values) is a
  separate, later change.

`preview.json` is **local source metadata and is never copied into the
deployment** — the builder projects only an allowlist of its fields.

### Route mapping and staging tree

The collection does **not** appear in the route: `<collection>/<id>/` maps to
`/p/<id>/`, so archiving is a plain `mv` that does not break links. The staging
tree is assembled in a system temp directory (nothing is written into the content
tree):

```text
<staging>/
├── directory.json
└── p/
    └── <id>/            # each item's content files, verbatim
```

### `contentHash` and the sanitization guarantee

The builder computes a `sha256` **`contentHash`** per item over a canonical
payload = the item's source files (posix relpath + sha256, sorted,
NFC-normalized) plus the intrinsic display metadata — computed BEFORE any chrome
injection, so the same revision hashes identically as a Library page or a Share
snapshot. The `collection` is **not** hashed (archiving must not look like a
content change). It is a derived value and is **never written back** into
`preview.json`.

`directory.json` is the whole catalog, built by **picking** an allowlist per item
(never spreading the raw metadata), sorted `updatedAt` DESC then `id` ASC:

- Per item: `id`, `title`, `createdAt`, `updatedAt`, `revision`, `project`,
  `tags`, `collection`, validated `supersededBy`, `contentHash`.
- Document-level: `generatedAt`, and `source.commit` when the root is in a git
  repo.

**Never emitted**: `sourceRef`, provenance, raw session ids, transcript paths, or
any absolute local path. `directory.json` is always produced via `JSON.stringify`,
never string concatenation.

### Hardening

- **Containment**: every item directory and file is realpath'd and asserted inside
  the preview root / item dir; a symlink escaping its preview dir, a
  directory-symlink cycle, and a device / socket / FIFO are all rejected.
- **Exclusions**: one case-insensitive predicate drops every dotfile and dotdir
  (`.vercel/` with its `project.json`, `.git/`, `.env*`, `.DS_Store`, and any
  accidental `.netrc` / `.git-credentials` / `.npmrc`) plus the non-hidden
  `preview.json` and the per-page `comment-overlay.js`. The same predicate feeds
  the scan, the fingerprint, the hash and the copy, so they cannot drift.
- **Torn-snapshot guard**: a shared working tree may auto-sync mid-build, so the
  builder fingerprints every file up front and re-hashes each staged copy; a file
  rewritten or removed between scan and copy aborts rather than publish a torn
  snapshot.
- **Framework assets have a single source** — the plugin's `skills/preview/assets/`.
  The content tree never holds shared components; the per-page `comment-overlay.js`
  is excluded so a later change can point the tag at the shared staging asset.
- **Injection is prepared, not applied**: `findInjectionPoint` locates the last
  `</body>` (with an EOF fallback) and the `injectEntry` seam defaults to verbatim
  copy, running after the torn-snapshot guard. Chrome (sidebar, provenance footer,
  Share UI) is a later change.

Tests live in `tests/build-library.test.mjs`; run them the same way as the rest —
`node --test tests/*.test.mjs` from `skills/preview`.

---
