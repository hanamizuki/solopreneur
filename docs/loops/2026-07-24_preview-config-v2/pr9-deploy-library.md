# feat(preview): library publish — staged deploy with fail-closed protection

Third PR of Phase 3. Adds `deploy-library.mjs`: it publishes a built Library
staging tree to its target's Vercel project as the **stable production entry**,
using a staged flow that was empirically verified on a real Hobby-plan account on
2026-07-24. Every rule below exists because the naive or documented approach was
observed to FAIL.

Builds on the merged Phase 1/3 work (#134 config-resolve + schema, #135 migrate,
#136 vercel-protect, #137 setup, #138 build-library, #139 provenance, #140 chrome,
#141 target identity / F9).

## Requirements

### The verified staged publish flow

`vercel deploy --prod --skip-domain` is **not** a staging step. It was tested:
`--skip-domain` only withholds the `targets.production` pointer, while the
automatic scope alias `<project>-<scope>.vercel.app` — which IS the stable entry —
switches to the new deployment immediately. There is no verify-before-switch
window, so that flow cannot be fail-closed.

The flow this module implements:

1. **`vercel deploy`** — a PLAIN preview, never `--prod`. Verified: produces a
   `target: null` deployment and does not move the scope alias. This is the real
   staging step.
2. **Verify the staged preview** before promoting: anonymously challenged
   (302/401) and carrying the revision just built (its `meta`, read back
   authenticated — no bypass secret needed).
3. **`vercel promote <preview>`** to publish. Verified caveat, and confirmed by
   Vercel's CLI docs: promoting a PREVIEW creates a **new** production deployment
   rather than converting that preview in place, so the deployment verified in
   step 2 is not literally the one that goes live.
4. **Verify again after promoting**: the live production carries our revision and
   the stable entry is anonymously challenged.
5. **Rollback = `vercel promote <last-good-production>`.** Verified: `vercel
   rollback` returns HTTP 500 on this account (both by-URL and by-id), so the
   module never invokes it.

Fail-closed posture: a step-2 failure issues **no promote** (the alias never
moved — zero impact); a step-4 failure promotes the last-good production back and
still exits non-zero. Success is never reported for an unverified state.

**First publish is a documented exception.** Vercel: "the first deployment of a
new project is always a production deployment, even when you omit `--prod`". The
module detects it (`target: "production"` **and** the project had no production
deployment before the deploy), skips the promote, and runs step 4 identically. On
an already-published project a `target: "production"` staging deploy is instead
refused — that would mean the entry moved unverified.

### Protection (first-publish responsibility)

`ssoProtection` is project-level and setup already ensures it, but the bare domain
`<project>.vercel.app` and the entry URL do not exist until the first production
deployment. So this module owns bare-domain removal and the entry probe, and runs
them on **every** publish (the anonymous probe is the only durable proof — a
config GET can be nulled afterwards).

Per publish, in order: `ensureProtected` **before** the deploy (content never
lands on an unprotected project) → publish → `ensureProtected` again →
`removeBareDomain` → `verifyEntryProtected` on the stable entry.

The last two are **separate checks and are never conflated**: removal is
confirmed by `removeBareDomain`'s own DELETE status (404 = already absent, 2xx =
removed), while `verifyEntryProtected` validates the protected ENTRY (302/401 =
protected, **200 = naked → fail closed**). A removed bare domain answers 404,
which the entry probe reads as unprotected.

### Target identity + publisher guard

- **Identity (F9).** The configured name is resolved by Vercel **under the
  target's scope**, and the answer is compared to the config: a `projectId` that
  disagrees, a `teamId` that is not the project's owner, or a name that resolves
  to a differently-named project all refuse to publish. A name-only target (still
  valid config) publishes with a loud warning rather than a refusal.
