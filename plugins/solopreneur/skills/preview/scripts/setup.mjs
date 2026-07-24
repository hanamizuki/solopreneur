#!/usr/bin/env node
/**
 * First-run setup for the v2 preview Library: stand up a `.solopreneur.json`
 * with a SINGLE `private` target, provision that target's Vercel protection,
 * and write the config only after protection is in place.
 *
 * Requires Node.js >= 20.
 *
 * Usage:
 *   setup.mjs [--root <path>] [--project <name>] [--force]
 *
 * Output: the proposal and progress on stdout; every error on stderr, exit 1 on
 *   any failure. Nothing is written and no Vercel mutation happens until the
 *   user explicitly confirms.
 *
 * This is the greenfield counterpart to config-migrate.mjs. The migrator turns
 * an existing legacy `solopreneur.json` into a v2 file; setup creates one from
 * scratch and, unlike the migrator, TALKS TO VERCEL — it provisions the target
 * project's `ssoProtection` before writing a config that claims the target is
 * private. It reuses the three sibling modules rather than reimplementing them:
 *   - config-resolve.mjs — first-run detection (the `mode` field) and the
 *     post-write "is it discoverable?" check.
 *   - vercel-protect.mjs — every Vercel protection primitive (ensureProtected,
 *     removeBareDomain, verifyEntryProtected, inventoryProject) and the injected
 *     `deps` seam that makes them testable with zero network.
 *
 * ## Setup vs. first-publish: the protection division
 *
 * A private target's full protection (the "Gate A recipe" in vercel-protect.mjs)
 * is the composition ensureProtected + removeBareDomain + a 302 entry-probe. But
 * the bare domain `<project>.vercel.app` and the immutable entry URL DO NOT EXIST
 * until a project has its first PRODUCTION deployment. So the division is:
 *
 *   - `ssoProtection` is a PROJECT-LEVEL setting, settable and GET-verifiable on a
 *     project with zero deployments. (Verified 2026-07-24 against the Vercel REST
 *     API reference: `POST /v1x/projects` accepts `ssoProtection` in the create
 *     body, and `PATCH /v9/projects/{id}` documents it as a project setting that
 *     needs no existing deployment. This is a checked platform fact, not an
 *     assumption — an unverified assumption here is exactly the failure the spec
 *     forbids.) Therefore setup always runs `ensureProtected`.
 *   - Bare-domain removal and the 302 entry-probe have nothing to act on until a
 *     deployment exists. On a brand-new / empty project setup does NOT do them and
 *     does NOT hard-fail for their absence — they are deploy-library.mjs's
 *     first-publish responsibility (a later PR). Setup only runs them on an
 *     EXISTING project that already has a production deployment.
 *
 * A `302` is read as "SSO protection is present" (the Gate A experiment verified
 * the status, not the redirect target), consistent with vercel-protect.mjs.
 *
 * ## Fail-closed ordering
 *
 * After the user confirms: the Vercel create/link + the applicable protection
 * steps run FIRST; the local config and content dirs are written LAST, only once
 * protection has succeeded. A half-written config that lies about protection is
 * worse than no config, so any provisioning/verification failure exits non-zero
 * having written nothing.
 *
 * All Vercel I/O goes through an injected `deps` object (vercel-protect's shape,
 * plus `createProject` and `getDeployment` for the two operations that module
 * does not cover) and all prompting through an injected `io` object, so the whole
 * flow — the confirm gate, the fail-closed ordering, the populated-project guard
 * — is exercised by `node --test` with zero real network and zero real prompts.
 * `makeDefaultDeps()` / `makeStdio()` build the production implementations.
 *
 * `PREVIEW_PROJECT` is the legacy per-page override; setup neither reads nor
 * writes it.
 */

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { ConfigError, resolveConfig } from './config-resolve.mjs';
import {
  ensureProtected,
  removeBareDomain,
  verifyEntryProtected,
  inventoryProject,
  makeDefaultDeps as makeProtectDeps,
  VercelProtectError,
} from './vercel-protect.mjs';

const SELF = 'setup.mjs';
const V2_FILENAME = '.solopreneur.json';
const API = 'https://api.vercel.com';

/**
 * Where a fresh Library keeps its previews when the user names no other root.
 * The same last-resort default the legacy flow documents (SKILL.md: "Otherwise
 * default to `<git_root>/docs/preview/`") and config-migrate.mjs adopts, so a
 * migrated repo and a freshly set-up one land in the same place.
 */
