/**
 * Vercel deployment-protection helpers — the "Gate A recipe".
 *
 * Requires Node.js >= 20.
 *
 * Every rule in this module encodes a Vercel behavior that was EMPIRICALLY
 * VERIFIED on 2026-07-24 against a real Hobby-plan account. The rules look
 * over-cautious; they are not. Do NOT "simplify" them (especially the
 * PATCH-then-GET dance) without re-running the experiment — the naive
 * trust-the-response version was observed to leave projects world-readable.
 * The three facts that shape this module:
 *
 *   1. On a fresh project, ssoProtection auto-enables to the legacy enum
 *      `all_except_custom_domains`. Under it the immutable deployment URL and
 *      the scope alias `<project>-<scope>.vercel.app` return anonymous 302
 *      (protected), but the BARE domain `<project>.vercel.app` returns
 *      anonymous 200 (world-readable) — so the bare domain must be removed.
 *   2. A REJECTED PATCH silently clears ssoProtection to `null` (fully naked),
 *      and the PATCH response body cannot be trusted. So after every PATCH we
 *      GET the value back and believe the GET, and we restore the pre-PATCH
 *      snapshot if the PATCH was rejected — we never leave the project null.
 *   3. The documented enum `prod_deployment_urls_and_all_previews` is WEAKER
 *      (it makes the scope alias anonymously 200), so migrating to it is a
 *      regression and is refused.
 *
 * IMPORTANT for callers: `ensureProtected` resolving does NOT mean the
 * deployment is anonymously unreadable. Under the legacy enum the bare domain
 * is still 200 (fact 1). Full protection of a private target is the COMPOSITION
 * `ensureProtected` + `removeBareDomain` + `verifyEntryProtected`, but the two
 * probes check DIFFERENT things:
 *   - `verifyEntryProtected` probes the PROTECTED ENTRY (the scope alias / the
 *     immutable URL), where a 302/401 means protected. Do NOT point it at the
 *     bare domain — a removed bare domain returns 404, which is neither a 302/401
 *     nor a naked 200, so it cannot validate bare-domain removal.
 *   - the bare domain being gone is confirmed by `removeBareDomain` itself,
 *     which returns the DELETE status (404 already-absent, or 2xx removed).
 * The durable guarantee is the anonymous ENTRY probe — not the config GET, which
 * fact 2 shows can be silently nulled afterwards. This module provides the
 * primitives; the orchestration lives in its consumers (`setup.mjs` and
 * `deploy-library.mjs`, later PRs). It has no in-plugin caller yet.
 *
 * All network I/O goes through an injected `deps` object so the logic is
 * testable with zero real network. `makeDefaultDeps()` builds the production
 * implementation (curl + the Vercel CLI token, mirroring deploy.sh). Tests pass
 * a fake `deps`; the real one is not exercised over the network by tests.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SELF = 'vercel-protect.mjs';
const API = 'https://api.vercel.com';

/**
 * The ONLY ssoProtection value this module sets. It is the legacy enum a fresh
 * project auto-enables (Gate A fact 1); the recipe depends on its
 * (undocumented) behavior of protecting the scope alias and immutable URL.
 */
export const LEGACY_PROTECTION = 'all_except_custom_domains';

/**
 * The documented enum that looks like an upgrade but is WEAKER (Gate A fact 3):
 * it leaves the scope alias `<project>-<scope>.vercel.app` anonymously 200.
 * `ensureProtected` refuses to set it.
 */
export const WEAKER_PROTECTION = 'prod_deployment_urls_and_all_previews';

/**
 * A protection operation that could not be completed safely. Thrown for every
 * fail-closed path; callers should treat it as "protection is NOT in place".
 */
export class VercelProtectError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VercelProtectError';
  }
}

// ---------------------------------------------------------------------------
// Protection primitives (pure logic over an injected `deps`)
// ---------------------------------------------------------------------------

/**
 * The current `ssoProtection.deploymentType`, read via GET, or `null` when
 * protection is off. Callers snapshot this BEFORE any PATCH so a rejected PATCH
 * (Gate A fact 2) can be rolled back.
 */
export async function snapshotSsoProtection({ projectId, teamId, deps }) {
  const project = await deps.getProject({ projectId, teamId });
  return project?.ssoProtection?.deploymentType ?? null;
}

/**
 * Drive the project's ssoProtection to the legacy enum, verifying the real
 * state by GET and never trusting the PATCH echo (Gate A fact 2). Resolves only
 * when a fresh GET confirms `all_except_custom_domains`; every other outcome
 * throws (fail closed). See the file header on why resolving here is NOT the
 * same as "the deployment is anonymously unreadable".
 *
 * @param {string} [deploymentType] target enum — only the legacy value is
 *   accepted; passing the documented weaker enum (or anything else) is refused.
 */
