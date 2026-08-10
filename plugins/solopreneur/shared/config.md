---
name: shared/config
description: |
  Config reference for solopreneur skills, covering both config files.
  1. `solopreneur.json` (legacy, keyed by git remote): the five shell helpers
     in `config.sh` — solopreneur_repo_key, solopreneur_config_home,
     read_solopreneur_config, write_solopreneur_config,
     write_solopreneur_repo_config — and their per-repo override cascade.
  2. `.solopreneur.json` (v2, keyed by filesystem path): the schema, the
     resolution order, and the path rules used by the preview Library and its
     config-resolve.mjs resolver.
  The two files coexist; neither reader touches the other's file.

  This file is NOT a skill — it is a reference document. The helpers it
  documents are implemented in `config.sh` beside it; skills `source` that
  file at the top of any bash block that touches config.
---

# Solopreneur Config Cascade Helper

All solopreneur skills that read or write `solopreneur.json` must use these
helpers instead of hardcoding paths or recomputing repo identity. `config.sh`
beside this file is the implementation; `source` it at the top of each bash
section that touches config.

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

## The `greenlight_reviewers` feature key

Per-repo observations about the review bots on that repo, written **only** by
`skills/greenlight/scripts/reviewer-state.mjs`. It is a **separate feature key
from `greenlight`** on purpose: the five-layer read returns the whole subtree of
whichever layer has the feature first, and `write_solopreneur_repo_config`
replaces a feature subtree wholesale. Sharing one subtree would mean the script's
observations either shadow `default.greenlight.fallback_order` or get deleted by
the next helper write.

```jsonc
"greenlight_reviewers": {
  "observed": {
    "gemini-code-assist[bot]": { "auto": false, "triggerable": false },
    "mystery[bot]":            { "recipe": "bugbot" }
  }
}
```

| Field | Written when | Meaning |
|---|---|---|
| `observed.<login>.recipe` | attended identify | which registry row this login is. Registry-verified logins (`knownLogins`) resolve automatically and need no entry; `null` / absent with no registry match = unidentified — findings still collected, never triggered, cannot gate |
| `observed.<login>.auto` | observation | it comments without being triggered, so non-gate rounds skip prompting it (the gate is always triggered) |
| `observed.<login>.triggerable` | self-healing | `false` after a trigger got no response within the reviewer's own poll budget; excluded until it acts again or an attended run retries it (both write `true` back) |

`fallback_order` stays in `greenlight` and keeps its meaning, except it now
orders **gate candidates**. The script never reads or writes it — greenlight
resolves it through `read_solopreneur_config` and passes it in.

## Lookup order (read)

`read_solopreneur_config <feature>` walks five layers, first non-null wins.
Each layer returns the **whole subtree** for `<feature>` (no merging across
layers):

| # | File                                     | Path                           |
|---|------------------------------------------|--------------------------------|
| 1 | session home (`solopreneur_config_home`) | `.repos[<repo-key>].<feature>` |
| 2 | session home                             | `.default.<feature>`           |
| 3 | each remaining home, in order            | `.repos[<repo-key>].<feature>` |
| 4 | each remaining home, in order            | `.default.<feature>`           |
| 5 | every home, same order (legacy fallback) | `.<feature>` at top level      |

The homes, in order and de-duplicated:

1. `solopreneur_config_home` — the running harness's own
2. `$HOME/.claude` — Claude Code's user-global default
3. `${CODEX_HOME:-$HOME/.codex}` — Codex's user-global default

Reads visit every harness's home rather than detecting one: a machine with a
single harness has a single real file, and a machine with both gets a
deterministic order instead of a guess. **Writes cannot do that** — they must
pick exactly one target, which is what `solopreneur_config_home` is for.