- **Project pinning is belt-and-braces on purpose.** An unlinked `vercel deploy`
  would CREATE a project named after the temp staging dir and publish private
  content into it, so the project is pinned two documented ways:
  `.vercel/project.json` (`{orgId, projectId}`, the documented contents of a
  linked directory; `.vercel` is on Vercel's default ignore list so it is never
  uploaded) **and** `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` (the recommended
  non-interactive pinning, which takes precedence over the file).
- **Stale-publish guard.** When the content root is a git repo: the content path
  must be clean and not behind its upstream, the source commit is recorded in the
  deployment metadata, and the live production's recorded commit must be an
  ancestor of ours (`git merge-base --is-ancestor`) — otherwise publishing would
  make the latest pointer go backwards. Checked **before the deploy** (so a stale
  publish costs no quota) and again immediately before the promote. A non-git
  content root skips the guard with a printed caveat; git is never hard-required.
- **The guard reads stable production only.** `targets.production` → that
  deployment, and only when it is `previewKind=library`. Never "the newest
  deployment in the project", or a later `previewKind=share` preview would poison
  the comparison. A foreign (non-library) production is still a valid rollback
  target but never drives the commit comparison.

### Deployment metadata

Every library deployment carries `previewKind=library`, `snapshot` (a sha256 over
the sorted `<id>/<contentHash>` pairs), and `sourceCommit` when there is one.
Vercel caps a meta value at 65536 characters, so no value here needs truncating.

### Quota

A publish is a full snapshot AND costs **two** deployments (the staged preview,
plus the rebuilt production the promote creates). The fleet has hit
`api-deployments-free-per-day` before, so a quota rejection is detected and
surfaced with that advice; verify locally with `build-library.mjs` first and
publish once per batch of edits.

### Output

Success prints the stable URL, the immutable production URL, the resolved project
(name + id + scope), the included collections, the source commit, the snapshot and
the bare-domain outcome. Failure prints the project's **actual** state — one of
untouched / published-but-unverified / rolled-back / rollback-failed / unknown.

## Design decisions

- **Revision is verified through the API, not through content.** The entry is
  SSO-protected, so its content cannot be read anonymously. Comparing the
  deployment's `meta` (authenticated) proves the live production is our build and
  is what catches a concurrent publisher winning the race — no bypass secret, no
  new CLI dependency.
- **The stable entry is discovered, not derived.** The scope slug is not in the
  link file or the API (both carry ids), so the entry is picked out of the
  hostnames Vercel reports — the production deployment's `alias` array and the
  project's domains — excluding the bare domain and the immutable URL, shortest
  match wins. Which of those two collections carries the scope alias was not
  captured in the Gate A log, so both are consulted and a failure to resolve is
  fail-closed rather than skipped.
- **A promote that does not confirm is UNKNOWN, not untouched.** Vercel documents
  that a promote timeout "does not affect the actual promotion which will continue
  to proceed", so a non-zero exit cannot be reported as "the entry did not move".
- **A promoted production without `previewKind` is refused.** `vercel promote` of
  a preview rebuilds, and metadata propagation across that rebuild is
  undocumented. Since the stale guard reads that metadata on the NEXT publish,
  accepting a production without it would silently degrade the guard — so the
  publish fails with the cause named in the message.
- **An empty Library refuses to publish.** A publish is a full snapshot, so zero
  items would replace the Library with an empty page and 404 every existing
  `/p/<id>/`. A misconfigured root is far likelier than a deliberate empty
  publish.
- **A non-private target refuses to publish.** The schema allows
  `visibility: "public"`, but its own description requires a publish-time content
  review that does not exist yet, so publishing one would skip a documented gate.
- **`build-library.mjs` produces the tree; this module never re-implements it.**
  It is called with `injectEntry: chromeInject` and with `gitCommit` pinned to the
  guarded commit, so `directory.json` and the deployment metadata cannot disagree
  about the source revision. The staging tree is removed after every publish,
  successful or not.

## Scope