export async function ensureProtected({ projectId, teamId, deps, deploymentType = LEGACY_PROTECTION }) {
  // Refuse anything but the legacy enum, BEFORE any I/O. The documented
  // `prod_deployment_urls_and_all_previews` is weaker (fact 3); `all` is
  // rejected by the Hobby plan and the rejected PATCH nulls protection (fact 2).
  if (deploymentType !== LEGACY_PROTECTION) {
    throw new VercelProtectError(
      `refusing to set ssoProtection to ${JSON.stringify(deploymentType)}: only ${JSON.stringify(LEGACY_PROTECTION)} `
      + `is supported. ${JSON.stringify(WEAKER_PROTECTION)} is WEAKER — it leaves the scope alias `
      + 'anonymously readable — so migrating to it would be a regression.',
    );
  }

  // A GET that reports the real value, or `undefined` when the GET itself fails.
  // A read error is NOT "no value": it means UNVERIFIABLE, and after a nulling
  // PATCH it must still reach the restore path below rather than propagate and
  // leave the project naked. This never throws.
  const read = async () => {
    try {
      return await snapshotSsoProtection({ projectId, teamId, deps });
    } catch {
      return undefined; // state could not be confirmed
    }
  };

  // Snapshot BEFORE any PATCH so a rejected PATCH that nulls protection can be
  // restored. This one read propagates its error on purpose: nothing has changed
  // yet, so failing to read the initial state is a safe, project-untouched abort.
  const snapshot = await snapshotSsoProtection({ projectId, teamId, deps });

  // Apply protection. A PATCH that THROWS is indeterminate (it may have been
  // processed AND nulled protection before the transport failed), so it is
  // swallowed — the verifying GET, never the PATCH's return or throw, decides.
  try {
    await deps.patchSsoProtection({ projectId, teamId, deploymentType: LEGACY_PROTECTION });
  } catch { /* verified by the GET below */ }

  const actual = await read();
  if (actual === LEGACY_PROTECTION) return; // confirmed by GET, never the echo

  // A DIFFERENT, readable value: the request was not honored (or the echo lied),
  // but the project still holds some protection value — fail closed on that GET
  // truth, with no pointless restore.
  if (actual !== null && actual !== undefined) {
    throw new VercelProtectError(
      `could not protect the project: after PATCHing ssoProtection to ${JSON.stringify(LEGACY_PROTECTION)}, a fresh `
      + `GET reports ${JSON.stringify(actual)}. The PATCH response echo is not trusted; the GET is the source of `
      + 'truth, so protection is NOT considered in place.',
    );
  }

  // actual is null (protection cleared) or undefined (could not verify): the
  // project may be naked, so best-effort restore the non-null snapshot and fail
  // closed. Every step here can itself fail — a throw must NEVER bypass the
  // fail-closed error — so the restore PATCH and its verifying read are each
  // swallowed, and the confirmed outcome is reflected in the message.
  let restored = actual;
  if (snapshot !== null) {
    try {
      await deps.patchSsoProtection({ projectId, teamId, deploymentType: snapshot });
    } catch { /* verified by the read below */ }
    restored = await read();
  }
  const detail = snapshot === null
    ? 'there was no prior value to restore, so the project is UNPROTECTED and must be fixed manually'
    : restored === snapshot
      ? `restored the prior value ${JSON.stringify(restored)}`
      : `could not confirm a restore of ${JSON.stringify(snapshot)} (a fresh GET reports `
        + `${restored === undefined ? 'unavailable' : JSON.stringify(restored)}) — the project may be UNPROTECTED `
        + 'and must be fixed manually';
  const cause = actual === undefined
    ? `the PATCH to ${JSON.stringify(LEGACY_PROTECTION)} could not be verified (the follow-up GET failed)`
    : `the PATCH to ${JSON.stringify(LEGACY_PROTECTION)} was rejected and cleared ssoProtection to null`;
  throw new VercelProtectError(`could not protect the project: ${cause}; ${detail}.`);
}

/**
 * Remove the world-readable bare domain `<name>.vercel.app` (Gate A fact 1),
 * where `<name>` is the project's OWN canonical name fetched from `projectId` —
 * NOT a caller-supplied string. A DELETE of a domain that is not attached to
 * `projectId` returns the SAME 404 as an already-absent one, so trusting a
 * caller's `project` string would let a stale or mismatched identifier falsely
 * confirm removal while the project's real bare domain stays exposed. Deriving
 * the domain from the fetched name makes a 404 unambiguous: `projectId`'s own
 * bare domain is absent. An optionally-passed `project` is cross-checked against
 * the fetched name and a mismatch throws — a caller-side identity bug is surfaced
 * rather than masked.
 *
 * A 404 (already absent) or a 2xx (removed) is success; any other status throws.
 * Do NOT validate removal with `verifyEntryProtected` — that checks a protected
 * ENTRY (302/401), whereas a removed bare domain is a 404, read there as naked.
 */
