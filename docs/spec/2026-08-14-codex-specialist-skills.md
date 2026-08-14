# Codex specialist knowledge skills

**Status:** Accepted — A1–A4 passed on 2026-08-14

**Date:** 2026-08-14

**Source shape:** `shared`

**Surfaces:** Codex exec, Codex TUI, Codex App

## Outcome

The four specialist plugins (`ios-dev`, `android-dev`, `ai-engineer`,
`neo4j-dev`) publish a Codex package for the first time. Eleven knowledge
skills are included; every other skill in those plugins stays excluded and
Claude-only. The Codex marketplace goes from one plugin to five.

This is the prerequisite for porting `/specialist-review` to Codex. That skill
dispatches a reviewer that reads the specialist skills out of the installed
plugin cache; without a published package the reviewer has nothing to read, so
the knowledge base ships first and the agent definitions come later.

## What is included, and why only these

The list is the output of a grading pass over all 33 review-relevant skills in
the four plugins, recorded in
`todos/backlog/2026-08-14_codex-specialist-review-port.md`. The criterion was
fixed before grading: **a skill earns publication only if it carries
information a current model cannot be trusted to recall.** Exact version pins,
newly-shipped API surfaces, and device- or vendor-specific bug mechanics
qualify. Generic best-practice prose does not — the reviewer already knows it,
and shipping it only dilutes retrieval.

| Plugin | Included | Excluded |
| --- | ---: | ---: |
| `android-dev` | 8 | 30 |
| `ios-dev` | 1 | 25 |
| `ai-engineer` | 1 | 1 |
| `neo4j-dev` | 1 | 3 |

Two families are excluded wholesale and are not candidates for a later phase:
`asc-*` (22) and `gplay-*` (16) drive real App Store Connect and Google Play
APIs, so each would need its own side-effect acceptance, and a code review
never reads them.

### android-dev (8)

`agp-9-upgrade`, `navigation-3`, `edge-to-edge`, `viewmodel`, `r8-analyzer`,
`play-billing-library-version-upgrade`, and
`migrate-xml-views-to-jetpack-compose` carry version-anchored facts — AGP 9
breaking changes, the Navigation 3 API with its official docs bundled, Kotlin
2.3 explicit backing fields, Play Billing upgrade paths.

`android-patterns` is the one in-house skill and the only source of
device-quirk knowledge: nested-scroll fling leaking into `ModalBottomSheet`
drag, MIUI locale date formatting, `SwipeToDismissBox` bleed-through under a
translucent foreground, and the Compose `@Preview` failure modes (Layoutlib
runs no coroutines, `LocalWindowInfo.containerSize` reads zero, Vico needs
2.1.0+).

### ios-dev (1)

`ios-patterns` carries the iOS 18 keyboard-toolbar first-focus bug and its
`safeAreaInset` workaround, the `JSONDecoder.iso8601` fractional-seconds
failure, and locale-correct date templating including script variants.

### ai-engineer (1)

`senior-prompt-engineer` is procedural: it enforces baseline-before-change and
an eval gate. Its three helper scripts are stdlib-only, read a prompt file, and
write local JSON.

### neo4j-dev (1)

`neo4j-cypher` is the densest version-anchored skill in the set — per-feature
version gates from 2025.01 through 2026.06 with fallbacks, and the `Z`-is-not-
UTC trap with its upstream issue link.

`neo4j-migration` and `neo4j-cli-tools` were graded worth publishing but are
**held back by a defect found during A4** — see below.

## The frontmatter defect A4 caught

`neo4j-migration` and `neo4j-cli-tools` install correctly on Codex and are
never listed. The host reports no error: `skills/list` simply omits them.

Root cause: their `description` is a multi-line **plain** (unquoted) YAML
scalar whose continuation lines contain `": "` —

```yaml
description: Migrates Neo4j driver code and Cypher queries from older versions
  Also handles Cypher syntax migration: QPE paths, CALL subqueries, ...
```

Strict YAML reads `migration: QPE paths...` as a nested mapping key and fails
with `mapping values are not allowed here`. Claude Code's loader is lenient and
accepts it, so the defect is invisible on the platform where these skills have
always run.

A repo-wide scan found exactly three skills in this state:
`neo4j-dev:neo4j-migration`, `neo4j-dev:neo4j-cli-tools`, and
`ai-engineer:ai-app-templates` (in-house, not published, so not blocking).

Two consequences:

1. The two neo4j skills are excluded from this publication. Both are vendored
   from `neo4j-contrib/neo4j-skills`, so a local edit would be reverted by the
   next `sync-vendored` run; the fix belongs upstream or in a
   generator-side normalization. Tracked in
   `todos/backlog/2026-08-14_codex-frontmatter-yaml-gate.md`.
2. `validate-skills-compatibility.py` now refuses to publish any skill whose
   frontmatter fails strict parsing, so this class of defect fails loudly in CI
   instead of shipping an invisible skill. The check is stdlib-only (the repo
   carries no YAML dependency) and was cross-checked against PyYAML over all
   103 skills — the two agree exactly.

