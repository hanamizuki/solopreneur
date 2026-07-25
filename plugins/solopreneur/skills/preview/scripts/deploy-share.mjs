#!/usr/bin/env node
/**
 * Deploy ONE preview from the Library as an isolated snapshot — a "Share" — into
 * the SAME Vercel project as the Library, as a plain PREVIEW deployment that never
 * touches Library production.
 *
 * Requires Node.js >= 20.
 *
 * Usage:
 *   deploy-share.mjs [--from <path>] [--request <file>] [--ttl <s>|never] [--json]
 *   deploy-share.mjs --list [--preview-id <id>] [--limit <n>] [--from <path>] [--json]
 *   deploy-share.mjs --revoke <deployment-id> [--secret <value>] [--from <path>] [--json]
 *
 * Output: the report on stdout; progress, warnings and every error on stderr,
 *   exit 1 — the same split `deploy.sh` uses, so `--json` stdout stays a single
 *   parseable document.
 *
 * Every platform rule below was empirically verified on a real Hobby-plan account
 * on 2026-07-24 (the "Gate D" experiment). They look over-cautious; they are not.
 *
 * ## Why a Share is a plain preview, and never the project's first deployment
 *
 * A plain `vercel deploy` produces a `target: null` deployment and does NOT move
 * the project's scope alias, so the published Library is untouched. There is
 * therefore no `--prod` and no `vercel promote` anywhere in this module.
 *
 * The one hole in that: Vercel makes a project's FIRST deployment production even
 * without `--prod`. A Share must never be that first deployment — it would
 * silently become the Library's production entry. So a project with no production
 * deployment yet is REFUSED (publish the Library first). After the deploy the
 * project's `targets.production` pointer is re-read and must be unchanged; the
 * module proves Library production did not move rather than assuming it.
 *
 * ## Fail closed on revision drift
 *
 * The request carries the revision + contentHash the human was LOOKING AT. This
 * module re-derives both locally by running the real `build-library.mjs` (the same
 * canonical payload, hashed before any chrome injection) and refuses on any
 * mismatch, deploying nothing. Sharing a different version than the human saw is
 * the one failure that cannot be walked back.
 *
 * ## The two access modes (do NOT substitute the other bypass)
 *
 *   - `project-members` (default): the deployment's own preview URL, anonymously
 *     challenged (302/401) by the project's ssoProtection. Verified anonymously
 *     before success is reported; a 200 means naked and fails closed.
 *   - `anyone-with-link`: a PER-DEPLOYMENT shareable link, created with
 *     `PATCH /aliases/<deploymentId>/protection-bypass` and read anonymously as
 *     `<deploymentUrl>?_vercel_share=<secret>` — which answers 307 + `Set-Cookie:
 *     _vercel_jwt` and redirects, so the probe must follow the redirect WITH the
 *     cookie to see 200.
 *
 * CRITICAL: the `x-vercel-protection-bypass` header/param does NOT accept a
 * shareable-link secret. It only accepts a project-level automation-bypass secret,
 * which would unlock the WHOLE project — so it is never used for sharing. If a
 * future change reaches for it, that is a project-wide leak, not a shortcut.
 *
 * The secret is never persisted: not into `preview.json`, `directory.json`, git or
 * deployment metadata, and never into process argv (the revoke body goes to curl
 * through a 0600 file, the probe URL through curl's stdin config). It is returned
 * to the caller for this session. It IS in this run's report — a shareable link is
 * useless without it — so the guarantee is about what this module WRITES.
 *
 * All Vercel I/O goes through an injected `deps` object, so the whole flow is
 * covered by `node --test` with ZERO real network and ZERO real deploys.
 * `makeDefaultDeps()` builds the production implementation.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLibrary, chromeInject, findInjectionPoint, BuildError } from './build-library.mjs';
import { ConfigError, resolveConfig } from './config-resolve.mjs';
import { resolveProvenance } from './resolve-provenance.mjs';
import {
  ensureProtected,
  verifyEntryProtected,
  makeDefaultDeps as makeProtectDeps,
  VercelProtectError,
} from './vercel-protect.mjs';
// The Share REQUEST contract and the footer's display model have ONE source: the
// same asset the page runs. Importing it is what keeps the producer (the in-page
// Share block) and this consumer from drifting — the version, the access options
// and the footer shape are never restated here. A default import of the CommonJS
// asset, mirroring tests/preview-shell.test.mjs: the export is assigned inside an
// `if`, which cjs-module-lexer does not reliably surface as named bindings. Under
// Node there is no `document`, so importing it runs no DOM boot.
import previewShell from '../assets/preview-shell.js';

const { SHARE_SCHEMA_VERSION, ACCESS_OPTIONS, footerModel } = previewShell;

const SELF = 'deploy-share.mjs';
const API = 'https://api.vercel.com';

/**
 * The `previewKind` metadata every Share deployment carries. It is what makes a
 * Share distinguishable from a Library publish in the same project: the Library's
 * stale-publish guard reads only `targets.production` AND `previewKind=library`,
 * so a Share can never poison "what is the live Library revision".
 */
export const SHARE_KIND = 'share';

/** The shared comment overlay, the one asset a Share carries besides its own. */
const OVERLAY = 'comment-overlay.js';

/** Marks the static footer, so the isolation audit can prove the root page is ours. */
export const FOOTER_CLASS = 'preview-share-provenance';

/** Vercel's documented ceiling for a shareable link's ttl (2 years, in seconds). */
export const MAX_TTL = 63072000;

/**
 * Default shareable-link lifetime: 7 days. `ttl` is OPTIONAL in the API and an
 * omitted one means "never expires" — not a safe default for a link anyone holding
 * it can read, so a bounded default is sent and `--ttl never` is the explicit,
 * warned opt-out.
 */
export const DEFAULT_TTL = 604800;

/** `--list` page size. There is no pagination — see the documented limitation. */
export const DEFAULT_LIMIT = 100;

/**
 * A user-facing Share failure. The CLI prints `.message` and exits 1. A bug in a
 * shipped file throws a plain Error instead — the same split config-resolve /
 * build-library / setup / deploy-library draw.
 *
 * There is deliberately no `.state` enum here (deploy-library's `DeployError` has
 * one): a Share moves no alias and has nothing to roll back, so "what is the
 * project in" has exactly one answer — Library production is untouched.
 */
export class ShareError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ShareError';
  }
}