export async function removeBareDomain({ projectId, teamId, project, deps }) {
  const fetched = await deps.getProject({ projectId, teamId });
  const name = fetched?.name;
  if (!name) {
    throw new VercelProtectError(
      `could not resolve the canonical name of project ${JSON.stringify(projectId)} to remove its bare domain`,
    );
  }
  if (project !== undefined && project !== name) {
    throw new VercelProtectError(
      `bare-domain identity mismatch: caller passed project ${JSON.stringify(project)} but ${JSON.stringify(projectId)} `
      + `is named ${JSON.stringify(name)} — refusing to delete a domain that may not be this project's.`,
    );
  }
  const domain = `${name}.vercel.app`;
  const { status } = await deps.deleteDomain({ projectId, teamId, domain });
  if (status === 404) return { domain, status, removed: false };
  if (status >= 200 && status < 300) return { domain, status, removed: true };
  throw new VercelProtectError(`could not remove bare domain ${domain}: DELETE returned status ${status}`);
}

/**
 * Fail-closed check that an anonymous request to `url` is challenged. Returns
 * true ONLY for a protected status (302 SSO redirect, or 401); false for 200
 * (naked) and for everything else — an unconfirmable state must never be read
 * as "safe". Callers run this after every provisioning step.
 */
export async function verifyEntryProtected(url, { deps }) {
  const { status } = await deps.probe(url);
  // Only an auth challenge counts as protected: 302 (Vercel's SSO redirect) or
  // 401. A 200 is naked, and any other or unconfirmable status fails closed.
  return status === 302 || status === 401;
}

/**
 * Report what a project already contains, so a caller can decide whether it is a
 * safe, empty, dedicated target or a populated one that must not be clobbered.
 * This module only reports — the confirmation decision lives in `setup.mjs`.
 *
 * @returns {Promise<{domains: Array, productionDeploymentId: string|null}>}
 */
