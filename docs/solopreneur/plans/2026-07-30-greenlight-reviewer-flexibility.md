# Greenlight Reviewer Flexibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 greenlight 的 external reviewer 從硬編碼 login 白名單 + 純序列 fallback，改成通用 bot 偵測 + per-repo 觀測快取 + 使用者選定的 clean-pass gate。

**Architecture:** detection 的過濾/合併/決策目前寫成 inline bash 讓 LLM 每次複製執行（`greenlight/SKILL.md:1549-1586`）。這些是純資料處理，抽成兩支 Node 腳本後可測、行為一致。registry 收成純資料表（每工具一行 trigger）；所有 per-repo 事實改由觀測寫進 config 的獨立 feature key。沿用 `preview` skill 已在 CI 跑的腳本 + `node --test` 架構。

**Tech Stack:** Node.js >= 20（僅 `node:` built-ins）、`node:test` + `node:assert/strict`、`gh` CLI（由 SKILL.md 呼叫，不由腳本呼叫）、GitHub Actions。

**Spec:** `todos/backlog/2026-07-30_greenlight-reviewer-flexibility.md`（本 plan 的每個決策都在那裡有理由；有衝突時 spec 為準）

## Global Constraints

- **Node >= 20，只用 `node:` built-in 模組。** repo 全域沒有 `package.json`、沒有 lockfile、不裝任何依賴（理由見 `.github/workflows/validate-preview-tests.yml:44-49`）。
- **腳本的註解與文件字串一律英文**（repo 根有 `LICENSE`）。plan 與 todos 文件本身維持中文。
- **腳本不呼叫 `gh`、不算 repo-key、不讀 `fallback_order`。** 三者都由 SKILL.md 傳入。`fallback_order` 必須由既有的 `read_solopreneur_config greenlight` 走完整五層取得後傳進來——腳本**不重新實作五層讀取**。
- **單一 writer 原則：** 腳本獨佔 `repos[<key>].greenlight_reviewers`，shell helper 獨佔 `repos[<key>].greenlight` / `default.greenlight`。腳本永遠不寫 `greenlight` 這個 key。
- **config 毀損必須 fail closed。** 只有「檔案不存在」可視為空設定；解析失敗、權限錯誤、頂層不是物件，一律致命錯誤且**不得寫入**。
- **`--json` 是唯一機器可讀契約**（比照 `preview/scripts/config-resolve.mjs:12-15`）。
- **錯誤處理沿用既有慣例：** `process.exitCode` + 讓 process 自然結束，不用 `process.exit()`（`config-resolve.mjs:618,622`）；使用者設定問題用專屬 error 型別印訊息，真正的 bug 才 throw（`config-resolve.mjs:59`）。
- **腳本路徑一律 `"${CLAUDE_SKILL_DIR}/"scripts/x.mjs`。** 不是 `$CLAUDE_PLUGIN_ROOT`——後者是 per-plugin 而非 per-skill，且在 skill markdown 裡不會被替換（`todos/done/2026-05-16_vendored-impeccable-path-collision.md:112-114`）。引號位置照 `sync-vendored.sh:218-220` 的形式，以承受安裝路徑含空白。
- **測試必須 hermetic**：env 用**白名單**而非 spread `process.env`，且 `HOME` 指向 fixture（照 `config-resolve.test.mjs:93`）。
- **不動 post-commit mode 與 uncommitted mode。** 只改 PR mode。
- **不 bump plugin 版本**（版本只由 `/release` 動）。

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `greenlight/scripts/reviewer-registry.mjs` | 廠商知識：每工具的 trigger、handshake、poll。純資料 + 查詢，無 I/O。 |
| `greenlight/scripts/reviewer-state.mjs` | 三個 subcommand：`detect`（過濾活動樣本並判定 reviewer 資格）、`record`（觀測回寫）、`resolve`（決定這輪角色）。唯一 I/O 是 config 檔與 stdin/stdout。 |
| `greenlight/tests/reviewer-registry.test.mjs` | registry 表格完整性（fails closed）+ alias 查詢。 |
| `greenlight/tests/reviewer-state.test.mjs` | 三個 subcommand 的 CLI 契約 + config 安全。 |
| `.github/workflows/validate-greenlight-tests.yml` | CI gate。 |
| `greenlight/SKILL.md` | registry 瘦身、detection 接上腳本、選擇與 gate、loop 流程、argument token。 |
| `shared/config.md` | `greenlight_reviewers` 欄位說明 + 兩處失真 invariant。 |
| `autopilot/SKILL.md` | dispatch-time 變數。 |
| `autopilot/references/pr-subagent-template.md` | 傳遞 token，明確帶 `unattended`。 |
| `autopilot/references/schemas.md` | plan.yaml 契約，新增 optional 欄位。 |

**PR 邊界（兩個 PR）：**

- **PR 1 = Task 1–7**：腳本 + 測試 + CI + SKILL.md 的 registry/detection 接上 + config.md。上線效果：CodeRabbit 可觸發、通用偵測生效、未識別 bot 的 finding 被收。loop 終止語意**不變**（仍是現有的單一 reviewer clean），所以不引入 gate 相關風險。
- **PR 2 = Task 8–10**：選擇與 gate 互動、四個終端狀態的 loop、綁定演算法、autopilot 交接。

原計畫的三 PR 拆法已放棄：純腳本的 PR 沒有 user-facing 價值，而 PR 2 若只接一半會讓 loop 語意處於中間狀態。

---

## PR 1 — 腳本、測試與 SKILL.md 接上

### Task 1: Reviewer registry

**Files:**
- Create: `plugins/solopreneur/skills/greenlight/scripts/reviewer-registry.mjs`
- Test: `plugins/solopreneur/skills/greenlight/tests/reviewer-registry.test.mjs`

**Interfaces:**
- Consumes: 無
- Produces: `RECIPES`（key = recipe id）、`DEFAULT_POLL`、`recipeFor(idOrAlias) -> {id, ...recipe} | null`。Task 3 的 `record` 與 Task 4 的 `resolve` 只 import `recipeFor`。

- [ ] **Step 1: 寫 failing test**

`tests/reviewer-registry.test.mjs`。完整性案例必須 **fail closed**——一個打錯的 `kind` 不能讓該列跳過所有檢查：

```javascript
/**
 * Tests for scripts/reviewer-registry.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs
 *
 * The registry is pure data, so these import it directly rather than spawning a
 * CLI. The completeness cases carry the weight: they are the guard that fires
 * when someone adds a tool and forgets a field, so each one must fail closed —
 * an unrecognised `kind` must be an error, never an exemption from the checks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, DEFAULT_POLL, recipeFor } from '../scripts/reviewer-registry.mjs';

const KINDS = new Set(['github-bot', 'local-cli']);

test('recipeFor resolves a canonical id', () => {
  assert.equal(recipeFor('codex-bot').id, 'codex-bot');
  assert.equal(recipeFor('codex-bot').trigger, '@codex review');
});

test('recipeFor resolves an alias', () => {
  assert.equal(recipeFor('codex bot').id, 'codex-bot');
  assert.equal(recipeFor('cursor').id, 'bugbot');
});

test('recipeFor trims and ignores case', () => {
  assert.equal(recipeFor('  Codex Bot  ').id, 'codex-bot');
});

test('recipeFor returns null for anything unknown', () => {
  for (const input of ['nope', '', '   ', undefined, null, 42, {}]) {
    assert.equal(recipeFor(input), null, `expected null for ${JSON.stringify(input)}`);
  }
});

test('every recipe declares a known kind', () => {
  // Fails closed: a typo'd kind would otherwise exempt the row from the trigger
  // and poll checks below, which is the worst direction for a guard to fail.
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(KINDS.has(r.kind), `${id} has unknown kind ${JSON.stringify(r.kind)}`);
  }
});

test('every recipe declares a non-empty aliases array', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(Array.isArray(r.aliases), `${id}.aliases is not an array`);
  }
});

test('every recipe carries a non-empty trigger', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(r.trigger && r.trigger.trim(), `${id} has no trigger`);
  }
});

test('every github-bot carries a complete poll policy', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    if (r.kind !== 'github-bot') continue;   // local CLIs are read from stdout
    for (const field of ['firstWaitSec', 'intervalSec', 'tries']) {
      assert.equal(typeof r.poll?.[field], 'number', `${id}.poll.${field} missing`);
    }
  }
});

test('every github-bot declares a handshake', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    if (r.kind !== 'github-bot') continue;
    assert.ok(r.handshake, `${id} has no handshake`);
  }
});

test('aliases never collide with each other or with any canonical id', () => {
  const ids = new Set(Object.keys(RECIPES));
  const seen = new Map();
  for (const [id, r] of Object.entries(RECIPES)) {
    for (const a of r.aliases) {
      assert.ok(!ids.has(a) || a === id, `alias "${a}" shadows canonical id "${a}"`);
      assert.ok(!seen.has(a), `alias "${a}" claimed by both ${seen.get(a)} and ${id}`);
      seen.set(a, id);
    }
  }
});

test('the three newly added tools use the default poll policy', () => {
  for (const id of ['coderabbit', 'bugbot', 'greptile']) {
    assert.ok(RECIPES[id], `${id} missing from registry`);
    assert.equal(RECIPES[id].handshake, 'none');
    // deepEqual on a distinct copy: if the rows shared the DEFAULT_POLL object
    // by reference this would compare an object to itself and never fail.
    assert.notEqual(RECIPES[id].poll, DEFAULT_POLL, `${id}.poll must be a copy`);
    assert.deepEqual(RECIPES[id].poll, DEFAULT_POLL);
  }
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/reviewer-registry.test.mjs
```

Expected: FAIL — `Cannot find module '../scripts/reviewer-registry.mjs'`

- [ ] **Step 3: 寫實作**

`scripts/reviewer-registry.mjs`：

```javascript
/**
 * The reviewer registry: vendor knowledge only.
 *
 * Requires Node.js >= 20. No I/O, no dependencies — pure data plus lookup.
 *
 * What belongs here: facts identical for every user of a tool — the comment
 * that triggers it, whether it acknowledges a trigger, how long to wait. What
 * must NOT be here: anything varying per repo or per user.
 *
 * There is deliberately no bot-login field. A tool's GitHub login cannot be
 * known from outside: probing found `cursor[bot]`, `cursor-com[bot]` and
 * `bugbot[bot]` to all be real accounts, and GitHub Copilot posts as `Copilot`
 * with no `[bot]` suffix. Logins are observed at trigger time and cached per
 * repo by reviewer-state.mjs.
 *
 * Nor is there an auto-review field. Whether a tool reviews automatically is a
 * per-user setting (Bugbot exposes it in Cursor's personal settings;
 * `@coderabbitai pause` turns CodeRabbit's off), invisible from the repo. It is
 * observed, not declared.
 *
 * Adding a tool is one row whose only required thought is the trigger string:
 * `handshake: 'none'` plus a copy of DEFAULT_POLL is the safe fallback, proven
 * by the `gemini` row which has never had a handshake.
 */

/**
 * Fallback timing for a tool whose acknowledgement behaviour is unverified.
 * Spread into each row rather than shared by reference — sharing would make
 * `deepEqual(row.poll, DEFAULT_POLL)` compare an object to itself.
 */
export const DEFAULT_POLL = Object.freeze({ firstWaitSec: 180, intervalSec: 120, tries: 3 });

export const RECIPES = {
  'codex-bot': {
    aliases: ['codex bot'],
    kind: 'github-bot',
    trigger: '@codex review',
    handshake: 'reaction',            // verified: 👀 on the triggering comment
    poll: { firstWaitSec: 60, intervalSec: 60, tries: 20 },
  },
  gemini: {
    aliases: ['gemini'],
    kind: 'github-bot',
    trigger: '/gemini review',
    handshake: 'none',
    poll: { firstWaitSec: 180, intervalSec: 120, tries: 2 },
  },
  coderabbit: {
    aliases: ['coderabbit'],
    kind: 'github-bot',
    trigger: '@coderabbitai review',  // `full review` re-reviews from scratch
    handshake: 'none',
    poll: { ...DEFAULT_POLL },
  },
  bugbot: {
    aliases: ['bugbot', 'cursor'],
    kind: 'github-bot',
    trigger: 'bugbot run',            // top-level comment only
    handshake: 'none',
    poll: { ...DEFAULT_POLL },
  },
  greptile: {
    aliases: ['greptile'],
    kind: 'github-bot',
    trigger: '@greptileai',
    handshake: 'none',
    poll: { ...DEFAULT_POLL },
  },
  'codex-cli': {
    aliases: ['codex cli'],
    kind: 'local-cli',
    trigger: 'codex review --base',
    handshake: 'stdout',
  },
  agy: {
    aliases: ['agy'],
    kind: 'local-cli',
    trigger: 'agy --print',
    handshake: 'stdout-marker',
  },
};

/**
 * Resolve a canonical id or user-typed alias to its recipe.
 * Returns the recipe with `id` attached, or null when nothing matches.
 */
export function recipeFor(idOrAlias) {
  if (typeof idOrAlias !== 'string') return null;
  const needle = idOrAlias.trim().toLowerCase();
  if (!needle) return null;
  for (const [id, recipe] of Object.entries(RECIPES)) {
    if (id === needle || recipe.aliases.includes(needle)) return { id, ...recipe };
  }
  return null;
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/reviewer-registry.test.mjs
```

