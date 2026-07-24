#!/usr/bin/env node
/**
 * Publish a built Library staging tree to its target's Vercel project as the
 * STABLE PRODUCTION ENTRY, using a staged flow that was empirically verified on a
 * real Hobby-plan account on 2026-07-24.
 *
 * Requires Node.js >= 20.
 *
 * Usage:
 *   deploy-library.mjs [--from <path>] [--json]
 *
 * Output: the publish report on stdout; every error on stderr, exit 1. A failure
 *   always states what the project is ACTUALLY in — published / rolled back /
 *   untouched — so a human can act without guessing.
 *
 * ## The staged publish flow (and why the intuitive one is wrong)
 *
 * `vercel deploy --prod --skip-domain` is NOT a staging step. It was tested:
 * `--skip-domain` only withholds the `targets.production` pointer, while the
 * automatic scope alias `<project>-<scope>.vercel.app` — which IS the stable entry
 * this module publishes — switches to the new deployment immediately. There is no
 * verify-before-switch window, so that flow cannot be fail-closed.
 *
 * The verified flow, in order:
 *
 *   1. `vercel deploy` — a PLAIN preview, never `--prod`. Verified: it produces a
 *      `target: null` deployment and does NOT move the scope alias. This is the
 *      real staging step.
 *   2. Verify that preview before promoting: anonymously challenged (302/401) and
 *      carrying the revision we just built (its `meta`, read back authenticated).
 *   3. `vercel promote <preview>` to publish. Verified caveat, and confirmed by
 *      Vercel's own CLI docs: promoting a PREVIEW creates a NEW production
 *      deployment rather than converting that preview in place — so the deployment
 *      verified in step 2 is not literally the one that goes live.
 *   4. Therefore verify AGAIN after promoting: the stable entry is anonymously
 *      challenged and the live production carries our revision.
 *   5. Rollback is `vercel promote <last-good-production>`. Verified: `vercel
 *      rollback` returns HTTP 500 on this account (both by-URL and by-id), so this
 *      module NEVER invokes it. Promoting a deployment that is already a
 *      production deployment is in-place and fast.
 *
 * Fail-closed posture: a failure in step 2 does not promote (the alias never
 * moved — zero impact); a failure in step 4 promotes the last-good production back
 * and still exits non-zero. Success is never reported for an unverified state.
 *
 * One documented exception, straight from Vercel: "the first deployment of a new
 * project is always a production deployment, even when you omit `--prod`". So on
 * FIRST publish the plain deploy of step 1 lands as production by itself. That is
 * detected (the deployment reports `target: "production"`), the promote is skipped,
 * and the post-publish verification of step 4 runs exactly as it would otherwise.
 *
 * ## First-publish protection responsibility
 *
 * `ssoProtection` is a project-level setting and setup already ensures it, but the
 * bare domain `<project>.vercel.app` and the entry URL DO NOT EXIST until the first
 * production deployment. So bare-domain removal and the anonymous entry probe are
 * this module's job — run on EVERY publish, not just the first, because that probe
 * is the only durable proof (a config GET can be nulled afterwards; see
 * vercel-protect.mjs fact 2).
 *
 * The two checks are SEPARATE and must never be conflated: bare-domain removal is
 * confirmed by `removeBareDomain`'s own DELETE status (404 = already absent), while
 * `verifyEntryProtected` validates the protected ENTRY (302/401 = protected, 200 =
 * naked). A removed bare domain answers 404, which the entry probe reads as false.
 *
 * ## Stale-publish guard
 *
 * A multi-machine fleet may publish from either machine, and every publish is a
 * FULL snapshot — so an older machine can make the latest pointer go backwards.
 * When the content root is a git repo the publish requires it to be clean and not
 * behind its remote for the content path, records the source commit in the
 * deployment metadata, and refuses to promote over a live production whose recorded
 * commit is not an ancestor of ours. When the content root is NOT a git repo the
 * guard is skipped (documented caveat: without a canonical publisher the latest
 * pointer can briefly go backwards) — git is never hard-required.
 *
 * The guard and every "what is the live library revision" question read ONLY the
 * stable production deployment and only when it is `previewKind=library`. They must
 * never read "the most recent deployment in the project", or a later Share preview
 * would poison the comparison.
 *
 * All Vercel and git I/O goes through an injected `deps` object, so the whole flow
 * — staged order, fail-closed refusals, promote-based rollback — is covered by
 * `node --test` with ZERO real network and ZERO real deploys. `makeDefaultDeps()`
 * builds the production implementation (the Vercel CLI + vercel-protect's authed
 * curl plumbing).
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLibrary, chromeInject, BuildError } from './build-library.mjs';
import { ConfigError, resolveConfig } from './config-resolve.mjs';
import {
  ensureProtected,
  removeBareDomain,
  verifyEntryProtected,
  makeDefaultDeps as makeProtectDeps,
  VercelProtectError,
} from './vercel-protect.mjs';

const SELF = 'deploy-library.mjs';
const API = 'https://api.vercel.com';

/**
 * The `previewKind` metadata every Library production deployment carries. It is
 * what separates a library publish from a Share preview in the same project, and
 * the guard below refuses to read anything else.
 */