**Home order outranks scope.** Repo scope beats `default` *within* a home, but a
`default` in a nearer home still beats a repo entry in a farther one — layers
1-2 finish before layer 3 begins. The alternative (every home's repo layer
first, then every home's default) was considered and rejected: cross-home
reading exists so a value configured under either harness stays *reachable*,
not so another harness's file can outrank the home belonging to the harness
actually running. One rule applied uniformly also survives a fourth home
without reopening the question. A regression test pins this.

Layer 5 keeps **pre-refactor configs working unchanged** — users do not need
to migrate their JSON. New writes always use the new shape, but reads honor
the old shape if that's all the file has.

`CLAUDE_CONFIG_DIR` is inherited from the parent session (see
`rebuild-skill-index/SKILL.md:30`); `:-$HOME/.claude` makes the helper safe
when the variable is unset. `CODEX_HOME` works the same way on Codex, where
`codex` itself defaults to `~/.codex`.

## Write API

Three writers; all write to `solopreneur_config_home`'s file only. The other
homes in the read cascade are never touched by a write.

- **`write_solopreneur_config <key> <jq_expr>`** — writes to
  `.default.<key>` in primary. Use for user-global preferences (e.g.
  `greenlight.fallback_order`).
- **`write_solopreneur_repo_config <key> <jq_expr>`** — writes to
  `.repos[<repo-key>].<key>` in primary. Use for repo-specific state (e.g.
  `preview.path`, `todos`).
- **`skills/greenlight/scripts/reviewer-state.mjs record`** — a Node writer, not
  a shell helper, and the only one outside this file. It writes exactly one key,
  `.repos[<repo-key>].greenlight_reviewers`, and never touches `greenlight`.
  Single-writer ownership per feature key is what keeps the two sides from
  erasing each other — see "The `greenlight_reviewers` feature key" above.

All three preserve sibling keys (atomic read-modify-write via a same-directory
temp file + rename) and create the file + parent directory if missing. The Node
writer additionally **refuses to write at all** when the existing file cannot be
parsed — only a missing file counts as empty, because rewriting an
unparseable config would replace every other repo's settings with one round's
observations.

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
    "github.com/owner/mono-repo":  { "todos":  { "backlog": "todos/backlog", ... } },
    "github.com/owner/some-repo":  { "preview": { "path": "docs/preview" } }
  }
}
```

The `preview` skill's old `preview.paths.<repo-key>` subtree migrates to
`repos[<repo-key>].preview.path` (note: singular `path`, plus the value is
the path string directly, not wrapped in another object).

## Helper implementation (`config.sh`)

`config.sh`, beside this file, **is** the implementation — the five helpers and
nothing else. It is sourced, never executed. Each consumer carries a
marker-delimited block that resolves the path and sources it, and defines no
functions of its own:

```bash
# --- solopreneur config helpers (sourced from shared/config.sh) ---
# One real shell file, so no harness rewrites the helpers on the way to the
# shell. Substitute the absolute path of the directory holding THIS SKILL.md —
# every harness states it to the model. $CLAUDE_SKILL_DIR is a Claude Code
# shortcut only; Codex never sets it, and it can be unset on Claude too.
source "${CLAUDE_SKILL_DIR:-<absolute path of the directory holding this SKILL.md>}/../../shared/config.sh"
# --- end solopreneur config helpers ---
```

**Why a file rather than a copy in each body.** The helpers take positional
parameters, and the harnesses disagree about those: Claude Code substitutes
bare `$N` in a skill body on every load and consumes the backslash of `\$N`,
while Codex substitutes nothing and passes the escape through untouched. Text
that binds `$1` correctly under one binds a literal string under the other, and
a config read that silently returns empty is the quiet kind of failure — the
model may even repair it by rewriting the shell it was told to run, which makes
correctness depend on improvisation rather than on execution. A `.sh` file is
rewritten by neither harness. The plugin installs as one directory, so
`shared/` is readable at runtime; the precedent is
`preview/scripts/config-resolve.mjs` reading `shared/config.schema.json` the
same way. Prefer a shipped file over inlined shell for new code.

Skills that only read still get all five helpers — sourcing is all-or-nothing,
and `read_solopreneur_config` calls `solopreneur_repo_key` regardless.

Find every consumer with:

```bash
grep -rl "# --- solopreneur config helpers" plugins/solopreneur/skills/
```

**`tests/config-helpers.test.mjs` fails when a consumer re-inlines the
helpers.** For each of the five it asserts the marker block sources
`../../shared/config.sh`, defines no functions, and carries no positional
parameter in any form — the thing that was broken. The behaviour half sources
`config.sh` itself, so the cascade is covered directly, including the rule that
"nothing configured" returns an empty string with a **zero** status, which is
what keeps callers running under `set -e` alive.

One consumer carries a bespoke derivative WITHOUT the marker —
`preview/scripts/deploy.sh`'s `_preview_repo_key`, which re-copies only the
repo-key URL normalization (it anchors at `$DIR` instead of cwd, so it cannot
source the shared helper as-is). The marker grep above misses it. List every
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
- `greenlight/scripts/reviewer-state.mjs` — restates `solopreneur_config_home`
  in JavaScript: `CODEX_THREAD_ID` set → `${CODEX_HOME:-~/.codex}`, else
  `${CLAUDE_CONFIG_DIR:-~/.claude}`, then `solopreneur.json` under it. Detecting
  the harness there rather than making greenlight export `CLAUDE_CONFIG_DIR` on
  each call is deliberate — a missed call would write reviewer state into the
  wrong harness's home. Unlike every other entry in this list it **writes**:
  `record` merges into
  `.repos[<repo-key>].greenlight_reviewers` and nothing else. It deliberately
  does **not** restate the five-layer cascade — `fallback_order` is read by the
  shell helper and passed in as a flag, so there is only ever one implementation
  of the cascade to keep in sync.
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
config read through the shell helpers in `config.sh`. This section describes
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

### Target identity (F9)

A target may additionally carry `projectId` and `teamId`, binding it to a specific
provider project rather than to a name alone:

```jsonc
"private": {
  "provider": "vercel",
  "project": "my-private-previews",
  "projectId": "prj_…",     // provider-side stable project id (Vercel's prj_…)
  "teamId": "team_…",       // owning team; omitted for a personal-scope project
  "visibility": "private",
  "include": ["active", "archive"]
}
```

- **Both are optional and additive.** A name-only target (neither field) stays
  fully valid and resolves exactly as it did before the pair existed, treated as
  the current scope — no migration is forced.
- **`teamId` only ever appears with a `projectId`.** A team scope is meaningless
  without the project id it scopes, so the resolver rejects a lone `teamId`.
- **They exist because a name is ambiguous across scopes.** One project name can
  name both a team project and a personal one; storing the id + team removes that
  ambiguity, which is what lets a target live on a Vercel team rather than only the
  personal account. Deploy-time enforcement that the three agree (name, id, team)
  is the library-deploy step's job (a later change); the identity is merely made
  available here.
- **`setup.mjs` writes them after provisioning** (see "Setting up from scratch").
  They are never fabricated — an id that cannot be resolved is left unwritten, and
  the resolver surfaces each field only when the config carries it.

## Private target protection contract

A `private` target's protection is not a single flag — it is a recipe of Vercel
behaviors verified against a real Hobby-plan account, enforced by
`scripts/vercel-protect.mjs`, consumed by `setup.mjs` at first-run provisioning
(see "Setting up from scratch" below) and by `deploy-library.mjs` on every publish
(see "Publishing the Library" below). The
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
- a target with a `teamId` but no `projectId` (a team scope is meaningless
  without the project id it scopes)
- a `--from` outside the resolved `root` (the error names both the config and
  the root)

The single-target and single-provider limits live in the **resolver**, not the
schema: `targets` stays a map and `provider` stays a field, so multi-target
support arrives without a file format change.

## Output

`--json` is the machine-readable contract, and carries `configPath`, `mode`,
`root`, `defaultTarget`, `target` (`{name, provider, project, visibility,
include}`, plus `projectId` / `teamId` only when the config sets them — see
"Target identity" above), `collections` and `legacy` (in legacy mode, an array of
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
node scripts/setup.mjs --project my-previews --team team_…   # provision under a Vercel team
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
- **Scope: personal or team.** `--team team_…` provisions under a Vercel team —
  every Vercel call runs on its behalf; omitting it is personal scope. A value
  that is not a `team_…` id is refused before any Vercel call, so a typo cannot
  silently provision in the personal account.
- **Bind the identity (F9).** After provisioning succeeds, setup reads the
  project's real `projectId` back from Vercel — and, for a team-owned project, its
  `teamId` from the project's owner — and writes them into the target, binding it
  to a specific project rather than a name. This is best-effort and never
  fabricated: if the id cannot be resolved, the target is written name-only. It
  lifts the earlier personal-scope-only, name-only limitation.
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
first-publish (`deploy-library.mjs`; see "Publishing the Library" below):

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
deployable staging tree. It builds; it does not deploy — `deploy-library.mjs` does
(see "Publishing the Library" below).
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
- **`provenance`** is validated as an object and passed through by the builder.
  Turning it into sanitized display values for the footer is
  `scripts/resolve-provenance.mjs` — see "Provenance display" below.

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

## Provenance display

`scripts/resolve-provenance.mjs` turns a `preview.json` `provenance` block —
`{ createdBy, lastUpdatedBy }` — into display-safe footer values, so the builder
can show "who produced / who last updated" a preview WITHOUT leaking a raw session
id, transcript path, or absolute local path onto the deployed page. It is a pure,
deterministic, **total** module (never throws — a footer resolver degrades to
"unrecorded", it does not abort a publish) with no I/O and no CLI; the builder's
`injectEntry` seam imports it.

Each party resolves to `{ agent, platform, sessionTitle }`, where `sessionTitle`
is **omitted, never guessed**, when unavailable. Priority, first hit wins:

1. **Caller-explicit** — a `sessionTitle` the caller passed in directly (the
   owning agent knows who it is). Highest, and platform-independent.
2. **Platform adapter** — deterministic normalization from platform data.
3. **Missing** — `sessionTitle` absent; the footer reads "unrecorded".

`agent` and `platform` are always the caller's, passed through. Every returned
object is assembled from the allowlist alone (`agent` / `platform` /
`sessionTitle`) — the input is never spread — so a raw `session_id`, a
`transcript_path`, a `payload`, or an absolute path cannot leak, the same "pick,
never spread" discipline `directory.json` uses.

`resolveProvenance` collapses to `{ producedBy }` when the creator and last
updater resolve identically (an item no one else has revised), else returns
`{ createdBy, lastUpdatedBy }` for separate footer lines. It resolves DISPLAY
values only; the create/update lifecycle (which party is immutable, when
`lastUpdatedBy` advances) is the item's metadata, owned elsewhere.

**v1 scope — Claude adapter only.** Only the Claude adapter is implemented: from a
Claude hook-style payload it derives `sessionTitle` from `session_title` (the raw
`session_id` is never read and never reaches the output). Codex, Hermes and
OpenClaw have no adapter yet — a preview from those platforms resolves its
`sessionTitle` to "unrecorded" while its `agent` / `platform` still pass through.
The `ADAPTERS` map is the clearly-named seam a later PR extends, one function per
platform.

Tests live in `tests/resolve-provenance.test.mjs`; run them the same way.

## Library chrome

The builder wires three browser-facing pieces into the staging tree so a built
Library is navigable, not just a bare content tree. The shared front-end assets
live only in the plugin's `skills/preview/assets/` — the content tree never holds
them — and `build-library.mjs` copies them into `<staging>/assets/` on every
build. Absolute `/assets/...` and `/p/<id>/` references work because the staging
root is the deployment root.

### `preview-shell.js` — injected entry chrome

Injected into every item entry inside a **Shadow DOM** (full two-way style
isolation from the preview content). It renders:

- a top-left directory **icon** that opens a **sidebar** with `active` and
  `archive` sections, each sorted `updatedAt` DESC, **Archive collapsed by
  default**, and the current page marked `v<revision> · updated <local time>`. The
  sidebar's catalog is fetched at runtime from the deployment's `/directory.json`
  (the same file the index is generated from — a single source), and every item
  link targets the same deployment's `/p/<id>/`. Archive rows that carry
  `supersededBy` nest under their canonical (when that id is also in Archive) in
  a collapsed **Earlier copies** group;
- a **Manage mode** block at the bottom of the sidebar: a one-line lifecycle
  blurb, a toggle that reveals per-row checkboxes (Active checked = archive,
  Archive checked = restore), and **Copy instructions**, which builds a read-only
  `## library archive request` text for an agent to `mv` items and re-publish.
  The page never writes the filesystem or calls deploy APIs;
