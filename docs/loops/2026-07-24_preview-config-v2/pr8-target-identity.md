# feat(preview): target identity — projectId + teamId (F9)

First PR of Phase 3. Adds a durable **target identity** to the v2 preview config
so a target is bound to a specific Vercel project by id + team, not just by a
name. This is the "F9" contract. It builds on the merged Phase 1 work (#134
config-resolve + schema, #135 migrate, #136 vercel-protect, #137 setup, #138–#140
build/provenance/chrome).

A name-only config cannot distinguish a team project from a same-named personal
one, which is why `setup.mjs` (#137) shipped personal-scope-only. F9 lifts that:
setup can provision under a team and records the real identity so a later
deploy step can trust the binding.

## Requirements

Three surgical, additive changes across already-merged files, plus tests + docs.

1. **`config.schema.json`** — add two OPTIONAL string fields to the `target`
   definition: `projectId` and `teamId` (`type: string`, `minLength: 1`). Not
   `required`. The schema already has no `additionalProperties: false` (pr1 left
   it open for exactly this), so existing configs without the fields stay valid.
   No other schema change.

2. **`config-resolve.mjs`** — surface `projectId` / `teamId` on the resolved
   `target` output object, passed through from config and **OMITTED when absent**
   (a name-only target's resolved shape is byte-identical to before). Resolution
   order and every other output field are unchanged. One explicit invariant is
   added in `resolveV2`, alongside the existing provider/include checks: a target
   with `teamId` but no `projectId` is rejected — a team scope is meaningless
   without the project id it scopes. (The tiny schema interpreter has no
   cross-field dependency keyword, so this lives in the resolver.)

3. **`setup.mjs`** — after provisioning succeeds, bind the target's identity:
   - A new `--team <teamId>` flag names the Vercel team to provision under; every
     Vercel call runs on its behalf (the `teamId` was already threaded through
     `provision` → `deps` → vercel-protect's `teamQuery`). A value that is not a
     `team_…` id is refused before any Vercel call. Omitting it is personal scope.
     This replaces #137's hardcoded `const teamId = undefined` F9 stub.
   - A best-effort `resolveIdentity({ projectName, teamId, deps })` reads the
     provisioned project back (`deps.getProject`) and takes `projectId` from its
     `id` (the same field the create/link path already reads) and `teamId` from
     its `accountId` when that is a team scope (`team_…`). A personal project
     reports the user id there, so personal scope writes no `teamId`.
   - `buildConfig` gains an identity param and includes the pair in the target
     when present. `provision()` itself is unchanged.

## Design decisions

- **Identity is additive metadata, not fail-closed.** Protection is fail-closed
  and runs first (unchanged); identity is read afterward. A failed identity read,
  or a project object with no `id`, yields a **name-only** config rather than an
  error — and an id is **never fabricated**. `teamId` is only ever written
  alongside a `projectId`.
- **`teamId` is read from the resolved object's owner (`accountId`), not the
  flag.** The flag is the scope the request runs under; the value persisted is
  what Vercel reports as the owner, which is self-validating and makes personal
  scope self-detecting. (Verified against the Vercel OpenAPI spec: both
  `POST /v11/projects` and `GET /v9/projects/{idOrName}` return `id`, `name`, and
  a required `accountId`; the `teamId` query param — `team_…` — is required to act
  on a team's behalf and cannot be inferred.)
- **`provision()` stays untouched.** The identity read is a separate `getProject`
  after provisioning, so the delicate fail-closed protection orchestration is not
  perturbed. The one extra GET is negligible for a one-time interactive setup.

## Scope

Identity fields + resolver output + setup write-back + tests + docs ONLY.
NOT in this PR (later PRs): `deploy-library.mjs` / `deploy-share.mjs` and the
deploy-time three-way consistency ENFORCEMENT (name ↔ id ↔ team) — F9 only makes
the identity available. Not modified: `config-migrate.mjs` (a migrated config
stays name-only, which is valid), `vercel-protect.mjs`, `build-library.mjs`,
`resolve-provenance.mjs`, any `plugin.json`.

## Acceptance criteria

- [x] `cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs`
      exits 0 — 319 tests (310 baseline + 9 new), 317 pass + 2 skipped.
- [x] **Schema**: a target with `projectId` + `teamId` validates; a target with
      neither still validates (backward compat); an empty `projectId` is rejected.
- [x] **Resolver**: `--json` surfaces `projectId` / `teamId` when present and omits
      them when absent (both asserted); a `teamId` without a `projectId` is
      rejected.
- [x] **Setup**: a personal-scope create writes the real `projectId` and no
      `teamId`; a `--team` create writes both, with `teamId` read back from the
      owner and the scope threaded into the Vercel call; an unresolvable id yields
      a name-only config (no invented ids); an invalid `--team` is refused before
      any Vercel call.
- [x] A previously-written name-only config still resolves unchanged.
- [x] No workspace-specific names (agent home paths, owner handles, private repo
      names) in the changed source, tests, or docs — generic placeholders only.
- [x] `git diff --stat` shows no change to `config-migrate.mjs`,
      `vercel-protect.mjs`, `build-library.mjs`, `resolve-provenance.mjs`, or any
      `plugin.json`.

## Notes

- Test command trap unchanged: run `node --test tests/*.test.mjs` (a bare
  `tests/` runs zero tests on Node ≥ 22.6); CI guards it with `shopt -s failglob`.
- Node built-ins only; no new deps; no `plugin.json` bump; Node floor 20 (CI 20 +
  24); English comments; generic placeholders (`my-private-previews`, `team_…`).