`deploy-library.mjs` + tests + docs ONLY. NOT in this PR: `deploy-share.mjs`
(next PR) and any `--list` / `--revoke` surface. Not modified: `deploy.sh` (the
legacy per-page flow keeps its preview-only invariant), `config-resolve.mjs`,
`config-migrate.mjs`, `vercel-protect.mjs`, `setup.mjs`, `build-library.mjs`,
`resolve-provenance.mjs`, `config.schema.json`, any `plugin.json`.

## Acceptance criteria

- [x] `cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs`
      exits 0 — 377 tests (320 baseline + 57 new), 375 pass + 2 skipped.
- [x] Staged order: a fake proves the publish issues a PLAIN preview deploy first
      (no `--prod`, no `--skip-domain`), probes it, and only then promotes.
- [x] Preview-verification failure → no promote is issued and the publish exits
      non-zero (asserted for a naked preview, a metadata mismatch, and a
      `target` that is not `null`).
- [x] Post-promote verification failure → a promote of the last-good production
      is issued and the publish exits non-zero.
- [x] `vercel rollback` is never invoked — asserted both at the flow level (the
      fake's `rollback` is never called) and at the argv level.
- [x] Entry probe fail-closed: a stable entry answering 200 makes the publish
      fail and roll back, never succeed.
- [x] Bare-domain removal is confirmed via `removeBareDomain`'s status (404 =
      already gone = success) and the bare domain is never used as a probe target.
- [x] Identity mismatch (`projectId`, `teamId`, or resolved name) refuses to
      publish before any deploy.
- [x] Stale guard: a live production recording a non-ancestor commit aborts before
      any deploy; a non-git content root skips the guard and still publishes.
- [x] The revision/guard query ignores `previewKind=share` deployments — asserted
      by a share preview that is the project's newest deployment and whose commit
      would abort the publish if it were read.
- [x] Every library deployment carries `previewKind=library` metadata.
- [x] All tests inject fakes: zero real network, zero real deploys, no `vercel`
      or `git` process spawned.
- [x] No workspace-specific names in the new source, tests, or doc.
- [x] `git diff --stat` shows no change to `deploy.sh`, `config-resolve.mjs`,
      `config-migrate.mjs`, `vercel-protect.mjs`, `setup.mjs`,
      `build-library.mjs`, `resolve-provenance.mjs`, `config.schema.json`, or any
      `plugin.json`.

## Residual platform unknowns

These are recorded rather than guessed. Each fails closed, so the module reports a
real state instead of a false success.

- **Metadata propagation across a promote** is undocumented (see above). If Vercel
  does not carry `--meta` into the rebuilt production deployment, the first real
  publish fails with that cause named — it does not silently publish a deployment
  the guard cannot read.
- **Re-promoting an already-promoted deployment.** Vercel's docs say a deployment
  that has been promoted before cannot be promoted again and that a rollback is
  the documented route — but `vercel rollback` was measured returning HTTP 500 on
  this account, which is why rollback here is promote-based. If both routes refuse,
  the module reports `rollback-failed` (state UNKNOWN, fix by hand) rather than
  claiming a rollback it did not achieve.
- **Rolling Releases** (Pro-only, off by default) changes promote into a gradual
  rollout. The module does not detect it, so a project with rolling releases
  enabled could report success while only part of the traffic sees the new
  snapshot. Both snapshots are protected Libraries, so the blast radius is
  cosmetic.
- **Deployment Retention** (default unlimited) can delete the rollback target. The
  rollback promote then fails and the state is reported as UNKNOWN.
- **Whether `GET /v9/projects/{id}/domains` lists the auto-assigned scope alias**
  was not captured in the Gate A log, which is why the entry is resolved from that
  list *and* the deployment's `alias` array.

## Notes

- Test command trap unchanged: run `node --test tests/*.test.mjs` (a bare
  `tests/` runs zero tests on Node >= 22.6); CI guards it with `shopt -s failglob`.
- Node built-ins only; no new deps; no `plugin.json` bump; Node floor 20 (CI 20 +
  24); English comments; generic placeholders.