- a **provenance footer** built from the shape `resolve-provenance.mjs` returns
  (`{ producedBy }` collapsed, or `{ createdBy, lastUpdatedBy }` distinct;
  "unrecorded" when absent). Timestamps render in the viewer's local timezone with
  the full ISO in a tooltip;
- a **Share request** block — an access selector (`project-members` default /
  `anyone-with-link`) and a read-only, copyable JSON request carrying
  schemaVersion, preview id, revision, contentHash, the current URL, and the chosen
  access. It performs no deploy and holds no token; it only produces the request an
  agent later consumes.

The builder injects the CURRENT item's display metadata + resolved provenance as a
`<script type="application/json">` island (escaped via `<` → `<`, never
concatenated), followed by the preview-shell script, at the `findInjectionPoint`
seam. `buildLibrary`'s default seam stays verbatim; the CLI passes the real
injector.

### `comment-overlay.js` — per-preview comments

The shared overlay keys its comments per preview: `preview_comments_v3:<id>` (and
the diff/clean preference `preview_diff_clean_v1:<id>`), so previews on one Library
origin never share one blob. The builder rewrites an existing
`<script src="./comment-overlay.js">` tag to the shared staging asset and stamps a
`data-preview-id` attribute; the overlay reads it via `document.currentScript`.
Never a second tag is added. The old global `preview_comments_v2` key is **never
auto-adopted** (it cannot be attributed to a single preview) — a manual import is
offered on `window.__previewCommentOverlay`. A failed `localStorage` write is
**surfaced** (a visible banner + export escape hatch), never swallowed, and a
double-inject of the overlay is a no-op.

