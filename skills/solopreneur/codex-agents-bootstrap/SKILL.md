---
name: codex-agents-bootstrap
description: |
  Install or refresh custom agents shipped by solopreneur-family plugins in the
  Codex user agents directory. Use after installing, updating, enabling, or
  disabling a solopreneur-family plugin, or when the user asks to bootstrap,
  install, refresh, or diagnose Codex agents. This is unnecessary on Claude.
---

# Bootstrap Codex Agents

Run the bundled `scripts/install-codex-agents.sh` with `/bin/bash`. The script
uses the active Codex installation list, validates every managed source before
copying, and preserves hand-authored user-layer identities declared by the base
`$CODEX_HOME/config.toml` or recursively under `$CODEX_HOME/agents/`, including
hidden files and directories. It requires `codex`, `jq`, and Python 3.9 or
newer. TOML parsing always uses the bundled Tomli 2.4.1; runtime package
installation and network access are unnecessary.

The collision check is deliberately more conservative than Codex: it never
follows a symlink in the user agent tree, base config, or a declared role's
`config_file`. A pre-existing unsafe, dangling, or non-regular path fails the
all-source preflight before any managed copy is committed. A base config role
keeps its exact table-key identity unless its `config_file` supplies a nonblank
root `name`, which Codex trims and uses as the identity. Managed destinations
and orphan reporting remain top-level only.

The same user-layer identity scan runs again after staging and immediately
before destination ownership is rechecked. A collision or unsafe path that
appears during staging aborts before committing the affected copy, and the
cleanup trap removes its staged temporary file; this narrows the ordinary race
window but does not claim atomic coordination with independent config writers.

Treat the result as a check of the base user-layer candidates, not proof of the
effective runtime role. Profile, project, command-line, or managed configuration
layers may have higher precedence and are outside this bootstrap's collision
scope.

Report all `Installed`, `Updated`, `Unchanged`, `Skipped`, `Inactive`, and
`Orphaned` entries exactly as returned. On a nonzero exit, report only actions
the script explicitly says were committed; never present a planned copy as
successful. Surface the error and stop.

A disabled plugin with a retained managed destination appears in both
`Inactive` and `Orphaned`: inactive explains why it was not refreshed, while
orphaned means only that no active solopreneur plugin source currently claims
the fully owned top-level copy. It is a manual-review candidate, not proof that
the file is unused or removable: a profile, project, command-line, managed, or
other config layer may still reference or override it. Never describe an
orphan as safe to remove. Any later removal requires explicit user approval
after auditing every relevant config layer and the exact path.

Only emit `Orphaned` when the exact marker, root TOML name, filename, and
canonical plugin/agent pair all agree. This proves solopreneur ownership, not
runtime non-use. A `Skipped` entry that says ownership is not proven is
suspicious and must not be presented as safe to remove.

After an install or update, tell the user to start a new Codex conversation so
the refreshed agent configuration is loaded.