export const PREVIEW_KIND = 'library';

/**
 * What the project is in when a publish fails. Printed verbatim on failure so a
 * human never has to guess whether the stable entry moved.
 */
export const STATE = {
  untouched: 'the stable entry was NOT moved — the published Library is unchanged',
  published: 'the new snapshot IS live but could not be verified — treat it as UNVERIFIED and fix by hand',
  rolledBack: 'the previous production was promoted back — the stable entry serves the previous snapshot',
  rollbackFailed: 'the rollback promote ALSO failed — the stable entry state is UNKNOWN and must be fixed by hand',
  unknown: 'the stable entry state could NOT be determined — check the project by hand',
};

/**
 * A user-facing publish failure. `.state` is one of STATE's values and is always
 * printed with the message. A bug in a shipped file throws a plain Error instead,
 * the same split config-resolve/build-library/setup draw.
 */
export class DeployError extends Error {
  constructor(message, state = STATE.untouched) {
    super(message);
    this.name = 'DeployError';
    this.state = state;
  }
}

const enc = encodeURIComponent;

/** Drop a scheme (and any trailing slash) — the v13 endpoint keys on a hostname. */
const hostOf = (url) => String(url).replace(/^https?:\/\//i, '').replace(/\/+$/, '');

/**
 * A stable digest of WHAT was built: sha256 over `<id>\n<contentHash>` for every
 * item, sorted by id so it does not depend on catalog order. Recorded in the
 * deployment metadata as the snapshot identity, which is what lets the
 * post-promote verification prove the live production is OUR build and not a
 * concurrent publisher's.
 */
export function snapshotId(directory) {
  const rows = (directory?.items ?? [])
    .map((item) => `${item.id}\n${item.contentHash}`)
    .sort();
  return createHash('sha256').update(rows.join('\n')).digest('hex');
}

/**
 * Pick the stable protected entry — `<project>-<scope>.vercel.app` — out of the
 * hostnames Vercel reports for the live production deployment.
 *
 * The scope slug is not derivable from anything this module holds (the link file
 * and the API carry ids, not slugs), so the entry is DISCOVERED rather than
 * guessed. Two collections can carry it and the Gate A experiment log did not
 * record which: the deployment's own `alias` array (documented as every alias
 * assigned at deployment creation) and the project's domains. Both are consulted,
 * and a failure to resolve is fail-closed at the call site rather than papered
 * over — probing the wrong host would "verify" nothing.
 *
 * Excluded by construction: the bare domain (the world-readable one this module
 * removes) and the immutable per-deployment URL (not a stable entry). Of what is
 * left, the SHORTEST match is the scope alias — `<project>-<scope>` is shorter
 * than both `<project>-<hash>-<scope>` and `<project>-git-<branch>-<scope>`.
 */
export function resolveStableEntry({ name, aliases = [], domains = [], immutable }) {
  const bare = `${name}.vercel.app`.toLowerCase();
  const skip = immutable ? hostOf(immutable).toLowerCase() : null;
  // The project name is a Vercel slug ([a-z0-9-]), but escape anyway rather than
  // splice a config-sourced string into a pattern.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scopeAlias = new RegExp(`^${escaped}-[a-z0-9-]+\\.vercel\\.app$`);

  const seen = new Set();
  const candidates = [];
  for (const entry of [...aliases, ...domains]) {
    const host = typeof entry === 'string' ? entry : entry?.name;
    if (typeof host !== 'string') continue;
    const lower = hostOf(host).toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    if (lower === bare || lower === skip) continue;
    if (!scopeAlias.test(lower)) continue;
    candidates.push(lower);
  }
  candidates.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------
// Target identity (F9)
// ---------------------------------------------------------------------------

/**
 * Resolve the configured target to a real Vercel project and refuse on any
 * disagreement. `GET /v9/projects/{idOrName}` accepts a NAME, so asking Vercel to
 * resolve the configured name UNDER THE TARGET'S SCOPE and comparing the answer to
 * the config's `projectId` is an independent cross-check — the config claims an
 * id, Vercel reports one, and a same-named project in another scope resolves to a
 * different id and is refused here rather than published to.
 *
 * A name-only target (no `projectId` — still valid config, e.g. from the migrator)
 * has nothing to cross-check, so it publishes with a loud warning instead of a
 * refusal: refusing would break configs the schema calls valid.
 */
async function resolveTargetProject({ target, deps, io }) {
  const teamId = target.teamId;
  let project;
  try {
    project = await deps.getProject({ projectId: target.project, teamId });
  } catch (err) {
    throw new DeployError(
      `could not resolve the Vercel project ${JSON.stringify(target.project)}`
      + `${teamId ? ` in team ${teamId}` : ' in the personal scope'}\n  ${err.message}`,
    );
  }
  const projectId = project?.id;
  if (!projectId) {
    throw new DeployError(`Vercel reported no id for the project ${JSON.stringify(target.project)}`);
  }
  // Vercel resolves both ids and names on this endpoint; a name that comes back
  // under a different name means the lookup did not land where the config points.
  if (project.name !== target.project) {
    throw new DeployError(
      `identity mismatch: the config names project ${JSON.stringify(target.project)} but Vercel resolved it to `
      + `${JSON.stringify(project.name)} — refusing to publish.`,
    );
  }
  if (target.projectId !== undefined && target.projectId !== projectId) {
    throw new DeployError(
      `identity mismatch: the target pins projectId ${JSON.stringify(target.projectId)} but `
      + `${JSON.stringify(target.project)} resolves to ${JSON.stringify(projectId)}`
      + `${teamId ? ` in team ${teamId}` : ' in the personal scope'} — a same-named project in another scope is a `
      + 'DIFFERENT project, so refusing to publish. Re-run setup if the target moved.',
    );
  }
  if (target.teamId !== undefined && project.accountId !== target.teamId) {
    throw new DeployError(
      `identity mismatch: the target pins teamId ${JSON.stringify(target.teamId)} but `
      + `${JSON.stringify(target.project)} is owned by ${JSON.stringify(project.accountId ?? null)}`
      + ' — refusing to publish.',
    );
  }
  if (target.projectId === undefined) {
    io.print(
      `WARNING: target ${JSON.stringify(target.name)} is bound by NAME only — a same-named project in another scope\n`
      + `  would be a different project. Re-run setup.mjs to record its projectId (resolved now: ${projectId}).\n`,
    );
  }
  return { projectId, name: project.name, owner: project.accountId ?? null, teamId };
}

// ---------------------------------------------------------------------------
// Stale-publish guard
// ---------------------------------------------------------------------------

/**
 * Check the content root's git state and return the source commit to record, or
 * `null` when the root is not in a git repo (the guard is then skipped — git is a
 * fleet convention, not a requirement).
 *
 * Refuses a dirty content path (an uncommitted snapshot must not become the
 * published one) and a content path that is behind its upstream (another machine
 * already committed newer content). The `git fetch` is best-effort: offline, the
 * behind-check still runs against the last-fetched remote ref, and the
 * authoritative protection against going backwards is the live-production commit
 * comparison below, which needs no remote at all.
 */
export function sourceGuard({ root, deps, io }) {
  const git = (args) => deps.git(args, root);
  if (git(['rev-parse', '--show-toplevel']).status !== 0) {
    io.print(
      'NOTE: the content root is not a git repo, so the stale-publish guard is skipped.\n'
      + '  Without a canonical publisher, a publish from another machine can make the Library\n'
      + '  latest pointer briefly go backwards; re-publishing from the newest machine heals it.\n',
    );
    return null;
  }

  const dirty = git(['status', '--porcelain', '--', '.']);
  if (dirty.status !== 0) {
    throw new DeployError(`could not read the content root's git status: ${root}`);
  }
  if (dirty.stdout.trim() !== '') {
    throw new DeployError(
      `the content root has uncommitted changes, so this snapshot is not reproducible:\n${
        dirty.stdout.trimEnd().split('\n').map((line) => `    ${line}`).join('\n')}\n`
      + '  commit (or stash) the content under the preview root, then publish.',
    );
  }

  // Best effort: a fetch failure is reported, not fatal (see the doc comment).
  if (git(['fetch', '--quiet']).status !== 0) {
    io.print('WARNING: `git fetch` failed — the behind-check uses the last-fetched remote ref.\n');
  }

  // No upstream configured → nothing to be behind. Not an error: a local-only
  // content repo is a legitimate single-machine setup.
  if (git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).status === 0) {
    const behind = git(['rev-list', '--count', 'HEAD..@{upstream}', '--', '.']);
    if (behind.status !== 0) {
      throw new DeployError(`could not compare the content path against its upstream: ${root}`);
    }
    if (behind.stdout.trim() !== '0') {
      throw new DeployError(
        `the content path is ${behind.stdout.trim()} commit(s) behind its upstream — publishing now would drop\n`
        + '  content another machine already committed. Pull, then publish.',
      );
    }
  }

  const head = git(['rev-parse', 'HEAD']);
  const commit = head.status === 0 ? head.stdout.trim() : '';
  if (!/^[0-9a-f]{7,64}$/i.test(commit)) {
    throw new DeployError(`could not read HEAD of the content root: ${root}`);
  }
  return commit;
}

/**
 * Refuse to publish over a live production whose recorded source commit is NOT an
 * ancestor of ours — that would make the latest pointer go backwards. `merge-base
 * --is-ancestor` is the whole test: exit 0 means our commit descends from (or
 * equals) the live one and publishing moves forward; a non-zero exit means the
 * live commit is newer or divergent, and an unknown commit (git exits 128) is
 * equally a refusal — an unverifiable comparison is never "safe".
 *
 * Only ever called with a commit read off a `previewKind=library` STABLE
 * PRODUCTION deployment; a Share preview never reaches it.
 */
export function assertMovesForward({ liveCommit, commit, root, deps }) {
  if (!liveCommit || !commit || liveCommit === commit) return;
  const res = deps.git(['merge-base', '--is-ancestor', liveCommit, commit], root);
  if (res.status === 0) return;
  throw new DeployError(
    `the live Library production was published from commit ${liveCommit}, which is not an ancestor of this\n`
    + `  checkout's ${commit} — publishing would make the Library go backwards.\n`
    + (res.status === 1
      ? '  Pull the newer content (or publish from the machine that has it), then retry.'
      : `  git could not compare the two commits (exit ${res.status}); run \`git fetch\` and retry.`),
  );
}

/**
 * The live stable production deployment, or null when the project has none.
 *
 * Read from the project's `targets.production` pointer — the thing the scope alias
 * follows — NEVER from "the newest deployment in the project": a Share preview is
 * newer and would poison both the rollback target and the commit comparison. The
 * returned `commit` is populated ONLY for a `previewKind=library` production, so a
 * foreign production deployment can still be rolled back to but never drives the
 * stale guard.
 */
async function liveProduction({ projectId, teamId, deps }) {
  const project = await deps.getProject({ projectId, teamId });
  const id = project?.targets?.production?.id;
  if (!id) return null;
  const deployment = await deps.getDeployment({ deploymentId: id, teamId });
  const isLibrary = deployment?.target === 'production' && deployment?.meta?.previewKind === PREVIEW_KIND;
  return {
    id,
    url: deployment?.url ?? null,
    aliases: Array.isArray(deployment?.alias) ? deployment.alias : [],
    meta: deployment?.meta ?? {},
    readyState: deployment?.readyState ?? null,
    target: deployment?.target ?? null,
    projectId: deployment?.projectId ?? null,
    isLibrary,
    commit: isLibrary ? (deployment.meta.sourceCommit || null) : null,
  };
}

/**
 * Assert a deployment record is the build we just made: ready, in the right
 * project, and carrying our exact metadata. This is the revision check — it is
 * authenticated (no bypass secret is needed to read a protected deployment's
 * metadata) and it is what catches a concurrent publisher winning the race.
 *
 * The metadata comparison is deliberately strict on the PUBLISHED side too, even
 * though metadata propagation across a promote is undocumented (Vercel's promote of
 * a preview rebuilds rather than re-points, and whether `--meta` carries into the
 * rebuilt deployment is not specified). It has to be: `previewKind=library` on the
 * stable production is what the stale-publish guard reads on the NEXT publish, so a
 * production deployment without it would silently degrade the guard to "no
 * comparison". Failing loudly here, with the platform behavior named in the
 * message, is the only outcome that does not hide that.
 */
function assertOurRevision(deployment, { projectId, meta, where, state }) {
  const fail = (detail) => { throw new DeployError(`${where}: ${detail}`, state); };
  if (!deployment) fail('Vercel returned no deployment record');
  if (deployment.readyState !== 'READY') {
    fail(`the deployment is not READY (state: ${JSON.stringify(deployment.readyState ?? null)})`);
  }
  if (deployment.projectId !== undefined && deployment.projectId !== null && deployment.projectId !== projectId) {
    fail(`the deployment belongs to project ${JSON.stringify(deployment.projectId)}, not ${JSON.stringify(projectId)}`);
  }
  const actual = deployment.meta ?? {};
  if (actual.previewKind === undefined) {
    fail(
      `the deployment carries NO previewKind metadata (expected ${JSON.stringify(PREVIEW_KIND)}). If this happened `
      + 'after a promote, Vercel did not carry `--meta` into the rebuilt production deployment — the Library '
      + 'revision guard depends on that metadata, so the publish cannot be accepted',
    );
  }
  for (const [key, want] of Object.entries(meta)) {
    if (actual[key] !== want) {
      fail(`deployment metadata ${key}=${JSON.stringify(actual[key] ?? null)} does not match the published `
        + `${key}=${JSON.stringify(want)} — another publisher may have won the race`);
    }
  }
}

// ---------------------------------------------------------------------------
// The publish
// ---------------------------------------------------------------------------

/**
 * Publish a resolved v2 target's Library. Returns the success report; throws a
 * DeployError carrying `.state` on every failure.
 *
 * @param {object} opts
 * @param {object} opts.resolved  a `mode: "v2"` config-resolve result
 * @param {object} opts.deps      injected Vercel + git I/O
 * @param {{print: (s: string) => void}} opts.io
 * @param {(o: object) => object} [opts.build]  staging-tree producer (default: the real builder)
 */
export async function publishLibrary({ resolved, deps, io, build = buildLibrary }) {
  const target = resolved.target;
  // Public library publishing would have to clear the publish-time content review
  // the schema documents, and that review does not exist yet. Refusing is the only
  // honest option — quietly publishing world-readable content is not.
  if (target.visibility !== 'private') {
    throw new DeployError(
      `target ${JSON.stringify(target.name)} has visibility ${JSON.stringify(target.visibility)}; this module `
      + 'publishes PRIVATE targets only (a public Library still needs a publish-time content review).',
    );
  }

  // 1. Identity BEFORE anything is built or deployed.
  const project = await resolveTargetProject({ target, deps, io });
  const { projectId, teamId } = project;

  // 2. Source guard, then build. Both precede every Vercel mutation, so a dirty or
  //    stale content root costs no deployment quota.
  const commit = sourceGuard({ root: resolved.root, deps, io });
  const built = build({
    root: resolved.root,
    collections: resolved.collections,
    include: target.include,
    // Pin the builder's own commit lookup to the guarded value, so directory.json
    // and the deployment metadata can never disagree about the source revision.
    gitCommit: () => commit,
    injectEntry: chromeInject,
  });

  try {
    // A publish is a FULL snapshot, so an empty one would replace the whole Library
    // with an empty page and 404 every existing `/p/<id>/`. A misconfigured root is
    // far likelier than a deliberate empty publish, so refuse rather than wipe.
    if (built.directory.items.length === 0) {
      throw new DeployError(
        `no previews were found under ${resolved.root} for collections ${target.include.join(', ')}\n`
        + '  publishing would replace the Library with an empty one — check the content root first.',
      );
    }

    const snapshot = snapshotId(built.directory);
    const meta = { previewKind: PREVIEW_KIND, snapshot };
    if (commit) meta.sourceCommit = commit;

    // 3. The live production: our rollback target, and (only when it is a library
    //    production) the commit the stale guard compares against. Checked before
    //    the deploy so a stale publish is refused without spending quota.
    let live = await liveProduction({ projectId, teamId, deps });
    assertMovesForward({ liveCommit: live?.commit, commit, root: resolved.root, deps });

    // 4. Protection before content lands. Project-level, so it works even on a
    //    project with zero deployments; GET-verified inside ensureProtected.
    await ensureProtected({ projectId, teamId, deps });

    // 5. Stage: a PLAIN preview deploy. No `--prod` — that would move the scope
    //    alias immediately and there would be nothing left to verify.
    //
    //    The project is pinned TWO documented ways, deliberately. If neither took,
    //    `vercel deploy` in an unlinked directory would CREATE a project named after
    //    the temp staging dir and publish private content into it — a wrong-project
    //    leak, so this is one of the few places belt-and-braces is warranted:
    //      - `.vercel/project.json` with `{orgId, projectId}` — the documented
    //        contents of a linked directory (and the file `deploy.sh` already reads),
    //        written from the identity just confirmed against Vercel rather than by
    //        shelling out to `vercel link` with a scope SLUG this module does not
    //        have. `.vercel` is on Vercel's default ignore list, so it is never part
    //        of the uploaded payload.
    //      - `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` — the officially recommended
    //        non-interactive pinning, which also takes PRECEDENCE over the file.
    //    `orgId` is the project's owner, which the project object always carries; a
    //    missing owner fails closed rather than falling back to a made-up value.
    const orgId = project.owner ?? teamId;
    if (!orgId) throw new DeployError(`Vercel reported no owner for project ${JSON.stringify(project.name)}`);
    fs.mkdirSync(path.join(built.stagingDir, '.vercel'), { recursive: true });
    fs.writeFileSync(
      path.join(built.stagingDir, '.vercel', 'project.json'),
      `${JSON.stringify({ projectId, orgId })}\n`,
    );
    const staged = await deps.deploy({ cwd: built.stagingDir, meta, projectId, orgId });
    const stagedHost = hostOf(staged?.url ?? '');
    if (!stagedHost) throw new DeployError('the Vercel CLI printed no deployment URL');
    io.print(`staged: https://${stagedHost}\n`);

    const stagedRecord = await deps.getDeployment({ deploymentId: stagedHost, teamId });

    // Vercel's documented exception: the FIRST deployment of a project is always a
    // production deployment even without `--prod`. Then there is nothing to promote
    // and nothing to roll back to — the post-publish verification below is the only
    // gate, and it is run identically.
    //
    // Gated on the project having had NO production deployment before this deploy:
    // that is the only situation the exception covers. On an already-published
    // project a `target: "production"` staging deploy means the stable entry moved
    // without verification, which the branch below refuses instead of waving through.
    const autoProduction = stagedRecord?.target === 'production' && !live;

    if (!autoProduction) {
      // 6. Verify the staged preview. Any failure here means NO promote: the scope
      //    alias never moved, so the published Library is untouched.
      assertOurRevision(stagedRecord, {
        projectId,
        meta,
        where: `the staged preview https://${stagedHost} did not verify`,
        state: STATE.untouched,
      });
      if (stagedRecord.target !== null && stagedRecord.target !== undefined) {
        throw new DeployError(
          `the staged deployment reports target ${JSON.stringify(stagedRecord.target)}; a staging deploy must be a `
          + 'plain preview (target: null) or the stable entry has already moved.',
        );
      }
      if (!(await verifyEntryProtected(`https://${stagedHost}`, { deps }))) {
        throw new DeployError(
          `the staged preview https://${stagedHost} is not anonymously challenged (expected 302/401) — refusing to `
          + 'promote unprotected content.',
        );
      }

      // 7. Re-check the guard immediately before the promote, narrowing the window
      //    in which another machine could have published something newer.
      live = await liveProduction({ projectId, teamId, deps });
      assertMovesForward({ liveCommit: live?.commit, commit, root: resolved.root, deps });

      // 8. Publish. `vercel promote` — never `vercel rollback`, which 500s on this
      //    account. Promoting a preview CREATES a new production deployment.
      //
      //    A non-zero exit here does NOT mean the promotion did not happen: `vercel
      //    promote` has a 3m default timeout and Vercel documents that "when a
      //    timeout occurs, it does not affect the actual promotion which will
      //    continue to proceed". So a throw is an UNKNOWN state, not an untouched
      //    one — anything else would tell a human the entry did not move when it
      //    may be moving right now.
      try {
        await deps.promote({ cwd: built.stagingDir, deployment: stagedHost, teamId, projectId, orgId });
      } catch (err) {
        throw new DeployError(
          `the promote of https://${stagedHost} did not confirm: ${err.message}\n`
          + '  the promotion may still be proceeding (a promote timeout does not cancel it) — check the project\'s\n'
          + '  production deployment before retrying, and do not assume the stable entry is unchanged.',
          STATE.unknown,
        );
      }
    } else {
      io.print('note: this is the project\'s first deployment, which Vercel publishes as production directly.\n');
    }

    // 9. From here the stable entry HAS moved (or landed, on first publish), so
    //    every failure below reports a real state and rolls back when it can.
    //     `noTarget` is the state to report when there is nothing to promote back
    //     (a first publish): usually the new snapshot IS live but unverified.
    const rollback = async (why, noTarget = STATE.published) => {
      if (!live?.id) {
        throw new DeployError(
          `${why}\n  the project had no previous production deployment, so there is nothing to promote back.`,
          noTarget,
        );
      }
      try {
        await deps.promote({ cwd: built.stagingDir, deployment: live.id, teamId, projectId, orgId });
      } catch (err) {
        throw new DeployError(
          `${why}\n  rolling back to ${live.id} failed too: ${err.message}`,
          STATE.rollbackFailed,
        );
      }
      throw new DeployError(`${why}\n  rolled back to the previous production ${live.id}.`, STATE.rolledBack);
    };

    const published = await liveProduction({ projectId, teamId, deps });
    // Nothing to claim as live: not "published", so do not say so.
    if (!published?.id) {
      await rollback('the publish left no production deployment on the project.', STATE.unknown);
    }
    try {
      assertOurRevision(published, {
        projectId,
        meta,
        where: 'the published production did not verify',
        state: STATE.published,
      });
    } catch (err) {
      await rollback(err.message);
    }

    // 10. Protection of the now-existing entry. Re-assert first (a GET-verified
    //     no-op when it is already correct), then remove the world-readable bare
    //     domain, then prove the entry itself is challenged. THREE distinct facts —
    //     the DELETE status confirms removal, the probe confirms the entry.
    let bareDomain;
    try {
      await ensureProtected({ projectId, teamId, deps });
      bareDomain = await removeBareDomain({ projectId, teamId, project: project.name, deps });
    } catch (err) {
      await rollback(`protection could not be confirmed after publishing: ${err.message}`);
    }

    const entry = resolveStableEntry({
      name: project.name,
      aliases: published.aliases,
      domains: (await deps.listDomains({ projectId, teamId })) ?? [],
      immutable: published.url,
    });
    if (!entry) {
      await rollback(
        'the stable entry hostname could not be resolved from the production deployment\'s aliases or the '
        + 'project\'s domains, so its protection could not be verified.',
      );
    }
    if (!(await verifyEntryProtected(`https://${entry}`, { deps }))) {
      // A 200 here means the entry is NAKED. Fail closed — never report success.
      await rollback(
        `the stable entry https://${entry} is not anonymously challenged (expected 302/401; a 200 means it is `
        + 'world-readable).',
      );
    }

    return {
      state: 'published',
      stableUrl: `https://${entry}`,
      productionUrl: published.url ? `https://${hostOf(published.url)}` : null,
      productionId: published.id,
      stagedUrl: `https://${stagedHost}`,
      promoted: !autoProduction,
      project: { name: project.name, projectId, scope: teamId ?? project.owner ?? null },
      collections: target.include,
      commit: commit ?? null,
      snapshot,
      bareDomain,
      items: built.directory.items.length,
      sizeReport: built.sizeReport,
    };
  } finally {
    // The staging tree is a disposable snapshot in the system temp dir — nothing
    // generated ever survives a publish, successful or not.
    fs.rmSync(built.stagingDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Production `deps`
//
// The five protection calls (and their authed-curl plumbing, token via curl's
// stdin config and never argv) come from vercel-protect.mjs wholesale. This adds
// `getDeployment` plus the two Vercel CLI invocations, mirroring setup.mjs's
// duplication note: that module must not be modified and does not export its
// internal request helper.
// ponytail: production-only lines, never exercised by tests (which inject a fake
// `deps`); the alternative is editing a frozen security module.
// ---------------------------------------------------------------------------

const teamQuery = (teamId) =>
  teamId && String(teamId).startsWith('team_') ? `?teamId=${enc(teamId)}` : '';

/** Quota rejections the fleet has actually hit, surfaced as a clear error. */
const QUOTA = /api-deployments-free-per-day|Resource is limited|429|too many requests/i;

/** Default process runner: spawnSync. Injectable so tests never spawn anything. */
const spawnRun = (cmd, args, options) => spawnSync(cmd, args, { encoding: 'utf8', ...options });

/**
 * Run the Vercel CLI in `cwd`, returning stdout and throwing a clear error.
 * `projectId`/`orgId` are exported as `VERCEL_PROJECT_ID` / `VERCEL_ORG_ID` — the
 * documented non-interactive pinning, which takes precedence over the link file and
 * makes "deploy into a project we did not confirm" impossible even if the file were
 * ignored.
 */
function runVercel(run, args, { cwd, projectId, orgId }) {
  const env = { ...process.env };
  if (projectId) env.VERCEL_PROJECT_ID = projectId;
  if (orgId) env.VERCEL_ORG_ID = orgId;
  const res = run('vercel', args, { cwd, env });
  if (res.error) {
    throw new DeployError(`could not run the Vercel CLI (is \`vercel\` installed and on PATH?): ${res.error.message}`);
  }
  const output = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
  if (res.status !== 0) {
    if (QUOTA.test(output)) {
      throw new DeployError(
        'Vercel rejected the deployment for QUOTA (deployments per day). Every Library publish is a full snapshot\n'
        + '  AND costs TWO deployments (the staged preview, plus the rebuilt production the promote creates), so\n'
        + '  batch your edits and publish once — verify locally with build-library.mjs first.\n'
        + `  vercel exited ${res.status}: ${output.trim().slice(0, 400)}`,
      );
    }
    throw new DeployError(`vercel ${args[0]} exited ${res.status}: ${output.trim().slice(0, 400)}`);
  }
  return res.stdout ?? '';
}

/** Read the Vercel CLI token the way deploy.sh / vercel-protect.mjs / setup.mjs do. */
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
  throw new DeployError(`${SELF}: no Vercel CLI auth token found (run \`vercel login\`)`);
}

/**
 * Build the production `deps`. `token` and `run` are injectable for tests; in
 * production both default (token from auth.json, run = real spawnSync).
 * `run(cmd, args, options)` covers curl, vercel and git alike.
 */
export function makeDefaultDeps({ token, run = spawnRun } = {}) {
  const authToken = token ?? readCliToken();
  // Same defense-in-depth as vercel-protect.mjs: a token carrying a character that
  // could break out of the `header = "…"` curl-config line fails closed.
  if (/["\r\n\\]/.test(authToken)) throw new DeployError(`${SELF}: Vercel token contains an illegal character`);
  const authInput = `header = "Authorization: Bearer ${authToken}"\n`;

  // One authenticated GET, mirroring vercel-protect's conventions exactly (token
  // via curl's stdin config and never argv; `-q` to ignore an ambient ~/.curlrc;
  // throw on any non-2xx so an error body can never parse as usable data).
  const apiJson = (url) => {
    const res = run('curl', ['-q', '-sS', '-m', '30', '--config', '-', '-w', '\n%{http_code}', url], { input: authInput });
    if (res.error) throw new DeployError(`${SELF}: curl could not run: ${res.error.message}`);
    if (res.status !== 0) throw new DeployError(`${SELF}: curl exited ${res.status}: ${(res.stderr || '').trim()}`);
    const out = res.stdout ?? '';
    const nl = out.lastIndexOf('\n');
    const httpStatus = Number(out.slice(nl + 1)) || 0;
    const body = nl >= 0 ? out.slice(0, nl) : out;
    if (httpStatus < 200 || httpStatus >= 300) {
      throw new DeployError(`${SELF}: Vercel API returned HTTP ${httpStatus}: ${body.slice(0, 200)}`);
    }
    const trimmed = body.trim();
    if (!trimmed) throw new DeployError(`${SELF}: Vercel API returned an empty body (HTTP ${httpStatus})`);
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new DeployError(`${SELF}: Vercel API returned unparseable JSON (HTTP ${httpStatus}): ${err.message}`);
    }
  };

  return {
    // vercel-protect owns every protection call; reuse it wholesale.
    ...makeProtectDeps({ token: authToken, run: (args, input) => run('curl', args, { input }) }),

    getDeployment: ({ deploymentId, teamId }) =>
      apiJson(`${API}/v13/deployments/${enc(hostOf(deploymentId))}${teamQuery(teamId)}`),

    // A PLAIN preview deploy: no `--prod`, no `--skip-domain`. `--yes` only skips
    // the new-project setup questions; the link file in `cwd` already pins the
    // project and scope. stdout is documented to be the deployment URL.
    deploy: ({ cwd, meta, projectId, orgId }) => {
      const args = ['deploy', '--yes'];
      // Vercel caps a meta VALUE at 65536 characters; every value here is a hex
      // digest or a git SHA, so no truncation is needed.
      for (const [key, value] of Object.entries(meta)) args.push('--meta', `${key}=${value}`);
      const out = runVercel(run, args, { cwd, projectId, orgId });
      const match = out.match(/https:\/\/[a-z0-9-]+\.vercel\.app/gi);
      return { url: match ? match[match.length - 1] : '' };
    },

    // `--yes` is REQUIRED: promoting a preview prompts for confirmation (it creates
    // a new production deployment) and would otherwise hang — and under an agent the
    // CLI defaults to non-interactive, where the unprompted behavior is unspecified.
    promote: ({ cwd, deployment, projectId, orgId }) => {
      runVercel(run, ['promote', deployment, '--yes'], { cwd, projectId, orgId });
    },

    git: (args, cwd) => {
      const res = run('git', ['-C', cwd, ...args], {});
      // A git that could not run at all reports a non-zero status, never a value —
      // sourceGuard reads that as "not a repo" / "cannot confirm", never as "clean".
      if (res.error || typeof res.stdout !== 'string') return { status: res.status ?? 1, stdout: '' };
      return { status: res.status, stdout: res.stdout };
    },
  };
}

/** Production `io`: report to stdout. */
export const makeStdio = () => ({ print: (text) => process.stdout.write(text) });

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `usage: ${SELF} [--from <path>] [--json]

  --from <path>  anchor config resolution at <path> instead of the current directory
  --json         print the publish report as JSON instead of a human report`;

// ponytail: hand-rolled rather than node:util parseArgs — parseArgs only became
// stable in 20.16 and this file's floor is 20, where it warns onto the stderr this
// CLI reserves for errors (every sibling script avoids it for the same reason).
function parseArgs(argv) {
  let from;
  let asJson = false;
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      asJson = true;
    } else if (arg.startsWith('--from=')) {
      from = arg.slice('--from='.length);
    } else if (arg === '--from') {
      from = argv[i + 1];
      if (from === undefined) throw new DeployError(`--from requires a path\n${USAGE}`);
      i += 1;
    } else if (arg === '-h' || arg === '--help') {
      help = true;
    } else {
      throw new DeployError(`unknown argument: ${arg}\n${USAGE}`);
    }
  }
  return { from, asJson, help };
}

const humanReport = (r) => [
  'published — the Library is live at its stable entry.',
  `  stable:      ${r.stableUrl}`,
  `  immutable:   ${r.productionUrl ?? '(not reported)'}`,
  `  project:     ${r.project.name} (${r.project.projectId}${r.project.scope ? `, ${r.project.scope}` : ''})`,
  `  collections: ${r.collections.join(', ')}`,
  `  commit:      ${r.commit ?? 'none (content root is not a git repo)'}`,
  `  snapshot:    ${r.snapshot.slice(0, 12)}`,
  `  bare domain: ${r.bareDomain.removed ? `removed (${r.bareDomain.domain})` : `already absent (${r.bareDomain.domain})`}`,
  `  items:       ${r.items}`,
  ...r.sizeReport.warnings.map((w) => `  WARNING: ${w}`),
].join('\n');

/**
 * The CLI flow. `io`, `makeDeps` and `build` are injected so tests drive every
 * branch with zero real network and zero real deploys; `makeDeps` is a FACTORY so
 * the Vercel token is not read on the --help / bad-config paths.
 */
export async function main({ argv = [], io, makeDeps, build }) {
  const opts = parseArgs(argv);
  if (opts.help) { io.print(`${USAGE}\n`); return 0; }

  const resolved = resolveConfig({ from: opts.from });
  if (resolved.mode !== 'v2') {
    throw new DeployError(
      `no v2 preview config resolved (mode: ${resolved.mode})\n`
      + '  run `node setup.mjs` to create one, or `node config-migrate.mjs` to migrate a legacy config.',
    );
  }

  const report = await publishLibrary({ resolved, deps: makeDeps(), io, build });
  io.print(opts.asJson ? `${JSON.stringify(report, null, 2)}\n` : `${humanReport(report)}\n`);
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
      // A known, user-facing failure prints cleanly WITH the project's real state
      // and exits 1; anything else is a bug and must surface as a stack trace.
      if (err instanceof DeployError) {
        process.stderr.write(`${SELF}: ${err.message}\n  project state: ${err.state}\n`);
        process.exitCode = 1;
      } else if (err instanceof VercelProtectError || err instanceof BuildError || err instanceof ConfigError) {
        process.stderr.write(`${SELF}: ${err.message}\n  project state: ${STATE.untouched}\n`);
        process.exitCode = 1;
      } else {
        throw err;
      }
    });
}
