# feat(preview): single-item Share deployment (Gate D recipe)

Final PR of Phase 3. Adds `deploy-share.mjs`: it consumes a **Share request**
produced by the in-page Share UI (PR #140) and deploys **only that one preview**
as an isolated snapshot into the **same** Vercel project as the Library — as a
plain **preview** deployment that never touches Library production.

Builds on the merged Phase 1/3 work (PR #134 config-resolve + schema, #135
migrate, #136 vercel-protect, #137 setup, #138 build-library, #139 provenance,
#140 chrome, #141 target identity / F9, #142 deploy-library).

Every platform rule below was empirically verified on a real Hobby-plan account
on 2026-07-24 (Gate D). Do not "simplify" the access-mode handling without
re-running that experiment — the intuitive substitution (the
`x-vercel-protection-bypass` header) does **not** work for sharing, and the one
that does work would unlock the whole project.

## Requirements

### The Share request contract

The page generates the request; this module parses it. The contract's single
source is `assets/preview-shell.js`, which `deploy-share.mjs` imports for
`SHARE_SCHEMA_VERSION` and `ACCESS_OPTIONS` rather than restating them — so the
producer and the consumer cannot drift.

```json
{
  "schemaVersion": 1,
  "kind": "preview-share-request",
  "previewId": "<slug>",
  "revision": 3,
  "contentHash": "sha256:<hex>",
  "url": "<source Library item URL>",
  "access": "project-members" | "anyone-with-link"
}
```

Parsing rules: an unknown `schemaVersion`, a missing/mistyped `previewId`,
`revision` or `contentHash`, or an unknown `access` is a clear refusal — never a
silent default. `kind` is checked when present. `url` is informational only (the
key `sourceUrl` is accepted as an alias, because the architecture doc names it
that; neither value is trusted for anything).

### Fail closed on revision drift

The module re-derives the item's content hash **locally**, from the same
canonical payload the builder hashes (source files + display metadata, before any
chrome injection), by running the real `build-library.mjs` over the resolved
target. It then compares the built item's `revision` **and** `contentHash` to the
request's.

On any mismatch — or an unknown `previewId` — it deploys **nothing** and tells the
user to reopen the latest Library page or explicitly handle the older revision. A
human must never see one version and share another.

### The isolated artifact

Assembled in a system temp dir (`mkdtemp`), removed in a `finally`:

- the selected preview becomes the **root page `/`** (not `/p/<id>/`). v1 pins
  `entry` to `index.html` (preview-schema), so the item directory already *is* a
  valid deployment root;
- it carries only its own files, plus `assets/comment-overlay.js` and a
  sanitized provenance footer;
- it MUST NOT contain the Library index, `directory.json`, the sidebar, any other
  `/p/<id>/`, or the raw `preview.json`. That is asserted by an explicit walk over
  the assembled tree before anything is deployed, not just by construction.

Mechanics: the real builder stages the whole Library into its own temp tree (with
`injectEntry` applied only to the requested item), and the item's staged directory
is then **`renameSync`d** out of that tree into a fresh path inside a second
`mkdtemp` root. Nothing is re-implemented: the scan, the validation, the content
hash, the torn-snapshot guard and the overlay-tag rewrite are all
`build-library.mjs`'s.

Scanning the **whole** target rather than one guessed collection is required, not
wasteful: `scanCollections`'s cross-collection duplicate-id check and
`validateSupersededBy`'s cycle check only hold when every included collection is
scanned together. The accepted trade-off is that a broken `preview.json` anywhere
in the target blocks sharing an otherwise-healthy item — the same refusal a
publish would give. **Both** temp roots are removed on every exit path, including
the revision-mismatch refusal: the Library tree holds every other item's content.

The item's own `assets/` directory is a tested, supported shape, and the shared
overlay is merged into it (`assets/comment-overlay.js` is excluded from staging at
every depth, so that exact name cannot collide). A preview shipping a plain *file*
named `assets` is refused with a clear message rather than an `EEXIST` stack trace.

The share entry keeps the comment overlay but **not** `preview-shell.js`: the
sidebar has no catalog to show on an isolated snapshot (and a nested Share block
would be nonsense), so the shell island + script that `chromeInject` appends are
removed and replaced by a **static, inline-styled provenance footer**. The removal
splits on `chromeInject`'s exact literal output and requires **exactly one** match
— zero means `build-library.mjs` changed its output, more than one means the
preview's own authored content contains that markup; both are loud refusals rather
than a page shipping a 404ing script tag or a stray island.

The footer is rendered inside the `injectEntry` seam, which receives the builder's
full `item` — so `item.meta.provenance` is available there and goes through the
real `resolve-provenance.mjs`. (After `buildLibrary` returns it would not be:
`directory.json`'s row allowlist deliberately strips provenance.) The display
model comes from `preview-shell.js`'s own `footerModel`, so the two renderings
cannot drift; it shows ISO instants rather than viewer-local time, because a static
footer runs no JavaScript.

### Deploy rules

- **Same project, pinned two ways.** The F9 target identity (`projectId`, plus
  `teamId` when present) is cross-checked against Vercel before anything is built,
  then written into `<share>/.vercel/project.json` **and** exported as
  `VERCEL_PROJECT_ID` / `VERCEL_ORG_ID`. Without that pinning, `vercel deploy` in
  an unlinked directory would create a new project named after the temp folder and
  publish private content into it. `deploy-library.mjs` does not export its
  equivalent check (`resolveTargetProject` is module-private and that file must not
  be modified), so this is a deliberate duplication — the same note that file's own
  header makes about re-deriving setup.mjs's request helper.
- **Plain `vercel deploy` — never `--prod`, never `vercel promote`.** Verified: a
  preview deployment does not move the project's scope alias, so Library
  production is untouched. The module has no promote code path at all, and the
  suite asserts the fake never sees `--prod`, `--skip-domain` or `promote`.
- **A Share must never be a project's FIRST deployment.** Vercel makes the first
  deployment of a project production even without `--prod`. So the module refuses
  when the project has no production deployment yet (publish the Library first) —
  this is exactly the trap that would silently make a Share the Library's
  production entry.
- **Protection before content lands.** `ensureProtected` runs before the deploy,
  so a share is never published into an unprotected project. Bare-domain removal
  is *not* this module's job: the bare domain serves production, and a share is a
  preview. Because `ensureProtected` would *change* a project's protection,
  **private targets only** — the same refusal `deploy-library` gives, so a share
  can never silently lock down (or leak) a target whose model this module does not
  own.
- **Metadata**: `previewKind=share`, `previewId`, `revision`, `contentHash`, every
  value a string (Vercel returns `--meta` values as strings, so a numeric revision
  would never compare equal on read-back). The deployment is read back over the
  authenticated API and refused unless it is READY, in the pinned project, `target`
  is not `production`, and the metadata is exactly ours. Its id comes from
  `record.id ?? record.uid` — v13-get returns `id`, the v7 list returns `uid`.
  `deploy-library`'s stale-guard reads only production/`previewKind=library`, so a
  share stays invisible to it.
- **Library production is verified unmoved**, not merely assumed: the project's
  `targets.production` pointer is re-read after the deploy and must still be the id
  recorded before it.

### Access modes

**`project-members`** (the default): report the deployment's own preview URL and
verify anonymously that it is challenged (302/401) via `verifyEntryProtected`. A
`200` means the deployment is naked — fail closed, never report success.

**`anyone-with-link`**: create a per-deployment shareable link.

```http
PATCH https://api.vercel.com/aliases/<deploymentId>/protection-bypass?teamId=<team>
{"ttl": <seconds>}      # optional; max 63072000. Omitted = never expires.
```

The response is `{"protectionBypass": {"<secret>": {"scope": "shareable-link",
…}}}`. Exactly one `shareable-link` entry is required — the deployment was created
seconds earlier, so more than one (or none) means the response is not what the
recipe assumes, and guessing which secret to hand out is not acceptable.

- The anonymous read URL is `<deploymentUrl>?_vercel_share=<secret>`. It returns
  **307 + `Set-Cookie: _vercel_jwt`** and redirects to the clean URL, so a client
  must follow the redirect **with** the cookie to reach 200. The probe therefore
  enables curl's cookie engine and follows redirects — unlike
  `vercel-protect.probe`, which deliberately does neither.
- **The `x-vercel-protection-bypass` header/param does NOT accept a
  shareable-link secret.** It only accepts a project-level automation-bypass
  secret, which would unlock the **whole project** — so it is never used for
  sharing, and the suite asserts that name never appears in any request.
- Success is reported only after the anonymous probe of the share URL returns
  **200**. The naked URL is verified as challenged first, in both modes, proving
  the secret is what unlocks it. If the probe does **not** reach 200 the link is
  immediately revoked before the failure is reported — an unverified public link
  must not be left live.
- `--ttl <seconds>` defaults to **7 days**; `--ttl never` omits the field for a
  never-expiring link and warns. A never-expiring public link is not a safe
  default.
- Revoke: the same endpoint, body
  `{"revoke": {"secret": "<secret>", "regenerate": false}}`. The deployment is
  identity-checked as one of our `previewKind=share` deployments first, and the
  revoke is confirmed by an anonymous probe that must no longer reach 200.

**Secret handling.** The secret is never written to `preview.json`,
`directory.json`, git, or deployment metadata, and nothing in the flow persists it.
It necessarily appears in the create step's own report — a shareable link is
useless without it — so the scope of the guarantee is "this module writes it
nowhere"; what a calling agent does with captured stdout is that caller's concern,
and the report says so. It also never reaches process **argv**: the revoke body
goes to curl through a `0600` file inside a `0700` temp dir and the share-URL probe
gets its URL through curl's stdin config, the same argv-free discipline
`vercel-protect.mjs` applies to the API token.

### CLI surface

```bash
node scripts/deploy-share.mjs [--ttl <s>|never]      # request on stdin
node scripts/deploy-share.mjs --request req.json     # request from a file
node scripts/deploy-share.mjs --list [--preview-id <id>] [--limit <n>]
node scripts/deploy-share.mjs --revoke <deployment-id>   # secret on stdin
```

`--json` prints the report as one parseable document (progress → stderr, report →
stdout, the `deploy.sh` split). Deleting a deployment is **not** part of this
module: it is destructive and needs an explicit human confirmation elsewhere.

Mode dispatch has no sibling precedent, so the rules are explicit: `--list` and
`--revoke` are mutually exclusive; neither combines with `--request` or `--ttl`;
`--preview-id` / `--limit` are `--list`-only; `--secret` is `--revoke`-only. Every
violation is a refusal naming the conflict, never a silently-ignored flag. Stdin is
read at most once per run (the request in deploy mode, the secret in revoke mode)
and refuses on a TTY rather than blocking.

`--list` filters by `previewKind=share` (and by `previewId` when given).
`GET /v7/deployments` has no documented `meta-<key>` filter, so the filtering is
client-side over `projectId`-scoped results.

## Known limitations (documented, not solved)

- **A shareable-link secret cannot be looked up from a deployment id.** It is not
  exposed on the deployment object, and `project.protectionBypass` lists only
  automation-bypass secrets. So `--revoke` **requires** the secret (from stdin, or
  `--secret <value>` with the documented `ps` caveat). Keep the secret from the
  create step for as long as the link should live.
- `--list` reads one page (`--limit`, default 100) with no pagination, so a share
  older than the last N deployments in the project will not appear.
- Each deploy costs one deployment against `api-deployments-free-per-day`; a quota
  rejection is detected and reported with that advice.

## Acceptance

`cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs` exits 0.
Every case injects a fake `deps` (and, for the production factory, a fake process
runner), so the suite performs **zero real network calls and zero real deploys**
and spawns no `vercel` or `curl` process.

Scope: `scripts/deploy-share.mjs`, `tests/deploy-share.test.mjs`, this spec, and
the `shared/config.md` section. No sibling script, schema or `plugin.json` is
modified.
