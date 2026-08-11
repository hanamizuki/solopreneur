# Codex publication safety

**Created:** 2026-08-10
**Status:** Active prerequisite for the first Codex-supporting release
**Related:** [Codex skill portability](../../docs/spec/2026-08-09-codex-skill-portability.md)
rollout PRs 3 and 4, [Codex Greenlight port](../../docs/spec/2026-08-10-codex-greenlight-port.md)

## Why this exists

The raw Codex package currently starts at **plain parity with Claude Code**:
every skill is discoverable, with no per-skill registry or publication filter.
That is exactly what Claude Code does today — its `plugin.json` and
`marketplace.json` carry `{name, version, description, license}` and nothing
about individual skills, and the harness auto-discovers `skills/`. Individual
runtime checks do not yet form a complete publication boundary.

Plain parity is sufficient for development and measurement, but not for an
honest public surface. Complete the bounded registry, publication filter, and
guards below before advertising Codex support. Default unreviewed skills to
unsupported and excluded; do not turn this into a 106-skill parity project.

## 1. Fail-closed host guards on side-effecting skills

The concrete risk is a skill that half-executes. The current `autopilot` body
only maps Claude's `Workflow`, `Agent`, and `CronCreate` paths, while Codex
exposes a different subagent lifecycle and keeps scheduled-task management out
of the CLI. Until its Codex V1 branch lands, it must stop before writing
artifacts or starting external work rather than entering a flow it cannot
finish.

Add a guard at the entry of each skill that mutates something outside its own
output: `autopilot`, `merge-pr`, `preview`, `worktree-handoff`, and any
`native_engines` skill without a Codex engine. The guard detects the missing
host capability and stops **before the first side effect**, naming the surface
that does support the workflow.

The portability spec already defines what counts as a guard
(`2026-08-09-codex-skill-portability.md:249-251`): it "must stop before workflow
side effects and explain the supported surface", and
`allow_implicit_invocation: false` does not qualify because explicit invocation
still works.

The Autopilot Codex V1 target is run-now, single-PR orchestration through a
Codex subagent with explicit worktree ownership. A generic Codex worker is the
fallback when a specialist is unavailable. Multi-PR waves and Codex App
scheduling are later capabilities; the CLI path never claims Claude Cron
parity. The guard remains the boundary for every unsupported mode and surface.

### Resolved foundation: positional-parameter corruption

The shared config extraction removed executable `$N` helpers from skill bodies,
and the current validation suite rejects their return. This failure class no
longer belongs to the open publication work; the remaining resolver task is the
single platform-aware config/plugin-root entry point tracked in the portability
spec.

## 2. Compatibility registry (`skills-compatibility.json`)

Build the minimum root-level registry classifying every discovered
`plugins/*/skills/*/SKILL.md` by source shape (`shared` /
`shared_with_seams` / `native_engines`) and by per-surface support
(`claude-code` / `codex-exec` / `codex-tui` / `codex-app` →
`full` / `degraded` / `unsupported` / `legacy`), with CI validation.

Scope warning from the spec itself: it "must not turn into a 106-skill parity
project". Seed it with the five `native_engines` skills plus Greenlight's
dependency closure and default everything else to
`unsupported` / `exclude`.

**Pre-decided, do not re-litigate:** Greenlight's `codex-exec` entry is
**`degraded`** — external mode only, no Phase 1 / Phase 2, a `claude-cli` gate,
sizes S and M only — with
[the port spec](../../docs/spec/2026-08-10-codex-greenlight-port.md) as its
limitation reference. Recorded in `greenlight/SKILL.md`'s "Host support" section
when W2-W5 landed. This settles the entry's *value*, not its publication:
Greenlight on Codex stays gated on the safety gates in this todo.

## 3. Filtered Codex publication view

Today every plugin declares `"skills": "./skills/"`, so installing
on Codex exposes all 106 skills. The spec's argument for filtering
(`2026-08-09-codex-skill-portability.md:264-266`): `allow_implicit_invocation:
false` disables only implicit invocation, so metadata alone cannot keep an
unsupported skill out of the package — the publication view has to physically
exclude it from the declared skills root.

Note the gate this releases: the spec states that "Greenlight cannot be
published on Codex before both safety gates pass"
(`2026-08-09-codex-skill-portability.md:500`). The same paragraph allows
building and measuring in parallel — only **publication** is gated. Revisit
before the first Codex-supporting release.