const enc = encodeURIComponent;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Drop a scheme (and any trailing slash) — the v13 endpoint keys on a hostname. */
const hostOf = (url) => String(url).replace(/^https?:\/\//i, '').replace(/\/+$/, '');

/**
 * Decide whether a redirect-following anonymous probe actually READ the deployment.
 *
 * A bare `status === 200` is NOT sufficient, and getting this wrong fails OPEN.
 * Verified against a real protected deployment: `?_vercel_share=<invalid secret>`
 * answers 302 and redirects to `https://vercel.com/login?next=…`, which is itself a
 * perfectly normal **HTTP 200** page. So a probe that follows redirects sees 200 for
 * BOTH a working shareable link and a dead one — the two are told apart only by WHERE
 * the redirect chain landed:
 *
 *   - working link  → 307, `Set-Cookie: _vercel_jwt`, redirect to the clean URL on
 *                     the DEPLOYMENT's own host, 200 = the preview content;
 *   - dead / absent → redirect to `vercel.com/login`, 200 = the SSO login page.
 *
 * Hence: 200 AND still on the deployment host. A missing or unparseable effective
 * URL is unconfirmable and fails closed.
 */
function readsAnonymously(probe, host) {
  if (probe?.status !== 200) return false;
  try {
    return new URL(String(probe.url)).host.toLowerCase() === String(host).toLowerCase();
  } catch {
    return false; // no (or unparseable) effective URL — never read as "confirmed readable"
  }
}

/**
 * A lowercase-slug preview id. Same pattern preview-schema.json pins, re-checked
 * here because the id becomes a temp DIRECTORY NAME and a `p/<id>` lookup path in
 * this module — never trusting that validation ran upstream.
 */
const SLUG = /^[a-z0-9-]+$/;

/** The builder's content hash shape: `sha256:` + a 64-char lowercase digest. */
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// The Share request
// ---------------------------------------------------------------------------

/**
 * Parse and validate the request text the in-page Share block produces.
 *
 * Nothing is defaulted: an unknown `schemaVersion`, a missing or mistyped field
 * and an unknown `access` are all refusals. The page CAN emit `null` for
 * previewId / revision / contentHash (when the injected data island is missing),
 * and those must be clear errors rather than a deploy of "something".
 *
 * `url` is informational only — it is echoed in the report and trusted for
 * nothing. `sourceUrl` is accepted as an alias because the architecture doc names
 * the field that way; neither spelling influences what is deployed.
 */
export function parseShareRequest(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) {
    throw new ShareError(
      'the Share request is empty — open the preview in the Library, expand "Share…", and copy the request block.',
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ShareError(
      `the Share request is not valid JSON: ${err.message}\n`
      + '  paste the request block from the preview page verbatim (it is already JSON).',
    );
  }
  if (!isObject(parsed)) throw new ShareError('the Share request is not a JSON object');

  if (parsed.schemaVersion !== SHARE_SCHEMA_VERSION) {
    throw new ShareError(
      `unsupported Share request schemaVersion ${JSON.stringify(parsed.schemaVersion ?? null)}`
      + ` (this build understands ${SHARE_SCHEMA_VERSION})\n`
      + '  reopen the latest Library page and copy a fresh request.',
    );
  }
  // `kind` is checked only when present: the page always sets it, but the field is
  // a label rather than the contract (schemaVersion is), so an older request that
  // omits it is still parseable.
  if (parsed.kind !== undefined && parsed.kind !== 'preview-share-request') {
    throw new ShareError(`not a Share request: kind ${JSON.stringify(parsed.kind)}`);
  }

  const previewId = parsed.previewId;
  if (typeof previewId !== 'string' || !SLUG.test(previewId)) {
    throw new ShareError(
      `the Share request has no usable previewId (got ${JSON.stringify(previewId ?? null)})\n`
      + '  it must be the item\'s lowercase-slug id; a null one means the page could not read its own metadata.',
    );
  }
  const revision = parsed.revision;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    throw new ShareError(
      `the Share request has no usable revision (got ${JSON.stringify(revision ?? null)})`,
    );
  }
  const contentHash = parsed.contentHash;
  if (typeof contentHash !== 'string' || !CONTENT_HASH.test(contentHash)) {
    throw new ShareError(
      `the Share request has no usable contentHash (got ${JSON.stringify(contentHash ?? null)})\n`
      + '  it must be the builder\'s `sha256:<64 hex>` value.',
    );
  }
  const access = parsed.access;
  if (typeof access !== 'string' || !ACCESS_OPTIONS.includes(access)) {
    throw new ShareError(
      `unknown Share access ${JSON.stringify(access ?? null)} (expected one of: ${ACCESS_OPTIONS.join(', ')})`,
    );
  }
  const sourceUrl = typeof parsed.url === 'string' && parsed.url
    ? parsed.url
    : (typeof parsed.sourceUrl === 'string' && parsed.sourceUrl ? parsed.sourceUrl : null);

  return { previewId, revision, contentHash, access, sourceUrl };
}

// ---------------------------------------------------------------------------
// The isolated artifact
// ---------------------------------------------------------------------------

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Inline styles, not a <style> block: the footer lives in the preview's own light
// DOM (there is no Shadow DOM without preview-shell.js), and an inline style
// survives page CSS that a class selector would lose to. Deliberately quote-free
// so it can sit inside a `style="…"` attribute untouched.
const FOOTER_STYLE = 'margin:40px 0 0;padding:14px 18px;border-top:1px solid #e5e7eb;'
  + 'background:#fafafa;color:#6b7280;font:12px/1.7 system-ui,sans-serif';
const LABEL_STYLE = 'color:#9ca3af';
const META_STYLE = 'margin-top:6px;color:#9ca3af';

/**
 * The sanitized provenance footer for a Share page: who produced it, when, and
 * which revision — the disclosure the Library shows in its shell footer.
 *
 * Rendered from `preview-shell.js`'s own `footerModel` over the real
 * `resolveProvenance`, so the Library and Share renderings cannot drift and no raw
 * session id / transcript path / local absolute path can reach the page. Every
 * value is HTML-escaped; nothing is concatenated unescaped.
 *
 * Two deliberate differences from the Library footer: it is static (no script, so
 * it works on a snapshot with no shell) and it shows the ISO instant rather than
 * viewer-local time, because localizing needs the JavaScript a Share does not ship.
 */
export function provenanceFooter(item) {
  const model = footerModel({
    createdAt: item.meta.createdAt,
    updatedAt: item.meta.updatedAt,
    revision: item.meta.revision,
    provenance: resolveProvenance(item.meta.provenance),
  });
  const parties = model.mode === 'produced'
    ? [['Produced by', model.producedBy]]
    : [['Created by', model.createdBy], ['Last updated by', model.lastUpdatedBy]];
  const rows = parties
    .map(([label, value]) => `<div><span style="${LABEL_STYLE}">${escapeHtml(label)}</span> ${escapeHtml(value)}</div>`)
    .join('');

  const chips = [];
  if (model.createdAt) chips.push(`Created ${escapeHtml(model.createdAt)}`);
  // Only a DIFFERENT updatedAt earns its own chip (the shell footer's rule).
  if (model.updatedAt && model.updatedAt !== model.createdAt) chips.push(`Updated ${escapeHtml(model.updatedAt)}`);
  if (model.revision !== undefined && model.revision !== null) chips.push(`revision ${escapeHtml(model.revision)}`);

  return `<footer class="${FOOTER_CLASS}" style="${FOOTER_STYLE}">${rows}`
    + `<div style="${META_STYLE}">${chips.join(' · ')}</div></footer>`;
}

/**
 * The exact block `chromeInject` appends: the shell's JSON island, then the shell
 * script, each followed by a newline.
 *
 * `[^<]*` for the island body is not laziness — it is the load-bearing part.
 * `jsonIsland` escapes every `<` to `<`, so the island's text CANNOT contain
 * a `<`; a pattern that stops at the first one therefore can only ever match a real
 * island, never run past it into page markup.
 */
const SHELL_BLOCK = /<script id="preview-shell-data" type="application\/json">[^<]*<\/script>\n<script src="\/assets\/preview-shell\.js"><\/script>\n/;

/**
 * The Share entry's chrome seam (`build-library.mjs`'s `injectEntry`), applied to
 * the requested item only.
 *
 * It runs the real `chromeInject` — which is what rewrites the per-page
 * `comment-overlay.js` tag to the shared staging asset, a quote-aware scan this
 * module must not re-implement — and then REMOVES the Library shell it appends. An
 * isolated snapshot has no `/directory.json`, so the sidebar would render "Catalog
 * unavailable" and the Share block would offer to share a share; neither belongs on
 * a page a human may send outside the project. The provenance footer is re-added
 * statically in its place.
 *
 * `split` rather than `replace` so the count is checked with no regex `lastIndex`
 * state: EXACTLY one match is required. Zero means `chromeInject`'s output changed
 * and this file must be updated (better a loud failure than shipping a script tag
 * that 404s); more than one means the preview's own authored content contains that
 * literal markup, and guessing which block is the injected one is not acceptable.
 */