## Side-effect boundaries

Publishing makes these skills invocable, so the ones that can run something
were triaged individually rather than cleared as a group.

| Skill | What it can run | Boundary |
| --- | --- | --- |
| `neo4j-cypher` | `generate_schema.py` opens a Bolt connection | Read-only introspection — one `execute_query` call, no `CREATE`/`MERGE`/`DELETE`. `define_schema.py` and `import_neo4j_schema.py` are offline. The skill's own write gate requires `EXPLAIN` plus user confirmation before any write. |
| `senior-prompt-engineer` | three Python scripts | Local filesystem only: read a prompt file, write a report. No network. |

## Limitations

`neo4j-cypher` is **degraded** on every Codex surface: its contract instructs
the agent to fetch official documentation with `WebFetch`, a Claude Code tool
name. A Codex host has no tool by that name, so that step cannot execute as
written and the agent must substitute its own web capability or proceed
without the fetch. Every other part of the contract — syntax tables, version
gates, the write gate — is host-neutral and applies unchanged.

The other ten skills are **full**: markdown knowledge plus reference files,
with no host-specific tool in the contract.

`senior-prompt-engineer` and `neo4j-cypher` require `python3` on the host for
their helper scripts. The knowledge content is readable without it.

Codex shortens skill descriptions when the set is large: with these plugins
installed the TUI reports *"Skill descriptions were shortened to fit the skills
context budget."* Every skill remains listed and readable; only the
description text the model sees up front is truncated. This is a discovery-
quality cost of publishing broadly, not a correctness failure, and it argues
against widening the include set without a matching gain.

## Acceptance

Support status is not granted by plugin loadability. Each claimed surface must
prove that the generated package — not the canonical source, and not the
Claude tree — is what the host loads, and that its bytes match canonical.

All runs used Codex CLI 0.147.0 against a throwaway `CODEX_HOME` holding only
this candidate marketplace, so the bytes under test were the generated
packages rather than any published release.

### A1 Registry, publication, and install

Accepted on 2026-08-14.

- `validate-skills-compatibility.py` passes: 103 skills, Codex included 18
  (7 pre-existing `solopreneur` engines plus these 11).
- Generation is deterministic: a second `generate-plugin-packages.sh` run left
  zero drift.
- `scripts/tests/` passes 46 of 46. The filtered-publication fixture passes and
  now asserts, per plugin, that the generated Codex tree holds exactly its
  include set — the assertion was negative-tested by feeding it a wrong
  expectation and confirming it fails.
- A clean `CODEX_HOME` installed all five plugins from the local marketplace.
  Each cache tree held exactly its include set, with zero `asc-*` or `gplay-*`
  directories anywhere in the cache.
- All 11 published `SKILL.md` files in the installed cache are byte-identical
  to their canonical sources.

### A2 Codex exec

Accepted on 2026-08-14, two probes, each asking for a positional line so that
recall cannot substitute for reading.

`android-dev:android-patterns` returned line 20 verbatim and named
`…/plugins/cache/solopreneur/android-dev/0.4.12/skills/android-patterns/SKILL.md`
as the file it read. `neo4j-dev:neo4j-cypher` returned line 53 verbatim —
the `SHOW` / `YIELD` rule with its `[2026.05]` anchor — from
`…/plugins/cache/solopreneur/neo4j-dev/0.0.9/skills/neo4j-cypher/SKILL.md`.
Both lines match canonical exactly.

### A3 Codex TUI

Accepted on 2026-08-14 through a real PTY-backed interactive session.
`ios-dev:ios-patterns` returned line 69 verbatim —
``- Storage/API/logs use fixed ISO formats (`yyyy-MM-dd`, `HH:mm`) — not
localized.`` — read from
`…/plugins/cache/solopreneur/ios-dev/0.4.12/skills/ios-patterns/SKILL.md`.
This run also surfaced the description-shortening notice recorded under
Limitations.

### A4 Codex App

Accepted on 2026-08-14 through the Codex App Server JSON-RPC protocol, not
inherited from the CLI or TUI evidence. After `initialize`, `skills/list`
resolved all 11 specialist skills by their plugin-qualified names
(`<plugin>:<skill>`) to paths under
`$CODEX_HOME/plugins/cache/solopreneur/<plugin>/<version>/skills/`, with 18
entries from this marketplace and zero `asc-*` / `gplay-*` leakage.

This is the surface that exposed the frontmatter defect: the first App run
resolved only 11 of the 13 candidates, and the two missing skills were traced
to strict-YAML frontmatter failure rather than to packaging.

## References

- [Codex skill portability](./2026-08-09-codex-skill-portability.md)
- [Codex non-mutating skills](./2026-08-13-codex-nonmutating-skills.md)
- `todos/backlog/2026-08-14_codex-specialist-review-port.md` — the grading pass
  and the adjudication that produced this list
- `todos/backlog/2026-08-14_codex-frontmatter-yaml-gate.md` — the two held-back
  skills and the upstream fix