### `library-index.html` — the Library home page

Generated at `<staging>/index.html` from the `library-index.html` template + the
projected `directory.json`, which the builder embeds as an escaped JSON island. It
renders active and archive sections (archive collapsed by default via a native
`<details>`, `updatedAt` DESC, links to `/p/<id>/`) — the same directory data the
sidebar uses, including **Earlier copies** grouping for archive rows with
`supersededBy`.

Tests live in `tests/preview-shell.test.mjs` and `tests/comment-overlay.test.mjs`
(the assets' pure helpers) and the chrome-injection cases in
`tests/build-library.test.mjs`; run them the same way.

## Publishing the Library

`scripts/deploy-library.mjs` publishes a built staging tree to the resolved
target's Vercel project as the **stable production entry**. It calls
`build-library.mjs` for the tree and `vercel-protect.mjs` for every protection
primitive; it never re-implements either.

```bash
node scripts/deploy-library.mjs --from "$DIR"          # human report
node scripts/deploy-library.mjs --json --from "$DIR"   # machine-readable report
```

It publishes **private** targets only. The schema allows
`visibility: "public"`, but that value's own contract requires a publish-time
content review which does not exist yet, so a public target is refused rather
than published unreviewed.

### The staged publish flow

Every step exists because the intuitive or documented alternative was measured
failing. Do not "simplify" this without re-running the experiment.

`vercel deploy --prod --skip-domain` is **not** a staging step. `--skip-domain`
only withholds the `targets.production` pointer; the automatic scope alias
`<project>-<scope>.vercel.app` — which IS the stable entry — switches to the new
deployment immediately, so there is no verify-before-switch window.

1. **`vercel deploy`** — a PLAIN preview, never `--prod`. It produces a
   `target: null` deployment and does not move the scope alias. This is the real
   staging step.
2. **Verify the staged preview**: anonymously challenged (302/401) and carrying
   the revision just built. The revision check reads the deployment's `meta`
   through the authenticated API — the entry is protected, so its content cannot
   be read anonymously, and no bypass secret is needed for metadata.
3. **`vercel promote <preview>`** to publish. Promoting a PREVIEW creates a
   **new** production deployment rather than converting that preview in place, so
   the deployment verified in step 2 is not the one that goes live.
4. **Verify again**: the live production carries our revision, and the stable
   entry is anonymously challenged.
5. **Rollback is `vercel promote <last-good-production>`**, never
   `vercel rollback` — that returns HTTP 500 on this account, by URL and by id
   alike. Promoting a deployment that is already production is in-place.

Fail-closed: a step-2 failure issues **no promote** (the alias never moved, so
the published Library is untouched); a step-4 failure promotes the last-good
production back and still exits non-zero. Success is never reported for a state
that could not be verified, and every failure prints what the project is
**actually** in — untouched / published-but-unverified / rolled-back /
rollback-failed / unknown. Every failure *past* the publish point is routed
through the rollback, including a transient Vercel read error — none of them can
be reported as an untouched project.

Two refinements keep the rollback from doing harm of its own:

- **It waits before judging.** Promoting a preview rebuilds, and neither the
  rebuild nor the alias assignment is documented as synchronous with the CLI's
  exit, so the post-publish check polls (60s) for the live production to become
  READY and carry our snapshot. A slow-but-successful publish must not be rolled
  back — discarding a good snapshot is the expensive mistake.
- **It never promotes over a stranger.** If the live production is another
  *Library* publisher's (it carries `previewKind=library` with a different
  snapshot and is not the one recorded before publishing), it is left alone and
  the state is reported as unknown — promoting our older snapshot back over it
  would cause exactly the backwards move the stale guard exists to prevent. A
  production deployment *without* `previewKind=library` is not a competing
  publisher, so rolling back over it is safe.