export function shareInject(html, item) {
  const injected = chromeInject(html, item);
  const parts = injected.split(SHELL_BLOCK);
  if (parts.length !== 2) {
    throw new ShareError(
      `could not isolate the Library shell in the entry page of ${JSON.stringify(item.id)}: found ${parts.length - 1} `
      + 'injected shell block(s), expected exactly 1.\n'
      + (parts.length < 2
        ? '  build-library.mjs\'s chromeInject output changed — deploy-share.mjs must be updated to match.'
        : '  the preview\'s own content contains the shell markup verbatim; remove it (or escape it) so the injected '
          + 'block is unambiguous.'),
    );
  }
  const stripped = parts.join('');
  const { index } = findInjectionPoint(stripped);
  return `${stripped.slice(0, index)}${provenanceFooter(item)}\n${stripped.slice(index)}`;
}

/** Files that would leak the Library into a supposedly isolated snapshot. */
const FORBIDDEN_FILES = new Set(['directory.json', 'preview.json']);

/**
 * Audit an assembled Share tree and refuse on anything that is not this one
 * preview. The tree is isolated BY CONSTRUCTION (only the item's own staged
 * directory is moved across, and the builder never copies `preview.json`), so this
 * walk is defense in depth on the guarantee that actually matters: what a human may
 * forward to someone outside the project.
 *
 * Checked: no `directory.json` / `preview.json` at any depth, no `/p/` route tree
 * at the root (that is the Library's item namespace), and a root `index.html` that
 * carries OUR footer marker — which is what proves the root page is the injected
 * item entry rather than the generated Library index.
 */
export function assertIsolated(dir) {
  const walk = (abs, rel) => {
    for (const dirent of fs.readdirSync(abs, { withFileTypes: true })) {
      const name = dirent.name;
      const childRel = rel ? `${rel}/${name}` : name;
      if (FORBIDDEN_FILES.has(name.toLowerCase())) {
        throw new ShareError(`the Share artifact must not contain ${childRel} — it is a single-item snapshot.`);
      }
      // Only at the ROOT: `/p/<id>/` is the Library's routing namespace. A nested
      // `p/` inside the preview's own assets is just a directory.
      if (rel === '' && name === 'p' && dirent.isDirectory()) {
        throw new ShareError('the Share artifact must not contain a /p/ route tree — it would expose other previews.');
      }
      if (dirent.isDirectory()) walk(path.join(abs, name), childRel);
    }
  };
  walk(dir, '');

  const entry = path.join(dir, 'index.html');
  let html;
  try {
    html = fs.readFileSync(entry, 'utf8');
  } catch {
    throw new ShareError(`the Share artifact has no root index.html — the preview must be servable at /: ${dir}`);
  }
  if (!html.includes(`class="${FOOTER_CLASS}"`)) {
    throw new ShareError(
      'the Share artifact\'s root index.html is not the injected preview entry (no provenance footer) — refusing to '
      + 'deploy an artifact whose root page cannot be confirmed.',
    );
  }
}

// ---------------------------------------------------------------------------
// Target identity (F9) + the first-deployment refusal
// ---------------------------------------------------------------------------

/**
 * Resolve the configured target to a real Vercel project and refuse on any
 * disagreement, then report whether the project already has a production
 * deployment.
 *
 * This is deliberately a duplicate of `deploy-library.mjs`'s `resolveTargetProject`:
 * that function is module-private, that file must not be modified, and publishing a
 * private preview into a same-named project in the WRONG scope is exactly the
 * failure the check exists to prevent — so it is re-derived rather than skipped.
 * (Same note that file's own header makes about re-deriving setup.mjs's helper.)
 *
 * `GET /v9/projects/{idOrName}` accepts a NAME, so asking Vercel to resolve the
 * configured name under the target's scope and comparing to the config's
 * `projectId` is an independent cross-check. A name-only target has nothing to
 * cross-check, so it warns loudly instead of refusing — refusing would break
 * configs the schema calls valid.
 */
async function resolveShareProject({ target, deps, io }) {
  const teamId = target.teamId;
  let project;
  try {
    project = await deps.getProject({ projectId: target.project, teamId });
  } catch (err) {
    throw new ShareError(
      `could not resolve the Vercel project ${JSON.stringify(target.project)}`
      + `${teamId ? ` in team ${teamId}` : ' in the personal scope'}\n  ${err.message}`,
    );
  }
  const projectId = project?.id;
  if (!projectId) {
    throw new ShareError(`Vercel reported no id for the project ${JSON.stringify(target.project)}`);
  }
  if (project.name !== target.project) {
    throw new ShareError(
      `identity mismatch: the config names project ${JSON.stringify(target.project)} but Vercel resolved it to `
      + `${JSON.stringify(project.name)} — refusing to deploy.`,
    );
  }
  if (target.projectId !== undefined && target.projectId !== projectId) {
    throw new ShareError(
      `identity mismatch: the target pins projectId ${JSON.stringify(target.projectId)} but `
      + `${JSON.stringify(target.project)} resolves to ${JSON.stringify(projectId)}`
      + `${teamId ? ` in team ${teamId}` : ' in the personal scope'} — a same-named project in another scope is a `
      + 'DIFFERENT project, so refusing to deploy. Re-run setup if the target moved.',
    );
  }
  if (target.teamId !== undefined && project.accountId !== target.teamId) {
    throw new ShareError(
      `identity mismatch: the target pins teamId ${JSON.stringify(target.teamId)} but `
      + `${JSON.stringify(target.project)} is owned by ${JSON.stringify(project.accountId ?? null)}`
      + ' — refusing to deploy.',
    );
  }
  if (target.projectId === undefined) {
    io.print(
      `WARNING: target ${JSON.stringify(target.name)} is bound by NAME only — a same-named project in another scope\n`
      + `  would be a different project. Re-run setup.mjs to record its projectId (resolved now: ${projectId}).\n`,
    );
  }
  return {
    projectId,
    name: project.name,
    owner: project.accountId ?? null,
    teamId,
    productionId: project?.targets?.production?.id ?? null,
  };
}

/**
 * Refuse a target this module must not touch.
 *
 * PRIVATE ONLY, and not for the reason deploy-library gives (an unreviewed public
 * publish): a Share calls `ensureProtected`, which would DRIVE a project's
 * ssoProtection to the legacy enum. On a public target that would lock down a
 * deliberately-open Library. A protection model this module does not own is a
 * refusal, not something to change on the way past.
 */
function assertShareableTarget(target) {
  if (target.visibility !== 'private') {
    throw new ShareError(
      `target ${JSON.stringify(target.name)} has visibility ${JSON.stringify(target.visibility)}; this module shares `
      + 'from PRIVATE targets only — it asserts project protection before deploying, which would change a public '
      + 'target\'s access model.',
    );
  }
}

// ---------------------------------------------------------------------------
// Deployment verification
// ---------------------------------------------------------------------------

/** v13-get returns `id`; the v7 list returns `uid`. Accept either, demand one. */
const deploymentIdOf = (record) => record?.id ?? record?.uid ?? null;

/**
 * Assert a deployment record is the Share we just made: ready, a PREVIEW (never
 * production), in the pinned project, and carrying exactly our metadata.
 *
 * Authenticated — the deployment is protected, so its content cannot be read
 * anonymously and the `meta` read back over the API is the only way to confirm what
 * it contains. `target === 'production'` is called out separately and loudly: it
 * should be unreachable (the project already had a production deployment, so the
 * first-deployment exception cannot apply), and if it ever happens the Library's
 * stable entry has moved.
 */