Expected: PASS，11 個 test 全綠

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/scripts/reviewer-registry.mjs \
        plugins/solopreneur/skills/greenlight/tests/reviewer-registry.test.mjs
git commit -m "feat(greenlight): add reviewer registry as pure data with lookup"
```

---

### Task 2: `detect` — 過濾活動樣本並判定 reviewer 資格

**Files:**
- Create: `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs`
- Test: `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs`

**Interfaces:**
- Consumes: 無
- Produces: CLI `reviewer-state.mjs detect`。stdin 吃四欄 TSV `login<TAB>type<TAB>iso<TAB>source`，`source` ∈ `conversation` / `review-comment` / `formal-review`。stdout 印 `{"bots":[{"login","lastSeen","evidence"}]}`，依 login 排序。`evidence` 為布林——只有 `review-comment` 或 `formal-review` 算 reviewer 證據。

**背景：** 這取代 `SKILL.md:1577-1582` 的 awk + jq pipeline。兩個行為變更：過濾條件從三筆硬編碼 login 改成 `type == "Bot"`；並保留證據來源，因為 `type == "Bot"` 認的是自動化而非 review 能力——dependabot / CI bot / release bot 全都是 `Bot`，而它們只出現在 conversation channel。

- [ ] **Step 1: 寫 failing test**

`tests/reviewer-state.test.mjs`：

```javascript
/**
 * Tests for scripts/reviewer-state.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs
 *
 * Every case spawns the real CLI so the contract under test is the one callers
 * depend on: exit code, stdout shape, and what lands in the config file. The
 * environment is an allowlist, not a copy of the developer's — HOME points at a
 * fixture and CLAUDE_CONFIG_DIR is always explicit, so a real ~/.claude config
 * can neither leak in nor be written to.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'reviewer-state.mjs',
);

const fixtures = [];
after(() => {
  for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true });
});

/** A fresh dir. realpath'd because macOS tmpdir sits under a /var symlink. */
function tmpDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gl-state-')));
  fixtures.push(dir);
  return dir;
}

/** A config dir holding solopreneur.json. Pass a string to write it verbatim. */
function tmpConfigDir(config) {
  const dir = tmpDir();
  if (config !== undefined) {
    fs.writeFileSync(
      path.join(dir, 'solopreneur.json'),
      typeof config === 'string' ? config : `${JSON.stringify(config, null, 2)}\n`,
    );
  }
  return dir;
}

function run(args, { stdin = '', configDir } = {}) {
  const home = tmpDir();
  const res = spawnSync(process.execPath, [SCRIPT, ...args], {
    input: stdin,
    encoding: 'utf8',
    // Allowlist, not { ...process.env }: an inherited NODE_OPTIONS or a real
    // CLAUDE_CONFIG_DIR would silently change what these assertions mean.
    env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: configDir ?? tmpDir() },
  });
  return { code: res.status, signal: res.signal, stdout: res.stdout, stderr: res.stderr };
}

/** Failure contract: clean exit 1, message on stderr, nothing on stdout. */
function assertFailed({ code, signal, stdout, stderr }, pattern) {
  assert.equal(signal, null, 'must not die on a signal');
  assert.equal(code, 1);
  assert.equal(stdout, '', 'stdout is the machine contract; it must stay clean on failure');
  assert.match(stderr, pattern);
}

const TSV = (rows) => rows.map((r) => r.join('\t')).join('\n');
const REVIEW = 'review-comment';
const FORMAL = 'formal-review';
const CHAT = 'conversation';

test('detect keeps only Bot authors', () => {
  const { code, stdout } = run(['detect'], {
    stdin: TSV([
      ['hanamizuki', 'User', '2026-07-29T10:00:00Z', REVIEW],
      ['coderabbitai[bot]', 'Bot', '2026-07-29T11:00:00Z', REVIEW],
    ]),
  });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout).bots, [
    { login: 'coderabbitai[bot]', lastSeen: '2026-07-29T11:00:00Z', evidence: true },
  ]);
});

test('detect keeps a Bot whose login has no [bot] suffix', () => {
  // GitHub Copilot code review posts as login `Copilot`, type Bot. The old
  // allowlist comment asserted every bot login carries the suffix; this case is
  // why detection keys on `type`, never on the name.
  const { stdout } = run(['detect'], {
    stdin: TSV([['Copilot', 'Bot', '2026-07-29T11:00:00Z', FORMAL]]),
  });
  assert.equal(JSON.parse(stdout).bots[0].login, 'Copilot');
});

test('detect marks a conversation-only bot as lacking review evidence', () => {
  // dependabot shape: it writes PR descriptions and issue comments, never
  // inline review comments. It must not become a reviewer candidate.
  const { stdout } = run(['detect'], {
    stdin: TSV([['dependabot[bot]', 'Bot', '2026-07-29T11:00:00Z', CHAT]]),
  });
  assert.deepEqual(JSON.parse(stdout).bots, [
    { login: 'dependabot[bot]', lastSeen: '2026-07-29T11:00:00Z', evidence: false },
  ]);
});

test('detect treats a formal review as evidence', () => {
  const { stdout } = run(['detect'], {
    stdin: TSV([['gemini-code-assist[bot]', 'Bot', '2026-07-29T11:00:00Z', FORMAL]]),
  });
  assert.equal(JSON.parse(stdout).bots[0].evidence, true);
});

test('detect ORs evidence across a bot’s rows', () => {
  // One conversation comment plus one review comment still means reviewer.
  const { stdout } = run(['detect'], {
    stdin: TSV([
      ['coderabbitai[bot]', 'Bot', '2026-07-01T00:00:00Z', CHAT],
      ['coderabbitai[bot]', 'Bot', '2026-07-29T11:00:00Z', REVIEW],
    ]),
  });
  const [bot] = JSON.parse(stdout).bots;
  assert.equal(bot.evidence, true);
  assert.equal(bot.lastSeen, '2026-07-29T11:00:00Z');
});

test('detect keeps the newest timestamp per login', () => {
  const { stdout } = run(['detect'], {
    stdin: TSV([
      ['x[bot]', 'Bot', '2026-07-29T11:00:00Z', REVIEW],
      ['x[bot]', 'Bot', '2026-07-01T00:00:00Z', REVIEW],
    ]),
  });
  assert.equal(JSON.parse(stdout).bots[0].lastSeen, '2026-07-29T11:00:00Z');
});

test('detect sorts by login so output is stable', () => {
  const { stdout } = run(['detect'], {
    stdin: TSV([
      ['zeta[bot]', 'Bot', '2026-07-29T11:00:00Z', REVIEW],
      ['alpha[bot]', 'Bot', '2026-07-29T11:00:00Z', REVIEW],
    ]),
  });
  assert.deepEqual(JSON.parse(stdout).bots.map((b) => b.login), ['alpha[bot]', 'zeta[bot]']);
});

test('detect ignores malformed, blank and unknown-source lines', () => {
  const { code, stdout } = run(['detect'], {
    stdin: [
      'only-one-field',
      '',
      'a\tb\tc',                                       // three fields, not four
      `bad[bot]\tBot\t2026-07-29T11:00:00Z\tmystery`,  // unknown source
      `ok[bot]\tBot\t2026-07-29T11:00:00Z\t${REVIEW}`,
      '   ',
    ].join('\n'),
  });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout).bots.map((b) => b.login), ['ok[bot]']);
});

test('detect on empty stdin yields an empty list, not an error', () => {
  const { code, stdout } = run(['detect'], { stdin: '' });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout).bots, []);
});

test('an unknown subcommand fails with usage', () => {
  assertFailed(run(['bogus']), /usage/i);
});

