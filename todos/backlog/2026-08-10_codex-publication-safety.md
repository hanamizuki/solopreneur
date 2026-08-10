# Codex publication safety (deferred)

**Created:** 2026-08-10
**Status:** Deliberately deferred — see "Why this is deferred" below
**Related:** [Codex skill portability](../../docs/spec/2026-08-09-codex-skill-portability.md)
rollout PRs 3 and 4, [Codex Greenlight port](../../docs/spec/2026-08-10-codex-greenlight-port.md)

## Why this is deferred

The Codex plugin is being brought up at **plain parity with Claude Code**: every
skill discoverable, no per-skill registry, no publication filter, no host
guards. That is exactly what Claude Code does today — its `plugin.json` and
`marketplace.json` carry `{name, version, description, license}` and nothing
about individual skills, and the harness auto-discovers `skills/`.

The portability spec asks for more than parity for Codex, and its reasoning is
sound (recorded below). We are choosing to ship parity first and harden after,
rather than build three safety systems before the first Codex skill runs.

**This list is the debt that choice creates.** Work it before advertising Codex
support, not before making Codex work.

## 1. Fail-closed host guards on side-effecting skills

The concrete risk is a skill that half-executes: on Codex, `autopilot` would
create a worktree and open a pull request, then reach its dispatch step
(`autopilot/SKILL.md:343`) and find neither a `Workflow` nor an `Agent` tool —
leaving a branch and a PR nobody finishes. That is an abandoned side effect, not
graceful degradation.

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

This is the cheapest of the three items and the one that actually prevents the
damage. Consider doing it alone and leaving 2 and 3 permanently deferred.

**Decided 2026-08-10 (Hana): Codex Autopilot V1 is not being built.** The
platform bounds it to run-now / single-PR / attended — no Workflow or Agent
tool, no cron — which forfeits all three of Autopilot's values (unattended
operation, multi-PR waves, scheduling). The `autopilot` guard above is
therefore the end state, not a stopgap. Revisit only if Codex ships subagent
or scheduling primitives, or real demand appears once Greenlight's Codex mode
is in use.

### Measured 2026-08-10: a fourth failure class — silent `\$N` corruption

A minimal probe plugin (SKILL.md body containing `$1`, `\$1`, `$ARGUMENTS`)
installed into Codex and driven via `codex exec` showed that **Codex performs
no argument substitution on skill bodies and does not consume backslash
escapes**: the model received every probe byte-for-byte, with the invocation
arguments appended separately.

Claude Code substitutes `$N` on every load, which is why commit `418dd5c`
escaped bare `$N` as `\$N` in the native skill bodies. On Codex that escape
arrives intact, so `local key="\$1"` in the inlined config helper binds `key`
to the literal string `$1`, every jq path in the five-layer cascade misses,
and `read_solopreneur_config` returns empty. The skill then runs with
defaults as if no config existed — no error, no stop.

That is a failure class the guard list above does not cover: not an abandoned
side effect, not a missing tool, but **silent wrong behavior** — the workflow
appears to work while ignoring the operator's configuration. Affected native
bodies (escaped-`$N` occurrences): `merge-pr` (10), `worktree-handoff` (6),
`todos-cleanup` (5), `todos-babysit` (5), `greenlight` (5).

The escape requirements are mutually exclusive at the body level: Claude needs
`\$N`, Codex needs bare `$N`. The exit is to stop interpolating shell that
uses positional parameters in skill bodies at all — move it into script files,
which neither harness rewrites. `preview` already made this move
(`scripts/config-resolve.mjs`, PR #147), and the portability spec's rollout
PR 5 (one executable config/plugin-root resolver) is the same fix for the
remaining five bodies.

## 2. Compatibility registry (`skills-compatibility.json`)

Rollout PR 3. A root-level registry classifying every discovered
`plugins/*/skills/*/SKILL.md` by source shape (`shared` /
`shared_with_seams` / `native_engines`) and by per-surface support
(`claude-code` / `codex-exec` / `codex-tui` / `codex-app` →
`full` / `degraded` / `unsupported` / `legacy`), with CI validation.

Scope warning from the spec itself: it "must not turn into a 106-skill parity
project". If this is ever built, seed it with the five `native_engines` skills
plus Greenlight's dependency closure and default everything else to
`unsupported` / `exclude`.

## 3. Filtered Codex publication view

Rollout PR 4. Today every plugin declares `"skills": "./skills/"`, so installing
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
