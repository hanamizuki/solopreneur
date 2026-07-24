/**
 * Tests for scripts/vercel-protect.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs
 *   (`node --test tests/` does not work on Node >= 22.6 — see config.md.)
 *
 * Unlike the config-* suites, these import the module and call it directly:
 * the whole contract is the exported functions over an injected `deps`, so a
 * fake `deps` is the natural seam. Every case injects one — there is ZERO real
 * network and zero filesystem access. The fakes model the Gate A behaviors the
 * module exists to survive (a PATCH echo that lies, a rejected PATCH that nulls
 * protection), so the assertions prove the module believes the GET, not the
 * PATCH response.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotSsoProtection,
  ensureProtected,
  removeBareDomain,
  verifyEntryProtected,
  inventoryProject,
  makeDefaultDeps,
  VercelProtectError,
  LEGACY_PROTECTION,
  WEAKER_PROTECTION,
} from '../scripts/vercel-protect.mjs';

/**
 * A fake `deps` for the ssoProtection functions. The stored value is scriptable:
 * `onPatch(current, requested)` returns what the project should hold AFTER a
 * PATCH — default is "the PATCH takes". `echo` overrides the PATCH RESPONSE body
 * so a test can make the echo disagree with the stored value on purpose. Every
 * GET and PATCH is recorded so order and arguments can be asserted.
 */
function ssoFake({ current = LEGACY_PROTECTION, onPatch, echo } = {}) {
  const state = { value: current };
  const patched = [];
  let gets = 0;
  return {
    patched,
    get getCount() { return gets; },
    getProject: async () => {
      gets += 1;
      return {
        ssoProtection: state.value === null ? null : { deploymentType: state.value },
        targets: {},
      };
    },
    patchSsoProtection: async ({ deploymentType }) => {
      patched.push(deploymentType);
      state.value = onPatch ? onPatch(state.value, deploymentType) : deploymentType;
      const echoed = echo !== undefined ? echo : state.value;
      return { ssoProtection: echoed === null ? null : { deploymentType: echoed } };
    },
  };
}

const args = { projectId: 'prj_demo', teamId: 'team_demo' };

// --- snapshotSsoProtection --------------------------------------------------

test('snapshotSsoProtection returns the current deploymentType via GET', async () => {
  const deps = ssoFake({ current: LEGACY_PROTECTION });
  assert.equal(await snapshotSsoProtection({ ...args, deps }), LEGACY_PROTECTION);
  assert.equal(deps.getCount, 1);
});

test('snapshotSsoProtection returns null when ssoProtection is off', async () => {
  const deps = ssoFake({ current: null });
  assert.equal(await snapshotSsoProtection({ ...args, deps }), null);
});

// --- ensureProtected: happy paths ------------------------------------------

test('ensureProtected sets the legacy enum and verifies it with a fresh GET', async () => {
  const deps = ssoFake({ current: null }); // fresh/naked project, PATCH takes
  await ensureProtected({ ...args, deps });
  assert.deepEqual(deps.patched, [LEGACY_PROTECTION]);
  // snapshot GET + verify GET — the verify GET is what makes success real.
  assert.ok(deps.getCount >= 2, `expected a verify GET after the PATCH, saw ${deps.getCount}`);
});

test('ensureProtected on an already-protected project is idempotent success', async () => {
  const deps = ssoFake({ current: LEGACY_PROTECTION });
  await ensureProtected({ ...args, deps });
  assert.deepEqual(deps.patched, [LEGACY_PROTECTION]);
});

// --- ensureProtected: the trust rules --------------------------------------

test('ensureProtected believes the GET, not the PATCH echo', async () => {
  // The PATCH echoes success (the legacy value) but the stored state stays at a
  // different value, and the verifying GET reveals it. The module must throw.
  const deps = ssoFake({
    current: WEAKER_PROTECTION,
    onPatch: (cur) => cur, // the PATCH does not actually change anything
    echo: LEGACY_PROTECTION, // ...but it echoes back the value we asked for
  });
  await assert.rejects(
    ensureProtected({ ...args, deps }),
    (err) => err instanceof VercelProtectError
      && /not trusted/.test(err.message)
      && err.message.includes(WEAKER_PROTECTION), // the real GET value is surfaced
  );
});

test('ensureProtected restores the snapshot and throws when the PATCH nulls it', async () => {
  // Gate A fact 2: the PATCH is rejected and clears protection to null. A
  // distinct snapshot value makes the restore PATCH unambiguous.
  const snapshot = WEAKER_PROTECTION;
  const deps = ssoFake({
    current: snapshot,
    onPatch: (cur, req) => (req === LEGACY_PROTECTION ? null : req), // legacy → null, restore → takes
  });

  await assert.rejects(
    ensureProtected({ ...args, deps }),
    (err) => err instanceof VercelProtectError && /could not protect/.test(err.message),
  );
  // First the attempt to set legacy, then a restore PATCH carrying the snapshot.
  assert.deepEqual(deps.patched, [LEGACY_PROTECTION, snapshot]);
  // Fail-closed outcome: the project is left with a value, never null.
  assert.equal(await snapshotSsoProtection({ ...args, deps }), snapshot);
});