test('no subcommand fails with usage', () => {
  assertFailed(run([]), /usage/i);
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/reviewer-state.test.mjs
```

Expected: FAIL — 找不到 `reviewer-state.mjs`

- [ ] **Step 3: 寫實作（`detect` + dispatch 骨架）**

`scripts/reviewer-state.mjs`：

```javascript
#!/usr/bin/env node
/**
 * Per-repo reviewer state for greenlight: which bots act on this repo, which of
 * them to trigger this round, and which observations to remember.
 *
 * Requires Node.js >= 20. Only `node:` built-ins.
 *
 * Usage:
 *   reviewer-state.mjs detect
 *       stdin:  TSV `login<TAB>type<TAB>iso<TAB>source`, source one of
 *               conversation | review-comment | formal-review
 *       stdout: {"bots":[{"login","lastSeen","evidence"}]}
 *
 * This script never calls `gh`, never derives the repo key, and never reads
 * `fallback_order` — all three are passed in. That keeps it testable and keeps
 * the five-layer config cascade in the one place that already implements it
 * (the shell helpers in shared/config.md).
 *
 * It owns exactly one config key: repos[<repo-key>].greenlight_reviewers. It
 * never writes `greenlight`, which stays owned by the shell helpers.
 *
 * stdout is the machine contract and stays clean on failure. Errors print to
 * stderr and set exitCode 1.
 */

const SUBCOMMANDS = ['detect'];

/** Sources that prove a bot performs code review, not just automation. */
const EVIDENCE_SOURCES = new Set(['review-comment', 'formal-review']);
const ALL_SOURCES = new Set([...EVIDENCE_SOURCES, 'conversation']);

/**
 * A problem with user-supplied input or config — printed as a message. Anything
 * else that throws is a bug and keeps its stack. Mirrors ConfigError in
 * preview/scripts/config-resolve.mjs.
 */
class InputError extends Error {}

function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exitCode = 1;
}

function usage(message) {
  const lines = message ? [`error: ${message}`] : [];
  lines.push(`usage: reviewer-state.mjs <${SUBCOMMANDS.join('|')}>`);
  process.stderr.write(`${lines.join('\n')}\n`);
  process.exitCode = 1;
}

/** Read all of stdin. Refuses a TTY, where it would otherwise hang forever. */
async function readStdin() {
  if (process.stdin.isTTY) throw new InputError('this subcommand reads stdin; pipe input in');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Reduce an activity sample to the bots in it.
 *
 * Filtering is on `type === 'Bot'`, never on the login text: a tool's login is
 * unpredictable (`Copilot` carries no `[bot]` suffix), and an allowlist of
 * logins is what stops a newly installed reviewer from being seen at all.
 *
 * `evidence` is ORed across a bot's rows. It separates "is automation" from
 * "does code review": dependabot and CI bots only ever appear in the
 * conversation channel, so they stay evidence-free and never become reviewer
 * candidates.
 */
function detect(tsv) {
  const byLogin = new Map();
  for (const line of tsv.split('\n')) {
    const parts = line.split('\t');
    if (parts.length !== 4) continue;
    const [login, type, at, source] = parts.map((s) => s.trim());
    if (!login || type !== 'Bot' || !at || !ALL_SOURCES.has(source)) continue;
    const prev = byLogin.get(login) ?? { login, lastSeen: at, evidence: false };
    byLogin.set(login, {
      login,
      lastSeen: at > prev.lastSeen ? at : prev.lastSeen,
      evidence: prev.evidence || EVIDENCE_SOURCES.has(source),
    });
  }
  return [...byLogin.values()].sort((a, b) => (a.login < b.login ? -1 : a.login > b.login ? 1 : 0));
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function main() {
  const [sub] = process.argv.slice(2);
  if (!sub) return usage('no subcommand given');

  if (sub === 'detect') {
    return emit({ bots: detect(await readStdin()) });
  }

  return usage(`unknown subcommand "${sub}"`);
}

main().catch((err) => {
  if (err instanceof InputError) fail(err.message);
  else throw err;
});
```

- [ ] **Step 4: 跑測試確認通過**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/reviewer-state.test.mjs
```

Expected: PASS，11 個 test 全綠

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs \
        plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs
git commit -m "feat(greenlight): add reviewer-state detect subcommand

Filter on user type instead of a hardcoded login allowlist, and keep the
evidence channel so automation (dependabot, CI bots) is not mistaken for a
code reviewer."
```

---

### Task 3: config 安全層與 `record`

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs`
- Modify: `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `recipeFor`
- Produces: CLI `reviewer-state.mjs record --repo-key <K>`。stdin 吃

```json
{"observations":[{"login":"coderabbitai[bot]","auto":true}],
 "bind":{"recipe":"greptile","login":"greptile-apps[bot]"},
 "dropPending":["bugbot"]}
```

寫進 `repos[<K>].greenlight_reviewers`（`observed` 逐 login merge、`pending` 增減），stdout 印寫入後的整個 `greenlight_reviewers`。另 `record --repo-key <K> --add-pending <recipe>` 把一個 recipe 排進 `pending`。

**這個 task 承載三個 Critical 的修正**：config 毀損 fail closed、觀測值落在獨立 feature key（不與 `greenlight` 同 subtree）、`pending` 的持久化。

- [ ] **Step 1: 寫 failing test**

追加到 `tests/reviewer-state.test.mjs`：

```javascript
const KEY = 'github.com/o/r';
const readBack = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'));
const reviewersOf = (dir) => readBack(dir).repos[KEY].greenlight_reviewers;

/** A config with both the shell-owned `greenlight` and script-owned key. */
const CFG = ({ observed = {}, pending = [], fallbackOrder = ['codex-bot'] } = {}) => ({
  default: { greenlight: { fallback_order: fallbackOrder } },
  repos: {
    [KEY]: {
      preview: { path: 'docs/preview' },
      greenlight: { fallback_order: fallbackOrder },
      greenlight_reviewers: { observed, pending },
    },
    'github.com/other/repo': { greenlight: { fallback_order: ['gemini'] } },
  },
});

test('record creates greenlight_reviewers on a fresh config', () => {
  const dir = tmpConfigDir();
  const { code } = run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'coderabbitai[bot]', auto: true }] }),
    configDir: dir,
  });
  assert.equal(code, 0);
  assert.deepEqual(reviewersOf(dir).observed['coderabbitai[bot]'], { auto: true });
});

test('record merges into an existing entry without dropping fields', () => {
  const dir = tmpConfigDir(CFG({ observed: { 'cursor[bot]': { recipe: 'bugbot', auto: false } } }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'cursor[bot]', auto: true }] }),
    configDir: dir,
  });
  assert.deepEqual(reviewersOf(dir).observed['cursor[bot]'], { recipe: 'bugbot', auto: true });
});

test('record writes triggerable:false for a reviewer that never answered', () => {
  const dir = tmpConfigDir(CFG({ observed: { 'gemini-code-assist[bot]': { recipe: 'gemini' } } }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'gemini-code-assist[bot]', triggerable: false }] }),
    configDir: dir,
  });
  assert.equal(reviewersOf(dir).observed['gemini-code-assist[bot]'].triggerable, false);
});

test('record never writes the shell-owned greenlight key', () => {
  // The whole reason observations live under their own feature key: the shell
  // helper replaces a feature subtree wholesale, and the five-layer read takes
  // the first layer that has the feature at all. Sharing one subtree means
  // either writer silently erases the other's work.
  const dir = tmpConfigDir(CFG({ fallbackOrder: ['codex-bot', 'codex-cli'] }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'coderabbitai[bot]', auto: true }] }),
    configDir: dir,
  });
  const cfg = readBack(dir);
  assert.deepEqual(cfg.repos[KEY].greenlight, { fallback_order: ['codex-bot', 'codex-cli'] });
  assert.deepEqual(cfg.default.greenlight, { fallback_order: ['codex-bot', 'codex-cli'] });
});

test('record preserves sibling repos and sibling features', () => {
  const dir = tmpConfigDir(CFG());
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'coderabbitai[bot]', auto: true }] }),
    configDir: dir,
  });
  const cfg = readBack(dir);
  assert.deepEqual(cfg.repos['github.com/other/repo'], { greenlight: { fallback_order: ['gemini'] } });
  assert.deepEqual(cfg.repos[KEY].preview, { path: 'docs/preview' });
});

test('record --add-pending queues a recipe without a login', () => {
  const dir = tmpConfigDir(CFG());
  const { code } = run(['record', '--repo-key', KEY, '--add-pending', 'greptile'], { configDir: dir });
  assert.equal(code, 0);
  assert.deepEqual(reviewersOf(dir).pending, ['greptile']);
});

test('record --add-pending is idempotent and rejects unknown recipes', () => {
  const dir = tmpConfigDir(CFG({ pending: ['greptile'] }));
  run(['record', '--repo-key', KEY, '--add-pending', 'greptile'], { configDir: dir });
  assert.deepEqual(reviewersOf(dir).pending, ['greptile']);
  assertFailed(run(['record', '--repo-key', KEY, '--add-pending', 'nope'], { configDir: dir }), /nope/);
});

test('record bind moves a pending recipe into observed with its learned login', () => {
  const dir = tmpConfigDir(CFG({ pending: ['greptile', 'bugbot'] }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ bind: { recipe: 'greptile', login: 'greptile-apps[bot]' } }),
    configDir: dir,
  });
  const r = reviewersOf(dir);
  assert.deepEqual(r.pending, ['bugbot'], 'the bound recipe leaves the queue');
  assert.equal(r.observed['greptile-apps[bot]'].recipe, 'greptile');
});

test('record dropPending removes a recipe that never answered', () => {
  const dir = tmpConfigDir(CFG({ pending: ['greptile', 'bugbot'] }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ dropPending: ['greptile'] }),
    configDir: dir,
  });
  assert.deepEqual(reviewersOf(dir).pending, ['bugbot']);
});

test('record rejects an observation with no login', () => {
  assertFailed(
    run(['record', '--repo-key', KEY], { stdin: JSON.stringify({ observations: [{ auto: true }] }) }),
    /login/i,
  );
});

test('record rejects an unknown recipe in an observation', () => {
  assertFailed(
    run(['record', '--repo-key', KEY], {
      stdin: JSON.stringify({ observations: [{ login: 'x[bot]', recipe: 'nope' }] }),
    }),
    /nope/,
  );
});

test('record requires --repo-key', () => {
  assertFailed(run(['record'], { stdin: '{"observations":[]}' }), /repo-key/);
});

test('record on an empty payload leaves the file byte-identical', () => {
  const dir = tmpConfigDir(CFG({ observed: { 'cursor[bot]': { recipe: 'bugbot' } } }));
  const before = fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8');
  const { code } = run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [] }), configDir: dir,
  });
  assert.equal(code, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), before);
});

test('record refuses to write when the config is malformed', () => {
  // The dangerous version of this bug: treat a parse error as "no config",
  // build {} plus the new entry, and rename it over the original. Every other
  // repo and every default.* feature would be gone, silently, exit 0.
  const broken = '{ "repos": { "github.com/o/r": { "greenlight": { } } },, }';
  const dir = tmpConfigDir(broken);
  assertFailed(
    run(['record', '--repo-key', KEY], {
      stdin: JSON.stringify({ observations: [{ login: 'x[bot]', auto: true }] }),
      configDir: dir,
    }),
    /parse|malformed|invalid/i,
  );
  assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), broken,
    'the original file must survive untouched');
});

test('record refuses a config whose top level is not an object', () => {
  for (const bad of ['null', '[]', '"str"', '42']) {
    const dir = tmpConfigDir(bad);
    assertFailed(
      run(['record', '--repo-key', KEY], {
        stdin: JSON.stringify({ observations: [{ login: 'x[bot]', auto: true }] }),
        configDir: dir,
      }),
      /object/i,
    );
    assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), bad);
  }
});

test('record treats an absent config as empty and creates it', () => {
  const dir = tmpDir();   // no solopreneur.json at all
  const { code } = run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'x[bot]', auto: true }] }),
    configDir: dir,
  });
  assert.equal(code, 0);
  assert.equal(reviewersOf(dir).observed['x[bot]'].auto, true);
});