export async function inventoryProject({ projectId, teamId, deps }) {
  const project = await deps.getProject({ projectId, teamId });
  const domains = await deps.listDomains({ projectId, teamId });
  return {
    domains: Array.isArray(domains) ? domains : [],
    productionDeploymentId: project?.targets?.production?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Production `deps` — real Vercel I/O via curl (mirrors deploy.sh)
//
// curl, not global `fetch`: `fetch` is unflagged on the Node 20 floor but emits
// an ExperimentalWarning on the stderr this script family reserves for errors
// (config-resolve.mjs avoids node:util parseArgs for the same reason), and
// deploy.sh already hard-depends on curl. The auth token is passed through
// curl's `--config -` (read from stdin), NEVER as a command-line argument, so it
// cannot leak into the process argv (visible to other local users via `ps`).
// ---------------------------------------------------------------------------

const enc = encodeURIComponent;

/** `?teamId=` only when the org/team id is a team (mirrors deploy.sh:241). */
const teamQuery = (teamId) =>
  teamId && String(teamId).startsWith('team_') ? `?teamId=${enc(teamId)}` : '';

const ssoBody = (deploymentType) =>
  deploymentType === null ? { ssoProtection: null } : { ssoProtection: { deploymentType } };

/**
 * Read the Vercel CLI auth token the way deploy.sh:230-238 does — the macOS
 * auth.json first, then the Linux/XDG default. (The illegal-character guard lives
 * at authInput construction in makeDefaultDeps, so it covers the injected-token
 * path too.)
 */
function readCliToken() {
  const files = [
    path.join(os.homedir(), 'Library', 'Application Support', 'com.vercel.cli', 'auth.json'),
    path.join(os.homedir(), '.local', 'share', 'com.vercel.cli', 'auth.json'),
  ];
  for (const file of files) {
    let token;
    try {
      token = JSON.parse(fs.readFileSync(file, 'utf8'))?.token;
    } catch {
      continue; // not present / unreadable — try the next location
    }
    if (token) return token;
  }
  throw new VercelProtectError(`${SELF}: no Vercel CLI auth token found (run \`vercel login\`)`);
}

/** Default process runner: curl via spawnSync. Injectable so tests never spawn. */
function spawnCurl(args, input) {
  return spawnSync('curl', args, { input, encoding: 'utf8' });
}

/**
 * Build the production `deps`. `token` and `run` are injectable for tests; in
 * production both default (token read from auth.json, run = real curl).
 */
export function makeDefaultDeps({ token, run = spawnCurl } = {}) {
  const authToken = token ?? readCliToken();
  // Reject a token carrying a character that could break out of the `header = "…"`
  // curl-config line below — defense-in-depth covering BOTH the injected-token and
  // the auth.json paths. Vercel tokens are alphanumeric, so a hit means the source
  // is malformed (fail closed), not that we should try to escape it.
  if (/["\r\n\\]/.test(authToken)) {
    throw new VercelProtectError(`${SELF}: Vercel token contains an illegal character`);
  }
  // The token lives ONLY here, written to curl's stdin config — never in argv.
  const authInput = `header = "Authorization: Bearer ${authToken}"\n`;
  // `-q` first: ignore an ambient ~/.curlrc that could add `-L` (which would make
  // a probe follow a protected 302 to a 200 and misread it as naked) or inject
  // credentials. `--config -` still loads OUR auth header from stdin.
  const base = ['-q', '-sS', '-m', '30', '--config', '-'];

  // One authenticated request. Throws on any TRANSPORT failure (curl missing,
  // timeout, non-zero exit) — a failed call is an error, never "no value". curl
  // exits 0 even on an HTTP error, so the HTTP status is captured (appended by -w
  // on its own line) and returned alongside the body for the caller to police.
  const request = (args) => {
    const res = run([...base, '-w', '\n%{http_code}', ...args], authInput);
    if (res.error) throw new VercelProtectError(`${SELF}: curl could not run: ${res.error.message}`);
    if (res.status !== 0) throw new VercelProtectError(`${SELF}: curl exited ${res.status}: ${(res.stderr || '').trim()}`);
    const out = res.stdout ?? '';
    const nl = out.lastIndexOf('\n');
    return { httpStatus: Number(out.slice(nl + 1)) || 0, body: nl >= 0 ? out.slice(0, nl) : out };
  };
  // JSON call: an HTTP error body is NOT valid data — a 401/404/429/5xx would
  // otherwise parse as an empty project and read as "safe" (fail OPEN) — so throw
  // on non-2xx, and wrap the parse so a non-JSON body throws a VercelProtectError
  // rather than a raw SyntaxError (honoring the documented error contract).
  const apiJson = (args) => {
    const { httpStatus, body } = request(args);
    if (httpStatus < 200 || httpStatus >= 300) {
      throw new VercelProtectError(`${SELF}: Vercel API returned HTTP ${httpStatus}: ${body.slice(0, 200)}`);
    }
    const trimmed = body.trim();
    if (!trimmed) {
      // An empty 2xx/204 body is unconfirmable — parsing it as `{}` would let
      // inventoryProject read a populated project as safely empty. Fail closed.
      throw new VercelProtectError(`${SELF}: Vercel API returned an empty body (HTTP ${httpStatus})`);
    }
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new VercelProtectError(`${SELF}: Vercel API returned unparseable JSON (HTTP ${httpStatus}): ${err.message}`);
    }
  };
  // DELETE reports its status uninterpreted — removeBareDomain treats 404 as
  // "already gone", so this must NOT throw on 4xx the way apiJson does.
  const apiStatus = (args) => request(['-o', '/dev/null', ...args]).httpStatus;

  return {
    getProject: ({ projectId, teamId }) =>
      apiJson([`${API}/v9/projects/${enc(projectId)}${teamQuery(teamId)}`]),

    patchSsoProtection: ({ projectId, teamId, deploymentType }) =>
      apiJson([
        '-X', 'PATCH', '-H', 'Content-Type: application/json',
        '-d', JSON.stringify(ssoBody(deploymentType)),
        `${API}/v9/projects/${enc(projectId)}${teamQuery(teamId)}`,
      ]),

    deleteDomain: ({ projectId, teamId, domain }) => ({
      status: apiStatus(['-X', 'DELETE', `${API}/v9/projects/${enc(projectId)}/domains/${enc(domain)}${teamQuery(teamId)}`]),
    }),

    listDomains: ({ projectId, teamId }) => {
      const body = apiJson([`${API}/v9/projects/${enc(projectId)}/domains${teamQuery(teamId)}`]);
      return Array.isArray(body.domains) ? body.domains : [];
    },

    probe: (url) => {
      // Anonymous — `-q` ignores ~/.curlrc, no auth config, and redirects are NOT
      // followed (no -L) so we observe the 302 itself rather than chase it to the
      // SSO page (which would 200). Any transport failure fails CLOSED to status 0
      // → verifyEntryProtected reads it as unprotected, never "confirmed safe".
      const res = run(['-q', '-sS', '-m', '15', '-o', '/dev/null', '-w', '%{http_code}', url], '');
      if (res.error || res.status !== 0) return { status: 0 };
      return { status: Number(res.stdout) || 0 };
    },
  };
}
