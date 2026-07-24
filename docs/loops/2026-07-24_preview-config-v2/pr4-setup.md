# feat(preview): first-run setup (single private target)

Follows PR #134 (`config-resolve.mjs`, `config.schema.json`), PR #135
(`config-migrate.mjs`), and PR #136 (`vercel-protect.mjs`). This PR adds
`setup.mjs`: the first-run experience that stands up a v2 preview Library config,
provisions its Vercel protection, and — only after explicit confirmation — writes
the config. It is `setup.mjs` + its tests + docs only. It does NOT implement
`build-library.mjs`, `deploy-library.mjs`, or `deploy-share.mjs`, and it does not
modify `deploy.sh`, `config-resolve.mjs`, `config-migrate.mjs`,
`vercel-protect.mjs`, or `config.schema.json`.

## Requirements

Implement `setup.mjs`: detect the absence of a v2 config, interactively propose a
SINGLE `private` target (never the legacy three buckets), and — only after the
user confirms — provision the Vercel project's protection, then write the config
and create the content dirs.

### Flow

1. **First-run detection.** Resolve via `config-resolve`. `mode: "v2"` → no-op:
   print the resolved config path, exit 0 (idempotent). `mode: "legacy"` → point
   at `config-migrate`, exit 0. Only `mode: "none"` (or `--force`) proceeds.
2. **Propose.** Before doing anything: the config path, the preview `root`, the
   `active/` and `archive/` dirs, the target name (`private`), the visibility
   (`private`), and the Vercel project name.
3. **Choose project.** Ask whether to create a new project or link an existing
   one. Both paths are supported.
4. **Confirm gate.** Nothing is written and no Vercel mutation happens until the
   user confirms.
5. **On confirm, provision then write — fail closed.**

### Protection responsibility — setup vs. first-publish

The bare domain `<project>.vercel.app` and the immutable entry URL do not exist
until a project has its first PRODUCTION deployment. So the division is
deliberate:

- **`ssoProtection` is a project-level setting** — settable and GET-verifiable on
  a project with **zero deployments**. Setup always runs `ensureProtected`.
- **Bare-domain removal + the 302 entry-probe** have nothing to act on until a
  deployment exists. On a brand-new / linked-empty project setup does NOT run
  them and does NOT hard-fail for their absence — they are `deploy-library.mjs`'s
  first-publish job. Setup runs the full hardening only on a POPULATED existing
  project (and the entry-probe only when it has a production deployment).
- **Existing populated project** requires an EXTRA explicit confirmation before
  provisioning (it could disrupt a real site). On confirm: `ensureProtected`,
  `removeBareDomain`, then TWO SEPARATE checks — the protected ENTRY via
  `verifyEntryProtected` (302), AND bare-domain removal via `removeBareDomain`'s
  returned status (404 = removed). They are not conflated: a removed bare domain
  is 404, which `verifyEntryProtected` reads as *unprotected*.

### The zero-deployment ssoProtection fact (verified, not assumed)

The spec required verifying — not assuming — that `ssoProtection` can be
PATCHed/GET on a project with no deployments. Verified 2026-07-24 against the
official Vercel REST API reference:

- **Create project** (`POST /v1x/projects`) accepts `ssoProtection` in the
  request body — it can be set at project creation, before any deployment.
- **Update project** (`PATCH /v9/projects/{idOrName}`) documents `ssoProtection`
  as a project-level configuration that can be set at any time and applies to
  future deployments; **no existing deployment is required**.
- `all_except_custom_domains` (the Gate A legacy enum) is a valid value in both
  endpoints' schemas.

So the "new/empty project" path can safely `ensureProtected` (GET → PATCH →
GET-verify) a freshly created project. This is a checked platform fact; it feeds
the `deploy-library.mjs` spec, which owns first-publish bare-domain removal + the
entry probe.

### Ordering (fail-closed)

After confirmation: Vercel create/link + the applicable protection steps run
FIRST; the local config + content dirs are written LAST, only once protection
succeeds. A provisioning/verification failure exits non-zero having written
nothing — a config that lies about protection is worse than no config.