const DEFAULT_ROOT = 'docs/preview';

/**
 * A user-facing setup failure. Thrown for every clean refusal; the CLI prints
 * `.message` and exits 1. A bug in a shipped file throws a plain Error instead,
 * so "fix your input" can never swallow "this script is broken" — the same split
 * config-resolve.mjs draws with ConfigError.
 */
export class SetupError extends Error {}

const enc = encodeURIComponent;

/** A yes/no answer the user typed, read as affirmative only on an explicit yes. */
const affirmative = (answer) => /^(y|yes)$/i.test(String(answer).trim());

/**
 * True when `child` is `parent` or sits underneath it — the same `path.relative`
 * test config-resolve.mjs / config-migrate.mjs use, for the same reason a prefix
 * compare cannot be (a trailing separator is needed to keep `/a/x-old` out of
 * `/a/x`, and that separator then breaks a `parent` of `/`).
 */
function isUnder(child, parent) {
  const rel = path.relative(parent, child);
  if (rel === '') return true;
  if (rel === '..' || rel.startsWith(`..${path.sep}`)) return false;
  return !path.isAbsolute(rel);
}

/**
 * The physical path a (possibly not-yet-created) target resolves to: realpath the
 * deepest existing ancestor and re-append the missing tail. A lexical path is
 * fooled by an in-repo symlink that leaves the repo (its realpath'd ancestor is
 * already outside) and by a component that is actually a file (realpath raises
 * ENOTDIR); both must be refused BEFORE Vercel is provisioned. A DANGLING symlink
 * is refused rather than stepped over — it exists yet its target is absent, so
 * ascending past it lexically could let a link pointing outside pass as contained
 * once its target appears. Mirrors config-migrate.mjs's `physicalize`.
 */