test('record rejects malformed stdin with a message naming the input', () => {
  assertFailed(run(['record', '--repo-key', KEY], { stdin: '{not json' }), /stdin/i);
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/reviewer-state.test.mjs
```

Expected: FAIL — `unknown subcommand "record"`（Task 2 的 11 個仍綠）

- [ ] **Step 3: 寫實作**

`SUBCOMMANDS` 改成 `['detect', 'record']`，加入 import 與 config 層：

```javascript
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recipeFor } from './reviewer-registry.mjs';

/** The feature key this script owns. It never touches `greenlight`. */
const FEATURE = 'greenlight_reviewers';

/** The primary config file, matching the shell helpers in shared/config.md. */
function configPath() {
  const base = process.env.CLAUDE_CONFIG_DIR
    ? path.resolve(process.env.CLAUDE_CONFIG_DIR)
    : path.join(os.homedir(), '.claude');
  return path.join(base, 'solopreneur.json');
}

/**
 * Read the config for writing.
 *
 * Only ENOENT may become `{}`. A parse failure, a permission error, or a
 * non-object top level is fatal: the caller is about to rewrite this file, and
 * treating "cannot understand it" as "it is empty" would replace the user's
 * whole config with whatever this round happened to observe.
 */
function readConfigForWrite() {
  let raw;
  try {
    raw = fs.readFileSync(configPath(), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw new InputError(`cannot read ${configPath()}: ${err.message}`);
  }
  if (!raw.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new InputError(`cannot parse ${configPath()} (malformed JSON): ${err.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InputError(`${configPath()} must contain a JSON object at the top level`);
  }
  return parsed;
}

/** Atomic replace via a private temp file in the same directory. */
function writeConfig(cfg) {
  const target = configPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // mkdtemp, not a predictable `${target}.tmp`: an attacker-planted symlink at
  // a guessable path would otherwise be followed by the write.
  const stage = fs.mkdtempSync(`${target}.`);
  const tmp = path.join(stage, 'solopreneur.json');
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, target);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

/** This repo's owned block, with both halves defaulted. */
function reviewersBlock(cfg, repoKey) {
  const block = cfg?.repos?.[repoKey]?.[FEATURE] ?? {};
  return {
    observed: block.observed && typeof block.observed === 'object' ? block.observed : {},
    pending: Array.isArray(block.pending) ? block.pending : [],
  };
}

/** Minimal `--flag value` parser. Unknown flags are an error, not ignored. */
function parseFlags(argv, allowed) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith('--')) throw new InputError(`unexpected argument "${flag}"`);
    const name = flag.slice(2);
    if (!allowed.includes(name)) throw new InputError(`unknown flag "${flag}"`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new InputError(`${flag} needs a value`);
    }
    out[name] = value;
    i += 1;
  }
  return out;
}

/** Parse stdin as JSON, naming the input so the message is actionable. */
function parseJsonStdin(raw) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new InputError(`cannot parse stdin as JSON: ${err.message}`);
  }
}
```

`record` 本體：

```javascript
/**
 * Merge this round's observations into the per-repo cache.
 *
 * Three independent edits, any combination of which may be present:
 *   observations  — per-login field merge (auto / triggerable / recipe)
 *   bind          — a pending recipe learned its login; move it to observed
 *   dropPending   — a pending recipe that never answered; forget it
 *
 * An empty payload does not rewrite the file at all, so a quiet round cannot
 * reformat or reorder a config the user hand-edited.
 */
function record({ observations = [], bind = null, dropPending = [], repoKey, addPending = null }) {
  for (const obs of observations) {
    if (!obs?.login) throw new InputError('every observation needs a login');
    if (obs.recipe != null && !recipeFor(obs.recipe)) {
      throw new InputError(`unknown recipe "${obs.recipe}"`);
    }
  }
  if (bind && (!bind.recipe || !bind.login)) {
    throw new InputError('bind needs both a recipe and a login');
  }
  if (bind && !recipeFor(bind.recipe)) throw new InputError(`unknown recipe "${bind.recipe}"`);
  if (addPending && !recipeFor(addPending)) throw new InputError(`unknown recipe "${addPending}"`);

  const cfg = readConfigForWrite();
  const current = reviewersBlock(cfg, repoKey);

  const noop = observations.length === 0 && !bind && dropPending.length === 0
    && (!addPending || current.pending.includes(addPending));
  if (noop) return current;

  const observed = { ...current.observed };
  let pending = [...current.pending];

  for (const { login, ...fields } of observations) {
    observed[login] = { ...(observed[login] ?? {}), ...fields };
  }
  if (bind) {
    observed[bind.login] = { ...(observed[bind.login] ?? {}), recipe: bind.recipe };
    pending = pending.filter((id) => id !== bind.recipe);
  }
  if (dropPending.length) pending = pending.filter((id) => !dropPending.includes(id));
  if (addPending && !pending.includes(addPending)) pending.push(addPending);

  cfg.repos ??= {};
  cfg.repos[repoKey] ??= {};
  cfg.repos[repoKey][FEATURE] = { observed, pending };
  writeConfig(cfg);
  return cfg.repos[repoKey][FEATURE];
}
```

dispatch 加入：

```javascript
  if (sub === 'record') {
    const flags = parseFlags(process.argv.slice(3), ['repo-key', 'add-pending']);
    if (!flags['repo-key']) throw new InputError('record needs --repo-key');
    // --add-pending is a standalone edit and takes no stdin.
    const payload = flags['add-pending'] ? {} : parseJsonStdin(await readStdin());
    return emit(record({
      ...payload, repoKey: flags['repo-key'], addPending: flags['add-pending'] ?? null,
    }));
  }
```

- [ ] **Step 4: 跑測試確認通過**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs
```

Expected: PASS，共 39 個 test（11 registry + 28 state）

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs \
        plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs
git commit -m "feat(greenlight): add reviewer-state record subcommand

Observations land in repos[<key>].greenlight_reviewers, a feature key this
script owns exclusively, so neither the five-layer read nor the shell
helper's whole-subtree write can erase them. A malformed or unreadable
config is fatal and never overwritten."
```

---

### Task 4: `resolve` — 這輪的角色決策

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs`
- Modify: `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `recipeFor`、Task 2 的 `detect` 輸出、Task 3 的 config 層
- Produces: CLI

```
reviewer-state.mjs resolve --repo-key <K> --fallback-order <ids>
                           [--cli-available <ids>] [--select <ids>] [--gate <id>]
```

stdin 吃 `{"bots":[...]}`，stdout 印：

```json
{
  "available": [
    {"kind":"bot","id":"coderabbitai[bot]","login":"coderabbitai[bot]",
     "recipe":"coderabbit","auto":true,"evidence":true,"lastSeen":"...","canGate":true},
    {"kind":"pending","id":"greptile","login":null,"recipe":"greptile","canGate":false},
    {"kind":"cli","id":"codex-cli","login":null,"recipe":"codex-cli","canGate":true}
  ],
  "trigger": [{"kind":"github-bot","recipe":"codex-bot","triggerText":"@codex review",
               "login":"chatgpt-codex-connector[bot]"}],
  "collect": ["coderabbitai[bot]","chatgpt-codex-connector[bot]"],
  "gate": {"kind":"bot","id":"...","login":"...","recipe":"codex-bot",
           "poll":{"firstWaitSec":60,"intervalSec":60,"tries":20},"handshake":"reaction"},
  "bindingCandidate": "greptile",
  "needsPrompt": false,
  "warnings": []
}
```

Task 8 吃 `available` / `needsPrompt` / `warnings`；Task 9 吃 `trigger` / `collect` / `gate` / `bindingCandidate`。

**`--fallback-order` 是參數而非讀 config。** `fallback_order` 落在 `.default.greenlight`（現有 writer 是 `write_solopreneur_config`，`SKILL.md:1656`），要正確取得必須走完整五層。SKILL.md 已有 `read_solopreneur_config greenlight` 能做這件事，腳本不重複實作。

**`codex-cli` 自動接手 / `agy` 要問，語意不在腳本裡。** 腳本只吃 `--cli-available`。SKILL.md 在 CLI gate 通過時傳 `codex-cli`；`agy` 只在使用者明確同意後才加入。而「codex-bot 失敗自動落到 codex-cli」由 `fallback_order` 本身表達（`config.md` 推薦的預設 `["codex-bot","codex-cli"]` 正是這個順序），不需要腳本內建規則。

- [ ] **Step 1: 寫 failing test**

追加到 `tests/reviewer-state.test.mjs`：

```javascript
const BOTS = (rows) => JSON.stringify({
  bots: rows.map((r) => (typeof r === 'string'
    ? { login: r, lastSeen: '2026-07-29T11:00:00Z', evidence: true }
    : { lastSeen: '2026-07-29T11:00:00Z', evidence: true, ...r })),
});

/** resolve with the required flags defaulted. */
function resolve(extra, { stdin, configDir }) {
  return run(['resolve', '--repo-key', KEY, '--fallback-order', 'codex-bot', ...extra],
    { stdin, configDir });
}

const CODEX = 'chatgpt-codex-connector[bot]';
const RABBIT = 'coderabbitai[bot]';

test('resolve merges detected bots with the cache', () => {
  const dir = tmpConfigDir(CFG({ observed: { [RABBIT]: { recipe: 'coderabbit', auto: true } } }));
  const { code, stdout } = resolve([], { stdin: BOTS([CODEX]), configDir: dir });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.deepEqual(out.available.map((r) => r.id).sort(), [RABBIT, CODEX].sort());
});

test('resolve excludes triggerable:false', () => {
  const dir = tmpConfigDir(CFG({ observed: {
    [RABBIT]: { recipe: 'coderabbit', auto: true },
    'gemini-code-assist[bot]': { recipe: 'gemini', triggerable: false },
  } }));
  const { stdout } = resolve([], { stdin: BOTS([RABBIT, 'gemini-code-assist[bot]']), configDir: dir });
  assert.deepEqual(JSON.parse(stdout).available.map((r) => r.id), [RABBIT]);
});

test('resolve drops an unidentified bot with no review evidence', () => {
  // dependabot shape. Without this it would be selected by default and its PR
  // description would enter the finding-processing loop as review feedback.
  const dir = tmpConfigDir(CFG());
  const { stdout } = resolve([], {
    stdin: BOTS([{ login: 'dependabot[bot]', evidence: false }, CODEX]),
    configDir: dir,
  });
  assert.deepEqual(JSON.parse(stdout).available.map((r) => r.id), [CODEX]);
});

test('resolve keeps an unidentified bot that has review evidence, but bars it from gating', () => {
  const dir = tmpConfigDir(CFG());
  const { stdout } = resolve([], { stdin: BOTS([CODEX, 'brand-new[bot]']), configDir: dir });
  const out = JSON.parse(stdout);
  const fresh = out.available.find((r) => r.id === 'brand-new[bot]');
  assert.equal(fresh.recipe, null);
  assert.equal(fresh.canGate, false);
  assert.ok(out.collect.includes('brand-new[bot]'), 'its findings are still collected');
  assert.ok(!out.trigger.some((t) => t.login === 'brand-new[bot]'), 'but it is never triggered');
});

test('resolve surfaces pending recipes as candidates that cannot gate', () => {
  const dir = tmpConfigDir(CFG({ pending: ['greptile'] }));
  const { stdout } = resolve([], { stdin: BOTS([CODEX]), configDir: dir });
  const pending = JSON.parse(stdout).available.find((r) => r.kind === 'pending');
  assert.equal(pending.id, 'greptile');
  assert.equal(pending.login, null);
  assert.equal(pending.canGate, false, 'nobody to wait for yet');
});

test('resolve triggers a pending recipe without a login', () => {
  // The deadlock this design exists to break: triggering needs only the recipe.
  const dir = tmpConfigDir(CFG({ pending: ['greptile'] }));
  const { stdout } = resolve([], { stdin: BOTS([CODEX]), configDir: dir });
  const out = JSON.parse(stdout);
  const t = out.trigger.find((x) => x.recipe === 'greptile');
  assert.equal(t.triggerText, '@greptileai');
  assert.equal(t.login, null);
  assert.equal(out.bindingCandidate, 'greptile');
});

test('resolve binds at most one pending recipe per round', () => {
  const dir = tmpConfigDir(CFG({ pending: ['greptile', 'bugbot'] }));
  const { stdout } = resolve([], { stdin: BOTS([CODEX]), configDir: dir });
  const out = JSON.parse(stdout);
  assert.equal(out.bindingCandidate, 'greptile', 'the queue head only');
  assert.equal(out.trigger.filter((t) => t.login === null).length, 1,
    'a second unbound trigger would make the response unattributable');
});

test('resolve admits an available local CLI and lets it gate', () => {
  const dir = tmpConfigDir(CFG());
  const { stdout } = resolve(['--cli-available', 'codex-cli'], { stdin: BOTS([]), configDir: dir });
  const cli = JSON.parse(stdout).available.find((r) => r.kind === 'cli');
  assert.equal(cli.id, 'codex-cli');
  assert.equal(cli.canGate, true);
});

test('resolve marks a local CLI trigger with its kind so SKILL.md can branch', () => {
  const dir = tmpConfigDir(CFG());
  const { stdout } = resolve(['--cli-available', 'codex-cli'], { stdin: BOTS([]), configDir: dir });
  const t = JSON.parse(stdout).trigger.find((x) => x.recipe === 'codex-cli');
  assert.equal(t.kind, 'local-cli');
});

test('resolve omits auto reviewers from trigger but keeps them in collect', () => {
  const dir = tmpConfigDir(CFG({ observed: {
    [RABBIT]: { recipe: 'coderabbit', auto: true },
    [CODEX]: { recipe: 'codex-bot', auto: false },
  } }));
  const { stdout } = resolve([], { stdin: BOTS([RABBIT, CODEX]), configDir: dir });
  const out = JSON.parse(stdout);
  assert.deepEqual(out.trigger.map((t) => t.login), [CODEX]);
  assert.ok(out.collect.includes(RABBIT));
});

test('resolve attaches the gate’s own poll policy and handshake', () => {
  const dir = tmpConfigDir(CFG({ observed: { [CODEX]: { recipe: 'codex-bot' } } }));
  const { stdout } = resolve([], { stdin: BOTS([CODEX]), configDir: dir });
  const { gate } = JSON.parse(stdout);
  assert.equal(gate.recipe, 'codex-bot');
  assert.deepEqual(gate.poll, { firstWaitSec: 60, intervalSec: 60, tries: 20 });
  assert.equal(gate.handshake, 'reaction');
});

test('resolve attaches a poll policy to an auto gate too', () => {
  // The case the previous contract could not express: an auto reviewer is
  // excluded from `trigger`, so if poll policy lived only there, gating on
  // CodeRabbit would leave the round with no wait policy at all.
  const dir = tmpConfigDir(CFG({ observed: { [RABBIT]: { recipe: 'coderabbit', auto: true } } }));
  const { stdout } = resolve(['--gate', 'coderabbit'], { stdin: BOTS([RABBIT]), configDir: dir });
  const { gate, trigger } = JSON.parse(stdout);
  assert.equal(gate.login, RABBIT);
  assert.equal(typeof gate.poll.firstWaitSec, 'number');
  assert.ok(!trigger.some((t) => t.login === RABBIT), 'still not triggered');
});

test('resolve picks the gate from fallback-order, skipping unavailable entries', () => {
  const dir = tmpConfigDir(CFG({ observed: {
    [RABBIT]: { recipe: 'coderabbit', auto: true },
    [CODEX]: { recipe: 'codex-bot' },
  } }));
  const { stdout } = run([
    'resolve', '--repo-key', KEY, '--fallback-order', 'gemini,codex-bot',
  ], { stdin: BOTS([RABBIT, CODEX]), configDir: dir });
  assert.equal(JSON.parse(stdout).gate.recipe, 'codex-bot', 'gemini is not available here');
});

test('resolve rejects a gate that cannot gate', () => {
  const dir = tmpConfigDir(CFG({ pending: ['greptile'] }));
  assertFailed(resolve(['--gate', 'greptile'], { stdin: BOTS([CODEX]), configDir: dir }), /gate/i);
});

test('resolve rejects a gate that is not available', () => {
  const dir = tmpConfigDir(CFG());
  assertFailed(resolve(['--gate', 'bugbot'], { stdin: BOTS([CODEX]), configDir: dir }), /bugbot/);
});

test('resolve degrades an unknown cached recipe instead of crashing', () => {
  // A registry row renamed in a later release, or a hand-edited config. The old
  // contract dereferenced recipeFor(...) directly and died with a TypeError on
  // every run, with no hint that one stale string was the cause.
  const dir = tmpConfigDir(CFG({ observed: { 'x[bot]': { recipe: 'retired-tool' } } }));
  const { code, stdout } = resolve([], { stdin: BOTS(['x[bot]']), configDir: dir });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.available.find((r) => r.id === 'x[bot]').recipe, null);
  assert.ok(out.warnings.some((w) => w.includes('retired-tool')), 'names the stale id');
});

test('resolve flags needsPrompt above two candidates', () => {
  const dir = tmpConfigDir(CFG({ observed: {
    [RABBIT]: { recipe: 'coderabbit' }, [CODEX]: { recipe: 'codex-bot' },
    'cursor[bot]': { recipe: 'bugbot' },
  } }));
  const { stdout } = resolve([], { stdin: BOTS([RABBIT, CODEX, 'cursor[bot]']), configDir: dir });
  assert.equal(JSON.parse(stdout).needsPrompt, true);
});

test('resolve does not prompt for two candidates', () => {
  const dir = tmpConfigDir(CFG({ observed: {
    [RABBIT]: { recipe: 'coderabbit' }, [CODEX]: { recipe: 'codex-bot' },
  } }));
  const { stdout } = resolve([], { stdin: BOTS([RABBIT, CODEX]), configDir: dir });
  assert.equal(JSON.parse(stdout).needsPrompt, false);
});

test('resolve does not prompt when the caller already chose', () => {
  const dir = tmpConfigDir(CFG({ observed: {
    [RABBIT]: { recipe: 'coderabbit' }, [CODEX]: { recipe: 'codex-bot' },
    'cursor[bot]': { recipe: 'bugbot' },
  } }));
  const stdin = BOTS([RABBIT, CODEX, 'cursor[bot]']);
  for (const extra of [
    ['--select', 'coderabbit,codex-bot'],
    ['--gate', 'codex-bot'],
  ]) {
    const { stdout } = resolve(extra, { stdin, configDir: dir });
    assert.equal(JSON.parse(stdout).needsPrompt, false, `still prompting with ${extra[0]}`);
  }
});

test('resolve rejects a selection that matches nothing', () => {
  // A stale select= token from an autopilot descriptor written days earlier
  // would otherwise yield an empty round with gate: null and exit 0.
  const dir = tmpConfigDir(CFG({ observed: { [CODEX]: { recipe: 'codex-bot' } } }));
  assertFailed(resolve(['--select', 'greptile'], { stdin: BOTS([CODEX]), configDir: dir }),
    /select|match/i);
});

test('resolve reports gate:null when nothing can gate, rather than guessing', () => {
  const dir = tmpConfigDir(CFG({ pending: ['greptile'] }));
  const { code, stdout } = resolve([], {
    stdin: BOTS([{ login: 'brand-new[bot]', evidence: true }]), configDir: dir,
  });
  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout).gate, null);
});

test('resolve requires --repo-key and --fallback-order', () => {
  assertFailed(run(['resolve', '--fallback-order', 'codex-bot'], { stdin: BOTS([]) }), /repo-key/);
  assertFailed(run(['resolve', '--repo-key', KEY], { stdin: BOTS([]) }), /fallback-order/);
});

test('resolve never writes to the config', () => {
  const dir = tmpConfigDir(CFG({ observed: { [CODEX]: { recipe: 'codex-bot' } } }));
  const before = fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8');
  resolve([], { stdin: BOTS([CODEX, 'brand-new[bot]']), configDir: dir });
  assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), before);
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/reviewer-state.test.mjs
```

Expected: FAIL — `unknown subcommand "resolve"`

- [ ] **Step 3: 寫實作**

`SUBCOMMANDS` 改成 `['detect', 'record', 'resolve']`。加入唯讀的 config 讀取（`resolve` 不寫檔，所以毀損時同樣中止但無覆寫風險）：

```javascript
/** Read-only view. Same fail-closed rules as the write path. */
function readConfig() {
  return readConfigForWrite();
}

const csv = (value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []);
```

`resolve` 本體：

```javascript
/**
 * Decide this round's roles.
 *
 * Candidates come from three places that cannot be unified — a GitHub bot has a
 * login, a pending recipe has none yet, and a local CLI never appears in GitHub
 * data at all — so each carries its `kind` and its own gating eligibility:
 *
 *   bot      cached or detected login. Gates when it has a usable recipe.
 *   pending  a recipe the user added whose login is not yet known. Never gates:
 *            with nobody to wait for there is no way to tell a round finished.
 *   cli      a local CLI that passed its availability gate. Gates — it runs
 *            synchronously, so finishing *is* the end of the round.
 *
 * An unidentified bot (no recipe) is collected but never triggered and never
 * gates. It must additionally carry review evidence: `type == "Bot"` proves
 * automation, not code review, and dependabot's PR prose is not review feedback.
 */
function resolve({ bots, repoKey, fallbackOrder, cliAvailable, select, gate }) {
  const warnings = [];
  const { observed, pending } = reviewersBlock(readConfig(), repoKey);

  // Union of remembered and observed, keyed by login.
  const merged = new Map();
  for (const [login, rec] of Object.entries(observed)) merged.set(login, { login, ...rec });
  for (const b of bots) {
    const prev = merged.get(b.login) ?? { login: b.login };
    merged.set(b.login, { ...prev, lastSeen: b.lastSeen, evidence: b.evidence === true });
  }

  const botCandidates = [...merged.values()]
    .filter((r) => r.triggerable !== false)
    .map((r) => {
      let recipe = r.recipe ?? null;
      if (recipe && !recipeFor(recipe)) {
        warnings.push(`cached recipe "${recipe}" is not in the registry; treating ${r.login} as unidentified`);
        recipe = null;
      }
      return {
        kind: 'bot',
        id: r.login,
        login: r.login,
        recipe,
        auto: r.auto === true,
        evidence: r.evidence === true,
        lastSeen: r.lastSeen ?? null,
        canGate: recipe !== null,
      };
    })
    // A recipe-bearing entry is a known reviewer; an unidentified one has to
    // prove it reviews before its comments are treated as findings.
    .filter((r) => r.recipe !== null || r.evidence);

  const pendingCandidates = pending
    .filter((id) => {
      if (recipeFor(id)) return true;
      warnings.push(`pending recipe "${id}" is not in the registry; ignoring it`);
      return false;
    })
    .map((id) => ({
      kind: 'pending', id, login: null, recipe: id, auto: false, evidence: false,
      lastSeen: null, canGate: false,
    }));

  const cliCandidates = cliAvailable
    .filter((id) => {
      const r = recipeFor(id);
      if (r && r.kind === 'local-cli') return true;
      warnings.push(`"${id}" is not a local-cli recipe; ignoring it`);
      return false;
    })
    .map((id) => ({
      kind: 'cli', id, login: null, recipe: recipeFor(id).id, auto: false, evidence: false,
      lastSeen: null, canGate: true,
    }));

  const available = [...botCandidates, ...pendingCandidates, ...cliCandidates]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const wanted = select ? csv(select) : null;
  const selected = wanted
    ? available.filter((r) => wanted.includes(r.recipe) || wanted.includes(r.id))
    : available;
  if (wanted && selected.length === 0) {
    throw new InputError(`--select matched no available reviewer: ${wanted.join(', ')}`);
  }

  // One pending binding per round: two unbound triggers in one window make the
  // responses unattributable, so the rest of the queue waits its turn.
  const bindingCandidate = selected.find((r) => r.kind === 'pending')?.id ?? null;

  const trigger = selected
    .filter((r) => {
      if (r.kind === 'pending') return r.id === bindingCandidate;
      if (r.kind === 'cli') return true;
      return !r.auto && r.recipe !== null;
    })
    .map((r) => {
      const recipe = recipeFor(r.recipe);
      return { kind: recipe.kind, recipe: r.recipe, triggerText: recipe.trigger, login: r.login };
    });

  let gateEntry = null;
  if (gate) {
    const found = selected.find((r) => r.recipe === gate || r.id === gate);
    if (!found) throw new InputError(`--gate "${gate}" is not among the available reviewers`);
    if (!found.canGate) {
      throw new InputError(
        `--gate "${gate}" cannot gate: ${found.kind === 'pending'
          ? 'its login is not bound yet'
          : 'it has no recipe, so it cannot be triggered'}`,
      );
    }
    gateEntry = found;
  } else {
    for (const id of fallbackOrder) {
      gateEntry = selected.find((r) => r.recipe === id && r.canGate) ?? null;
      if (gateEntry) break;
    }
    gateEntry ??= selected.find((r) => r.canGate) ?? null;
  }

  const gatePayload = gateEntry
    ? {
      kind: gateEntry.kind,
      id: gateEntry.id,
      login: gateEntry.login,
      recipe: gateEntry.recipe,
      // The gate's own policy, not the triggered set's: an auto gate is never
      // in `trigger`, so this is the only place its timing can be read.
      poll: recipeFor(gateEntry.recipe).poll ?? null,
      handshake: recipeFor(gateEntry.recipe).handshake,
    }
    : null;

  return {
    available,
    trigger,
    collect: selected.filter((r) => r.login).map((r) => r.login),
    gate: gatePayload,
    bindingCandidate,
    // Only ask when the caller expressed no preference at all.
    needsPrompt: !wanted && !gate && available.length > 2,
    warnings,
  };
}
```

dispatch 加入：

```javascript
  if (sub === 'resolve') {
    const flags = parseFlags(process.argv.slice(3),
      ['repo-key', 'fallback-order', 'cli-available', 'select', 'gate']);
    if (!flags['repo-key']) throw new InputError('resolve needs --repo-key');
    if (flags['fallback-order'] === undefined) {
      throw new InputError('resolve needs --fallback-order (read it with read_solopreneur_config)');
    }
    const { bots = [] } = parseJsonStdin(await readStdin());
    return emit(resolve({
      bots,
      repoKey: flags['repo-key'],
      fallbackOrder: csv(flags['fallback-order']),
      cliAvailable: csv(flags['cli-available']),
      select: flags.select,
      gate: flags.gate,
    }));
  }
```

- [ ] **Step 4: 跑測試確認通過**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs
```

Expected: PASS，共 62 個 test（11 registry + 51 state）

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs \
        plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs
git commit -m "feat(greenlight): add reviewer-state resolve subcommand

Three candidate kinds with separate gating eligibility. A pending recipe is
triggerable without a login, which breaks the bind deadlock. The gate
carries its own poll policy so an auto reviewer can gate. An unknown cached
recipe degrades with a warning instead of crashing the run."
```

---

### Task 5: CI gate

**Files:**
- Create: `.github/workflows/validate-greenlight-tests.yml`

**Interfaces:**
- Consumes: Task 1–4 的測試套件
- Produces: PR 上的 `validate-greenlight-tests` check

- [ ] **Step 1: 寫 workflow**

照 `validate-preview-tests.yml` 完整複製，**含它的 `timeout-minutes` 與 matrix-aware `concurrency`**——後者的註解記錄了一個真實 bug（group 沒帶 matrix leg 時兩個 Node job 互相 cancel，一個版本靜默未測）。matrix 也用相同的兩個版本與相同理由，不加第三個：

```yaml
name: Validate greenlight tests

on:
  pull_request:
    paths:
      - 'plugins/solopreneur/skills/greenlight/**'
      - '.github/workflows/validate-greenlight-tests.yml'
  push:
    branches: [main]
    paths:
      - 'plugins/solopreneur/skills/greenlight/**'
      - '.github/workflows/validate-greenlight-tests.yml'

permissions:
  contents: read

defaults:
  run:
    shell: bash

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    concurrency:
      # The matrix leg has to be part of the group, as in validate-preview-tests.yml:
      # without it the Node jobs share one group and cancel each other, leaving
      # one version silently untested.
      group: validate-greenlight-tests-${{ github.ref }}-${{ matrix.node }}
      cancel-in-progress: true
    strategy:
      fail-fast: false
      matrix:
        # '20' is the floor the scripts declare in their headers, and testing
        # only a modern Node would let a floor break ship green. '24' is the
        # current Active LTS. Same pair, same reasoning, as the preview suite.
        node: ['20', '24']
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5  # v4

      - name: Install Node ${{ matrix.node }}
        uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38  # v6
        with:
          node-version: ${{ matrix.node }}
          # Deliberately no `cache:` — it keys on a lockfile and hard errors when
          # there is none. This repo ships no package.json anywhere and the suite
          # uses Node built-ins only.

      - name: Run the greenlight skill test suite
        working-directory: plugins/solopreneur/skills/greenlight
        run: |
          # failglob, or this gate can pass having run zero tests: with no match
          # bash passes the pattern through literally, Node >= 22.6 treats it as
          # its own glob, matches nothing, and exits 0 on "tests 0".
          shopt -s failglob
          # NOT `node --test tests/`: since Node 22.6 the positional arguments are
          # glob patterns rather than paths, so a bare directory matches itself
          # and Node tries to execute the directory as a test file.
          if ! node --test tests/*.test.mjs; then
            echo
            echo "::error::The greenlight skill's test suite failed on Node ${{ matrix.node }}."
            echo "::error::Reproduce with: cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs"
            exit 1
          fi
```

- [ ] **Step 2: 本機驗證兩個 Node 版本都綠**

```bash
cd /Users/Hana/Agents/nana/repos/solopreneur/plugins/solopreneur/skills/greenlight
node --version
node --test tests/*.test.mjs
```

Expected: PASS。若本機 Node 不是 20/24，至少確認當前版本綠，其餘交給 CI。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/validate-greenlight-tests.yml
git commit -m "ci: gate the greenlight skill test suite"
```

---

### Task 6: SKILL.md registry 表格瘦身

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md:1482-1524`

**Interfaces:**
- Consumes: Task 1 的 `RECIPES`
- Produces: 瘦身後的 registry 段，供 Task 7–9 引用

- [ ] **Step 1: 換掉表格**

把 `SKILL.md:1488-1494` 的表格換成下表。**刪掉 `bot login` 與 `wizard eligibility` 兩欄**（前者是 per-repo 觀測值，後者由 `resolve` 的 `available` 決定）：

| recipe_id | aliases (arg) | kind | trigger | handshake | poll policy |
|---|---|---|---|---|---|
| `codex-bot` | `codex bot` | github-bot | PR comment `@codex review` | 👀 reaction | 60s first, 60s × 20 |
| `gemini` | `gemini` | github-bot | PR comment `/gemini review` | none | 180s first, 120s × 2 |
| `coderabbit` | `coderabbit` | github-bot | PR comment `@coderabbitai review` | none | default |
| `bugbot` | `bugbot`, `cursor` | github-bot | PR comment `bugbot run` (top-level only) | none | default |
| `greptile` | `greptile` | github-bot | PR comment `@greptileai` | none | default |
| `codex-cli` | `codex cli` | local-cli | `codex review --base main` | stdout `[P*]` | n/a |
| `agy` | `agy` | local-cli | `agy --model … --print` | stdout + marker | n/a |

- [ ] **Step 2: 改寫 kinds 說明並刪掉硬編碼 login 清單**

把 `SKILL.md:1496-1502` 換成兩類，`passive-bot` 這個分類消失：

```markdown
**Reviewer kinds:**
- **github-bot** — triggered by a PR comment and polled for. Whether it *also*
  reviews automatically on push is **observed**, not declared — see `auto` in
  `shared/config.md`.
- **local-cli** — runs locally and is read from stdout. Availability comes from
  a CLI gate, not from activity detection, because a local CLI never appears in
  GitHub data. It stays a legal PR-mode reviewer and gate.

There is deliberately **no bot-login column**. A tool's GitHub login cannot be
known from outside — `cursor[bot]`, `cursor-com[bot]` and `bugbot[bot]` are all
real accounts, and GitHub Copilot posts as `Copilot` with no `[bot]` suffix.
Logins are learned at trigger time and cached per repo.

`scripts/reviewer-registry.mjs` is the executable copy of this table and the one
the loop actually reads; keep this table in sync with it.
```

刪除 `SKILL.md:1509-1521` 整個 bash 區塊（`CODEX_BOT` / `GEMINI_BOT` / `CODERABBIT_BOT` / `REVIEWER_BOT_LOGINS` / `BOT_LOGIN`）。那份三筆的硬編碼清單被 `detect` 的 `type == "Bot"` 過濾取代。

- [ ] **Step 3: 驗證兩份表一致**

```bash
cd /Users/Hana/Agents/nana/repos/solopreneur/plugins/solopreneur/skills/greenlight
node --input-type=module -e '
import { RECIPES } from "./scripts/reviewer-registry.mjs";
import fs from "node:fs";
const md = fs.readFileSync("SKILL.md", "utf8");
let bad = 0;
for (const [id, r] of Object.entries(RECIPES)) {
  if (!md.includes("`" + id + "`")) { console.error("missing row:", id); bad++; continue; }
  // The trigger string is the one field worth checking mechanically — it is the
  // only per-tool knowledge, and a stale one sends the wrong comment.
  if (!md.includes(r.trigger)) { console.error("trigger not in SKILL.md:", id, r.trigger); bad++; }
}
if (md.includes("REVIEWER_BOT_LOGINS")) { console.error("hardcoded login list still present"); bad++; }
if (bad) process.exitCode = 1; else console.log("registry and SKILL.md agree");
'
```

Expected: `registry and SKILL.md agree`

- [ ] **Step 4: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/SKILL.md
git commit -m "refactor(greenlight): trim reviewer registry to vendor knowledge

Drop the bot-login and wizard-eligibility columns and the hardcoded
REVIEWER_BOT_LOGINS list. Fold passive-bot into github-bot: auto-review is
observed per repo, not a property of the tool."
```

---

### Task 7: detection 接上腳本 + config.md 文件

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md:1526-1601`
- Modify: `plugins/solopreneur/shared/config.md`

**Interfaces:**
- Consumes: Task 2 的 `detect`、Task 4 的 `resolve`
- Produces: `RESOLVED`（`resolve` 的 JSON），供 Task 8–9 使用

- [ ] **Step 1: 採樣加上來源欄**

`collect_reviewer_activity()` 的三個來源保留，每個 `--jq` 加 `.user.type` 並附一個常數來源標記，成為四欄 TSV：

```bash
# Source 1: conversation comments — summaries, quota notices, dependabot prose.
# Deliberately NOT evidence of code review (see the evidence rule below).
chunk=$(gh api "repos/$OWNER/$REPO/issues/comments?sort=created&direction=desc&per_page=100" \
          --jq '.[] | [.user.login, .user.type, .created_at, "conversation"] | @tsv') || rc=1
# Source 2: inline review comments — line-level findings.
chunk=$(gh api "repos/$OWNER/$REPO/pulls/comments?sort=created&direction=desc&per_page=100" \
          --jq '.[] | [.user.login, .user.type, .created_at, "review-comment"] | @tsv') || rc=1
# Source 3: formal reviews — a bot may leave ONLY one of these (verified: PR #108).
chunk=$(gh api "repos/$OWNER/$REPO/pulls/$n/reviews" \
          --jq '.[] | [.user.login, .user.type, .submitted_at, "formal-review"] | @tsv') || rc=1
```

- [ ] **Step 2: 過濾與決策改呼叫腳本**

把 `SKILL.md:1573-1586` 的 awk + jq 整段換成：

```bash
SCRIPTS="${CLAUDE_SKILL_DIR}/scripts"
REPO_KEY=$(solopreneur_repo_key)

# fallback_order must come through the five-layer cascade: the existing writer
# puts it at .default.greenlight (see "Fallback Logic"), so reading only the
# repo layer would silently lose a user's configured order. The script never
# reads it for exactly this reason.
FALLBACK_ORDER=$(read_solopreneur_config greenlight | jq -r '(.fallback_order // []) | join(",")')

# Local CLIs never appear in GitHub activity, so their availability comes from
# the pre-flight CLI gate instead. codex-cli is included whenever its gate
# passed — it is the documented successor to codex-bot. agy is NOT included
# automatically: switching model family is the user's call, so it is added only
# after the selection prompt (see "Reviewer selection").
CLI_AVAILABLE=""
[ "$CODEX_INSTALLED" = true ] && [ "$CODEX_AUTH" = true ] && CLI_AVAILABLE="codex-cli"

if ACTIVITY=$(collect_reviewer_activity); then
  DETECTED=$(printf '%s\n' "$ACTIVITY" | node "$SCRIPTS/reviewer-state.mjs" detect)
  DETECTION_STATUS=ok
else
  DETECTED='{"bots":[]}'; DETECTION_STATUS=unavailable
fi

# Runs in both branches: on `unavailable` the per-repo cache alone still yields a
# usable decision, which is what keeps detection an enhancement and never a gate.
RESOLVED=$(printf '%s' "$DETECTED" | node "$SCRIPTS/reviewer-state.mjs" resolve \
  --repo-key "$REPO_KEY" --fallback-order "$FALLBACK_ORDER" --cli-available "$CLI_AVAILABLE")

# Warnings are actionable config problems (a stale recipe id), not failures.
printf '%s' "$RESOLVED" | jq -r '.warnings[]?' | while read -r w; do echo "note: $w"; done
```

- [ ] **Step 3: 更新結果解讀表**

把 `SKILL.md:1591-1595` 換成：

| Result | Meaning | What happens |
|---|---|---|
| `DETECTION_STATUS=unavailable` | API failure / rate limit | `resolve` runs on the cache alone; empty cache falls through to the default flow |
| `available` empty | Nothing has ever acted here and nothing cached | Default flow (current behaviour) |
| `available` non-empty | These reviewers act here | Use `trigger` / `collect` / `gate` from `RESOLVED` |
| `needsPrompt` true | More than two candidates and no explicit choice | Run the selection prompt (Task 8) |
| `gate` null | Nothing eligible to gate (only unidentified bots or unbound pending) | Cannot establish a clean signal — treat as the exhausted-gate path |

保留 `SKILL.md:1597-1601`「detection 只列選項、不證明存活」那段——該論述在新架構下依然成立，且正是 `triggerable: false` 自我修復存在的理由。

- [ ] **Step 4: 補 config.md**

在 `config.md` 的 `greenlight` 範例附近新增：

```markdown
### `greenlight_reviewers`

Per-repo observations about the review bots on that repo, written **only** by
`skills/greenlight/scripts/reviewer-state.mjs`. It is a **separate feature key
from `greenlight`** on purpose: the five-layer read returns the whole subtree of
whichever layer has the feature first, and `write_solopreneur_repo_config`
replaces a feature subtree wholesale. Sharing one subtree would mean the script's
observations either shadow `default.greenlight.fallback_order` or get deleted by
the next helper write.

```json
"greenlight_reviewers": {
  "observed": { "coderabbitai[bot]": { "recipe": "coderabbit", "auto": true } },
  "pending":  ["greptile"]
}
```

| Field | Written when | Meaning |
|---|---|---|
| `observed.<login>.recipe` | first successful trigger | which registry row this login is; `null` = unidentified — findings still collected, never triggered, cannot gate |
| `observed.<login>.auto` | observation | it comments without being triggered, so it is never prompted |
| `observed.<login>.triggerable` | self-healing | `false` after a trigger got no response; excluded until removed by hand |
| `pending` | user adds a tool by name | recipe known, login not yet; the next round triggers it and binds the responder |

`fallback_order` stays in `greenlight` and keeps its meaning, except it now
orders **gate candidates**. The script never reads or writes it — greenlight
resolves it through `read_solopreneur_config` and passes it in.
```

同時修掉兩處會失真的 invariant：

- `config.md:115` 的「Two writers; both write to the primary file only」→ 改為三個 writer，並說明第三個是 Node、只碰 `greenlight_reviewers`。
- `config.md:340-345` 的其他語言 writer 註冊表 → 新增 `reviewer-state.mjs` 一列，並註明它**會寫**（既有的 `config-resolve.mjs` 一列註明只讀，兩者對比要清楚），因為該表存在的理由就是 grep 只找得到 bash。

- [ ] **Step 5: 用真 repo 驗證**

```bash
cd /Users/Hana/Agents/nana/repos/solopreneur
OWNER=hanamizuki REPO=solopreneur
{
  gh api "repos/$OWNER/$REPO/issues/comments?sort=created&direction=desc&per_page=100" \
    --jq '.[] | [.user.login, .user.type, .created_at, "conversation"] | @tsv'
  gh api "repos/$OWNER/$REPO/pulls/comments?sort=created&direction=desc&per_page=100" \
    --jq '.[] | [.user.login, .user.type, .created_at, "review-comment"] | @tsv'
} | node plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs detect | jq .
```

Expected: 三筆 bot——`chatgpt-codex-connector[bot]`、`coderabbitai[bot]`、`gemini-code-assist[bot]`，`evidence` 皆為 `true`（三者都有 inline review comment）。**沒有** `hanamizuki`（type User）。

- [ ] **Step 6: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/SKILL.md plugins/solopreneur/shared/config.md
git commit -m "refactor(greenlight): drive detection through reviewer-state

Sample the same three sources but tag each with its channel, so review
evidence can be told apart from mere automation. fallback_order still comes
from the five-layer shell cascade and is passed into the script."
```

**PR 1 收尾：** 開 PR，標題 `feat(greenlight): detection-driven reviewers`。內文列出行為變更：CodeRabbit 可觸發、通用偵測取代 login 白名單、未識別但有 review 證據的 bot 其 finding 會被收、loop 終止語意**未變**（gate 在 PR 2）。

---

## PR 2 — Gate 互動與 loop 語意

### Task 8: Reviewer 選擇與 gate 互動

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md:1613-1663`（Fallback Logic 段）
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md:809-835`（Argument Parsing）

**Interfaces:**
- Consumes: Task 4 的 `available` / `needsPrompt` / `warnings`
- Produces: `SELECTED_RECIPES`、`GATE_RECIPE`，以及新的 `select=` / `gate=` invocation token

- [ ] **Step 1: 新增選擇流程**

在 Fallback Logic 之前插入：

```markdown
### Reviewer selection (PR mode)

`RESOLVED.needsPrompt` is true when more than two candidates are available and
the caller expressed no preference. Ask two questions in one exchange:

1. **Which reviewers this round?** (multi-select) List every `available` entry
   with its `lastSeen`, annotated by kind:
   - `kind: "bot"`, `auto: true` → "reviews automatically"
   - `kind: "bot"`, `recipe: null` → "unidentified — findings collected, cannot be triggered or gate"
   - `kind: "pending"` → "added by you, login not yet known — will bind this round"
   - `kind: "cli"` → "local CLI"
2. **Which reviewer's clean pass gates the loop?** (single-select) Offer only
   entries with `canGate: true`.

Also offer **"add one not listed"**, backed by the registry table: a tool
installed today has no history, and GitHub gives no way to enumerate installed
Apps (`/user/installations` → 403 for a `gh` token, `/repos/{o}/{r}/installation`
→ 401 without an App JWT, and check-runs show only `github-actions` for the
review bots verified here). The user picks the tool name; queue it and let the
binding algorithm learn the login:

```bash
node "$SCRIPTS/reviewer-state.mjs" record --repo-key "$REPO_KEY" --add-pending "$RECIPE"
```

**`agy` is offered here and only here.** It is a local CLI that passes its gate
whenever installed, but it is Gemini-family: switching model family is the user's
call, not something a fallback chain should do silently. If chosen, add it to
`--cli-available` for this run. `codex-cli` needs no such prompt — it is the
documented successor to `codex-bot` in the same model family, and
`config.md`'s recommended `fallback_order` already pairs them.

Feed the answers back and re-resolve:

```bash
RESOLVED=$(printf '%s' "$DETECTED" | node "$SCRIPTS/reviewer-state.mjs" resolve \
  --repo-key "$REPO_KEY" --fallback-order "$FALLBACK_ORDER" \
  --cli-available "$CLI_AVAILABLE" --select "$SELECTED_RECIPES" --gate "$GATE_RECIPE")
```

Persist the gate choice so the next run does not ask again. **Use the shell
helper, which owns `greenlight`** — and note it replaces that feature subtree
wholesale, which is safe here precisely because observations live under
`greenlight_reviewers`:

```bash
write_solopreneur_repo_config greenlight "{fallback_order:[\"$GATE_RECIPE\"]}"
```
```

- [ ] **Step 2: 新增 invocation token**

greenlight 的參數是 token 風格（`external`、`unattended`、`size=m`），**不是** `--flag`（那是腳本層）。新增兩個：

- `select=coderabbit,codex-bot,bugbot` → `SELECTED_RECIPES`
- `gate=codex-bot` → `GATE_RECIPE`

兩者**必須**加進 `SKILL.md:823` 的 token-dropping 行（目前丟掉 `external` / `unattended` / `size=…`）。否則 `gate=codex-bot` 會 survive 進 `reviewer_args`，被當成 reviewer 名字，`current_reviewer` 變成字面字串 `gate=codex-bot`，之後每次查表都失敗。擴充同一行，不要加第二輪解析。

- [ ] **Step 3: 更新 Fallback Logic**

把 `SKILL.md:1628-1638`「With config」改成：

```markdown
**With config:** `fallback_order` orders **gate candidates**. The gate is the
first entry that is available *and* `canGate`; when it fails, it is recorded
`triggerable: false` and the next entry takes over. Non-gate reviewers are
untouched by this fallback — they were never holding the loop open.

Because `config.md`'s recommended order is `["codex-bot", "codex-cli"]`, a dead
Codex bot falls to Codex CLI automatically: same model family, no prompt.

**When every gate candidate is exhausted** — each tried and recorded
`triggerable: false` — or when `RESOLVED.gate` is null to begin with, the
existing escalation applies unchanged: attended runs ask, unattended runs
**halt** with `reason_class: transient-dependency` (`SKILL.md:1637-1638`).
Findings collected from `auto` reviewers do **not** rescue this: with no
triggerable gate there is no way to establish that a round finished, so there is
no defensible clean signal. Report what was collected, then halt.
```

在 unattended 段（`SKILL.md:1665-1673`）後補：

```markdown
For reviewer selection specifically an unattended run does **not** halt: the gate
becomes the first available `fallback_order` entry and every auto reviewer is
still collected. Blocking on input is worse than a defensible default gate.
```

保留 `SKILL.md:1675-1682` 的 Gemini sunset 段原樣。

- [ ] **Step 4: 走查一致性**

```bash
cd /Users/Hana/Agents/nana/repos/solopreneur/plugins/solopreneur/skills/greenlight
# 新 token 必須同時出現在解析與丟棄兩處
grep -n "select=\|gate=" SKILL.md
# 舊的 wizard 用語不該再出現（wizard eligibility 已由 canGate 取代）
grep -n "wizard eligibility" SKILL.md || echo "ok: no stale wizard-eligibility reference"
```

Expected: `select=` / `gate=` 在選擇流程、resolve 呼叫、Argument Parsing 的丟棄行都出現；無殘留 `wizard eligibility`。

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/SKILL.md
git commit -m "feat(greenlight): add reviewer selection and clean-pass gate

More than two candidates prompts for which to use and which gates.
fallback_order now orders gate candidates, so codex-cli succeeds codex-bot
automatically while agy stays opt-in."
```

---

### Task 9: Poll 窗口、終端狀態與綁定

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md`（Phase 3 external loop，PR mode 部分）

**Interfaces:**
- Consumes: Task 4 的 `trigger` / `collect` / `gate` / `bindingCandidate`；Task 3 的 `record`
- Produces: 一輪的完整流程與 `record` 的 payload

- [ ] **Step 1: 改寫一輪的流程**

```markdown
Each round:

1. Push the round's fixes.
2. Record the cursor ceiling **per channel** — one for `issues/comments`, one for
   `pulls/comments`, one for `pulls/<n>/reviews`. Feedback arrives on all three
   and they are not comparable to each other; a single ceiling would miss a
   reviewer that only files formal reviews. **Never filter by timestamp**
   (existing rule).
3. Trigger every entry in `RESOLVED.trigger`, in parallel, branching on `kind`:
   - `github-bot` → post `triggerText` as a top-level PR comment
   - `local-cli` → run it via the existing Flow B (synchronous, read stdout)
   Entries absent from `trigger` are `auto` (needs no prompting) or recipe-less
   (cannot be prompted).
4. Open the poll window using **`RESOLVED.gate.poll`** and `gate.handshake`.
5. Inside the window collect new items from **every** login in `collect`, not
   only the triggered ones, across all three channels.
6. Close the window when the gate produces a new item, or on timeout. This holds
   when the gate is `auto`: the test is "did the gate produce something new", not
   "did it answer a trigger", so gating on CodeRabbit works.
7. Write observations and bindings (Step 2 below).
8. Merge and dedupe findings across all sources, then hand them to the existing
   finding-processing flow, adversarial verification included.
9. Classify the round into exactly one terminal state (Step 3 below).

**Deliberately not waiting for auto reviewers.** The window closes on the gate.
An auto reviewer still mid-review is not waited for — every channel's ceiling
rises monotonically, so its late findings arrive next round. Nothing is lost; it
is deferred by one round. This is what stops "collect four reviewers" from
becoming "wait for the slowest one, every round".
```

- [ ] **Step 2: 觀測與綁定回寫**

```markdown
After closing the window, build `$OBSERVATIONS` from what the window actually
showed. Each row below is decidable from the collected items plus
`RESOLVED.trigger`:

| Condition | Payload |
|---|---|
| login produced an item, was **not** in `trigger` | `observations: [{login, auto: true}]` |
| login was in `trigger` and produced an item | `observations: [{login, auto: false}]` |
| login was in `trigger` and stayed silent all window | `observations: [{login, triggerable: false}]` |
| exactly one **new unbound** login appeared and `bindingCandidate` was triggered | `bind: {recipe: bindingCandidate, login: <that login>}` |
| `bindingCandidate` was triggered and **no** new unbound login appeared | `dropPending: [bindingCandidate]` |
| **more than one** new unbound login appeared | attended: ask which; unattended: neither `bind` nor `dropPending` — leave them `recipe: null` so findings are still collected |

"New unbound" = a login in this window's items that is absent from
`RESOLVED.available`. Then:

```bash
printf '%s' "$OBSERVATIONS" \
  | node "$SCRIPTS/reviewer-state.mjs" record --repo-key "$REPO_KEY"
```

An empty payload is legal and rewrites nothing.
```

- [ ] **Step 3: 四個終端狀態**

```markdown
**Silence is not a pass.** Classify every round into exactly one state; only the
first ends the loop:

| State | Condition | Action |
|---|---|---|
| `clean` | the gate **produced an item** and it carried no new findings | end the loop |
| `findings` | new findings from any collected reviewer | fix, next round |
| `timeout` | the gate stayed silent through the whole window | record `triggerable: false`, move to the next gate candidate; candidates exhausted → halt. **Never clean** |
| `quota` | the gate's item is a quota / rate-limit notice | same path as `timeout` |

This distinction is load-bearing. Treating "no new findings" as clean would make
a dead reviewer equal a passing review — the one direction a review gate must
never fail in.

`SIZE_MAX_ROUNDS` (S=3 / M=5 / L=10) is unchanged. Size S is external-only with
a single reviewer, which is therefore the gate, so the >2 selection prompt cannot
trigger under S.
```

- [ ] **Step 4: 實跑驗證（需要一個開著的 PR）**

四項，各對應一個設計主張。逐項記錄結果：

```bash
# 1. CodeRabbit 可觸發（PR 1 的核心主張，也驗證 OSS 方案下 chat 指令可用）
gh pr comment <PR> --body "@coderabbitai review"
sleep 180
gh api "repos/hanamizuki/solopreneur/pulls/<PR>/comments" \
  --jq '[.[] | select(.user.login=="coderabbitai[bot]")] | length'

# 2. 綁定流程走完整路徑——不可手動塞入猜測的 login 代替
node plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs \
  record --repo-key github.com/hanamizuki/solopreneur --add-pending greptile
#    然後跑一輪 greenlight，確認：發出了 `@greptileai`；窗口內沒有新未綁定 login；
#    收尾後 pending 已清空（dropPending 生效）
jq '.repos["github.com/hanamizuki/solopreneur"].greenlight_reviewers' \
  "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"

# 3. timeout 不等於 clean
#    把 gate 設成一個已知不會回應的 reviewer，確認該輪回報 timeout、
#    寫入 triggerable:false、且**沒有**結束 loop
# 4. unattended 不等待輸入
#    在有 >2 候選的 repo 上跑 `/greenlight external unattended`
```

Expected: 1 有回應；2 `pending` 清空且沒有捏造的 login 進 `observed`；3 回報 `timeout` 並換 gate；4 全程無提示。

**自動化測不到的兩處，只能走查**（誠實記錄，不要假裝有覆蓋）：

| 行為 | 為什麼測不到 | 怎麼確認 |
|---|---|---|
| 窗口內出現**兩個**新未綁定 login 時不綁定 | 決策在 SKILL.md 的 prompt 層。腳本只收 SKILL.md 已經決定好的 `bind` payload，看不到「窗口裡有幾個新 login」 | 讀 Step 2 的表格，確認該列存在且 unattended 分支明確寫「neither `bind` nor `dropPending`」 |
| 四個終端狀態的分類 | 同上——`clean` / `timeout` 的判定發生在 prompt 層 | 上面實跑第 3 項；另確認 Step 3 的表沒有任何一列把沉默導向 `clean` |

腳本層對這兩者能保證的只有：`record` 在沒有 `bind` 時不會憑空綁定（Task 3 的 empty-payload 測試），以及 `resolve` 一輪只給一個 `bindingCandidate`（Task 4）。剩下的靠 prompt 走查。

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/SKILL.md
git commit -m "feat(greenlight): per-channel poll window with four terminal states

Trigger non-auto reviewers in parallel, collect from all selected logins
across all three channels, close on the gate. A silent gate is a timeout,
never a clean pass. One pending recipe binds per round."
```

---

### Task 10: Autopilot 交接

**Files:**
- Modify: `plugins/solopreneur/skills/autopilot/SKILL.md:314-322`
- Modify: `plugins/solopreneur/skills/autopilot/references/schemas.md`
- Modify: `plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md:88-95`

**Interfaces:**
- Consumes: Task 8 的 `select=` / `gate=` token
- Produces: `{SELECT}` / `{GATE}` 兩個 dispatch-time 變數與對應的 descriptor 欄位

**現況**（已查證）：autopilot 不直接呼叫 greenlight。它把變數代入 `references/pr-subagent-template.md`，由被 dispatch 的 worktree subagent 在其 Step 5 執行 `/greenlight size=m`（`pr-subagent-template.md:90`）。plan.yaml 的完整 schema 在 `references/schemas.md`（`autopilot/SKILL.md:174` 指向它），新欄位必須在那裡定義。既有的 `{SIZE}` 是要照抄的先例。

- [ ] **Step 1: schema 定義新欄位**

在 `references/schemas.md` 的 PR descriptor 定義中新增兩個 optional 欄位，措辭比照既有 `size`：

```markdown
| `select` | optional | Comma-separated reviewer recipe ids for `/greenlight`. Resolved during the interactive planning phase; omit to let greenlight resolve from per-repo config. |
| `gate`   | optional | The recipe whose clean pass gates the review loop. Omit to use the first available `fallback_order` entry. |
```

- [ ] **Step 2: 加入 dispatch-time 變數**

在 `autopilot/SKILL.md:314-322` 的變數清單中，緊接 `{SIZE}` 之後：

```markdown
   - `{SELECT}`    = the planned reviewer selection as a comma-separated recipe
     list — Step 5 of the suffix passes it as `select={SELECT}`. When the
     descriptor set none, drop the `select={SELECT}` clause entirely.
   - `{GATE}`      = the recipe whose clean pass gates the loop — passed as
     `gate={GATE}`. Drop the clause when unset, exactly as with `{SIZE}`.
```

- [ ] **Step 3: 規劃階段問一次**

autopilot 的規劃階段互動、dispatch 之後不互動，所以問答必須在規劃時完成。在產出 descriptor 的步驟加入：

```markdown
While still interactive, resolve the reviewer selection once for this repo:

```bash
REPO_KEY=$(solopreneur_repo_key)
FALLBACK_ORDER=$(read_solopreneur_config greenlight | jq -r '(.fallback_order // []) | join(",")')
RESOLVED=$(… | node "${CLAUDE_SKILL_DIR}/"../greenlight/scripts/reviewer-state.mjs resolve \
  --repo-key "$REPO_KEY" --fallback-order "$FALLBACK_ORDER")
```

If `RESOLVED.needsPrompt` is true, ask greenlight's two selection questions here
and write the answers into the descriptor's `select` / `gate` fields. Asking now
is the whole point — the dispatched agent cannot.
```

That path reaches across sibling skills, which holds because `autopilot` and
`greenlight` are both skills of the **same** plugin and therefore always share a
parent directory. Step 5's grep confirms the resolved path. If it ever fails to
resolve, degrade rather than block: skip the pre-resolution, leave `select` /
`gate` unset, and let the dispatched `unattended` run pick its default gate —
the descriptor fields are optional precisely so this is survivable.

- [ ] **Step 4: 模板傳遞 token 並明確帶 `unattended`**

改 `references/pr-subagent-template.md:88-95`。除了新 token，**還要明確加上 `unattended`**——目前的 invocation 沒有它（`pr-subagent-template.md:90` 只有 `size={SIZE}`），而新的降級行為（不問、不 halt、用預設 gate）是綁在該 token 上的：

```markdown
Invoke the /greenlight skill with the `unattended` token — a dispatched run has
no human to answer a selection prompt, and `unattended` is what makes greenlight
pick a defensible default gate instead of blocking. When the plan set a size,
pass `size={SIZE}`; when it recorded a reviewer selection, also pass
`select={SELECT}` and `gate={GATE}`. For example:

    /greenlight unattended size=m select=coderabbit,codex-bot gate=codex-bot

With no selection tokens, greenlight resolves from the per-repo config and falls
back to the first available `fallback_order` entry as gate.
```

- [ ] **Step 5: 走查一致性**

```bash
cd /Users/Hana/Agents/nana/repos/solopreneur
# 模板傳出的 token 必須與 greenlight 解析的相同拼法
grep -n "select=\|gate=\|unattended" plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md
grep -n "select=\|gate=" plugins/solopreneur/skills/greenlight/SKILL.md
# 變數必須有定義，否則代入後留下字面 {SELECT}
grep -n "{SELECT}\|{GATE}" plugins/solopreneur/skills/autopilot/SKILL.md
# schema 必須定義欄位，否則 descriptor 驗證不到
grep -n "select\|gate" plugins/solopreneur/skills/autopilot/references/schemas.md
```

Expected: 四個 grep 都有命中；token 拼法兩邊一致（`select=` / `gate=`，非 `--select`）。

- [ ] **Step 6: Commit**

```bash
git add plugins/solopreneur/skills/autopilot/SKILL.md \
        plugins/solopreneur/skills/autopilot/references/schemas.md \
        plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md
git commit -m "feat(autopilot): pass reviewer selection through to greenlight

Resolve the selection during interactive planning and hand it to the
dispatched subagent as select=/gate= tokens, mirroring size=. The dispatched
invocation now carries `unattended` explicitly, which is what the
no-prompt fallback is keyed on."
```

**PR 2 收尾：** 開 PR，標題 `feat(greenlight): selectable gate and multi-reviewer collection`。內文附 Task 9 Step 4 的四項實跑結果。

---

## 完成後

兩個 PR 都 merge 後跑 `/release`，`solopreneur` plugin 取 patch bump。依 repo 根 `CLAUDE.md`，版本只由 `/release` 動，本 plan 的任何 commit 都不碰 `plugin.json`。