The written config must be **discoverable and effective**: after writing, resolve
it via `config-resolve` (walking up from a content path, not by pointing
`$SOLOPRENEUR_CONFIG` at it) and assert `mode: "v2"` with the expected
`root`/`target`. schema-valid ≠ resolvable (PR #135). A config that does not
resolve is removed, so setup never leaves an ineffective file behind.

### Testability

Both seams are injected so the flow is exercised with zero real network and zero
real prompts:

- a Vercel `deps` seam (vercel-protect's shape, plus `createProject` and
  `getDeployment`) — tests pass a fake.
- a prompt/IO seam (`io` with `ask`/`print`/`error`) — tests queue answers.

`makeDefaultDeps()` / `makeStdio()` build the production implementations.
`makeDefaultDeps` reuses vercel-protect's `makeDefaultDeps` for the five
protection operations and adds only `createProject` + `getDeployment` with a small
authed-curl mirroring its conventions (vercel-protect must not be modified and
does not export its request helper).

### Constraints

- Node built-ins only; no new deps; no `package.json`. Node floor 20 (CI 20 + 24).
- Open-source repo: comments and docs in English.
- No Hana-specific values in the new files.
- No `plugin.json` version bump.
- `PREVIEW_PROJECT` is neither read nor written.

## Acceptance Criteria

- [x] `cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs`
      exits 0 — 154 tests (133 baseline + 21 new).
- [x] **Idempotency**: `mode: "v2"` → no-op printing the existing config path,
      exit 0, no prompting, no mutation.
- [x] **Confirm-gate**: declining writes nothing, creates no dirs, issues no
      Vercel mutation (the fake records no PATCH/DELETE/createProject).
- [x] **Fail-closed ordering**: a provisioning failure writes no config and exits
      non-zero.
- [x] **Discoverable-and-effective**: after a successful run the written config
      resolves (via the shipped resolver) to `mode: "v2"` with the expected
      root/target.
- [x] **Existing-populated guard**: a non-empty `inventoryProject` requires the
      extra confirmation; declining aborts without mutation.
- [x] **Two-separate-checks**: bare-domain removal confirmed via
      `removeBareDomain`'s status (404 = removed) and entry protection via
      `verifyEntryProtected` (302), not conflated; a naked entry (200) fails
      closed even when the bare domain is 404.
- [x] **Single private target**: the emitted config has exactly one target,
      `private`, `visibility: "private"` — never three buckets.
- [x] No Hana-specific values in the two new files.
- [x] `git diff --stat` shows no change to `deploy.sh`, `config-resolve.mjs`,
      `config-migrate.mjs`, `vercel-protect.mjs`, `config.schema.json`, or any
      `plugin.json`.

## Implementation decisions

**`provision()` returns a boolean, throws on failure.** `true` = protected,
`false` = the user declined the populated-project confirmation (a clean exit-0
abort, consistent with the main-confirm decline), a throw = fail-closed. This
keeps a decline distinct from a failure at the call site.

**`getProject` doubles as the existing-project resolver.** Vercel's
`GET /v9/projects/{idOrName}` accepts a name, so linking resolves the user's name
to the canonical id without a new dep.

**The populated-path entry URL comes from the production deployment.**
`inventoryProject` returns `productionDeploymentId`; `getDeployment` yields its
immutable `url`, which is a verified protected entry (302). No scope-slug
construction needed. When a populated project has domains but no production
deployment, `removeBareDomain` still runs (404-tolerated) but the entry probe is
skipped — there is no immutable entry yet.

**In-process hermetic tests.** Unlike the config-* suites (which spawn the CLI),
setup tests import `main` and inject fakes, then control the resolver's globals
(a fixture cwd via `chdir`, a fixture `HOME`, cleared `SOLOPRENEUR_CONFIG` /
`CLAUDE_CONFIG_DIR`, `GIT_CONFIG_NOSYSTEM` / `GIT_CEILING_DIRECTORIES`) restored
after each test. The discoverability check is proven by spawning the real
`config-resolve.mjs`, so "effective" is asserted, not mocked.

## Notes

- **No in-repo caller yet.** `setup.mjs` is invoked by a human (`node setup.mjs`);
  wiring it into `SKILL.md`'s workflow is a later PR, so `SKILL.md` is unchanged
  (it documents no v2 first-run path today).
- **Test command trap.** `node --test tests/` runs zero tests on Node ≥ 22.6; the
  suite is run as `node --test tests/*.test.mjs`, and CI guards it with
  `shopt -s failglob`.