function assertShareDeployment(record, { projectId, meta, url }) {
  const fail = (detail) => { throw new ShareError(`the Share deployment ${url} did not verify: ${detail}`); };
  if (!record) fail('Vercel returned no deployment record');
  if (record.target === 'production') {
    throw new ShareError(
      `the Share deploy of ${url} landed as a PRODUCTION deployment. A plain \`vercel deploy\` must produce a preview `
      + '(target: null), so the project\'s stable entry may have MOVED — check the project\'s production deployment by '
      + 'hand and re-publish the Library if it did.',
    );
  }
  if (record.target !== null && record.target !== undefined) {
    fail(`it reports target ${JSON.stringify(record.target)}; a Share must be a plain preview (target: null)`);
  }
  if (record.readyState !== 'READY') {
    fail(`it is not READY (state: ${JSON.stringify(record.readyState ?? null)})`);
  }
  if (record.projectId !== undefined && record.projectId !== null && record.projectId !== projectId) {
    fail(`it belongs to project ${JSON.stringify(record.projectId)}, not ${JSON.stringify(projectId)}`);
  }
  const actual = record.meta ?? {};
  for (const [key, want] of Object.entries(meta)) {
    if (actual[key] !== want) {
      fail(`its metadata ${key}=${JSON.stringify(actual[key] ?? null)} does not match the deployed `
        + `${key}=${JSON.stringify(want)}`);
    }
  }
  if (!deploymentIdOf(record)) fail('Vercel reported no deployment id');
}

// ---------------------------------------------------------------------------
// Shareable links (anyone-with-link)
// ---------------------------------------------------------------------------

/**
 * Create a per-deployment shareable link and return its secret.
 *
 * `PATCH /aliases/<deploymentId>/protection-bypass` with `{ttl}`. The response is
 * documented as an open object; the verified shape is
 * `{"protectionBypass": {"<secret>": {"scope": "shareable-link", …}}}`, and that
 * bag can hold other kinds of bypass, so entries are filtered by scope rather than
 * counted blindly. EXACTLY one shareable-link entry is required: the deployment was
 * created seconds earlier and cannot already have one, so anything else means the
 * response is not what this recipe assumes — and handing out a guessed secret (or
 * one belonging to a different link) is not acceptable.
 */
async function createShareableLink({ deploymentId, teamId, ttl, deps }) {
  const body = ttl === null ? {} : { ttl };
  let response;
  try {
    response = await deps.patchProtectionBypass({ deploymentId, teamId, body });
  } catch (err) {
    throw new ShareError(
      `could not create a shareable link for ${deploymentId}: ${err.message}\n`
      + '  the deployment IS live but is only reachable by project members; retry, or share it as project-members.',
    );
  }
  const bag = response?.protectionBypass;
  const secrets = isObject(bag)
    ? Object.entries(bag).filter(([, value]) => value?.scope === 'shareable-link').map(([secret]) => secret)
    : [];
  if (secrets.length !== 1) {
    throw new ShareError(
      `the shareable-link response carried ${secrets.length} shareable-link secret(s), expected exactly 1 — refusing `
      + 'to guess which one to hand out.\n'
      + `  the deployment ${deploymentId} may now carry a link that was NOT reported; revoke it from the Vercel `
      + 'dashboard if so.',
    );
  }
  return secrets[0];
}

/** Revoke one shareable-link secret. `regenerate: false` — revoke, never rotate. */
const revokeShareableLink = ({ deploymentId, teamId, secret, deps }) =>
  deps.patchProtectionBypass({ deploymentId, teamId, body: { revoke: { secret, regenerate: false } } });

// ---------------------------------------------------------------------------
// The Share deploy
// ---------------------------------------------------------------------------

/**
 * Deploy one preview as an isolated Share. Returns the report; throws a ShareError
 * on every failure. Library production is never moved on any path.
 *
 * @param {object} opts
 * @param {object} opts.resolved  a `mode: "v2"` config-resolve result
 * @param {object} opts.request   a parsed Share request
 * @param {number|null} [opts.ttl] shareable-link lifetime in seconds, or null for never
 * @param {object} opts.deps      injected Vercel I/O
 * @param {{print: (s: string) => void}} opts.io
 * @param {(o: object) => object} [opts.build]  staging-tree producer (default: the real builder)
 */