Progress and warnings go to **stderr**, only the final report to **stdout**, so
`--json` output is a single parseable document (the same split `deploy.sh` uses).

**First publish is a documented exception**: Vercel always makes a project's
first deployment a production deployment, even without `--prod`. That case is
detected (the staged deployment reports `target: "production"` *and* the project
had no production deployment beforehand), the promote is skipped, and step 4 runs
identically. On an already-published project the same report is refused — it
would mean the entry moved unverified.

A promote whose CLI call does not confirm is reported as **unknown**, not
untouched: Vercel documents that a promote timeout does not cancel the promotion.

### First-publish protection split

`ssoProtection` is a project-level setting that setup already ensures (see "Setup
vs. first-publish" above), but the bare domain `<project>.vercel.app` and the
entry URL do not exist until the first production deployment — so **bare-domain
removal and the entry probe belong to the publish**, and run on EVERY publish,
not only the first. The anonymous entry probe is the only durable proof; a config
GET can be nulled afterwards.

Per publish, in order:

1. `ensureProtected` **before** the deploy, so content never lands on an
   unprotected project.
2. publish (steps 1–3 above).
3. `ensureProtected` again — it GET-verifies, so a value changed mid-flight is
   caught rather than assumed.
4. `removeBareDomain`.
5. `verifyEntryProtected` on the stable entry.

Steps 4 and 5 are **separate checks and are never conflated**: removal is
confirmed by `removeBareDomain`'s own DELETE status (404 = already absent, 2xx =
removed), while `verifyEntryProtected` validates the protected ENTRY (302/401 =
protected, **200 = naked → the publish fails and rolls back**). A removed bare
domain answers 404, which the entry probe reads as unprotected.