function physicalize(target) {
  const tail = [];
  for (let cur = target; ;) {
    try {
      return path.join(fs.realpathSync(cur), ...tail);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw new SetupError(`the preview root is unusable: ${cur}\n  ${err.message}`);
      }
      try {
        fs.readlinkSync(cur);
        throw new SetupError(`the preview root passes through a dangling symlink: ${cur}`);
      } catch (linkErr) {
        if (linkErr instanceof SetupError) throw linkErr;
        // not a symlink — a genuinely missing component; keep ascending
      }
      const parent = path.dirname(cur);
      if (parent === cur) return path.join(cur, ...tail);
      tail.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

/**
 * The nearest `.solopreneur.json` strictly between the physical preview `root`
 * and the `anchor` that would SHADOW the config setup writes at the anchor — one
 * carrying a `preview` block (the resolver stops there walking up from content),
 * or one present-but-broken (fatal to the resolver, so resolution stops there
 * too). A preview-less file configures another feature and is skipped, exactly as
 * the resolver's walk-up skips it. Returns the file path or null. Mirrors
 * config-migrate.mjs's `nestedShadow`: it lets setup refuse a guaranteed-
 * undiscoverable placement BEFORE provisioning Vercel, not after.
 */
function nestedShadow(root, anchor) {
  // Start at the deepest EXISTING directory at or under the root, so a not-yet-
  // created root is covered by scanning its existing ancestors.
  let dir = root;
  while (dir !== anchor && isUnder(dir, anchor) && !fs.existsSync(dir)) dir = path.dirname(dir);
  for (; dir !== anchor && isUnder(dir, anchor); dir = path.dirname(dir)) {
    const file = path.join(dir, V2_FILENAME);
    let raw;
    try {
      if (!fs.statSync(file).isFile()) return file; // a non-regular file is fatal to the resolver
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') continue; // nothing here
      return file; // present but unreadable — fatal to the resolver
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return file; } // malformed — fatal
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && Object.hasOwn(parsed, 'preview')) {
      return file; // a preview block here is found first and shadows the anchor config
    }
    // a valid config without a preview block configures another feature — skip it
  }
  return null;
}

/**
 * Run git under the current working directory, returning stdout with only its
 * trailing newline(s) stripped, or null. Never throws: git may be absent, the
 * directory may not be a repo, an ownership refusal also lands here — each has to
 * fall through to the cwd fallback rather than abort. `.replace(/\n+$/, '')` not
 * `.trim()`, matching config-migrate.mjs: a toplevel path ending in a space is
 * valid and must not be mangled.
 */
function git(args) {
  const result = spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8' });
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') return null;
  const out = result.stdout.replace(/\n+$/, '');
  return out === '' ? null : out;
}

/** Where `.solopreneur.json` is written: the git toplevel, else the cwd. */
const anchorDir = () => git(['rev-parse', '--show-toplevel']) ?? process.cwd();

/**
 * A relative `root` for the config file, `./`-prefixed so the "relative to this
 * file's directory" reading is obvious. Byte-for-byte the normalization
 * config-migrate.mjs uses, so the two writers emit the same value. An absolute
 * root, or one escaping via `..`, is passed through unmarked.
 */
function toRoot(value) {
  if (path.isAbsolute(value)) return value;
  const normalized = path.normalize(value).replace(/\/+$/, '');
  const escapes = normalized === '..' || normalized.startsWith(`..${path.sep}`);
  return normalized === '.' || escapes ? normalized : `./${normalized}`;
}

/**
 * The v2 file: a fixed single-private-target template. Mirrors config-migrate.mjs's
 * `buildConfig` — a set-up config and a migrated one are otherwise indistinguishable
 * — but inlined rather than imported because that module does not export it and must
 * not be modified. NEVER emits the legacy three buckets; exactly one target named
 * `private`, visibility `private`.
 *
 * `identity` carries the target-identity pair (F9): the real `projectId` Vercel
 * assigned, and — for a team-owned project — its `teamId`. Both are OMITTED when
 * absent, so a name-only setup (identity could not be resolved) emits exactly the
 * pre-F9 shape. `teamId` is written ONLY alongside `projectId`: a team scope is
 * meaningless without the project id it scopes (the resolver rejects the half-set
 * case). config-migrate.mjs stays name-only — a name-only target is fully valid.
 */
const buildConfig = (project, root, { projectId, teamId } = {}) => {
  const target = {
    provider: 'vercel',
    project,
    ...(projectId ? { projectId } : {}),
    ...(projectId && teamId ? { teamId } : {}),
    visibility: 'private',
    include: ['active', 'archive'],
  };
  return {
    schemaVersion: 2,
    preview: {
      root,
      defaultTarget: 'private',
      collections: {
        active: { path: 'active', label: 'Previews' },
        archive: { path: 'archive', label: 'Archive' },
      },
      targets: { private: target },
    },
  };
};

/**
 * Write `text` to `dest` via a same-directory temp + rename, so a crash mid-write
 * never leaves a half-written config. Same directory keeps the rename on one
 * filesystem (no EXDEV) — the same reasoning config-migrate.mjs's stageConfig
 * gives. No fsync: rename is atomic against other processes, which is the only
 * property that matters for a single-user CLI whose recovery is "run it again".
 */
function writeAtomic(dest, text) {
  const tmp = path.join(path.dirname(dest), `.${path.basename(dest)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, dest);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw new SetupError(`could not write ${dest}\n  ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const USAGE = `usage: ${SELF} [--root <path>] [--project <name>] [--team <teamId>] [--force]

  --root <path>      content root for the Library (default: ${DEFAULT_ROOT})
  --project <name>   Vercel project name (else you are prompted)
  --team <teamId>    Vercel team id ("team_…") to provision under; omit for personal scope
  --force            set up a fresh config even if one already governs here`;

// ponytail: hand-rolled rather than node:util parseArgs, for the reason
// config-resolve.mjs gives — parseArgs only became stable in 20.16, and this
// file's declared floor is 20, where it warns onto the stderr reserved for errors.
function parseArgs(argv) {
  const opts = { root: undefined, project: undefined, team: undefined, force: false, help: false };
  const valueOf = (arg, name, i) => {
    if (arg.startsWith(`${name}=`)) return { value: arg.slice(name.length + 1), next: i };
    const value = argv[i + 1];
    if (value === undefined) throw new SetupError(`${name} requires a value\n${USAGE}`);
    // Refuse to swallow the next flag as this one's value: with the value coming
    // from a prompt otherwise, `--project --force` would quietly name a project
    // "--force" and never set the flag. The `=` form is the deliberate escape.
    if (value.startsWith('--')) {
      throw new SetupError(
        `${name} requires a value, but the next argument is the flag ${value}\n`
        + `  if that really is the value, write it as ${name}=${value}\n${USAGE}`,
      );
    }
    return { value, next: i + 1 };
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') {
      opts.force = true;
    } else if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg === '--root' || arg.startsWith('--root=')) {
      const { value, next } = valueOf(arg, '--root', i); opts.root = value; i = next;
    } else if (arg === '--project' || arg.startsWith('--project=')) {
      const { value, next } = valueOf(arg, '--project', i); opts.project = value; i = next;
    } else if (arg === '--team' || arg.startsWith('--team=')) {
      const { value, next } = valueOf(arg, '--team', i); opts.team = value; i = next;
    } else {
      throw new SetupError(`unknown argument: ${arg}\n${USAGE}`);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------

/**
 * Provision the target's protection. Returns `true` when protection is in place,
 * `false` when the user declined a populated-project confirmation (a clean abort,
 * no mutation), and THROWS (fail closed) on any provisioning/verification
 * failure. Split from the write so the caller can guarantee ordering: this must
 * return true before a single byte of config is written.
 *
 * The `create` path and the `link` path diverge exactly where the protection
 * division does. On create — or on linking a project that is EMPTY — only
 * `ensureProtected` applies: there is no deployment yet, so the bare domain and
 * the immutable entry do not exist, and bare-domain removal + the 302 entry-probe
 * are deploy-library's first-publish job (not run here, and NOT a hard-fail).
 * On linking a project that is POPULATED (has domains or a production
 * deployment), an extra confirmation is required first — provisioning it could
 * disrupt a real site — then the full hardening runs.
 */
async function provision({ create, projectName, teamId, io, deps }) {
  if (create) {
    const project = await deps.createProject({ name: projectName, teamId });
    const projectId = project?.id;
    if (!projectId) {
      throw new SetupError(`Vercel returned no id for the new project ${JSON.stringify(projectName)}`);
    }
    // A fresh project auto-enables the legacy enum (Gate A fact 1); ensureProtected
    // GET-verifies and only PATCHes if needed, and throws if it cannot confirm
    // protection. Nothing else to do until the first production deployment.
    await ensureProtected({ projectId, teamId, deps });
    return true;
  }

  // Link: resolve the name to its canonical id — GET /v9/projects/{idOrName}
  // accepts a name, so vercel-protect's getProject doubles as the resolver.
  const project = await deps.getProject({ projectId: projectName, teamId });
  const projectId = project?.id;
  if (!projectId) throw new SetupError(`could not resolve the Vercel project ${JSON.stringify(projectName)}`);

  const inv = await inventoryProject({ projectId, teamId, deps });
  const populated = inv.domains.length > 0 || inv.productionDeploymentId !== null;

  // An empty linked project is the create path's twin: protect it and stop. The
  // bare domain / entry probe have nothing to act on until first publish.
  if (!populated) {
    await ensureProtected({ projectId, teamId, deps });
    return true;
  }

  // Populated: require a second, explicit confirmation before touching it.
  io.print(
    `project ${JSON.stringify(projectName)} already has ${inv.domains.length} domain(s)`
    + `${inv.productionDeploymentId ? ' and a production deployment' : ''} — it is NOT empty.\n`
    + '  Provisioning it (changing protection, removing the bare domain) could disrupt a real site.\n',
  );
  if (!affirmative(await io.ask('This is not an empty project. Continue anyway? [y/N]: '))) {
    return false; // declined — the caller aborts cleanly, nothing mutated
  }

  await ensureProtected({ projectId, teamId, deps });

  // Bare-domain removal is confirmed by removeBareDomain's OWN returned status
  // (404 = already absent, 2xx = removed; it throws on anything else). This is a
  // check SEPARATE from the entry probe below — a removed bare domain returns
  // 404, which verifyEntryProtected reads as unprotected, so the two must never
  // be conflated.
  await removeBareDomain({ projectId, teamId, project: project.name ?? projectName, deps });

  // The 302 entry-probe needs a real deployment URL. A populated-by-domains-only
  // project may still have no production deployment; only when one exists is there
  // an immutable entry to probe, so the probe is gated on it (deferred otherwise).
  if (inv.productionDeploymentId) {
    const deployment = await deps.getDeployment({ deploymentId: inv.productionDeploymentId, teamId });
    const url = deployment?.url;
    if (!url) throw new SetupError('could not resolve the production deployment URL to verify entry protection');
    const entryUrl = `https://${url}`;
    if (!(await verifyEntryProtected(entryUrl, { deps }))) {
      // Fail closed: never write a config claiming a protected private target when
      // the anonymous entry is not actually challenged.
      throw new SetupError(
        `the protected entry ${entryUrl} did not return a challenge (expected 302); `
        + `protection is NOT confirmed for ${JSON.stringify(projectName)} — fix it before setting up`,
      );
    }
  }
  return true;
}

/**
 * Resolve the target's durable identity (F9) from the provisioned project: the
 * real `projectId` Vercel assigned, plus the `teamId` when the project is
 * team-owned. Read AFTER provisioning succeeds, so protection integrity is never
 * affected by it.
 *
 * Identity is additive metadata, NOT fail-closed like protection — so this is
 * best-effort and NEVER fabricates. A GET that fails, or a project object without
 * an `id`, yields a name-only config (the pre-F9 behavior) rather than an error or
 * an invented id. Both values come from the resolved object, never a guess:
 * `projectId` is its `id` (the same field the create/link path already reads), and
 * `teamId` is its `accountId` when that is a team scope (`team_…`) — a personal
 * project reports the user id there, so personal scope writes no teamId. `teamId`
 * is only ever paired with a `projectId`.
 *
 * The `teamId` argument is the scope the request must run under (createProject /
 * getProject are team-scoped only when it is passed); it is not itself written —
 * the written teamId is read back from the object's owner.
 */
async function resolveIdentity({ projectName, teamId, deps }) {
  let project;
  try {
    project = await deps.getProject({ projectId: projectName, teamId });
  } catch {
    project = undefined; // a failed identity read is not fatal — name-only
  }
  const identity = {};
  if (project?.id) {
    identity.projectId = project.id;
    const owner = project.accountId;
    if (typeof owner === 'string' && owner.startsWith('team_')) identity.teamId = owner;
  }
  return identity;
}

/**
 * The whole first-run flow. Returns an exit code. `io` and `deps` are injected so
 * tests drive every branch with zero real prompts and zero real network; the cwd
 * and environment come from the process (the real resolver reads them too), which
 * tests control with a fixture directory and a fixture HOME.
 */
export async function main({ argv = [], io, makeDeps }) {
  const opts = parseArgs(argv);
  if (opts.help) { io.print(`${USAGE}\n`); return 0; }

  // Team-scope (F9): --team names the Vercel team every Vercel call runs on behalf
  // of; omitted → personal scope. A team id is "team_…" — reject anything else up
  // front, before any prompt or Vercel call, so a typo cannot silently provision in
  // the personal account. This scope is threaded through provisioning; the teamId
  // PERSISTED to config is read back from the project's owner (resolveIdentity), not
  // from this flag. Lifts PR #137's personal-scope-only limitation.
  const teamId = opts.team;
  if (teamId !== undefined && !teamId.startsWith('team_')) {
    throw new SetupError(`--team must be a Vercel team id (starts with "team_"), got ${JSON.stringify(teamId)}`);
  }

  // 1. First-run detection. resolveConfig with NO `from` anchors at the cwd and
  //    skips the "--from must sit under root" containment check, so a v2 config
  //    whose root is a subdirectory of the cwd still reports mode "v2" (an
  //    explicit `from` at the repo root would instead be rejected as outside that
  //    root). A v2 config already present is an idempotent no-op.
  const existing = resolveConfig({});
  if (existing.mode === 'v2') {
    io.print(
      `a v2 preview config already governs this location:\n  ${existing.configPath}\n`
      + `${opts.force ? '--force given: setting up a fresh config anyway.\n' : 'nothing to do (re-run with --force to replace it).\n'}`,
    );
    if (!opts.force) return 0;
  } else if (existing.mode === 'legacy' && !opts.force) {
    // A legacy config is not a v2 config, but it is not "nothing" either — the
    // right tool is the migrator, which preserves what the user already set.
    io.print(
      `a legacy solopreneur.json preview config was found:\n  ${existing.configPath}\n`
      + '  convert it with config-migrate.mjs, or re-run setup with --force to start fresh.\n',
    );
    return 0;
  }

  // Physical anchor: the resolver realpaths every path it reports, so a repo
  // reached through a symlinked path would otherwise make the step-7 configPath
  // check (resolver's physical path vs. this dest) mismatch and undo a good
  // config. anchorDir() always returns an existing path (a git toplevel or the
  // cwd), so realpath cannot throw here.
  const anchor = fs.realpathSync(anchorDir());
  const dest = path.join(anchor, V2_FILENAME);

  // Never clobber a `.solopreneur.json` that configures another feature: the
  // resolver skips a preview-less one during walk-up (which is why mode came back
  // "none"), but overwriting it here would destroy that config. lstat, not stat,
  // so a dangling symlink sitting in the way is still seen. Overwriting is allowed
  // ONLY when --force is replacing this script's own v2 config at this exact path.
  const overwritingOwnV2 = existing.mode === 'v2' && existing.configPath === dest && opts.force;
  let destPresent = false;
  try { fs.lstatSync(dest); destPresent = true; } catch { /* absent */ }
  if (destPresent && !overwritingOwnV2) {
    throw new SetupError(
      `a ${V2_FILENAME} already exists at ${dest}\n`
      + '  setup will not overwrite it — merge by hand, or remove it and re-run',
    );
  }
  // The only way past that guard with a file present is a --force replacement of
  // our own v2 config. Keep its bytes: the write preserves any sibling top-level
  // keys (a v2 file may configure other features too — the schema allows it), and
  // a later verification failure restores them rather than deleting a config that
  // was working before this run.
  const priorBytes = overwritingOwnV2 && destPresent ? fs.readFileSync(dest) : null;

  const root = toRoot(opts.root ?? DEFAULT_ROOT);
  const rootAbs = path.resolve(anchor, root);
  const activeDir = path.join(rootAbs, 'active');
  const archiveDir = path.join(rootAbs, 'archive');

  // Validate the root's PHYSICAL placement BEFORE any prompt or Vercel call, so
  // setup never provisions Vercel — or writes content dirs outside the repo — for
  // a placement the config walk-up could never discover. The config is found only
  // by walking UP from a content path to `dest`, so the root must sit physically
  // under `anchor`, be a directory (or not exist yet), and have no nearer
  // `.solopreneur.json` shadowing it. The lexical `rootAbs` is not enough — an
  // in-repo symlink can leave the repo and a component can be a file; physicalize
  // resolves both. These mirror config-migrate.mjs's pre-write checks.
  const physicalRoot = physicalize(rootAbs);
  if (!isUnder(physicalRoot, anchor)) {
    throw new SetupError(
      `the preview root must sit under ${anchor}\n`
      + `  ${physicalRoot} is outside it — a config at ${dest} could never be discovered from there`,
    );
  }
  try {
    if (!fs.statSync(physicalRoot).isDirectory()) {
      throw new SetupError(`the preview root is a file, not a directory: ${physicalRoot}`);
    }
  } catch (err) {
    if (err instanceof SetupError) throw err;
    if (err.code !== 'ENOENT') throw new SetupError(`cannot inspect the preview root: ${physicalRoot}\n  ${err.message}`);
    // ENOENT — the root does not exist yet; setup creates it after provisioning.
  }
  const shadow = nestedShadow(physicalRoot, anchor);
  if (shadow) {
    throw new SetupError(
      `a ${V2_FILENAME} nearer the content than ${dest} would shadow it\n`
      + `  ${shadow} — remove it, or choose a root not beneath it`,
    );
  }

  // 2/3. Gather the two inputs setup cannot infer: the project name and whether
  //      to create it or link an existing one. Both are asked (create-vs-link is
  //      the decision the spec calls for), the name may be preset with --project.
  const projectName = (opts.project ?? await io.ask('Vercel project name: ')).trim();
  if (!projectName) throw new SetupError('a Vercel project name is required');
  const choice = (await io.ask('Create a NEW Vercel project or LINK an existing one? [new/existing]: '))
    .trim().toLowerCase();
  const create = /^(n|new|c|create)$/.test(choice);
  const link = /^(e|existing|l|link)$/.test(choice);
  if (!create && !link) {
    throw new SetupError(`unrecognized choice ${JSON.stringify(choice)} — answer "new" or "existing"`);
  }

  // 2. Propose — show everything BEFORE anything happens.
  io.print(`${[
    'first-run preview setup — nothing is written or changed until you confirm:',
    `  config file:     ${dest}`,
    `  preview root:    ${rootAbs}`,
    `  collections:     active  -> ${activeDir}`,
    `                   archive -> ${archiveDir}`,
    '  target:          private (visibility: private)',
    `  Vercel project:  ${projectName}  (${create ? 'create new' : 'link existing'}, ${teamId ? `team ${teamId}` : 'personal scope'})`,
  ].join('\n')}\n`);

  // 4. Confirm gate — before ANY Vercel call or disk write.
  if (!affirmative(await io.ask('Proceed? [y/N]: '))) {
    io.print('aborted — nothing was written or changed.\n');
    return 0;
  }

  // Construct the Vercel deps only now, past the decline point: --help, an
  // idempotent/legacy no-op, and a decline all return above without ever touching
  // Vercel. Building deps eagerly at the CLI entry read the auth token before any
  // of those, so a machine without `vercel login` could not even print --help. A
  // missing token now throws SetupError HERE, inside main, so the CLI entry's
  // catch turns it into a clean message rather than a raw stack trace.
  const deps = makeDeps();

  // 5. Provision FIRST (fail closed). A throw here exits non-zero having written
  //    no config; a `false` return is the populated-project decline — a clean
  //    abort with nothing mutated.
  if (!(await provision({ create, projectName, teamId, io, deps }))) {
    io.print('aborted — nothing was written or changed.\n');
    return 0;
  }

  // 5b. Bind the target to the project's real identity (F9), read back from the
  //     provisioned project. Best-effort and never fabricated — see resolveIdentity;
  //     an unresolvable identity yields a name-only config, not a failure.
  const identity = await resolveIdentity({ projectName, teamId, deps });

  // 6. Write config + content dirs LAST, only now that protection is in place.
  //    Under --force replacing our own v2 config, preserve any sibling top-level
  //    keys the file carried — replace only schemaVersion + preview, never blow
  //    the whole file away (which would silently drop another feature's config).
  fs.mkdirSync(activeDir, { recursive: true });
  fs.mkdirSync(archiveDir, { recursive: true });
  const fresh = buildConfig(projectName, root, identity);
  const cfgObject = priorBytes
    ? { ...JSON.parse(priorBytes), schemaVersion: fresh.schemaVersion, preview: fresh.preview }
    : fresh;
  writeAtomic(dest, `${JSON.stringify(cfgObject, null, 2)}\n`);

  // 7. Discoverable AND effective: prove the SHIPPED resolver finds this config
  //    by walking up from a content path — not by pointing $SOLOPRENEUR_CONFIG at
  //    it, which would only re-check the schema. schema-valid != resolvable
  //    (PR #135). A config that does not resolve is removed so setup never leaves
  //    an ineffective file behind; the Vercel project stays provisioned.
  const undo = (why) => {
    // Restore the prior config under --force — a failed re-setup must never
    // destroy a config that worked before this run — else remove the file we just
    // created (greenfield). The fs op is best-effort: its OWN failure must not
    // replace the SetupError with a raw stack trace, so it is folded into the
    // message rather than thrown.
    let rollback = priorBytes ? 'the previous config was restored' : 'the config was removed';
    try {
      if (priorBytes) fs.writeFileSync(dest, priorBytes);
      else fs.rmSync(dest, { force: true });
    } catch (err) {
      rollback = `could not ${priorBytes ? 'restore the previous config' : 'remove the config'} at ${dest} `
        + `(${err.message}) — remove or fix it by hand`;
    }
    return new SetupError(
      `${why}, so ${rollback}\n  the Vercel project ${JSON.stringify(projectName)} WAS provisioned`
      + ' — re-run setup after fixing the location',
    );
  };
  let resolved;
  try {
    resolved = resolveConfig({ from: activeDir });
  } catch (err) {
    throw undo(`the written config does not resolve (${err instanceof Error ? err.message : String(err)})`);
  }
  const wantRoot = fs.realpathSync(rootAbs);
  if (resolved.mode !== 'v2'
    || resolved.configPath !== dest
    || resolved.root !== wantRoot
    || resolved.target?.name !== 'private'
    || resolved.target?.project !== projectName
    || resolved.target?.visibility !== 'private') {
    throw undo(
      `the written config did not resolve to the expected private target `
      + `(got mode=${resolved.mode}, project=${resolved.target?.project ?? 'none'})`,
    );
  }

  io.print(`${[
    'done — the preview Library is set up.',
    `  config:  ${dest}`,
    `  root:    ${wantRoot}`,
    `  target:  private -> ${projectName} (protected)`,
  ].join('\n')}\n`);
  return 0;
}

// ---------------------------------------------------------------------------
// Production `deps` — the two operations vercel-protect.mjs does not cover
//
// vercel-protect.mjs owns every PROTECTION call and its authed-curl plumbing;
// this reuses it wholesale for those five. It adds only `createProject` and
// `getDeployment`. That module must not be modified and does not export its
// internal request helper, so the minimal authed-JSON caller below is duplicated
// on purpose — mirroring its conventions exactly (token via curl's stdin config,
// never argv; `-q` to ignore an ambient ~/.curlrc; `-m` timeout; throw on any
// non-2xx so an error body can never parse as usable data).
// ponytail: ~30 production-only lines, never touched by tests (which inject a
// fake `deps`); the alternative is editing a frozen security module.
// ---------------------------------------------------------------------------

const teamQuery = (teamId) =>
  teamId && String(teamId).startsWith('team_') ? `?teamId=${enc(teamId)}` : '';

function spawnCurl(args, input) {
  return spawnSync('curl', args, { input, encoding: 'utf8' });
}

/** Read the Vercel CLI token the way deploy.sh / vercel-protect.mjs do. */
function readCliToken() {
  const files = [
    path.join(os.homedir(), 'Library', 'Application Support', 'com.vercel.cli', 'auth.json'),
    path.join(os.homedir(), '.local', 'share', 'com.vercel.cli', 'auth.json'),
  ];
  for (const file of files) {
    try {
      const token = JSON.parse(fs.readFileSync(file, 'utf8'))?.token;
      if (token) return token;
    } catch { /* not present / unreadable — try the next */ }
  }
  throw new SetupError(`${SELF}: no Vercel CLI auth token found (run \`vercel login\`)`);
}

export function makeDefaultDeps({ token, run = spawnCurl } = {}) {
  const authToken = token ?? readCliToken();
  // Same defense-in-depth as vercel-protect.mjs: a token carrying a character
  // that could break out of the `header = "…"` config line fails closed.
  if (/["\r\n\\]/.test(authToken)) {
    throw new SetupError(`${SELF}: Vercel token contains an illegal character`);
  }
  const authInput = `header = "Authorization: Bearer ${authToken}"\n`;
  const base = ['-q', '-sS', '-m', '30', '--config', '-'];

  const apiJson = (args) => {
    const res = run([...base, '-w', '\n%{http_code}', ...args], authInput);
    if (res.error) throw new SetupError(`${SELF}: curl could not run: ${res.error.message}`);
    if (res.status !== 0) throw new SetupError(`${SELF}: curl exited ${res.status}: ${(res.stderr || '').trim()}`);
    const out = res.stdout ?? '';
    const nl = out.lastIndexOf('\n');
    const httpStatus = Number(out.slice(nl + 1)) || 0;
    const body = nl >= 0 ? out.slice(0, nl) : out;
    if (httpStatus < 200 || httpStatus >= 300) {
      throw new SetupError(`${SELF}: Vercel API returned HTTP ${httpStatus}: ${body.slice(0, 200)}`);
    }
    const trimmed = body.trim();
    if (!trimmed) throw new SetupError(`${SELF}: Vercel API returned an empty body (HTTP ${httpStatus})`);
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new SetupError(`${SELF}: Vercel API returned unparseable JSON (HTTP ${httpStatus}): ${err.message}`);
    }
  };

  return {
    ...makeProtectDeps({ token: authToken, run }),
    createProject: ({ name, teamId }) => apiJson([
      '-X', 'POST', '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({ name }), `${API}/v11/projects${teamQuery(teamId)}`,
    ]),
    getDeployment: ({ deploymentId, teamId }) =>
      apiJson([`${API}/v13/deployments/${enc(deploymentId)}${teamQuery(teamId)}`]),
  };
}

/** Production `io`: prompts on stdin/stdout via readline, output to stdout. */
export function makeStdio() {
  return {
    print: (text) => process.stdout.write(text),
    ask: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

// Kept in step with config-resolve.mjs: comparing physical paths because this
// file is reachable through symlinked plugin trees (argv[1] is the link,
// import.meta.url is resolved), plus the lexical compare for
// `--preserve-symlinks-main`. It also keeps the module importable from a test
// without running the CLI as a side effect.
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
  const io = makeStdio();
  // `makeDeps` (not a built `deps`) is passed so main constructs the real deps
  // LAZILY — only when it actually provisions, past --help / a no-op / a decline.
  // Building them here would read the Vercel token before main runs, and that
  // throw would land OUTSIDE the catch below (argument evaluation precedes the
  // call) and surface as a raw stack trace on the commonest first-run condition.
  main({ argv: process.argv.slice(2), io, makeDeps: makeDefaultDeps })
    .then((code) => { process.exitCode = code; })
    .catch((err) => {
      // A known, user-facing failure prints cleanly and exits 1; anything else is
      // a bug and must surface as a real stack trace, never as "fix your input".
      if (err instanceof SetupError || err instanceof VercelProtectError || err instanceof ConfigError) {
        process.stderr.write(`${SELF}: ${err.message}\n`);
        process.exitCode = 1;
      } else {
        throw err;
      }
    });
}
