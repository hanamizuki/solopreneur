# feat(preview): vercel protection module (Gate A recipe)

Follows PR #134 (`config-resolve.mjs`, `config.schema.json`) and PR #135
(`config-migrate.mjs` + the CI test gate). This PR adds the security-critical
core that the upcoming `setup.mjs` and `deploy-library.mjs` will both call. It
is the module + its tests only — no interactive flow, no config writing, and no
change to `deploy.sh` (its inline `ssoProtection` block stays as the legacy
per-page flow).

## Requirements

Implement `vercel-protect.mjs`: the module that encodes a set of Vercel
deployment-protection behaviors empirically verified on 2026-07-24 against a
real Hobby-plan account (the "Gate A recipe"). Every rule exists because the
naive version was observed to fail.

### Why the naive version is wrong (verified facts these rules encode)

On a fresh Vercel project, `ssoProtection` auto-enables to the legacy enum
`all_except_custom_domains`. Under it the immutable deployment URL and the scope
alias `<project>-<scope>.vercel.app` return anonymous 302 (protected), but the
**bare domain `<project>.vercel.app` returns anonymous 200** (world-readable).
Three things were verified the hard way and shape this module:

1. **A rejected PATCH silently clears `ssoProtection` to `null`** (fully naked).
   Never trust a PATCH's echo, and always be able to restore.
2. **The PATCH response echo cannot be trusted** — GET the value back to know
   the real state.
3. The documented enum `prod_deployment_urls_and_all_previews` is **weaker** (it
   makes the scope alias anonymously 200), so migrating to it is a regression
   and is refused.

### Module contract

All network access goes through an **injected `deps` object** so the module is
testable with zero real network:

- `getProject({projectId, teamId})` → the project JSON (for `ssoProtection`,
  `targets.production`, …)
- `patchSsoProtection({projectId, teamId, deploymentType})` → raw PATCH result
- `deleteDomain({projectId, teamId, domain})` → `{status}`
- `listDomains({projectId, teamId})` → domains array
- `probe(url)` → `{status}` for an **anonymous** (no-auth) HTTP request

A real default `deps` (`makeDefaultDeps()`) is provided for production, mirroring
`deploy.sh`'s conventions: it reads the Vercel CLI auth token from `auth.json`
the way `deploy.sh:230-238` does, hits `https://api.vercel.com`, and adds
`?teamId=` when the org id starts with `team_`. Tests inject a fake `deps`; the
real one is not exercised over the network by tests.

Exported functions:

1. `snapshotSsoProtection({projectId, teamId, deps})` → the current
   `ssoProtection.deploymentType` (or `null`), via GET. Callers snapshot BEFORE
   any PATCH so a rejected PATCH can be rolled back.
2. `ensureProtected({projectId, teamId, deps, deploymentType?})`: snapshot →
   PATCH `all_except_custom_domains` → **GET again and read the real value**
   (never the echo). If the GET shows `null` (rejected + nulled), restore the
   snapshot, GET-verify, and throw a clear "could not protect" error (never leave
   it null). If the GET shows the legacy enum, success. Refuse to set
   `prod_deployment_urls_and_all_previews`, or any value other than the legacy
   enum.
3. `removeBareDomain({projectId, teamId, project, deps})`: DELETE
   `<project>.vercel.app`; a 404 (already absent) is success.
4. `verifyEntryProtected(url, {deps})`: anonymous probe; true only for a
   protected status (302/401), false for 200 (naked). The fail-closed check
   callers run after every provisioning step.
5. `inventoryProject({projectId, teamId, deps})`: `{domains,
   productionDeploymentId}` so a caller can tell a safe empty target from a
   populated project that must not be clobbered. Reports only — the decision
   lives in `setup.mjs`.

### Constraints

- Node.js built-ins only; no new dependencies, no `package.json`. Declared floor
  is Node 20 (CI matrix runs 20 + 24).
- Header comment declaring the minimum Node version and that the rules encode
  empirically verified Vercel behavior.
- Open-source repo: all comments and docs in English.
- No Hana-specific values (`grep -rniE 'hana|~/Agents|mojo-apps'` over the new
  files returns nothing).