export async function deployShare({ resolved, request, ttl = DEFAULT_TTL, deps, io, build = buildLibrary }) {
  const target = resolved.target;
  assertShareableTarget(target);
  if (ttl !== null && (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL)) {
    throw new ShareError(`invalid ttl ${JSON.stringify(ttl)}: expected 1..${MAX_TTL} seconds, or null for never`);
  }

  // 1. Identity BEFORE anything is built or deployed.
  const project = await resolveShareProject({ target, deps, io });
  const { projectId, teamId } = project;

  // 2. The trap this module exists to close: Vercel makes a project's FIRST
  //    deployment production even without `--prod`.
  if (!project.productionId) {
    throw new ShareError(
      `project ${JSON.stringify(project.name)} has no production deployment yet.\n`
      + '  Vercel publishes a project\'s FIRST deployment as PRODUCTION even without `--prod`, so this Share would\n'
      + '  silently become the Library\'s production entry. Publish the Library first (deploy-library.mjs), then share.',
    );
  }

  // 3. Build the Library and capture the requested item AS THE BUILDER SAW IT.
  //    The whole target is scanned on purpose: the cross-collection duplicate-id
  //    and supersededBy-cycle checks only hold when every included collection is
  //    scanned together, so narrowing to one guessed collection would re-open the
  //    bug they close. The trade-off is that a broken sibling item blocks a share
  //    — the same refusal a publish gives.
  //
  //    The capture happens INSIDE the injection seam because that is the only place
  //    `item.meta.provenance` exists: directory.json's row allowlist strips it (the
  //    sanitization guarantee), so the footer could not be rendered afterwards.
  let captured = null;
  const built = build({
    root: resolved.root,
    collections: resolved.collections,
    include: target.include,
    injectEntry: (html, item) => {
      // Every other item is left verbatim — none of them is staged into the Share,
      // so injecting chrome into them would be pure waste.
      if (item.id !== request.previewId) return html;
      captured = { revision: item.meta.revision, contentHash: item.contentHash, title: item.meta.title };
      return shareInject(html, item);
    },
  });

  // Both temp roots are removed on EVERY exit path: the Library tree holds every
  // other item's content, so leaking it on a refusal would be a content-exposure
  // bug, not untidiness.
  let shareParent = null;
  try {
    if (!captured) {
      const known = built.directory.items.map((row) => row.id);
      throw new ShareError(
        `no preview ${JSON.stringify(request.previewId)} in target ${JSON.stringify(target.name)} `
        + `(collections: ${target.include.join(', ')}).\n`
        + `  ids found: ${known.length ? known.join(', ') : '(none)'}\n`
        + '  reopen the Library page and copy a fresh Share request.',
      );
    }
    // 4. Fail closed on revision drift. Nothing has been deployed at this point, so
    //    a mismatch costs zero deployment quota.
    if (captured.revision !== request.revision || captured.contentHash !== request.contentHash) {
      throw new ShareError(
        `${JSON.stringify(request.previewId)} has changed since that Share request was copied — refusing to share a\n`
        + '  different version than the page showed.\n'
        + `    requested: revision ${request.revision}, ${request.contentHash}\n`
        + `    local now: revision ${captured.revision}, ${captured.contentHash}\n`
        + '  reopen the latest Library page and copy a fresh request, or say explicitly that the older revision is\n'
        + '  the one to share (it has to be restored locally first — a Share only ever deploys local content).',
      );
    }

    // 5. Assemble the isolated artifact. The item's staged directory is MOVED out
    //    of the Library tree onto a fresh path (never over an existing one), so the
    //    preview becomes the root page `/` — v1 pins `entry` to index.html, so the
    //    item directory already is a valid deployment root.
    shareParent = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-share-'));
    const shareDir = path.join(shareParent, request.previewId);
    fs.renameSync(path.join(built.stagingDir, 'p', request.previewId), shareDir);

    // The shared overlay. The injected tag points at `/assets/comment-overlay.js`,
    // which on a root-mounted item is the item's OWN assets directory — that merge
    // is safe because the builder excludes a file named `comment-overlay.js` at
    // every depth, so the name cannot already be taken. A preview shipping a plain
    // FILE called `assets` would otherwise crash with a raw EEXIST/ENOTDIR.
    const assetsDir = path.join(shareDir, 'assets');
    let assetsStat = null;
    try {
      assetsStat = fs.lstatSync(assetsDir);
    } catch { /* absent — the common case */ }
    if (assetsStat && !assetsStat.isDirectory()) {
      throw new ShareError(
        `preview ${JSON.stringify(request.previewId)} ships a non-directory named "assets", which collides with the `
        + '/assets/ path the shared comment overlay is served from — rename it.',
      );
    }
    fs.mkdirSync(assetsDir, { recursive: true });
    const overlayTarget = path.join(assetsDir, OVERLAY);
    if (fs.existsSync(overlayTarget)) {
      throw new ShareError(`the Share artifact already carries assets/${OVERLAY} — refusing to overwrite it.`);
    }
    fs.copyFileSync(path.join(built.stagingDir, 'assets', OVERLAY), overlayTarget);

    // 6. Prove the artifact is one preview and nothing else, BEFORE the link file is
    //    written (so the audit never has to make an exception for `.vercel`).
    assertIsolated(shareDir);

    // 7. Pin the project two documented ways, for the reason deploy-library gives:
    //    an unpinned `vercel deploy` in a temp directory CREATES a project named
    //    after that directory and publishes private content into it.
    const orgId = project.owner ?? teamId;
    if (!orgId) throw new ShareError(`Vercel reported no owner for project ${JSON.stringify(project.name)}`);
    fs.mkdirSync(path.join(shareDir, '.vercel'), { recursive: true });
    fs.writeFileSync(
      path.join(shareDir, '.vercel', 'project.json'),
      `${JSON.stringify({ projectId, orgId })}\n`,
    );

    // 8. Protection before content lands, so a Share is never published into an
    //    unprotected project. GET-verified inside ensureProtected. Bare-domain
    //    removal is NOT done here: the bare domain serves production, and this is a
    //    preview.
    await ensureProtected({ projectId, teamId, deps });

    // Every metadata value is a STRING: Vercel returns `--meta` values as strings,
    // so a numeric revision would never compare equal on read-back.
    const meta = {
      previewKind: SHARE_KIND,
      previewId: request.previewId,
      revision: String(request.revision),
      contentHash: request.contentHash,
    };

    // 9. A PLAIN preview deploy. No `--prod`, no promote — verified: a preview does
    //    not move the project's scope alias, so Library production is untouched.
    const deployed = await deps.deploy({ cwd: shareDir, meta, projectId, orgId });
    const host = hostOf(deployed?.url ?? '');
    if (!host) throw new ShareError('the Vercel CLI printed no deployment URL');
    const previewUrl = `https://${host}`;
    io.print(`deployed: ${previewUrl}\n`);

    const record = await deps.getDeployment({ deploymentId: host, teamId });
    assertShareDeployment(record, { projectId, meta, url: previewUrl });
    const deploymentId = deploymentIdOf(record);

    // 10. Prove Library production did not move, rather than assuming it.
    const after = await deps.getProject({ projectId, teamId });
    const productionNow = after?.targets?.production?.id ?? null;
    if (productionNow !== project.productionId) {
      throw new ShareError(
        `the project's production deployment changed during this Share (was ${project.productionId}, now `
        + `${JSON.stringify(productionNow)}). A Share must never move it — inspect the project before trusting the `
        + 'published Library.',
      );
    }

    // 11. The deployment must be anonymously challenged in BOTH modes. For
    //     project-members that IS the access control; for anyone-with-link it is
    //     what proves the secret is the thing that unlocks it.
    if (!(await verifyEntryProtected(previewUrl, { deps }))) {
      throw new ShareError(
        `${previewUrl} is not anonymously challenged (expected 302/401; a 200 means it is world-readable) — refusing `
        + 'to report a Share of unprotected content.',
      );
    }

    const report = {
      state: 'shared',
      access: request.access,
      previewId: request.previewId,
      title: captured.title,
      revision: request.revision,
      contentHash: request.contentHash,
      deploymentId,
      previewUrl,
      shareUrl: null,
      shareSecret: null,
      ttl: null,
      sourceUrl: request.sourceUrl,
      project: { name: project.name, projectId, scope: teamId ?? project.owner ?? null },
      libraryProduction: { id: project.productionId, moved: false },
    };
    if (request.access !== 'anyone-with-link') return report;

    // 12. The shareable link. Created only after everything above verified, so a
    //     link is never issued for a deployment whose identity is in doubt.
    const secret = await createShareableLink({ deploymentId, teamId, ttl, deps });
    const shareUrl = `${previewUrl}?_vercel_share=${enc(secret)}`;

    // The anonymous read is a 307 that sets `_vercel_jwt` and redirects, so the
    // probe follows the redirect WITH the cookie — and success is 200 STILL ON THE
    // DEPLOYMENT HOST, never a bare 200 (see `readsAnonymously`: a dead secret lands
    // on vercel.com/login, which is also a 200). NOTE: the
    // `x-vercel-protection-bypass` header does NOT accept this secret (it only
    // accepts a project-wide automation-bypass secret, which would unlock the whole
    // project) — never substitute it here.
    const probe = await deps.probeShare(shareUrl);
    if (!readsAnonymously(probe, host)) {
      // The link is LIVE and unverified. Revoke it rather than leave an
      // unconfirmed public URL behind, then report the failure either way.
      let revoked = false;
      try {
        await revokeShareableLink({ deploymentId, teamId, secret, deps });
        revoked = true;
      } catch { /* reported below */ }
      throw new ShareError(
        `the shareable link for ${deploymentId} could not be read anonymously (HTTP `
        + `${probe?.status ?? 'unknown'}, landed on ${JSON.stringify(probe?.url ?? null)}; expected 200 on `
        + `${host} after following the 307 with its cookie).\n`
        + (revoked
          ? '  the link was revoked, so nothing unverified was left live. Retry, or share as project-members.'
          : '  the link could NOT be revoked either — it may still be live. Revoke it from the Vercel dashboard '
            + '(Deployment → Protection → Shareable Links).'),
      );
    }

    return {
      ...report,
      shareUrl,
      shareSecret: secret,
      ttl,
    };
  } finally {
    fs.rmSync(built.stagingDir, { recursive: true, force: true });
    if (shareParent) fs.rmSync(shareParent, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// --list / --revoke
// ---------------------------------------------------------------------------

/**
 * Find this project's Share deployments by `previewKind=share`, optionally narrowed
 * to one `previewId`.
 *
 * The filtering is CLIENT-SIDE: `GET /v7/deployments` has no documented
 * `meta-<key>` filter, and an undocumented one is not something to depend on for a
 * "which of these is safe to revoke" answer. Production identity is not required
 * here — listing must work on a project whose Library has not been published.
 */
export async function listShares({ resolved, previewId, limit = DEFAULT_LIMIT, deps, io }) {
  const project = await resolveShareProject({ target: resolved.target, deps, io });
  const deployments = await deps.listDeployments({ projectId: project.projectId, teamId: project.teamId, limit });
  const shares = (Array.isArray(deployments) ? deployments : [])
    .filter((d) => d?.meta?.previewKind === SHARE_KIND)
    .filter((d) => previewId === undefined || d.meta.previewId === previewId)
    .map((d) => ({
      deploymentId: deploymentIdOf(d),
      url: d.url ? `https://${hostOf(d.url)}` : null,
      previewId: d.meta.previewId ?? null,
      revision: d.meta.revision ?? null,
      contentHash: d.meta.contentHash ?? null,
      readyState: d.readyState ?? null,
      target: d.target ?? null,
      createdAt: typeof d.createdAt === 'number' ? new Date(d.createdAt).toISOString() : null,
    }));
  return {
    state: 'listed',
    project: { name: project.name, projectId: project.projectId, scope: project.teamId ?? project.owner ?? null },
    previewId: previewId ?? null,
    limit,
    shares,
  };
}

/**
 * Revoke one shareable link.
 *
 * The secret is REQUIRED and cannot be looked up: a shareable-link secret is not
 * exposed on the deployment object, and the project object lists only
 * automation-bypass secrets (see the documented limitation). The deployment is
 * identity-checked as one of OUR `previewKind=share` deployments first, so a
 * mistyped Library production id cannot be operated on, and the revoke is confirmed
 * by an anonymous probe that must no longer reach 200.
 */
export async function revokeShare({ resolved, deploymentId, secret, deps, io }) {
  if (typeof deploymentId !== 'string' || !deploymentId.trim()) {
    throw new ShareError('--revoke requires a deployment id');
  }
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new ShareError(
      'a shareable-link secret is required to revoke it.\n'
      + '  Vercel does not expose the secret on the deployment or project object, so it cannot be looked up from the\n'
      + '  id alone — pipe the secret on stdin (preferred) or pass --secret <value>.',
    );
  }
  const project = await resolveShareProject({ target: resolved.target, deps, io });
  const { teamId } = project;

  const record = await deps.getDeployment({ deploymentId, teamId });
  if (record?.meta?.previewKind !== SHARE_KIND) {
    throw new ShareError(
      `deployment ${deploymentId} is not a Share (previewKind: `
      + `${JSON.stringify(record?.meta?.previewKind ?? null)}) — refusing to change protection on it.`,
    );
  }
  if (record.projectId !== undefined && record.projectId !== null && record.projectId !== project.projectId) {
    throw new ShareError(
      `deployment ${deploymentId} belongs to project ${JSON.stringify(record.projectId)}, not `
      + `${JSON.stringify(project.projectId)} — refusing to change protection on it.`,
    );
  }

  await revokeShareableLink({ deploymentId, teamId, secret, deps });

  // Confirm, never assume: the same secret must no longer read the deployment.
  // `readsAnonymously`, not a bare status check — a REVOKED secret redirects to
  // vercel.com/login, which answers 200, so `status === 200` alone would call every
  // successful revoke a failure.
  const host = record.url ? hostOf(record.url) : null;
  const url = host ? `https://${host}` : null;
  let confirmed = false;
  if (url) {
    const probe = await deps.probeShare(`${url}?_vercel_share=${enc(secret)}`);
    if (readsAnonymously(probe, host)) {
      throw new ShareError(
        `the revoke was accepted but ${url} is STILL readable with that secret — treat the link as live and revoke it `
        + 'from the Vercel dashboard (Deployment → Protection → Shareable Links).',
      );
    }
    confirmed = true;
  }
  return {
    state: 'revoked',
    deploymentId,
    previewId: record.meta.previewId ?? null,
    url,
    confirmed,
    project: { name: project.name, projectId: project.projectId, scope: teamId ?? project.owner ?? null },
  };
}

// ---------------------------------------------------------------------------
// Production `deps`
//
// The protection calls (and their authed-curl plumbing — token via curl's stdin
// config, never argv) come from vercel-protect.mjs wholesale. This adds the
// deployment reads, the shareable-link PATCH, the Vercel CLI deploy, and the
// redirect-following anonymous probe.
// ponytail: production-only lines, exercised by tests only through an injected
// process runner (which is where a `--prod` or a leaked secret would show up).
// ---------------------------------------------------------------------------

const isTeam = (teamId) => Boolean(teamId) && String(teamId).startsWith('team_');
const teamQuery = (teamId) => (isTeam(teamId) ? `?teamId=${enc(teamId)}` : '');

/** Quota rejections the fleet has actually hit, surfaced as a clear error. */
const QUOTA = /api-deployments-free-per-day|Resource is limited|429|too many requests/i;

/** Default process runner: spawnSync. Injectable so tests never spawn anything. */
const spawnRun = (cmd, args, options) => spawnSync(cmd, args, { encoding: 'utf8', ...options });

/** Read the Vercel CLI token the way deploy.sh / vercel-protect / deploy-library do. */
function readCliToken() {
  const files = [
    path.join(os.homedir(), 'Library', 'Application Support', 'com.vercel.cli', 'auth.json'),
    path.join(os.homedir(), '.local', 'share', 'com.vercel.cli', 'auth.json'),
  ];
  for (const file of files) {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'))?.token;
      if (value) return value;
    } catch { /* not present / unreadable — try the next */ }
  }
  throw new ShareError(`${SELF}: no Vercel CLI auth token found (run \`vercel login\`)`);
}

/**
 * A value safe to place inside a curl-config `key = "…"` line. Used for the
 * SECRET-bearing values, which are kept out of argv the way vercel-protect keeps
 * the API token out of it. A hit means the value is malformed (shareable-link
 * secrets are URL-safe), so it fails closed rather than being escaped.
 */
const assertConfigSafe = (value, what) => {
  if (/["\r\n\\]/.test(value)) throw new ShareError(`${SELF}: ${what} contains an illegal character`);
  return value;
};

/**
 * Build the production `deps`. `token` and `run` are injectable for tests; in
 * production both default. `run(cmd, args, options)` covers curl and vercel alike.
 */
export function makeDefaultDeps({ token, run = spawnRun } = {}) {
  const authToken = assertConfigSafe(token ?? readCliToken(), 'Vercel token');
  const authInput = `header = "Authorization: Bearer ${authToken}"\n`;

  // One authenticated call, mirroring vercel-protect's conventions exactly: token
  // via curl's stdin config and never argv, `-q` to ignore an ambient ~/.curlrc,
  // and a throw on any non-2xx so an error body can never parse as usable data.
  const apiJson = (args, extraInput = '') => {
    const res = run('curl', ['-q', '-sS', '-m', '30', '--config', '-', '-w', '\n%{http_code}', ...args],
      { input: `${authInput}${extraInput}` });
    if (res.error) throw new ShareError(`${SELF}: curl could not run: ${res.error.message}`);
    if (res.status !== 0) throw new ShareError(`${SELF}: curl exited ${res.status}: ${(res.stderr || '').trim()}`);
    const out = res.stdout ?? '';
    const nl = out.lastIndexOf('\n');
    const httpStatus = Number(out.slice(nl + 1)) || 0;
    const body = nl >= 0 ? out.slice(0, nl) : out;
    if (httpStatus < 200 || httpStatus >= 300) {
      throw new ShareError(`${SELF}: Vercel API returned HTTP ${httpStatus}: ${body.slice(0, 200)}`);
    }
    const trimmed = body.trim();
    if (!trimmed) throw new ShareError(`${SELF}: Vercel API returned an empty body (HTTP ${httpStatus})`);
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new ShareError(`${SELF}: Vercel API returned unparseable JSON (HTTP ${httpStatus}): ${err.message}`);
    }
  };

  /**
   * Run the Vercel CLI in `cwd`. `projectId`/`orgId` are exported as
   * `VERCEL_PROJECT_ID` / `VERCEL_ORG_ID` — the documented non-interactive pinning,
   * which takes precedence over the link file, so "deploy into a project we did not
   * confirm" is impossible even if the file were ignored.
   */
  const runVercel = (args, { cwd, projectId, orgId }) => {
    const env = { ...process.env };
    if (projectId) env.VERCEL_PROJECT_ID = projectId;
    if (orgId) env.VERCEL_ORG_ID = orgId;
    const res = run('vercel', args, { cwd, env });
    if (res.error) {
      throw new ShareError(`could not run the Vercel CLI (is \`vercel\` installed and on PATH?): ${res.error.message}`);
    }
    const output = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
    if (res.status !== 0) {
      if (QUOTA.test(output)) {
        throw new ShareError(
          'Vercel rejected the deployment for QUOTA (deployments per day). A Share costs ONE deployment; the daily\n'
          + '  limit is shared with Library publishes, so wait for the window to reset or share an existing snapshot\n'
          + `  (\`--list\`).\n  vercel exited ${res.status}: ${output.trim().slice(0, 400)}`,
        );
      }
      throw new ShareError(`vercel ${args[0]} exited ${res.status}: ${output.trim().slice(0, 400)}`);
    }
    return res.stdout ?? '';
  };

  return {
    // vercel-protect owns getProject / patchSsoProtection / listDomains /
    // deleteDomain / probe; reuse it wholesale rather than re-deriving them.
    ...makeProtectDeps({ token: authToken, run: (args, input) => run('curl', args, { input }) }),

    getDeployment: ({ deploymentId, teamId }) =>
      apiJson([`${API}/v13/deployments/${enc(hostOf(deploymentId))}${teamQuery(teamId)}`]),

    listDeployments: ({ projectId, teamId, limit }) => {
      const query = [`projectId=${enc(projectId)}`, `limit=${enc(limit)}`];
      if (isTeam(teamId)) query.push(`teamId=${enc(teamId)}`);
      const body = apiJson([`${API}/v7/deployments?${query.join('&')}`]);
      return Array.isArray(body?.deployments) ? body.deployments : [];
    },

    // The body goes through a 0600 file inside a 0700 temp dir, NOT `-d <json>`:
    // the revoke body carries the shareable-link secret, and argv is visible to
    // other local users via `ps`. Same reasoning vercel-protect gives for the token.
    patchProtectionBypass: ({ deploymentId, teamId, body }) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-share-body-'));
      const file = path.join(dir, 'body.json');
      try {
        fs.writeFileSync(file, JSON.stringify(body), { mode: 0o600 });
        return apiJson([
          '-X', 'PATCH', '-H', 'Content-Type: application/json', '-d', `@${file}`,
          `${API}/aliases/${enc(deploymentId)}/protection-bypass${teamQuery(teamId)}`,
        ]);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },

    // A PLAIN preview deploy: no `--prod`, no `--skip-domain`, and this module has
    // no promote at all. `--yes` only skips the new-project setup questions; the
    // link file in `cwd` and the env vars already pin the project and scope.
    deploy: ({ cwd, meta, projectId, orgId }) => {
      const args = ['deploy', '--yes'];
      for (const [key, value] of Object.entries(meta)) args.push('--meta', `${key}=${value}`);
      const out = runVercel(args, { cwd, projectId, orgId });
      const match = out.match(/https:\/\/[a-z0-9-]+\.vercel\.app/gi);
      return { url: match ? match[match.length - 1] : '' };
    },

    // The anonymous shareable-link probe — deliberately NOT vercel-protect's
    // `probe`, which never follows redirects (it must observe the protected 302
    // itself). `?_vercel_share=<secret>` answers 307 + `Set-Cookie: _vercel_jwt`
    // and redirects to the clean URL, so this one enables curl's cookie engine
    // (`-b` over a not-yet-existing jar switches it on with an empty store) and
    // follows the redirect, which is what replays the cookie. The URL carries the
    // SECRET, so it rides in curl's stdin config rather than argv.
    //
    // `%{url_effective}` is reported alongside the status because the status ALONE
    // fails open: a dead secret redirects to vercel.com/login, which is a 200 (see
    // `readsAnonymously`). Any transport failure fails CLOSED to status 0 with no
    // effective URL — never "confirmed readable".
    probeShare: (url) => {
      assertConfigSafe(String(url), 'share URL');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-share-jar-'));
      const jar = path.join(dir, 'cookies');
      try {
        const res = run('curl', [
          '-q', '-sS', '-m', '20', '-L', '--max-redirs', '5',
          '-b', jar, '-c', jar, '-o', '/dev/null', '-w', '%{http_code} %{url_effective}', '--config', '-',
        ], { input: `url = "${url}"\n` });
        if (res.error || res.status !== 0) return { status: 0, url: null };
        // Split on the FIRST space only: a URL carries no unescaped space, but the
        // status is always the leading token, so this cannot mis-parse.
        const out = String(res.stdout ?? '').trim();
        const sp = out.indexOf(' ');
        return sp === -1
          ? { status: Number(out) || 0, url: null }
          : { status: Number(out.slice(0, sp)) || 0, url: out.slice(sp + 1).trim() || null };
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Production `io`. Progress and warnings go to STDERR and only the final report to
 * STDOUT, so `--json` stdout is a single parseable JSON document — the same split
 * `deploy.sh` uses. `readStdin` refuses on a TTY rather than blocking forever.
 */
export const makeStdio = () => ({
  print: (text) => process.stderr.write(text),
  report: (text) => process.stdout.write(text),
  readStdin: (what) => {
    if (process.stdin.isTTY) {
      throw new ShareError(`nothing was piped on stdin — pipe the ${what} in, or pass it as a file/value.`);
    }
    return fs.readFileSync(0, 'utf8');
  },
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `usage: ${SELF} [--from <path>] [--request <file>] [--ttl <s>|never] [--json]
       ${SELF} --list [--preview-id <id>] [--limit <n>] [--from <path>] [--json]
       ${SELF} --revoke <deployment-id> [--secret <value>] [--from <path>] [--json]

  (default)          deploy one preview as an isolated Share; the request is read
                     from stdin unless --request names a file
  --request <file>   read the Share request from <file> ("-" means stdin)
  --ttl <seconds>    shareable-link lifetime for anyone-with-link (default ${DEFAULT_TTL},
                     max ${MAX_TTL}); "never" omits it, so the link never expires
  --list             list this project's previewKind=share deployments
  --preview-id <id>  with --list: only shares of that preview
  --limit <n>        with --list: page size (default ${DEFAULT_LIMIT}; there is no pagination)
  --revoke <id>      revoke a shareable link on that deployment; the secret is read
                     from stdin unless --secret is given
  --secret <value>   with --revoke: the secret to revoke. Prefer stdin — an argv
                     value is visible to other local users via \`ps\`
  --from <path>      anchor config resolution at <path> instead of the cwd
  --json             print the report as JSON instead of a human report`;

// ponytail: hand-rolled rather than node:util parseArgs — parseArgs only became
// stable in 20.16 and this file's floor is 20, where it warns onto the stderr this
// CLI reserves for errors (every sibling script avoids it for the same reason).
function parseArgs(argv) {
  const opts = { from: undefined, request: undefined, ttl: undefined, list: false, previewId: undefined, limit: undefined, revoke: undefined, secret: undefined, asJson: false, help: false };
  const value = (i, flag) => {
    const next = argv[i + 1];
    if (next === undefined) throw new ShareError(`${flag} requires a value\n${USAGE}`);
    return next;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const [flag, inline] = arg.startsWith('--') && eq > 0 ? [arg.slice(0, eq), arg.slice(eq + 1)] : [arg, undefined];
    switch (flag) {
      case '--json': opts.asJson = true; break;
      case '--list': opts.list = true; break;
      case '-h': case '--help': opts.help = true; break;
      case '--from': opts.from = inline ?? value(i, flag); if (inline === undefined) i += 1; break;
      case '--request': opts.request = inline ?? value(i, flag); if (inline === undefined) i += 1; break;
      case '--ttl': opts.ttl = inline ?? value(i, flag); if (inline === undefined) i += 1; break;
      case '--preview-id': opts.previewId = inline ?? value(i, flag); if (inline === undefined) i += 1; break;
      case '--limit': opts.limit = inline ?? value(i, flag); if (inline === undefined) i += 1; break;
      case '--revoke': opts.revoke = inline ?? value(i, flag); if (inline === undefined) i += 1; break;
      case '--secret': opts.secret = inline ?? value(i, flag); if (inline === undefined) i += 1; break;
      default: throw new ShareError(`unknown argument: ${arg}\n${USAGE}`);
    }
  }
  return opts;
}

/**
 * Decide the mode and refuse every flag combination that does not belong to it.
 * There is no sibling precedent for a multi-mode CLI in this family, so the rules
 * are explicit and a misplaced flag is an error rather than something silently
 * ignored — a `--ttl` that quietly did nothing would be read as "the link expires".
 */
function resolveMode(opts) {
  if (opts.list && opts.revoke !== undefined) throw new ShareError(`--list and --revoke are mutually exclusive\n${USAGE}`);
  const mode = opts.list ? 'list' : opts.revoke !== undefined ? 'revoke' : 'deploy';
  const reject = (name, present) => {
    if (present) throw new ShareError(`${name} is not valid with ${mode === 'deploy' ? 'a Share request' : `--${mode}`}\n${USAGE}`);
  };
  if (mode !== 'deploy') {
    reject('--request', opts.request !== undefined);
    reject('--ttl', opts.ttl !== undefined);
  }
  if (mode !== 'list') {
    reject('--preview-id', opts.previewId !== undefined);
    reject('--limit', opts.limit !== undefined);
  }
  if (mode !== 'revoke') reject('--secret', opts.secret !== undefined);
  return mode;
}

/** `--ttl` → seconds, or null for a never-expiring link. */
function parseTtl(raw) {
  if (raw === undefined) return DEFAULT_TTL;
  if (raw === 'never') return null;
  const ttl = Number(raw);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL) {
    throw new ShareError(`invalid --ttl ${JSON.stringify(raw)}: expected 1..${MAX_TTL} seconds, or "never"`);
  }
  return ttl;
}

function parseLimit(raw) {
  if (raw === undefined) return DEFAULT_LIMIT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ShareError(`invalid --limit ${JSON.stringify(raw)}: expected 1..100`);
  }
  return limit;
}

/** Read the Share request from a file, or stdin when no file was named. */
function readRequestText(opts, io) {
  if (opts.request === undefined || opts.request === '-') return io.readStdin('Share request');
  try {
    return fs.readFileSync(opts.request, 'utf8');
  } catch (err) {
    throw new ShareError(`cannot read the Share request: ${opts.request}\n  ${err.message}`);
  }
}

const line = (label, value) => `  ${`${label}:`.padEnd(14)}${value}`;

function humanReport(r) {
  if (r.state === 'listed') {
    const head = `${r.shares.length} share deployment(s) in ${r.project.name}`
      + `${r.previewId ? ` for ${r.previewId}` : ''} (newest ${r.limit} deployments scanned)`;
    return [head, ...r.shares.map((s) => `  ${s.deploymentId}  ${s.previewId} v${s.revision}  ${s.readyState}  ${s.url ?? '(no url)'}`)].join('\n');
  }
  if (r.state === 'revoked') {
    return [
      `revoked — the shareable link on ${r.deploymentId} no longer reads${r.confirmed ? ' (confirmed anonymously)' : ''}.`,
      line('preview', r.previewId ?? '(unknown)'),
      line('deployment', r.url ?? '(no url)'),
    ].join('\n');
  }
  const lines = [
    'shared — one preview is live as an isolated snapshot. Library production was NOT touched.',
    line('preview', `${r.previewId} — ${r.title}`),
    line('revision', `${r.revision}  (${r.contentHash.slice(0, 19)}…)`),
    line('access', r.access),
    line('deployment', r.deploymentId),
    line('preview URL', `${r.previewUrl}  (project members only — anonymously protected)`),
  ];
  if (r.shareUrl) {
    lines.push(line('share URL', r.shareUrl));
    lines.push(line('link ttl', r.ttl === null ? 'never expires' : `${r.ttl}s`));
    lines.push('  NOTE: that URL embeds a secret anyone holding it can read. It is stored nowhere — keep it if you');
    lines.push(`        want to revoke later:  ${SELF} --revoke ${r.deploymentId}  (secret on stdin)`);
  }
  lines.push(line('project', `${r.project.name} (${r.project.projectId}${r.project.scope ? `, ${r.project.scope}` : ''})`));
  lines.push(line('library prod', `${r.libraryProduction.id} (unchanged)`));
  return lines.join('\n');
}

/**
 * The CLI flow. `io`, `makeDeps` and `build` are injected so tests drive every
 * branch with zero real network and zero real deploys; `makeDeps` is a FACTORY so
 * the Vercel token is not read on the --help / bad-config paths.
 */
export async function main({ argv = [], io, makeDeps, build }) {
  const opts = parseArgs(argv);
  if (opts.help) { io.report(`${USAGE}\n`); return 0; }
  const mode = resolveMode(opts);

  // EVERY flag value is validated before stdin is touched. A bad `--ttl` must
  // report the bad ttl — not block on a pipe, and not surface as whatever the
  // request happened to be. (The request/secret is still read before the config, so
  // a piped-in request is consumed even when config resolution then fails.)
  const ttl = mode === 'deploy' ? parseTtl(opts.ttl) : undefined;
  const limit = mode === 'list' ? parseLimit(opts.limit) : undefined;

  const request = mode === 'deploy' ? parseShareRequest(readRequestText(opts, io)) : null;
  if (mode === 'deploy' && ttl === null && request.access === 'anyone-with-link') {
    io.print('WARNING: --ttl never — the shareable link will not expire until it is revoked.\n');
  }
  const secret = mode === 'revoke' ? (opts.secret ?? io.readStdin('shareable-link secret')).trim() : null;

  const resolved = resolveConfig({ from: opts.from });
  if (resolved.mode !== 'v2') {
    throw new ShareError(
      `no v2 preview config resolved (mode: ${resolved.mode})\n`
      + '  run `node setup.mjs` to create one, or `node config-migrate.mjs` to migrate a legacy config.',
    );
  }

  const deps = makeDeps();
  let report;
  if (mode === 'list') {
    report = await listShares({ resolved, previewId: opts.previewId, limit, deps, io });
  } else if (mode === 'revoke') {
    report = await revokeShare({ resolved, deploymentId: opts.revoke, secret, deps, io });
  } else {
    report = await deployShare({ resolved, request, ttl, deps, io, build });
  }
  // The report goes to `io.report` (stdout), never `io.print` (stderr): progress
  // lines on stdout would make `--json` output unparseable.
  io.report(opts.asJson ? `${JSON.stringify(report, null, 2)}\n` : `${humanReport(report)}\n`);
  return 0;
}

// Physical-path comparison, kept in step with the sibling scripts: this file is
// reachable through symlinked plugin trees (argv[1] is the link, import.meta.url is
// resolved), plus the lexical compare for `--preserve-symlinks-main`. It also keeps
// the module importable from a test without running the CLI as a side effect.
function invokedDirectly() {
  const self = fileURLToPath(import.meta.url);
  const entry = process.argv[1];
  if (!entry) return false;
  if (path.resolve(entry) === self) return true;
  try {
    return fs.realpathSync(entry) === self;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main({ argv: process.argv.slice(2), io: makeStdio(), makeDeps: makeDefaultDeps })
    .then((code) => { process.exitCode = code; })
    .catch((err) => {
      // A known, user-facing failure prints cleanly and exits 1; anything else is a
      // bug and must surface as a stack trace.
      if (err instanceof ShareError || err instanceof VercelProtectError
          || err instanceof BuildError || err instanceof ConfigError) {
        process.stderr.write(`${SELF}: ${err.message}\n`);
        process.exitCode = 1;
      } else {
        throw err;
      }
    });
}
