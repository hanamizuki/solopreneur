# Codex publication safety

**Created:** 2026-08-10
**Completed:** 2026-08-11
**Status:** Complete
**Related:** [Codex skill portability](../../docs/spec/2026-08-09-codex-skill-portability.md)
rollout rows 3–4, [Codex Greenlight port](../../docs/spec/2026-08-10-codex-greenlight-port.md)

## Outcome

Codex no longer installs the canonical Claude skill trees. The compatibility
registry is the publication authority, and the generator builds separate
filtered roots under `.codex/plugins/<name>/`. A plugin appears in the Codex
marketplace only when at least one of its skills is explicitly included.

The initial registry classifies all 106 discovered skills: 88 `shared`, 12
`shared_with_seams`, and 6 `native_engines`. Claude Code remains included with
the migration baseline marked `legacy`; Codex defaults fail closed to
`unsupported` and `exclude`. Greenlight records its accepted degraded
`codex-exec` surface but remains excluded until its remaining product gates
pass.

## Completed gates

1. Seven side-effecting unsupported core workflows now carry an early
   `CODEX_THREAD_ID` guard: `autopilot`, `merge-pr`, `mvp`, `plan-review`,
   `preview`, `todos-babysit`, and `worktree-handoff`.
2. `skills-compatibility.json` classifies every canonical skill and records
   support, publication, evidence, resources, dependencies, capabilities, and
   required guards. Validation rejects missing or duplicate classifications,
   unsafe defaults, unsupported publication, missing evidence or resources,
   broken dependency closure, and absent early guards.
3. The generator removes Codex manifests from canonical plugin roots and emits
   only registry-included skill directories into generated install roots.
   Drift, exact published inventory, manifest location, and local installation
   are CI gates.

## Acceptance evidence

The one-skill acceptance fixture at
`7cca235f20bd10388265cad40800338fa4012838` included only
`solopreneur:filter-canary`.

- Codex CLI 0.147.0 installed both local-path and fresh git-ref marketplaces.
- Both installed caches contained exactly `filter-canary`; excluded canonical
  siblings such as `autopilot` were absent.
- The generated plugin root passed the official plugin validator.
- An authenticated git-ref invocation under an isolated home resolved the
  cached absolute skill path and returned exactly `FILTER_CANARY_ONLY` (session
  `019ff048-7bb8-7c70-b8c3-fdd8a4ee1a07`).

This closes publication safety only. It does not publish Greenlight or claim
Autopilot support. The next critical-path gate is Greenlight reviewed-head
binding, followed by the shared-view surface guard evidence.