The stable entry hostname is **discovered, not derived**: the scope slug is in
neither the link file nor the API (both carry ids), so it is picked out of the
hostnames Vercel reports for the live production — the deployment's `alias` array
and the project's domains — excluding the bare domain and the immutable URL, with
the shortest match winning. If it cannot be resolved, the publish fails closed
rather than skipping the probe.

### Target identity and project pinning

The configured project name is resolved by Vercel **under the target's scope**
and the answer is compared with the config: a `projectId` that disagrees, a
`teamId` that is not the project's owner, or a name resolving to a
differently-named project each refuse to publish before anything is deployed — a
name-only match is not sufficient, because a same-named project in another scope
is a different project. A name-only target (valid config, e.g. from the migrator)
publishes with a warning instead, and should be re-run through setup to record
its `projectId`.

The staging directory is pinned to that confirmed project **two** documented ways,
because an unlinked `vercel deploy` would create a project named after the temp
directory and publish private content into it: `.vercel/project.json` carrying
`{orgId, projectId}` (the documented contents of a linked directory; `.vercel` is
on Vercel's default ignore list, so it is never uploaded), and the
`VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` environment variables (the recommended
non-interactive pinning, which take precedence over the file).

### Stale-publish guard

Every publish is a FULL snapshot, so a publish from an older machine can make the
Library's latest pointer go backwards. When the content root is in a git repo:

- the content path must be **clean** — an uncommitted snapshot is not reproducible;
- it must not be **behind its upstream** for that path (`git fetch` first;
  a failed fetch warns and falls back to the last-fetched ref, because the
  authoritative check is the next one);
- the **source commit** is recorded in the deployment metadata;
- the live production's recorded commit must be an **ancestor** of ours
  (`git merge-base --is-ancestor`). Anything else — newer, divergent, or a commit
  git cannot resolve — aborts. Checked before the deploy (so a stale publish costs
  no quota) and again immediately before the promote.

When the content root is **not** a git repo the guard is skipped with a printed
caveat: without a canonical publisher, a publish from another machine can make the
latest pointer briefly go backwards, and re-publishing from the newest machine
heals it. Git is never hard-required.

**The guard covers tracked content only.** A non-hidden file excluded by
`.gitignore` inside a preview item is still deployed by the builder while
`git status` reports the tree clean, so two machines at the same commit could
publish different bundles. Treating ignored files as dirty was rejected
deliberately: the legacy per-page flow leaves a gitignored `.vercel/` inside
preview directories, so that check would block every publish on a file the builder
already excludes. Keep deployable content tracked.

The guard, and every "what is the live Library revision" question, reads **only**
the stable production deployment (`targets.production`) and only when it carries
`previewKind=library`. Never "the newest deployment in the project" — a later
`previewKind=share` preview would otherwise poison the comparison. A foreign
(non-library) production deployment is still a valid rollback target, but never
drives the commit comparison.

An **empty** Library refuses to publish: a full-snapshot publish of zero items
would replace the Library with an empty page and 404 every existing `/p/<id>/`,
and a misconfigured root is far likelier than a deliberate empty publish.

### Deployment metadata and quota

Every Library deployment carries `previewKind=library`, a `snapshot` digest
(sha256 over the sorted `<id>`/`contentHash` pairs) and `sourceCommit` when there
is one. `previewKind` is what separates a Library production from a Share preview
in the same project, which is why a promoted production **without** it is refused
rather than accepted — metadata propagation across the promote's rebuild is
undocumented, and the guard depends on that field on the next publish.

A publish costs **two** deployments against the daily limit: the staged preview,
plus the rebuilt production the promote creates. Verify locally with
`build-library.mjs` first and publish once per batch of edits; a quota rejection
is detected and reported with that advice.

### Known limitations

- **Rolling Releases** (Pro-only, off by default) turns a promote into a gradual
  rollout. The module does not detect it, so such a project could report success
  while only part of the traffic sees the new snapshot. Both snapshots are
  protected Libraries, so the impact is cosmetic.
- **Deployment Retention** can delete the rollback target; the rollback promote
  then fails and the state is reported as unknown rather than as a rollback.
- Vercel documents that a deployment already promoted once cannot be promoted
  again (a rollback is the documented route) — but `vercel rollback` 500s on this
  account, which is why rollback here is promote-based. If both refuse, the
  publish reports `rollback-failed` rather than claiming a rollback it did not
  achieve.

Tests live in `tests/deploy-library.test.mjs`; run them the same way. Every case
injects a fake `deps`, so the suite performs **zero real network calls and zero
real deploys** and spawns no `vercel` or `git` process.

## Sharing a single preview

`scripts/deploy-share.mjs` deploys **one** Library item as an isolated snapshot
into the **same** Vercel project, as a plain **preview** deployment. It adds no
config surface: there is no share project, no second root, no second target — the
resolved Library target's identity is what it deploys into.

```bash
node scripts/deploy-share.mjs                       # request on stdin
node scripts/deploy-share.mjs --request req.json    # request from a file
node scripts/deploy-share.mjs --list [--preview-id <id>] [--limit <n>]
node scripts/deploy-share.mjs --revoke <deployment-id>   # secret on stdin
```

**Private targets only** — it asserts project protection before deploying, which
would change a public target's access model.

### The Share request

The in-page Share block (`preview-shell.js`) produces the request; it holds no
token and deploys nothing. The contract has one source: `deploy-share.mjs` imports
`SHARE_SCHEMA_VERSION` and `ACCESS_OPTIONS` from that same asset rather than
restating them, so the producer and consumer cannot drift.

```json
{
  "schemaVersion": 1,
  "kind": "preview-share-request",
  "previewId": "<slug>",
  "revision": 3,
  "contentHash": "sha256:<hex>",
  "url": "<source Library item URL>",
  "access": "project-members"
}
```

Nothing is defaulted: an unknown `schemaVersion`, a `null`/mistyped field (what the
page emits when it cannot read its own metadata island) and an unknown `access` are
all refusals. `url` is informational; `sourceUrl` is accepted as an alias.

**Revision drift fails closed.** The module re-derives the item's `revision` and
`contentHash` locally by running the real builder — the same canonical payload,
hashed before chrome injection — and on any mismatch (or an unknown `previewId`)
deploys **nothing**, naming both versions and telling you to reopen the latest
Library page. A human must never see one version and share another.

### The isolated artifact

The selected preview becomes the **root page `/`**, not `/p/<id>/`. It carries only
its own files plus `assets/comment-overlay.js`; it never contains the Library index,
`directory.json`, another `/p/<id>/`, or the raw `preview.json` — asserted by a walk
over the assembled tree before anything is deployed.

The real builder stages the whole target (its cross-collection duplicate-id and
`supersededBy` cycle checks only hold that way, so a broken sibling item blocks a
share — the same refusal a publish gives), then the item's staged directory is moved
out into a second temp root. **Both** temp roots are removed on every exit path,
refusals included.

A Share keeps the comment overlay but **not** `preview-shell.js`: with no
`/directory.json` the sidebar would render "Catalog unavailable" and the Share block
would offer to share a share, neither of which belongs on a page that may leave the
project. The shell island + script are removed (exactly one match required, so a
change to the builder's output or a preview containing that markup verbatim is a
loud refusal) and a **static provenance footer** takes their place — same
`footerModel`, same `resolve-provenance.mjs`, rendered from the builder's `item`
inside the injection seam, because `directory.json` deliberately strips provenance.
It shows ISO instants rather than viewer-local time: a static footer runs no
JavaScript.

### Never `--prod`, never `promote`

A plain `vercel deploy` produces a `target: null` preview and does not move the
project's scope alias, so Library production is untouched — there is no `--prod` and
no promote path in the module at all. The project is pinned two documented ways
(`.vercel/project.json` **and** `VERCEL_PROJECT_ID`/`VERCEL_ORG_ID`), because an
unpinned deploy from a temp directory would create a project named after it.

**A Share must never be a project's FIRST deployment.** Vercel publishes a project's
first deployment as production even without `--prod`, so a project with no
production deployment is refused (publish the Library first). After the deploy the
`targets.production` pointer is re-read and must be unchanged — the module *proves*
production did not move rather than assuming it.

Metadata: `previewKind=share`, `previewId`, `revision`, `contentHash`, every value a
**string** (Vercel returns `--meta` values as strings, so a numeric revision would
never compare equal on read-back). The deployment is read back over the
authenticated API and refused unless it is READY, in the pinned project, not
production, and carrying exactly that metadata. Because the Library's stale-publish
guard reads only `targets.production` **and** `previewKind=library`, a Share can
never poison "what is the live Library revision".

### Access modes

`project-members` (the default) reports the deployment's own preview URL and
verifies anonymously that it is challenged (302/401). A 200 means naked and fails
closed. That check runs in **both** modes.

`anyone-with-link` additionally creates a **per-deployment** shareable link:

```http
PATCH https://api.vercel.com/aliases/<deploymentId>/protection-bypass?teamId=<team>
{"ttl": 604800}     # optional, max 63072000; omitted = never expires
```

The response is `{"protectionBypass": {"<secret>": {"scope": "shareable-link", …}}}`;
entries are filtered by that scope and **exactly one** is required, because handing
out a guessed secret is not acceptable. The anonymous read URL is
`<deploymentUrl>?_vercel_share=<secret>`, which answers **307 + `Set-Cookie:
_vercel_jwt`** and redirects — so the probe follows redirects with curl's cookie
engine on. If verification fails, the link is revoked immediately rather than left
live unverified.

> **A bare `200` is not proof the link works.** Verified: a *dead*
> `?_vercel_share=` secret redirects to `https://vercel.com/login?next=…`, which is
> itself a normal **HTTP 200**. So the probe reports `%{http_code}` **and**
> `%{url_effective}`, and "reads anonymously" means 200 **still on the deployment's
> own host** — a working link ends on the deployment, a dead one on `vercel.com`.
> The rule inverts for revoke: a *successful* revoke lands on that same 200 login
> page, so a status-only check would report every good revoke as a failure. One
> helper decides both directions.

`--ttl` defaults to **7 days**; `--ttl never` omits the field and warns. Revoke with
the same endpoint and `{"revoke": {"secret": "<secret>", "regenerate": false}}`; the
deployment is identity-checked as one of our shares first and the revoke is
confirmed by an anonymous probe that must no longer reach 200.

> **Never** substitute `x-vercel-protection-bypass` for a shareable-link secret. It
> does not accept one — it accepts a project-level **automation-bypass** secret,
> which would unlock the **whole project**.

### Secret handling and known limitations

The shareable-link secret is written **nowhere**: not `preview.json`, not
`directory.json`, not git, not deployment metadata, and not process **argv** (the
revoke body reaches curl through a `0600` file in a `0700` temp dir; the
secret-bearing probe URL through curl's stdin config — the same discipline
`vercel-protect.mjs` applies to the API token). It does appear in the create step's
own report, because a shareable link is useless without it; what a calling agent
does with captured stdout is that caller's concern.

- **The secret cannot be looked up from a deployment id.** It is not on the
  deployment object, and `project.protectionBypass` lists only automation-bypass
  secrets — so `--revoke` **requires** it. Keep it for as long as the link should
  live.
- `--list` reads one page (`--limit`, default 100) with no pagination, and filters
  `previewKind=share` client-side: `GET /v7/deployments` has no documented
  `meta-<key>` filter, and an undocumented one is not something a "which of these is
  safe to revoke" answer may depend on.
- Deleting a deployment is deliberately **not** in this module — it is destructive
  and needs an explicit human confirmation elsewhere.
- A Share is a new origin, so existing Library comments do not travel with it (which
  matches the overlay's "comments are not promised across deployments" contract).
- One deploy per share, against the same daily deployment quota as a publish; a quota
  rejection is reported with that advice.

Tests live in `tests/deploy-share.test.mjs`; run them the same way. Every case
injects a fake `deps`, so the suite performs **zero real network calls and zero real
deploys** and spawns no `vercel` or `curl` process.

---
