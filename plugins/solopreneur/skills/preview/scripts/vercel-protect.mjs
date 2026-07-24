#!/usr/bin/env node
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
 * is still 200 (fact 1). Full protection of a private target is the
 * COMPOSITION `ensureProtected` + `removeBareDomain` + `verifyEntryProtected`
 * (probing BOTH the protected entry and the bare domain), and the durable
 * guarantee is the anonymous probe — not the config GET, which fact 2 shows can
 * be silently nulled afterwards. This module provides the primitives; the
 * orchestration lives in its consumers (`setup.mjs` and `deploy-library.mjs`,
 * later PRs). It has no in-plugin caller yet.
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

/** Statuses that count as "an anonymous request was challenged" (protected). */
const PROTECTED_STATUSES = new Set([302, 401]);

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

  // Snapshot first, so a rejected PATCH that nulls protection can be restored.
  const snapshot = await snapshotSsoProtection({ projectId, teamId, deps });

  // The PATCH echo cannot be trusted (fact 2) — issue it, then GET the real
  // state and believe that.
  await deps.patchSsoProtection({ projectId, teamId, deploymentType: LEGACY_PROTECTION });
  const actual = await snapshotSsoProtection({ projectId, teamId, deps });

  if (actual === LEGACY_PROTECTION) return; // verified by GET, not by the echo

  if (actual === null) {
    // The PATCH was rejected and Vercel cleared ssoProtection to null — the
    // project is now fully naked (fact 2). Put the pre-PATCH value back if there
    // was one, verify it took, and fail closed. We must NEVER resolve here.
    let restored = null;
    if (snapshot !== null) {
      await deps.patchSsoProtection({ projectId, teamId, deploymentType: snapshot });
      restored = await snapshotSsoProtection({ projectId, teamId, deps });
    }
    const tail = snapshot === null
      ? 'there was no prior value to restore, so the project is UNPROTECTED and must be fixed manually.'
      : restored === snapshot
        ? `restored the prior value ${JSON.stringify(restored)}.`
        : `attempted to restore ${JSON.stringify(snapshot)} but a fresh GET reports ${JSON.stringify(restored)} `
          + '— the project may be UNPROTECTED and must be fixed manually.';
    throw new VercelProtectError(
      `could not protect the project: the PATCH to ${JSON.stringify(LEGACY_PROTECTION)} was rejected and cleared `
      + `ssoProtection to null; ${tail}`,
    );
  }

  // A fresh GET disagrees with the requested value (and with the PATCH echo).
  // Believe the GET — protection is not what we asked for, so do not report
  // success.
  throw new VercelProtectError(
    `could not protect the project: after PATCHing ssoProtection to ${JSON.stringify(LEGACY_PROTECTION)}, a fresh GET `
    + `reports ${JSON.stringify(actual)}. The PATCH response echo is not trusted; the GET is the source of truth, so `
    + 'protection is NOT considered in place.',
  );
}

/**
 * Remove the world-readable bare domain `<project>.vercel.app` (Gate A fact 1).
 * A 404 means it is already absent, which is success — not an error. Any other
 * non-2xx status throws.
 *
 * Note: a 404 also results from a wrong project/domain, so a caller that must be
 * certain the real bare domain is gone should follow this with an anonymous
 * `verifyEntryProtected` of the bare URL. That composition lives in the caller.
 */
export async function removeBareDomain({ projectId, teamId, project, deps }) {
  const domain = `${project}.vercel.app`;
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
  return PROTECTED_STATUSES.has(status);
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
 * auth.json first, then the Linux/XDG default. Rejects a token carrying a quote
 * or newline, which could otherwise break out of the curl config line it is
 * written into.
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
    if (token) {
      if (/["\r\n]/.test(token)) throw new VercelProtectError(`Vercel token in ${file} contains an illegal character`);
      return token;
    }
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
  // The token lives ONLY here, written to curl's stdin config — never in argv.
  const authInput = `header = "Authorization: Bearer ${authToken}"\n`;
  const base = ['-sS', '-m', '30', '--config', '-'];

  // Authenticated call that throws on any transport failure (curl missing,
  // timeout, non-zero exit) — a failed API call is an error, never "no value".
  const apiText = (args) => {
    const res = run([...base, ...args], authInput);
    if (res.error) throw new VercelProtectError(`${SELF}: curl could not run: ${res.error.message}`);
    if (res.status !== 0) throw new VercelProtectError(`${SELF}: curl exited ${res.status}: ${(res.stderr || '').trim()}`);
    return res.stdout ?? '';
  };
  const apiJson = (args) => JSON.parse(apiText(args) || '{}');
  const apiStatus = (args) => Number(apiText(['-o', '/dev/null', '-w', '%{http_code}', ...args])) || 0;

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
      // Anonymous — no auth config, redirects NOT followed (no -L) so we observe
      // the 302 itself rather than chase it to the SSO page (which would 200).
      // Any transport failure fails CLOSED to status 0 → verifyEntryProtected
      // reads it as unprotected, never as "confirmed safe".
      const res = run(['-sS', '-m', '15', '-o', '/dev/null', '-w', '%{http_code}', url], '');
      if (res.error || res.status !== 0) return { status: 0 };
      return { status: Number(res.stdout) || 0 };
    },
  };
}