- No `plugin.json` version bump (that is `/release`'s job).

## Acceptance Criteria

- [x] `cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs`
      exits 0 — 121 tests (PR #134+#135's 104 plus 17 new).
- [x] **Echo-not-trusted**: a fake where PATCH echoes success but the subsequent
      GET returns a different value → `ensureProtected` throws (believes the GET).
- [x] **Rejected-PATCH-nulls-it**: a fake where PATCH nulls the value →
      `ensureProtected` issues a restore PATCH with the snapshot value, throws a
      clear "could not protect" error, and the final GET is not null.
- [x] **Weaker-enum refused**: setting `prod_deployment_urls_and_all_previews` is
      rejected (before any I/O).
- [x] **Bare-domain 404 tolerated**: `removeBareDomain` treats a 404 as success.
- [x] **Fail-closed probe**: `verifyEntryProtected` is true for 302 and 401,
      false for 200 (and every other status).
- [x] **Inventory**: `inventoryProject` surfaces a populated project distinctly
      from an empty one.
- [x] No Hana-specific values in the two new files.
- [x] `git diff --stat` shows no change to `deploy.sh`, `config-resolve.mjs`,
      `config-migrate.mjs`, `config.schema.json`, or any `plugin.json`.

## Implementation decisions

**curl, not global `fetch`, in the real `deps`.** `fetch` is unflagged on the
Node 20 floor but emits an ExperimentalWarning on the stderr this script family
reserves for errors (`config-resolve.mjs` avoids `node:util` `parseArgs` for the
same reason), and `deploy.sh` already hard-depends on curl. curl also mirrors
`deploy.sh`'s existing token/URL conventions exactly.

**The auth token never reaches the process argv.** `curl -H "Authorization:
Bearer <token>"` would put the token in argv, readable by other local users via
`ps` on a shared host. The token is instead written to curl's `--config -`
(stdin), and a token carrying a quote or newline is rejected. A hermetic test
asserts the token appears in the stdin config and never in argv — the security
property is checked, not merely claimed.

**Every module function is `async` and awaits the `deps` calls.** `await` on a
non-promise is a no-op, so a synchronous curl-based real `deps` and an async
`fetch`-based one both satisfy the contract, and tests inject plain sync fakes.

**`ensureProtected` resolving is NOT "the deployment is unreadable".** Under the
legacy enum the bare domain is still 200. Full protection of a private target is
the composition `ensureProtected` + `removeBareDomain` + `verifyEntryProtected`
(probing both the entry and the bare domain), and the durable guarantee is the
anonymous probe, not the config GET (which can be silently nulled afterwards).
This module ships the primitives; the orchestration lives in `setup.mjs` and
`deploy-library.mjs` (later PRs). The module header and `shared/config.md` say so.

**`removeBareDomain` keeps its 404-is-success contract; it does not probe.** A
404 also results from a wrong target, so a caller that must be certain follows it
with an anonymous `verifyEntryProtected` of the bare URL. That composition is the
caller's, matching the function separation in the contract.

**curl failure semantics are defined.** Authenticated API calls throw on any
transport failure (curl missing, timeout, non-zero exit) — a failed call is an
error, never "no value". The anonymous probe fails **closed** to status 0, so
`verifyEntryProtected` reads an unconfirmable state as unprotected. `-m`
timeouts keep a hang from wedging the caller.

**The probe is a redirect-non-following GET.** `curl` without `-L` reports the
302 itself rather than chasing it to the SSO login page (which would 200 and read
as naked). If HEAD were ever unsupported (405) the fail-closed allowlist keeps
that safe.

## Notes

- **No in-repo caller yet.** `setup.mjs` (next PR) and `deploy-library.mjs`
  (Phase 3) are the consumers; a reviewer noting "no in-repo caller yet" is
  expected.
- **Test command trap.** `node --test tests/` runs zero tests on Node ≥ 22.6;
  the suite is run as `node --test tests/*.test.mjs`, and CI guards it with
  `shopt -s failglob`.
- **No CLI.** A thin CLI was optional per the spec; skipped to keep the module a
  clean, import-side-effect-free library and avoid an untested surface.