test('ensureProtected refuses the documented weaker enum, without any I/O', async () => {
  const deps = ssoFake();
  await assert.rejects(
    ensureProtected({ ...args, deps, deploymentType: WEAKER_PROTECTION }),
    (err) => err instanceof VercelProtectError && /WEAKER/.test(err.message),
  );
  assert.deepEqual(deps.patched, [], 'a refusal must not touch the project');
  assert.equal(deps.getCount, 0);
});

test('ensureProtected refuses any non-legacy enum such as "all"', async () => {
  const deps = ssoFake();
  await assert.rejects(
    ensureProtected({ ...args, deps, deploymentType: 'all' }),
    (err) => err instanceof VercelProtectError && /refusing to set/.test(err.message),
  );
  assert.deepEqual(deps.patched, []);
});

// --- removeBareDomain -------------------------------------------------------

test('removeBareDomain tolerates a 404 as success and targets <project>.vercel.app', async () => {
  const seen = [];
  const deps = { deleteDomain: async ({ domain }) => { seen.push(domain); return { status: 404 }; } };
  const result = await removeBareDomain({ ...args, project: 'demo-previews', deps });
  assert.deepEqual(seen, ['demo-previews.vercel.app']);
  assert.equal(result.removed, false); // already absent
  assert.equal(result.status, 404);
});

test('removeBareDomain reports a 2xx removal', async () => {
  const deps = { deleteDomain: async () => ({ status: 200 }) };
  const result = await removeBareDomain({ ...args, project: 'demo-previews', deps });
  assert.equal(result.removed, true);
});

test('removeBareDomain throws on an unexpected status', async () => {
  const deps = { deleteDomain: async () => ({ status: 500 }) };
  await assert.rejects(
    removeBareDomain({ ...args, project: 'demo-previews', deps }),
    (err) => err instanceof VercelProtectError && /status 500/.test(err.message),
  );
});

// --- verifyEntryProtected (fail-closed) ------------------------------------

test('verifyEntryProtected returns true for a 302 SSO redirect and for a 401', async () => {
  for (const status of [302, 401]) {
    const deps = { probe: async () => ({ status }) };
    assert.equal(await verifyEntryProtected('https://x.vercel.app', { deps }), true, `status ${status}`);
  }
});

test('verifyEntryProtected returns false for 200 and every other status (fail closed)', async () => {
  for (const status of [200, 0, 403, 404, 500, 307]) {
    const deps = { probe: async () => ({ status }) };
    assert.equal(await verifyEntryProtected('https://x.vercel.app', { deps }), false, `status ${status}`);
  }
});

// --- inventoryProject -------------------------------------------------------

test('inventoryProject surfaces a populated project distinctly', async () => {
  const deps = {
    getProject: async () => ({ targets: { production: { id: 'dpl_live' } } }),
    listDomains: async () => [{ name: 'demo.example.com' }],
  };
  const inv = await inventoryProject({ ...args, deps });
  assert.equal(inv.productionDeploymentId, 'dpl_live');
  assert.equal(inv.domains.length, 1);
});

test('inventoryProject reports an empty project as empty', async () => {
  const deps = {
    getProject: async () => ({ targets: {} }), // no production deployment
    listDomains: async () => [],
  };
  const inv = await inventoryProject({ ...args, deps });
  assert.equal(inv.productionDeploymentId, null);
  assert.deepEqual(inv.domains, []);
});

// --- makeDefaultDeps: token never reaches argv (security) -------------------

test('makeDefaultDeps passes the token via curl stdin config, never in argv', async () => {
  const seen = [];
  const run = (argv, input) => {
    seen.push({ argv, input });
    return { status: 0, stdout: `{"ssoProtection":{"deploymentType":"${LEGACY_PROTECTION}"}}`, stderr: '', error: null };
  };
  const deps = makeDefaultDeps({ token: 'SUPER-SECRET-TOKEN', run });
  await deps.getProject({ projectId: 'prj_demo', teamId: 'team_demo' });

  const call = seen.at(-1);
  assert.ok(!call.argv.some((a) => a.includes('SUPER-SECRET-TOKEN')), `token leaked into argv: ${JSON.stringify(call.argv)}`);
  assert.ok(call.input.includes('SUPER-SECRET-TOKEN'), 'token must be passed via stdin config');
  assert.ok(call.argv.includes('--config'), 'curl must read the auth header from a config on stdin');
  // A team-scoped id becomes a query param; a personal scope would not.
  assert.ok(call.argv.some((a) => a.includes('teamId=team_demo')), 'teamId query param missing');
});

test('makeDefaultDeps probe is anonymous (no token) and fails closed on curl error', async () => {
  const seen = [];
  const run = (argv, input) => {
    seen.push({ argv, input });
    return { status: 7, stdout: '', stderr: 'connection refused', error: null }; // curl transport failure
  };
  const deps = makeDefaultDeps({ token: 'SUPER-SECRET-TOKEN', run });
  const { status } = await deps.probe('https://demo.vercel.app');
  assert.equal(status, 0, 'a failed probe must report a non-protected status, never throw');
  const call = seen.at(-1);
  assert.equal(call.input, '', 'the anonymous probe must not send the auth config');
  assert.ok(!call.argv.includes('--config'), 'the probe must not read the auth token');
  assert.ok(!call.argv.includes('-L'), 'the probe must not follow redirects (it observes the 302 itself)');
});
