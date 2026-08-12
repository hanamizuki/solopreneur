/**
 * Hermetic tests for the Codex agent reconciler.
 *
 * Each case invokes the real script with the system /bin/bash. On macOS this
 * is Bash 3.2, which makes the suite a regression gate against Bash 4-only
 * constructs. The `codex` executable is a fixture that returns a controlled
 * plugin listing; no login, model call, or network access is used.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('../scripts/install-codex-agents.sh', import.meta.url),
);
const MARKER = '# solopreneur-managed-agent v2 plugin=marketer agent=marketer';

function agentToml({ marker = MARKER, name = 'marketer', instructions = 'Do useful marketing work.' } = {}) {
  return `${marker}\nname = "${name}"\ndescription = "Marketing specialist."\ndeveloper_instructions = '''\n${instructions}\n'''\n`;
}

async function executable(path, contents) {
  await writeFile(path, contents, 'utf8');
  await chmod(path, 0o755);
}

async function fixture(t, prefix = 'solopreneur-codex-bootstrap-') {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const codexHome = join(root, 'home', '.codex');
  const bin = join(root, 'bin');
  const listing = join(root, 'plugin-list.json');
  await mkdir(bin, { recursive: true });
  await writeFile(listing, JSON.stringify({ installed: [], available: [] }), 'utf8');
  await executable(
    join(bin, 'codex'),
    `#!/bin/sh
if [ "$1" = "plugin" ] && [ "$2" = "list" ] && [ "$3" = "--json" ]; then
  if [ -n "$CODEX_STUB_FAIL" ]; then
    exit 23
  fi
  /bin/cat "$CODEX_STUB_LISTING"
  exit 0
fi
exit 64
`,
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, codexHome, bin, listing };
}

function entry({
  marketplaceName = 'solopreneur',
  name = 'marketer',
  version = '0.0.10',
  enabled = true,
} = {}) {
  return { name, marketplaceName, version, enabled, installed: true };
}

async function setListing(f, entries) {
  await writeFile(
    f.listing,
    JSON.stringify({ installed: entries, available: [] }),
    'utf8',
  );
}

function cacheAgentPath(f, item = entry(), filename = `${item.name}.toml`) {
  return join(
    f.codexHome,
    'plugins',
    'cache',
    item.marketplaceName,
    item.name,
    item.version,
    'agents',
    filename,
  );
}

async function addCacheAgent(f, item = entry(), contents = agentToml()) {
  const path = cacheAgentPath(f, item);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
  return path;
}

function run(f, extraEnv = {}) {
  return spawnSync('/bin/bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: join(f.root, 'home'),
      CODEX_HOME: f.codexHome,
      CODEX_STUB_LISTING: f.listing,
      PATH: `${f.bin}:${process.env.PATH}`,
      ...extraEnv,
    },
  });
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

test('fresh install is byte-identical and the second run is unchanged', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  const source = await addCacheAgent(f, item);
  const destination = join(f.codexHome, 'agents', 'marketer.toml');

  const first = run(f);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Installed:\s+marketer\.toml/);
  assert.equal(await readFile(destination, 'utf8'), await readFile(source, 'utf8'));
  assert.equal((await stat(destination)).mode & 0o777, 0o600);

  const before = (await stat(destination)).mtimeMs;
  const second = run(f);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Unchanged:\s+marketer\.toml/);
  assert.equal((await stat(destination)).mtimeMs, before);
});

test('a byte-identical destination with unsafe mode is atomically repaired', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const destination = join(f.codexHome, 'agents', 'marketer.toml');
  assert.equal(run(f).status, 0);
  await chmod(destination, 0o666);

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Updated:\s+marketer\.toml/);
  assert.equal((await stat(destination)).mode & 0o777, 0o600);
});

test('a changed managed source atomically updates the managed destination', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  const source = await addCacheAgent(f, item);
  assert.equal(run(f).status, 0);

  await writeFile(source, agentToml({ instructions: 'Use the revised brief.' }), 'utf8');
  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Updated:\s+marketer\.toml/);
  assert.equal(
    await readFile(join(f.codexHome, 'agents', 'marketer.toml'), 'utf8'),
    await readFile(source, 'utf8'),
  );
});

test('a same-name hand-authored destination is never overwritten', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const destination = join(f.codexHome, 'agents', 'marketer.toml');
  await mkdir(dirname(destination), { recursive: true });
  const manual = 'name = "marketer"\n# solopreneur-managed-agent v2 appears only in the body\n';
  await writeFile(destination, manual, 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipped:\s+marketer\.toml/);
  assert.equal(await readFile(destination, 'utf8'), manual);
});

test('a managed marker with the wrong destination identity is never overwritten', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const destination = join(f.codexHome, 'agents', 'marketer.toml');
  await mkdir(dirname(destination), { recursive: true });
  const tampered = agentToml({ name: 'designer' });
  await writeFile(destination, tampered, 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipped:\s+marketer\.toml/);
  assert.doesNotMatch(result.stdout, /Updated:\s+marketer\.toml/);
  assert.equal(await readFile(destination, 'utf8'), tampered);
});

test('a managed marker with malformed destination TOML is never overwritten', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const destination = join(f.codexHome, 'agents', 'marketer.toml');
  await mkdir(dirname(destination), { recursive: true });
  const tampered = `${MARKER}\nname = [\n`;
  await writeFile(destination, tampered, 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipped:\s+marketer\.toml/);
  assert.doesNotMatch(result.stdout, /Updated:\s+marketer\.toml/);
  assert.equal(await readFile(destination, 'utf8'), tampered);
});

test('a destination symlink and its target remain untouched', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  const target = join(f.root, 'outside.toml');
  const destination = join(agents, 'marketer.toml');
  await mkdir(agents, { recursive: true });
  await writeFile(target, 'outside content\n', 'utf8');
  await symlink(target, destination);

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /destination is a symlink/);
  assert.equal(await readFile(target, 'utf8'), 'outside content\n');
  assert.equal((await lstat(destination)).isSymbolicLink(), true);
});

test('a different-filename agent symlink fails closed before installation', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  const target = join(f.root, 'outside-agent.toml');
  await mkdir(agents, { recursive: true });
  await writeFile(target, 'name = "marketer"\n', 'utf8');
  await symlink(target, join(agents, 'custom.toml'));

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing agent candidate is a symlink/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
  assert.equal(await readFile(target, 'utf8'), 'name = "marketer"\n');
});

test('a different-filename non-regular TOML path fails closed', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(join(agents, 'opaque.toml'), { recursive: true });

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing agent candidate is not a regular file/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a different filename declaring the same TOML identity blocks installation', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(join(agents, 'my-marketer.toml'), 'name = "marketer"\n', 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already declares name=marketer/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a nested hand-authored identity blocks installation', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(join(agents, 'team'), { recursive: true });
  await writeFile(join(agents, 'team', 'custom.toml'), 'name = "marketer"\n', 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /team\/custom\.toml already declares name=marketer/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a hidden hand-authored TOML file blocks installation', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(join(agents, '.custom.toml'), 'name = "marketer"\n', 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\.custom\.toml already declares name=marketer/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('an agent in a hidden directory blocks installation', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(join(agents, '.team'), { recursive: true });
  await writeFile(join(agents, '.team', 'custom.toml'), 'name = "marketer"\n', 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\.team\/custom\.toml already declares name=marketer/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('whitespace around a hand-authored TOML name is canonicalized', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(join(agents, 'custom.toml'), 'name = "  marketer  "\n', 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already declares name=marketer/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a nested agent-file symlink fails closed without touching its target', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  const target = join(f.root, 'outside-nested.toml');
  await mkdir(join(agents, 'team'), { recursive: true });
  await writeFile(target, 'name = "marketer"\n', 'utf8');
  await symlink(target, join(agents, 'team', 'custom.toml'));

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing agent candidate is a symlink/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
  assert.equal(await readFile(target, 'utf8'), 'name = "marketer"\n');
});

test('a nested dangling agent symlink fails closed', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(join(agents, 'team'), { recursive: true });
  await symlink(join(f.root, 'missing.toml'), join(agents, 'team', 'custom.toml'));

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing agent candidate is a symlink/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a nested directory symlink fails closed without traversing it', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  const outside = join(f.root, 'outside-agent-dir');
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, 'custom.toml'), 'name = "marketer"\n', 'utf8');
  await mkdir(agents, { recursive: true });
  await symlink(outside, join(agents, 'linked-team'));

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing agent candidate is a symlink/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a nested symlink cycle is rejected instead of traversed', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(join(agents, 'cycle'), { recursive: true });
  await symlink(agents, join(agents, 'cycle', 'back'));

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing agent candidate is a symlink/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('an earlier identity conflict cannot mask a later unsafe tree path', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(join(agents, 'a-conflict.toml'), 'name = "marketer"\n', 'utf8');
  await symlink(join(f.root, 'missing'), join(agents, 'z-unsafe'));

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing agent candidate is a symlink/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a nested non-regular TOML path fails closed', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(join(agents, 'team', 'opaque.toml'), { recursive: true });

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing agent candidate is not a regular file/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a single-quoted hand-authored identity also blocks installation', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(join(agents, 'custom.toml'), "name = 'marketer'\n", 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already declares name=marketer/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a multiline-literal hand-authored identity also blocks installation', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(join(agents, 'custom.toml'), "name = '''marketer'''\n", 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already declares name=marketer/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a TOML 1.1 hex-escaped hand-authored identity safely blocks installation', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(
    join(agents, 'custom.toml'),
    'name = "marke\\x74er"\ndescription = "Custom."\ndeveloper_instructions = "Stay custom."\n',
    'utf8',
  );

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already declares name=marketer/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a quoted name key in a hand-authored agent safely blocks installation', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(
    join(agents, 'custom.toml'),
    '"name" = "marketer"\ndescription = "Custom."\ndeveloper_instructions = "Stay custom."\n',
    'utf8',
  );

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already declares name=marketer/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a multiline basic-string identity safely blocks installation', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(
    join(agents, 'custom.toml'),
    'name = """marketer"""\ndescription = "Custom."\ndeveloper_instructions = "Stay custom."\n',
    'utf8',
  );

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already declares name=marketer/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('only a root name participates in hand-authored identity conflicts', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(
    join(agents, 'custom.toml'),
    'name = "analyst"\ndescription = "Custom."\ndeveloper_instructions = "Stay custom."\n[metadata]\nname = "marketer"\n',
    'utf8',
  );

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed:\s+marketer\.toml/);
  assert.equal(await exists(join(agents, 'marketer.toml')), true);
});

test('malformed hand-authored TOML fails closed before installation', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(join(agents, 'custom.toml'), 'name = [\n', 'utf8');

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot validate existing agent identity/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('duplicate hand-authored identity keys fail closed before installation', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(
    join(agents, 'custom.toml'),
    'name = "marketer"\nname = "marketer"\n',
    'utf8',
  );

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot validate existing agent identity/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('a base config role collision blocks a fresh agents-directory install', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  await writeFile(
    join(f.codexHome, 'config.toml'),
    '[agents.marketer]\ndescription = "Hand-authored marketer."\n',
    'utf8',
  );

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /config\.toml \[agents\.marketer\] already declares name=marketer/);
  assert.equal(await exists(join(f.codexHome, 'agents', 'marketer.toml')), false);
});

test('a base config collision cannot mask an unsafe user-agent tree', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  await writeFile(
    join(f.codexHome, 'config.toml'),
    '[agents.marketer]\ndescription = "Hand-authored marketer."\n',
    'utf8',
  );
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await symlink(join(f.root, 'missing'), join(agents, 'unsafe'));

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing agent candidate is a symlink/);
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
});

test('known scalar agent settings are not mistaken for declared roles', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  await writeFile(
    join(f.codexHome, 'config.toml'),
    '[agents]\nenabled = true\nmax_threads = 6\nmax_depth = 1\n',
    'utf8',
  );

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed:\s+marketer\.toml/);
});

test('base config role table keys are not whitespace-normalized by Codex', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  await writeFile(
    join(f.codexHome, 'config.toml'),
    '[agents." marketer "]\ndescription = "A distinct role."\n',
    'utf8',
  );

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed:\s+marketer\.toml/);
});

test('a declared config_file name overrides its table key after trimming', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const declared = join(f.codexHome, 'declared', 'custom.toml');
  await mkdir(dirname(declared), { recursive: true });
  await writeFile(
    declared,
    'name = "  marketer  "\ndescription = "Declared."\ndeveloper_instructions = "Stay custom."\n',
    'utf8',
  );
  await writeFile(
    join(f.codexHome, 'config.toml'),
    '[agents.custom]\ndescription = "Declared."\nconfig_file = "./declared/custom.toml"\n',
    'utf8',
  );

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /config\.toml \[agents\.custom\] already declares name=marketer/);
  assert.equal(await exists(join(f.codexHome, 'agents', 'marketer.toml')), false);
});

test('a config_file identity can replace a marketer table-key identity', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const declared = join(f.codexHome, 'declared', 'analyst.toml');
  await mkdir(dirname(declared), { recursive: true });
  await writeFile(
    declared,
    'name = "analyst"\ndescription = "Declared."\ndeveloper_instructions = "Stay analytical."\n',
    'utf8',
  );
  await writeFile(
    join(f.codexHome, 'config.toml'),
    '[agents.marketer]\ndescription = "Declared."\nconfig_file = "./declared/analyst.toml"\n',
    'utf8',
  );

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed:\s+marketer\.toml/);
});

test('a declared config_file is excluded from recursive file discovery', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const agents = join(f.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(
    join(agents, 'custom.toml'),
    'description = "Declared."\ndeveloper_instructions = "Stay custom."\n',
    'utf8',
  );
  await writeFile(
    join(f.codexHome, 'config.toml'),
    '[agents.custom]\ndescription = "Declared."\nconfig_file = "./agents/custom.toml"\n',
    'utf8',
  );

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed:\s+marketer\.toml/);
});

test('malformed base config fails closed before creating a destination', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  await writeFile(join(f.codexHome, 'config.toml'), '[agents.marketer\n', 'utf8');

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid agent TOML .*config\.toml/);
  assert.equal(await exists(join(f.codexHome, 'agents', 'marketer.toml')), false);
});

test('a symlinked base config fails closed without following its target', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const outside = join(f.root, 'outside-config.toml');
  await writeFile(outside, '[agents.marketer]\ndescription = "Outside."\n', 'utf8');
  await symlink(outside, join(f.codexHome, 'config.toml'));

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Codex base config is a symlink/);
  assert.equal(await exists(join(f.codexHome, 'agents', 'marketer.toml')), false);
  assert.match(await readFile(outside, 'utf8'), /Outside/);
});

test('a symlinked declared config_file fails closed', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const outside = join(f.root, 'outside-role.toml');
  const declaredDir = join(f.codexHome, 'declared');
  await mkdir(declaredDir, { recursive: true });
  await writeFile(outside, 'name = "marketer"\n', 'utf8');
  await symlink(outside, join(declaredDir, 'custom.toml'));
  await writeFile(
    join(f.codexHome, 'config.toml'),
    '[agents.custom]\ndescription = "Declared."\nconfig_file = "./declared/custom.toml"\n',
    'utf8',
  );

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /agent file is unsafe/);
  assert.equal(await exists(join(f.codexHome, 'agents', 'marketer.toml')), false);
});

test('a dangling declared config_file fails closed', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  await writeFile(
    join(f.codexHome, 'config.toml'),
    '[agents.custom]\ndescription = "Declared."\nconfig_file = "./missing.toml"\n',
    'utf8',
  );

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /agent file is unsafe/);
  assert.equal(await exists(join(f.codexHome, 'agents', 'marketer.toml')), false);
});

test('a non-regular declared config_file fails closed', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  await mkdir(join(f.codexHome, 'declared.toml'), { recursive: true });
  await writeFile(
    join(f.codexHome, 'config.toml'),
    '[agents.custom]\ndescription = "Declared."\nconfig_file = "./declared.toml"\n',
    'utf8',
  );

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /agent candidate is not a regular file/);
  assert.equal(await exists(join(f.codexHome, 'agents', 'marketer.toml')), false);
});

test('a disabled plugin leaves its managed destination inactive and orphaned', async (t) => {
  const f = await fixture(t);
  const item = entry({ enabled: false });
  await setListing(f, [item]);
  await addCacheAgent(f, item, agentToml({ instructions: 'New instructions.' }));
  const destination = join(f.codexHome, 'agents', 'marketer.toml');
  await mkdir(dirname(destination), { recursive: true });
  const old = agentToml({ instructions: 'Old instructions.' });
  await writeFile(destination, old, 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Inactive:\s+marketer\.toml/);
  assert.equal(await readFile(destination, 'utf8'), old);
  assert.match(result.stdout, /Orphaned:\s+marketer\.toml/);
});

test('orphan reporting retains a copy referenced by base config for manual review', async (t) => {
  const f = await fixture(t);
  const item = entry({ enabled: false });
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  const destination = join(f.codexHome, 'agents', 'marketer.toml');
  await mkdir(dirname(destination), { recursive: true });
  const managed = agentToml();
  await writeFile(destination, managed, 'utf8');
  await writeFile(
    join(f.codexHome, 'config.toml'),
    '[agents.custom]\ndescription = "Still referenced."\nconfig_file = "./agents/marketer.toml"\n',
    'utf8',
  );

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Orphaned:\s+marketer\.toml/);
  assert.equal(await readFile(destination, 'utf8'), managed);
});

test('an uninstalled managed agent is reported as an orphan but retained', async (t) => {
  const f = await fixture(t);
  const destination = join(f.codexHome, 'agents', 'marketer.toml');
  await mkdir(dirname(destination), { recursive: true });
  const contents = agentToml();
  await writeFile(destination, contents, 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Orphaned:\s+marketer\.toml/);
  assert.equal(await readFile(destination, 'utf8'), contents);
});

test('an uninstalled tampered managed marker is suspicious, never orphaned', async (t) => {
  const f = await fixture(t);
  const destination = join(f.codexHome, 'agents', 'marketer.toml');
  await mkdir(dirname(destination), { recursive: true });
  const tampered = agentToml({ name: 'designer' });
  await writeFile(destination, tampered, 'utf8');

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipped:\s+marketer\.toml .*ownership not proven/);
  assert.match(result.stdout, /Orphaned:\s+none/);
  assert.equal(await readFile(destination, 'utf8'), tampered);
});

test('malformed plugin JSON fails before creating the agents directory', async (t) => {
  const f = await fixture(t);
  await writeFile(f.listing, '{not-json', 'utf8');

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsupported schema/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('a missing exact-version cache fails closed before copying', async (t) => {
  const f = await fixture(t);
  await setListing(f, [entry()]);

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /installed plugin cache is missing/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('a source symlink fails closed before copying', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  const source = cacheAgentPath(f, item);
  const outside = join(f.root, 'outside-source.toml');
  await mkdir(dirname(source), { recursive: true });
  await writeFile(outside, agentToml(), 'utf8');
  await symlink(outside, source);

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /managed source is a symlink/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('a dangling source symlink also fails closed before copying', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  const source = cacheAgentPath(f, item);
  await mkdir(dirname(source), { recursive: true });
  await symlink(join(f.root, 'missing-source.toml'), source);

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /managed source is a symlink/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('a markerless source in an official plugin cache fails closed', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(
    f,
    item,
    'name = "marketer"\ndescription = "Unmanaged."\ndeveloper_instructions = "Unmanaged."\n',
  );

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /managed source is missing its exact marker/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('a markerless source cannot make an existing managed copy look orphaned', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(
    f,
    item,
    'name = "marketer"\ndescription = "Unmanaged."\ndeveloper_instructions = "Unmanaged."\n',
  );
  const destination = join(f.codexHome, 'agents', 'marketer.toml');
  await mkdir(dirname(destination), { recursive: true });
  const managed = agentToml();
  await writeFile(destination, managed, 'utf8');

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /managed source is missing its exact marker/);
  assert.doesNotMatch(result.stdout, /Orphaned:\s+marketer\.toml/);
  assert.equal(await readFile(destination, 'utf8'), managed);
});

test('malformed source TOML fails closed before copying', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item, `${MARKER}\nname = "marketer"\ndescription = [`);

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /managed source is not valid agent TOML/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('a cache directory symlink fails closed before copying', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  const versionDir = dirname(dirname(cacheAgentPath(f, item)));
  const outside = join(f.root, 'outside-cache');
  await mkdir(join(outside, 'agents'), { recursive: true });
  await writeFile(join(outside, 'agents', 'marketer.toml'), agentToml(), 'utf8');
  await mkdir(dirname(versionDir), { recursive: true });
  await symlink(outside, versionDir);

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cache path is a symlink/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('a symlinked agents directory inside the cache fails closed', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  const agentsDir = dirname(cacheAgentPath(f, item));
  const outside = join(f.root, 'outside-agents');
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, 'marketer.toml'), agentToml(), 'utf8');
  await mkdir(dirname(agentsDir), { recursive: true });
  await symlink(outside, agentsDir);

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /managed agents directory is a symlink/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('a non-directory agents path inside the cache fails closed', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  const agentsDir = dirname(cacheAgentPath(f, item));
  await mkdir(dirname(agentsDir), { recursive: true });
  await writeFile(agentsDir, 'not a directory\n', 'utf8');

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /managed agents path is not a directory/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('duplicate installed sources fail preflight before copying', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item, item]);
  await addCacheAgent(f, item);

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /duplicate managed agent filename/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('an unrelated marketplace cannot claim the managed identity', async (t) => {
  const f = await fixture(t);
  const item = entry({ marketplaceName: 'third-party' });
  await setListing(f, [item]);
  await addCacheAgent(f, item);

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed:\s+none/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('a malformed same-name entry from another marketplace is ignored', async (t) => {
  const f = await fixture(t);
  await setListing(f, [{ name: 'marketer', marketplaceName: 'third-party' }]);

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed:\s+none/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('a symlinked plugins cache parent fails closed before copying', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  const outside = join(f.root, 'outside-plugins');
  const source = join(
    outside,
    'cache',
    item.marketplaceName,
    item.name,
    item.version,
    'agents',
    'marketer.toml',
  );
  await mkdir(dirname(source), { recursive: true });
  await writeFile(source, agentToml(), 'utf8');
  await mkdir(f.codexHome, { recursive: true });
  await symlink(outside, join(f.codexHome, 'plugins'));

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cache path is a symlink/);
  assert.equal(await exists(join(f.codexHome, 'agents')), false);
});

test('CODEX_HOME paths containing spaces work', async (t) => {
  const f = await fixture(t, 'solopreneur codex bootstrap ');
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);

  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await exists(join(f.codexHome, 'agents', 'marketer.toml')), true);
});

test('a staging copy failure leaves no destination or temporary file', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  await executable(
    join(f.bin, 'cp'),
    '#!/bin/sh\nprintf partial > "$2"\nexit 9\n',
  );

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /failed to stage a verified copy/);
  const agents = join(f.codexHome, 'agents');
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
  assert.deepEqual(await readdir(agents), []);
});

test('a nested hidden identity created while staging aborts the install', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  await executable(
    join(f.bin, 'cp'),
    [
      '#!/bin/sh',
      '/bin/cp "$1" "$2"',
      '/bin/mkdir -p "$CODEX_HOME/agents/.late"',
      'printf \'%s\\n\' \'name = "marketer"\' > "$CODEX_HOME/agents/.late/custom.toml"',
      '',
    ].join('\n'),
  );

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /user agent identity set changed while staging marketer\.toml/);
  const agents = join(f.codexHome, 'agents');
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
  assert.equal(
    await readFile(join(agents, '.late', 'custom.toml'), 'utf8'),
    'name = "marketer"\n',
  );
  assert.deepEqual(await readdir(agents), ['.late']);
});

test('a base config identity created while staging preserves the old destination', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item, agentToml({ instructions: 'New instructions.' }));
  const destination = join(f.codexHome, 'agents', 'marketer.toml');
  await mkdir(dirname(destination), { recursive: true });
  const old = agentToml({ instructions: 'Old instructions.' });
  await writeFile(destination, old, 'utf8');
  await executable(
    join(f.bin, 'cp'),
    [
      '#!/bin/sh',
      '/bin/cp "$1" "$2"',
      'printf \'%s\\n\' \'[agents.marketer]\' \'description = "Late config role."\' > "$CODEX_HOME/config.toml"',
      '',
    ].join('\n'),
  );

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /user agent identity set changed while staging marketer\.toml/);
  assert.equal(await readFile(destination, 'utf8'), old);
  assert.match(await readFile(join(f.codexHome, 'config.toml'), 'utf8'), /agents\.marketer/);
  assert.deepEqual(await readdir(join(f.codexHome, 'agents')), ['marketer.toml']);
});

test('an unsafe symlink created while staging aborts without following it', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  await executable(
    join(f.bin, 'cp'),
    [
      '#!/bin/sh',
      '/bin/cp "$1" "$2"',
      '/bin/ln -s "$CODEX_HOME/missing" "$CODEX_HOME/agents/late-link"',
      '',
    ].join('\n'),
  );

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /user agent identity set changed while staging marketer\.toml/);
  const agents = join(f.codexHome, 'agents');
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
  assert.equal((await lstat(join(agents, 'late-link'))).isSymbolicLink(), true);
  assert.deepEqual(await readdir(agents), ['late-link']);
});

test('a source name changed after preflight cannot reach the atomic rename', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  await executable(
    join(f.bin, 'cp'),
    [
      '#!/bin/sh',
      `printf '%s\\n' '${MARKER}' 'name = "designer"' 'description = "Changed."' 'developer_instructions = "Changed."' > "$1"`,
      '/bin/cp "$1" "$2"',
      '',
    ].join('\n'),
  );

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /staged agent identity changed while staging/);
  const agents = join(f.codexHome, 'agents');
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
  assert.deepEqual(await readdir(agents), []);
});

test('a source marker changed after preflight cannot reach the atomic rename', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item);
  await executable(
    join(f.bin, 'cp'),
    [
      '#!/bin/sh',
      `printf '%s\\n' '# solopreneur-managed-agent v2 plugin=designer agent=marketer' 'name = "marketer"' 'description = "Changed."' 'developer_instructions = "Changed."' > "$1"`,
      '/bin/cp "$1" "$2"',
      '',
    ].join('\n'),
  );

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /staged agent identity changed while staging/);
  const agents = join(f.codexHome, 'agents');
  assert.equal(await exists(join(agents, 'marketer.toml')), false);
  assert.deepEqual(await readdir(agents), []);
});

test('a destination identity changed while staging is not overwritten', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item, agentToml({ instructions: 'New instructions.' }));
  const destination = join(f.codexHome, 'agents', 'marketer.toml');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, agentToml({ instructions: 'Old instructions.' }), 'utf8');
  await executable(
    join(f.bin, 'cp'),
    [
      '#!/bin/sh',
      '/bin/cp "$1" "$2"',
      `printf '%s\\n' '${MARKER}' 'name = "designer"' 'description = "Tampered."' 'developer_instructions = "Tampered."' > '${destination}'`,
      '',
    ].join('\n'),
  );

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /destination identity changed while staging/);
  assert.match(await readFile(destination, 'utf8'), /name = "designer"/);
});

test('an atomic rename failure retains the previous managed destination', async (t) => {
  const f = await fixture(t);
  const item = entry();
  await setListing(f, [item]);
  await addCacheAgent(f, item, agentToml({ instructions: 'New instructions.' }));
  const destination = join(f.codexHome, 'agents', 'marketer.toml');
  await mkdir(dirname(destination), { recursive: true });
  const old = agentToml({ instructions: 'Old instructions.' });
  await writeFile(destination, old, 'utf8');
  await executable(join(f.bin, 'mv'), '#!/bin/sh\nexit 9\n');

  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /failed to atomically install/);
  assert.equal(await readFile(destination, 'utf8'), old);
});

test('the reconciler source stays within the Bash 3.2 subset', async () => {
  const source = await readFile(SCRIPT, 'utf8');
  assert.doesNotMatch(source, /\bdeclare\s+-A\b/);
  assert.doesNotMatch(source, /\bmapfile\b/);
  assert.doesNotMatch(source, /\breadarray\b/);
  assert.doesNotMatch(source, /\blocal\s+-n\b/);
  assert.doesNotMatch(source, /\$\{[^}\n]+,,\}/);
});
