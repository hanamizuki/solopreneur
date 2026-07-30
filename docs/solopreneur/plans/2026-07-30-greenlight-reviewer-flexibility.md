# Greenlight Reviewer Flexibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 greenlight 的 external reviewer 從硬編碼 login 白名單 + 純序列 fallback，改成通用 bot 偵測 + per-repo 觀測快取 + 使用者選定的 clean-pass gate。

**Architecture:** 現在 detection 的過濾/合併/決策全寫成 inline bash 讓 LLM 每次複製執行（`greenlight/SKILL.md:1549-1586`）。這些是純資料處理，抽成兩支 Node 腳本後可測、行為一致、SKILL.md 也變短。registry 收成純資料表（每個工具一行 trigger），所有 per-repo 事實（login 綁定、有沒有開 auto、能不能觸發）改由觀測寫進 config。沿用 `preview` skill 已在 CI 跑的腳本 + `node --test` 架構。

**Tech Stack:** Node.js >= 20（僅 `node:` built-ins）、`node:test` + `node:assert/strict`、`gh` CLI（由 SKILL.md 呼叫，不由腳本呼叫）、GitHub Actions。

## Global Constraints

- **Node >= 20，只用 `node:` built-in 模組。** 這個 repo 全域沒有 `package.json`、沒有 lockfile、不裝任何依賴（見 `.github/workflows/validate-preview-tests.yml:44-49` 的說明）。
- **腳本的註解與文件字串一律英文。** repo 根目錄有 `LICENSE`，屬 open source。plan 與 todos 文件本身維持中文（repo 現況慣例）。
- **腳本不呼叫 `gh`、不算 repo-key。** 兩者都由 SKILL.md 傳入。腳本保持純粹以便 hermetic 測試。
- **config 寫入必須保留 sibling keys** — sibling repos 與同 repo 內的 sibling features 都不能被覆寫，比照 `plugins/solopreneur/shared/config.md:274` 的 `write_solopreneur_repo_config` 契約（atomic read-modify-write）。
- **`--json` 是唯一機器可讀契約。** 人類可讀輸出不保證可解析，比照 `preview/scripts/config-resolve.mjs:12-15`。
- **不動 post-commit mode 與 uncommitted mode。** 只改 PR mode。
- **不 bump plugin 版本。** 依 repo 根 `CLAUDE.md`，版本只由 `/release` 動。
- **測試必須 hermetic**：`HOME` 指向 fixture 目錄，`CLAUDE_CONFIG_DIR` 明確設定，開發者自己的 config 不得洩入。

參考 spec：`todos/backlog/2026-07-30_greenlight-reviewer-flexibility.md`

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `plugins/solopreneur/skills/greenlight/scripts/reviewer-registry.mjs` | 廠商知識：每個工具的 trigger 指令、handshake、poll 政策。純資料 + 查詢函式，無 I/O。 |
| `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs` | 三個 subcommand：`detect`（過濾活動樣本）、`resolve`（決定這輪觸發誰／收誰／gate 是誰）、`record`（觀測回寫 config）。唯一 I/O 是讀寫 config 檔與 stdin/stdout。 |
| `plugins/solopreneur/skills/greenlight/tests/reviewer-registry.test.mjs` | registry 表格完整性 + alias 查詢。 |
| `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs` | 三個 subcommand 的契約：exit code、stdout 形狀、config 寫入結果。 |
| `.github/workflows/validate-greenlight-tests.yml` | CI gate，比照 `validate-preview-tests.yml`。 |
| `plugins/solopreneur/skills/greenlight/SKILL.md` | 改為呼叫腳本；registry 表格瘦身；gate 互動與 loop 流程改寫。 |
| `plugins/solopreneur/shared/config.md` | 補 `greenlight.reviewers` 的欄位說明。 |

**PR 邊界**（每個 PR 獨立可上線、獨立有價值）：

- **PR 1 = Task 1–4**：純新增腳本 + 測試 + CI。不碰 SKILL.md，行為零變化。
- **PR 2 = Task 5–7**：SKILL.md 接上腳本、registry 瘦身、CodeRabbit 改為可觸發。
- **PR 3 = Task 8–10**：gate 選擇互動、poll 窗口與觀測回寫、降級與 autopilot 整合。

---

## PR 1 — 腳本與測試（行為不變）

### Task 1: Reviewer registry

**Files:**
- Create: `plugins/solopreneur/skills/greenlight/scripts/reviewer-registry.mjs`
- Test: `plugins/solopreneur/skills/greenlight/tests/reviewer-registry.test.mjs`

**Interfaces:**
- Consumes: 無（第一個 task）
- Produces: `RECIPES`（object，key = recipe id）、`DEFAULT_POLL`、`recipeFor(idOrAlias) -> {id, ...recipe} | null`、`allRecipeIds() -> string[]`。Task 3 的 `resolve` 與 Task 4 的 `record` 只 import `recipeFor`；`allRecipeIds` 由本 task 的測試使用，並在 Task 8 的「add one not listed」清單中列出可選工具。

- [ ] **Step 1: 寫 failing test**

建立 `tests/reviewer-registry.test.mjs`：

```javascript
/**
 * Tests for scripts/reviewer-registry.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs
 *
 * The registry is pure data, so these tests import it directly rather than
 * spawning a CLI. The completeness cases matter most: they are the guard that
 * fires when someone adds a tool to the table and forgets a required field.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECIPES, DEFAULT_POLL, recipeFor, allRecipeIds,
} from '../scripts/reviewer-registry.mjs';

test('recipeFor resolves a canonical id', () => {
  const r = recipeFor('codex-bot');
  assert.equal(r.id, 'codex-bot');
  assert.equal(r.trigger, '@codex review');
});

test('recipeFor resolves an alias', () => {
  assert.equal(recipeFor('codex bot').id, 'codex-bot');
  assert.equal(recipeFor('cursor').id, 'bugbot');
});

test('recipeFor is case-insensitive and trims', () => {
  assert.equal(recipeFor('  Codex Bot  ').id, 'codex-bot');
});

test('recipeFor returns null for an unknown name', () => {
  assert.equal(recipeFor('nope'), null);
  assert.equal(recipeFor(''), null);
  assert.equal(recipeFor(undefined), null);
});

test('every github-bot recipe carries a non-empty trigger', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    if (r.kind !== 'github-bot') continue;
    assert.ok(r.trigger && r.trigger.trim().length > 0, `${id} has no trigger`);
  }
});

test('every recipe carries a complete poll policy', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    if (r.kind === 'local-cli') continue;   // read stdout, never polled
    for (const field of ['firstWaitSec', 'intervalSec', 'tries']) {
      assert.equal(typeof r.poll[field], 'number', `${id}.poll.${field} missing`);
    }
  }
});

test('aliases are unique across recipes', () => {
  const seen = new Map();
  for (const [id, r] of Object.entries(RECIPES)) {
    for (const a of r.aliases) {
      assert.ok(!seen.has(a), `alias "${a}" claimed by both ${seen.get(a)} and ${id}`);
      seen.set(a, id);
    }
  }
});

test('the three newly added tools are present', () => {
  for (const id of ['coderabbit', 'bugbot', 'greptile']) {
    assert.ok(allRecipeIds().includes(id), `${id} missing from registry`);
  }
});

test('newly added tools use the default poll policy', () => {
  for (const id of ['coderabbit', 'bugbot', 'greptile']) {
    assert.deepEqual(RECIPES[id].poll, DEFAULT_POLL);
    assert.equal(RECIPES[id].handshake, 'none');
  }
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/reviewer-registry.test.mjs
```

Expected: FAIL — `Cannot find module '../scripts/reviewer-registry.mjs'`

- [ ] **Step 3: 寫實作**

建立 `scripts/reviewer-registry.mjs`：

```javascript
/**
 * The reviewer registry: vendor knowledge only.
 *
 * Requires Node.js >= 20. No I/O, no dependencies — pure data plus lookup.
 *
 * What belongs here: facts that are identical for every user of a given tool —
 * the comment that triggers it, whether it acknowledges a trigger, how long to
 * wait. What must NOT be here: anything that varies per repo or per user. In
 * particular there is deliberately no bot-login field. A tool's GitHub login
 * cannot be known from outside: probing found `cursor[bot]`, `cursor-com[bot]`
 * and `bugbot[bot]` all to be real accounts, and GitHub Copilot's login is
 * `Copilot` with no `[bot]` suffix at all. Logins are observed at trigger time
 * and cached per repo by reviewer-state.mjs instead.
 *
 * Nor is there an "auto-review on push" field. Whether a tool reviews
 * automatically is a per-user setting (Bugbot exposes it in Cursor's personal
 * settings; `@coderabbitai pause` turns CodeRabbit's off), invisible from the
 * repo. It is observed, not declared.
 *
 * Adding a tool is therefore one row whose only required thought is the trigger
 * string: `handshake: 'none'` plus DEFAULT_POLL is the safe fallback, proven by
 * the `gemini` row which has never had a handshake.
 */

/**
 * Fallback timing for any tool whose acknowledgement behaviour is unverified.
 * First wait is long enough for a cold start; the retries cover a slow queue.
 */
export const DEFAULT_POLL = { firstWaitSec: 180, intervalSec: 120, tries: 3 };

export const RECIPES = {
  'codex-bot': {
    aliases: ['codex bot'],
    kind: 'github-bot',
    trigger: '@codex review',
    // Verified: leaves a 👀 reaction on the triggering comment.
    handshake: 'reaction',
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
    // Incremental review. `@coderabbitai full review` re-reviews from scratch.
    trigger: '@coderabbitai review',
    handshake: 'none',
    poll: DEFAULT_POLL,
  },
  bugbot: {
    aliases: ['bugbot', 'cursor'],
    kind: 'github-bot',
    // Must be a top-level comment; Cursor ignores it inside a thread reply.
    trigger: 'bugbot run',
    handshake: 'none',
    poll: DEFAULT_POLL,
  },
  greptile: {
    aliases: ['greptile'],
    kind: 'github-bot',
    trigger: '@greptileai',
    handshake: 'none',
    poll: DEFAULT_POLL,
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

/** Canonical ids, in table order. */
export function allRecipeIds() {
  return Object.keys(RECIPES);
}

/**
 * Resolve a canonical id or a user-typed alias to its recipe.
 * Returns the recipe with its `id` attached, or null when nothing matches.
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

Expected: PASS，9 個 test 全綠

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/scripts/reviewer-registry.mjs \
        plugins/solopreneur/skills/greenlight/tests/reviewer-registry.test.mjs
git commit -m "feat(greenlight): add reviewer registry as pure data with lookup"
```

---

### Task 2: `detect` — 過濾活動樣本

**Files:**
- Create: `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs`
- Test: `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs`

**Interfaces:**
- Consumes: 無（`detect` 不需要 registry）
- Produces: CLI `reviewer-state.mjs detect`，stdin 吃 TSV `login<TAB>type<TAB>iso`，stdout 印 `{"bots":[{"login":"...","lastSeen":"..."}]}`，依 `login` 排序。Task 3 的 `resolve` 吃這個形狀。

**背景：** 這取代 `SKILL.md:1577-1582` 的 awk + jq + while-read pipeline。關鍵行為變更是過濾條件——從比對三筆硬編碼 login 改成看 `type == "Bot"`，任何 review bot 因此自動被發現。

- [ ] **Step 1: 寫 failing test**

建立 `tests/reviewer-state.test.mjs`：

```javascript
/**
 * Tests for scripts/reviewer-state.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs
 *
 * Every case spawns the real CLI with a controlled environment so the contract
 * under test is the one callers depend on: exit code, stdout shape, and what
 * lands in the config file. CLAUDE_CONFIG_DIR always points at a fixture, so a
 * developer's own solopreneur.json can never leak in or be written to.
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

/** A fresh config dir. realpath'd because macOS tmpdir sits under a symlink. */
function tmpConfigDir(configJson) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gl-state-')));
  fixtures.push(dir);
  if (configJson !== undefined) {
    fs.writeFileSync(path.join(dir, 'solopreneur.json'), JSON.stringify(configJson, null, 2));
  }
  return dir;
}

/** Run the CLI. `configDir` becomes CLAUDE_CONFIG_DIR. */
function run(args, { stdin = '', configDir } = {}) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir ?? tmpConfigDir() },
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

const TSV = (rows) => rows.map((r) => r.join('\t')).join('\n');

test('detect keeps only Bot authors', () => {
  const { code, stdout } = run(['detect'], {
    stdin: TSV([
      ['hanamizuki', 'User', '2026-07-29T10:00:00Z'],
      ['coderabbitai[bot]', 'Bot', '2026-07-29T11:00:00Z'],
    ]),
  });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout).bots, [
    { login: 'coderabbitai[bot]', lastSeen: '2026-07-29T11:00:00Z' },
  ]);
});

test('detect keeps a Bot whose login has no [bot] suffix', () => {
  // GitHub Copilot code review posts as login `Copilot`, type Bot. The old
  // allowlist comment in SKILL.md asserted every bot login carries the suffix;
  // this case is why detection must key on `type`, never on the name.
  const { stdout } = run(['detect'], {
    stdin: TSV([['Copilot', 'Bot', '2026-07-29T11:00:00Z']]),
  });
  assert.deepEqual(JSON.parse(stdout).bots, [
    { login: 'Copilot', lastSeen: '2026-07-29T11:00:00Z' },
  ]);
});

test('detect keeps the newest timestamp per login', () => {
  const { stdout } = run(['detect'], {
    stdin: TSV([
      ['coderabbitai[bot]', 'Bot', '2026-07-01T00:00:00Z'],
      ['coderabbitai[bot]', 'Bot', '2026-07-29T11:00:00Z'],
      ['coderabbitai[bot]', 'Bot', '2026-07-15T00:00:00Z'],
    ]),
  });
  assert.equal(JSON.parse(stdout).bots[0].lastSeen, '2026-07-29T11:00:00Z');
});

test('detect sorts by login so output is stable', () => {
  const { stdout } = run(['detect'], {
    stdin: TSV([
      ['zeta[bot]', 'Bot', '2026-07-29T11:00:00Z'],
      ['alpha[bot]', 'Bot', '2026-07-29T11:00:00Z'],
    ]),
  });
  assert.deepEqual(JSON.parse(stdout).bots.map((b) => b.login), ['alpha[bot]', 'zeta[bot]']);
});

test('detect ignores malformed and blank lines', () => {
  const { code, stdout } = run(['detect'], {
    stdin: ['only-one-field', '', 'a\tb', 'ok[bot]\tBot\t2026-07-29T11:00:00Z', '   '].join('\n'),
  });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout).bots.map((b) => b.login), ['ok[bot]']);
});

test('detect on empty stdin yields an empty list, not an error', () => {
  const { code, stdout } = run(['detect'], { stdin: '' });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout).bots, []);
});

test('an unknown subcommand exits 1 with usage on stderr', () => {
  const { code, stderr } = run(['bogus']);
  assert.equal(code, 1);
  assert.match(stderr, /usage/i);
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/reviewer-state.test.mjs
```

Expected: FAIL — 找不到 `reviewer-state.mjs`

- [ ] **Step 3: 寫實作（只做 `detect` + dispatch 骨架）**

建立 `scripts/reviewer-state.mjs`：

```javascript
#!/usr/bin/env node
/**
 * Per-repo reviewer state for greenlight: what bots act on this repo, which of
 * them to trigger this round, and which observations to remember.
 *
 * Requires Node.js >= 20. Only `node:` built-ins.
 *
 * Usage:
 *   reviewer-state.mjs detect
 *       stdin:  TSV lines `login<TAB>type<TAB>iso` (a GitHub activity sample)
 *       stdout: {"bots":[{"login","lastSeen"}]}  — Bot authors only, newest
 *               timestamp per login, sorted by login.
 *
 * This script never calls `gh` and never derives the repo key: both are passed
 * in by the caller. That keeps it pure enough to test hermetically, and keeps
 * the GitHub sampling logic in SKILL.md where it is already documented.
 *
 * Errors go to stderr with exit 1. stdout is always JSON — it is the machine
 * contract, so nothing human-oriented is ever printed there.
 */

const SUBCOMMANDS = ['detect'];

function usage(msg) {
  if (msg) process.stderr.write(`error: ${msg}\n`);
  process.stderr.write(`usage: reviewer-state.mjs <${SUBCOMMANDS.join('|')}>\n`);
  process.exit(1);
}

/** Read all of stdin. Returns '' when stdin is closed or empty. */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Reduce an activity sample to the bots in it.
 *
 * Filtering is on `type === 'Bot'`, never on the login text: a tool's login is
 * unpredictable (`Copilot` carries no `[bot]` suffix), and an allowlist of
 * logins is exactly what stops a newly installed reviewer from being seen.
 */
function detect(tsv) {
  const newest = new Map();
  for (const line of tsv.split('\n')) {
    const parts = line.split('\t');
    if (parts.length !== 3) continue;               // malformed row
    const [login, type, at] = parts.map((s) => s.trim());
    if (!login || type !== 'Bot' || !at) continue;
    const prev = newest.get(login);
    if (prev === undefined || at > prev) newest.set(login, at);
  }
  return [...newest.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([login, lastSeen]) => ({ login, lastSeen }));
}

async function main() {
  const [sub] = process.argv.slice(2);
  if (!sub) usage('no subcommand given');

  if (sub === 'detect') {
    process.stdout.write(`${JSON.stringify({ bots: detect(await readStdin()) })}\n`);
    return;
  }

  usage(`unknown subcommand "${sub}"`);
}

main().catch((err) => {
  process.stderr.write(`error: ${err.message}\n`);
  process.exit(1);
});
```

- [ ] **Step 4: 跑測試確認通過**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/reviewer-state.test.mjs
```

Expected: PASS，7 個 test 全綠

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs \
        plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs
git commit -m "feat(greenlight): add reviewer-state detect subcommand

Filters an activity sample on user type rather than a hardcoded login
allowlist, so any newly installed review bot is discovered automatically."
```

---

### Task 3: `resolve` — 這輪的 reviewer 決策

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs`
- Modify: `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `recipeFor`；Task 2 的 `detect` 輸出形狀
- Produces: CLI `reviewer-state.mjs resolve --repo-key <K> [--select <ids>] [--gate <id>]`。stdin 吃 `{"bots":[...]}`，stdout 印：

```json
{
  "available": [{"login":"...","recipe":"coderabbit","auto":true,"lastSeen":"..."}],
  "trigger":   [{"login":"...","recipe":"codex-bot","triggerText":"@codex review","poll":{...}}],
  "collect":   ["coderabbitai[bot]", "chatgpt-codex-connector[bot]"],
  "gate":      {"login":"...","recipe":"codex-bot"},
  "needsPrompt": true,
  "reason": "4 reviewers available (>2)"
}
```

Task 8 的 SKILL.md gate 互動吃 `needsPrompt` 與 `available`；Task 9 的 poll 窗口吃 `trigger`、`collect`、`gate`。

**決策規則**（來自 spec 的〈Reviewer 選擇與 gate〉與〈一輪 loop 的流程〉）：

- `available` = 偵測到的 bot ∪ config 裡有紀錄的 bot，排除 `triggerable === false`
- `trigger` = 選定者中 `auto !== true` 且有 recipe 的（`auto` 的不需要催、無 recipe 的無從催）
- `collect` = **所有**選定者，含 `recipe: null`（未識別 bot 的 finding 照收）
- `gate` = `--gate` 指定者；未指定時取 `fallback_order` 第一個在 `available` 中的
- `needsPrompt` = `available.length > 2` 且沒有明確 `--select`
- gate 必須有 recipe，否則 exit 1：沒 recipe 無法主動觸發，也就無從判定它這輪講完了

- [ ] **Step 1: 寫 failing test**

追加到 `tests/reviewer-state.test.mjs`：

```javascript
const CFG = (reviewers, fallbackOrder = ['codex-bot']) => ({
  repos: {
    'github.com/o/r': {
      greenlight: { fallback_order: fallbackOrder, reviewers },
    },
    'github.com/other/repo': { greenlight: { fallback_order: ['gemini'] } },
  },
});

const BOTS = (logins) => JSON.stringify({
  bots: logins.map((login) => ({ login, lastSeen: '2026-07-29T11:00:00Z' })),
});

test('resolve marks needsPrompt when more than two reviewers are available', () => {
  const dir = tmpConfigDir(CFG({
    'coderabbitai[bot]': { recipe: 'coderabbit', auto: true },
    'chatgpt-codex-connector[bot]': { recipe: 'codex-bot', auto: false },
    'cursor[bot]': { recipe: 'bugbot', auto: true },
  }));
  const { code, stdout } = run(['resolve', '--repo-key', 'github.com/o/r'], {
    stdin: BOTS(['coderabbitai[bot]', 'chatgpt-codex-connector[bot]', 'cursor[bot]']),
    configDir: dir,
  });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.available.length, 3);
  assert.equal(out.needsPrompt, true);
  assert.match(out.reason, />2|more than two/i);
});

test('resolve does not prompt for two reviewers', () => {
  const dir = tmpConfigDir(CFG({
    'coderabbitai[bot]': { recipe: 'coderabbit', auto: true },
    'chatgpt-codex-connector[bot]': { recipe: 'codex-bot', auto: false },
  }));
  const { stdout } = run(['resolve', '--repo-key', 'github.com/o/r'], {
    stdin: BOTS(['coderabbitai[bot]', 'chatgpt-codex-connector[bot]']),
    configDir: dir,
  });
  assert.equal(JSON.parse(stdout).needsPrompt, false);
});

test('resolve does not prompt when --select is explicit', () => {
  const dir = tmpConfigDir(CFG({
    'coderabbitai[bot]': { recipe: 'coderabbit', auto: true },
    'chatgpt-codex-connector[bot]': { recipe: 'codex-bot', auto: false },
    'cursor[bot]': { recipe: 'bugbot', auto: true },
  }));
  const { stdout } = run([
    'resolve', '--repo-key', 'github.com/o/r',
    '--select', 'coderabbit,codex-bot,bugbot', '--gate', 'codex-bot',
  ], { stdin: BOTS(['coderabbitai[bot]', 'chatgpt-codex-connector[bot]', 'cursor[bot]']), configDir: dir });
  assert.equal(JSON.parse(stdout).needsPrompt, false);
});

test('resolve excludes triggerable:false from available', () => {
  const dir = tmpConfigDir(CFG({
    'coderabbitai[bot]': { recipe: 'coderabbit', auto: true },
    'chatgpt-codex-connector[bot]': { recipe: 'codex-bot', auto: false },
    'gemini-code-assist[bot]': { recipe: 'gemini', auto: false, triggerable: false },
  }));
  const { stdout } = run(['resolve', '--repo-key', 'github.com/o/r'], {
    stdin: BOTS(['coderabbitai[bot]', 'chatgpt-codex-connector[bot]', 'gemini-code-assist[bot]']),
    configDir: dir,
  });
  const out = JSON.parse(stdout);
  assert.equal(out.available.length, 2);
  assert.equal(out.needsPrompt, false);
  assert.ok(!out.available.some((r) => r.login === 'gemini-code-assist[bot]'));
});

test('resolve omits auto reviewers from trigger but keeps them in collect', () => {
  const dir = tmpConfigDir(CFG({
    'coderabbitai[bot]': { recipe: 'coderabbit', auto: true },
    'chatgpt-codex-connector[bot]': { recipe: 'codex-bot', auto: false },
  }));
  const { stdout } = run(['resolve', '--repo-key', 'github.com/o/r'], {
    stdin: BOTS(['coderabbitai[bot]', 'chatgpt-codex-connector[bot]']),
    configDir: dir,
  });
  const out = JSON.parse(stdout);
  assert.deepEqual(out.trigger.map((t) => t.login), ['chatgpt-codex-connector[bot]']);
  assert.ok(out.collect.includes('coderabbitai[bot]'));
  assert.ok(out.collect.includes('chatgpt-codex-connector[bot]'));
});

test('resolve attaches trigger text and poll policy from the registry', () => {
  const dir = tmpConfigDir(CFG({ 'chatgpt-codex-connector[bot]': { recipe: 'codex-bot', auto: false } }));
  const { stdout } = run(['resolve', '--repo-key', 'github.com/o/r'], {
    stdin: BOTS(['chatgpt-codex-connector[bot]']), configDir: dir,
  });
  const [t] = JSON.parse(stdout).trigger;
  assert.equal(t.triggerText, '@codex review');
  assert.equal(t.poll.tries, 20);
});

test('resolve collects an unidentified bot but never triggers it', () => {
  const dir = tmpConfigDir(CFG({ 'chatgpt-codex-connector[bot]': { recipe: 'codex-bot', auto: false } }));
  const { stdout } = run(['resolve', '--repo-key', 'github.com/o/r'], {
    stdin: BOTS(['chatgpt-codex-connector[bot]', 'brand-new[bot]']), configDir: dir,
  });
  const out = JSON.parse(stdout);
  assert.ok(out.collect.includes('brand-new[bot]'));
  assert.ok(!out.trigger.some((t) => t.login === 'brand-new[bot]'));
});

test('resolve defaults gate to the first available entry of fallback_order', () => {
  const dir = tmpConfigDir(CFG({
    'coderabbitai[bot]': { recipe: 'coderabbit', auto: true },
    'chatgpt-codex-connector[bot]': { recipe: 'codex-bot', auto: false },
  }, ['gemini', 'codex-bot']));
  const { stdout } = run(['resolve', '--repo-key', 'github.com/o/r'], {
    stdin: BOTS(['coderabbitai[bot]', 'chatgpt-codex-connector[bot]']), configDir: dir,
  });
  // `gemini` is listed first but is not available here, so codex-bot takes it.
  assert.equal(JSON.parse(stdout).gate.recipe, 'codex-bot');
});

test('resolve honours an explicit --gate, including an auto reviewer', () => {
  const dir = tmpConfigDir(CFG({
    'coderabbitai[bot]': { recipe: 'coderabbit', auto: true },
    'chatgpt-codex-connector[bot]': { recipe: 'codex-bot', auto: false },
  }));
  const { stdout } = run([
    'resolve', '--repo-key', 'github.com/o/r', '--gate', 'coderabbit',
  ], { stdin: BOTS(['coderabbitai[bot]', 'chatgpt-codex-connector[bot]']), configDir: dir });
  assert.equal(JSON.parse(stdout).gate.login, 'coderabbitai[bot]');
});

test('resolve rejects a gate with no recipe', () => {
  const dir = tmpConfigDir(CFG({ 'chatgpt-codex-connector[bot]': { recipe: 'codex-bot', auto: false } }));
  const { code, stderr } = run([
    'resolve', '--repo-key', 'github.com/o/r', '--gate', 'brand-new[bot]',
  ], { stdin: BOTS(['chatgpt-codex-connector[bot]', 'brand-new[bot]']), configDir: dir });
  assert.equal(code, 1);
  assert.match(stderr, /recipe/i);
});

test('resolve on a repo with no config still reports detected bots', () => {
  const { code, stdout } = run(['resolve', '--repo-key', 'github.com/fresh/repo'], {
    stdin: BOTS(['coderabbitai[bot]']), configDir: tmpConfigDir(),
  });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.available.length, 1);
  assert.equal(out.available[0].recipe, null);
});

test('resolve requires --repo-key', () => {
  const { code, stderr } = run(['resolve'], { stdin: BOTS([]) });
  assert.equal(code, 1);
  assert.match(stderr, /repo-key/);
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/reviewer-state.test.mjs
```

Expected: FAIL — `unknown subcommand "resolve"`（新增的 12 個 case 失敗，Task 2 的 7 個仍綠）

- [ ] **Step 3: 寫實作**

在 `scripts/reviewer-state.mjs` 的 import 區加入 registry，並把 `SUBCOMMANDS` 改成 `['detect', 'resolve']`：

```javascript
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recipeFor } from './reviewer-registry.mjs';
```

加入 config 讀取與參數解析：

```javascript
/** The primary config file, matching the shell helpers in shared/config.md. */
function configPath() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'solopreneur.json');
}

/** Read the config, or {} when absent/unreadable. Never throws. */
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

/** The greenlight block for one repo key, with defaults filled in. */
function greenlightFor(cfg, repoKey) {
  const block = cfg?.repos?.[repoKey]?.greenlight ?? {};
  return {
    fallbackOrder: Array.isArray(block.fallback_order) ? block.fallback_order : [],
    reviewers: block.reviewers && typeof block.reviewers === 'object' ? block.reviewers : {},
  };
}

/** Minimal `--flag value` parser. Unknown flags are an error, not ignored. */
function parseFlags(argv, allowed) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith('--')) usage(`unexpected argument "${flag}"`);
    const name = flag.slice(2);
    if (!allowed.includes(name)) usage(`unknown flag "${flag}"`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) usage(`${flag} needs a value`);
    out[name] = value;
    i += 1;
  }
  return out;
}
```

加入 resolve 實作：

```javascript
/**
 * Decide this round's reviewer roles.
 *
 * `available` merges what detection saw with what config remembers, minus
 * anything already proven untriggerable. Everything selected lands in
 * `collect` — including bots with no recipe, whose findings are still worth
 * reading. Only recipe-bearing, non-auto reviewers land in `trigger`: an auto
 * reviewer needs no prompting, and one without a recipe cannot be prompted.
 */
function resolve({ bots, repoKey, select, gate }) {
  const { fallbackOrder, reviewers } = greenlightFor(readConfig(), repoKey);

  // Union of observed and remembered, keyed by login.
  const merged = new Map();
  for (const [login, rec] of Object.entries(reviewers)) merged.set(login, { login, ...rec });
  for (const b of bots) {
    const prev = merged.get(b.login) ?? { login: b.login, recipe: null };
    merged.set(b.login, { ...prev, lastSeen: b.lastSeen });
  }

  const available = [...merged.values()]
    .filter((r) => r.triggerable !== false)
    .map((r) => ({
      login: r.login,
      recipe: r.recipe ?? null,
      auto: r.auto === true,
      lastSeen: r.lastSeen ?? null,
    }))
    .sort((a, b) => (a.login < b.login ? -1 : a.login > b.login ? 1 : 0));

  // `--select` names recipes (or logins for unidentified bots).
  const wanted = select ? select.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const selected = wanted
    ? available.filter((r) => wanted.includes(r.recipe) || wanted.includes(r.login))
    : available;

  const trigger = selected
    .filter((r) => !r.auto && r.recipe)
    .map((r) => {
      const recipe = recipeFor(r.recipe);
      return {
        login: r.login,
        recipe: r.recipe,
        triggerText: recipe.trigger,
        poll: recipe.poll ?? null,
      };
    });

  // Gate: explicit flag wins; otherwise the first fallback_order entry that is
  // actually available. Falls back to the first selected entry with a recipe.
  let gateEntry = null;
  if (gate) {
    gateEntry = selected.find((r) => r.recipe === gate || r.login === gate) ?? null;
    if (!gateEntry) usage(`--gate "${gate}" is not among the available reviewers`);
    if (!gateEntry.recipe) {
      usage(`--gate "${gate}" has no recipe, so it cannot be triggered or gated on`);
    }
  } else {
    for (const id of fallbackOrder) {
      gateEntry = selected.find((r) => r.recipe === id) ?? null;
      if (gateEntry) break;
    }
    gateEntry ??= selected.find((r) => r.recipe) ?? null;
  }

  const needsPrompt = !wanted && available.length > 2;

  return {
    available,
    trigger,
    collect: selected.map((r) => r.login),
    gate: gateEntry ? { login: gateEntry.login, recipe: gateEntry.recipe } : null,
    needsPrompt,
    reason: needsPrompt
      ? `${available.length} reviewers available (>2), ask which to use and which gates`
      : null,
  };
}
```

在 `main()` 的 dispatch 加入：

```javascript
  if (sub === 'resolve') {
    const flags = parseFlags(process.argv.slice(3), ['repo-key', 'select', 'gate']);
    if (!flags['repo-key']) usage('resolve needs --repo-key');
    const input = await readStdin();
    const { bots = [] } = input.trim() ? JSON.parse(input) : {};
    process.stdout.write(`${JSON.stringify(resolve({
      bots, repoKey: flags['repo-key'], select: flags.select, gate: flags.gate,
    }))}\n`);
    return;
  }
```

- [ ] **Step 4: 跑測試確認通過**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs
```

Expected: PASS，全部 28 個 test 綠（9 registry + 19 state）

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs \
        plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs
git commit -m "feat(greenlight): add reviewer-state resolve subcommand

Merges detection with the per-repo cache and decides this round's roles:
who to trigger, whose findings to collect, and which reviewer gates the
loop. Auto reviewers are collected but never prompted."
```

---

### Task 4: `record` — 觀測回寫與 CI gate

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs`
- Modify: `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs`
- Create: `.github/workflows/validate-greenlight-tests.yml`

**Interfaces:**
- Consumes: Task 3 的 config 讀取函式
- Produces: CLI `reviewer-state.mjs record --repo-key <K>`，stdin 吃：

```json
{"observations":[
  {"login":"coderabbitai[bot]","auto":true},
  {"login":"gemini-code-assist[bot]","triggerable":false},
  {"login":"cursor[bot]","recipe":"bugbot"}
]}
```

寫進 `repos[<K>].greenlight.reviewers`，逐 login merge（未提供的欄位保留原值），stdout 印寫入後的該區塊。

- [ ] **Step 1: 寫 failing test**

追加到 `tests/reviewer-state.test.mjs`：

```javascript
const readBack = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'));

test('record creates the reviewers block on a fresh config', () => {
  const dir = tmpConfigDir();
  const { code } = run(['record', '--repo-key', 'github.com/o/r'], {
    stdin: JSON.stringify({ observations: [{ login: 'coderabbitai[bot]', auto: true }] }),
    configDir: dir,
  });
  assert.equal(code, 0);
  assert.deepEqual(
    readBack(dir).repos['github.com/o/r'].greenlight.reviewers['coderabbitai[bot]'],
    { auto: true },
  );
});

test('record merges into an existing entry without dropping fields', () => {
  const dir = tmpConfigDir(CFG({
    'cursor[bot]': { recipe: 'bugbot', auto: false },
  }));
  run(['record', '--repo-key', 'github.com/o/r'], {
    stdin: JSON.stringify({ observations: [{ login: 'cursor[bot]', auto: true }] }),
    configDir: dir,
  });
  assert.deepEqual(
    readBack(dir).repos['github.com/o/r'].greenlight.reviewers['cursor[bot]'],
    { recipe: 'bugbot', auto: true },
  );
});

test('record writes triggerable:false for a reviewer that never answered', () => {
  const dir = tmpConfigDir(CFG({ 'gemini-code-assist[bot]': { recipe: 'gemini' } }));
  run(['record', '--repo-key', 'github.com/o/r'], {
    stdin: JSON.stringify({ observations: [{ login: 'gemini-code-assist[bot]', triggerable: false }] }),
    configDir: dir,
  });
  assert.equal(
    readBack(dir).repos['github.com/o/r'].greenlight.reviewers['gemini-code-assist[bot]'].triggerable,
    false,
  );
});

test('record binds a newly learned recipe to an observed login', () => {
  const dir = tmpConfigDir(CFG({}));
  run(['record', '--repo-key', 'github.com/o/r'], {
    stdin: JSON.stringify({ observations: [{ login: 'cursor[bot]', recipe: 'bugbot', auto: false }] }),
    configDir: dir,
  });
  assert.equal(
    readBack(dir).repos['github.com/o/r'].greenlight.reviewers['cursor[bot]'].recipe,
    'bugbot',
  );
});

test('record preserves sibling repos and sibling features', () => {
  const dir = tmpConfigDir({
    default: { todos: { path: 'todos' } },
    repos: {
      'github.com/o/r': {
        preview: { path: 'docs/preview' },
        greenlight: { fallback_order: ['codex-bot'] },
      },
      'github.com/other/repo': { greenlight: { fallback_order: ['gemini'] } },
    },
  });
  run(['record', '--repo-key', 'github.com/o/r'], {
    stdin: JSON.stringify({ observations: [{ login: 'coderabbitai[bot]', auto: true }] }),
    configDir: dir,
  });
  const cfg = readBack(dir);
  assert.deepEqual(cfg.default, { todos: { path: 'todos' } });
  assert.deepEqual(cfg.repos['github.com/other/repo'], { greenlight: { fallback_order: ['gemini'] } });
  assert.deepEqual(cfg.repos['github.com/o/r'].preview, { path: 'docs/preview' });
  assert.deepEqual(cfg.repos['github.com/o/r'].greenlight.fallback_order, ['codex-bot']);
});

test('record rejects an unknown recipe', () => {
  const dir = tmpConfigDir(CFG({}));
  const { code, stderr } = run(['record', '--repo-key', 'github.com/o/r'], {
    stdin: JSON.stringify({ observations: [{ login: 'x[bot]', recipe: 'nope' }] }),
    configDir: dir,
  });
  assert.equal(code, 1);
  assert.match(stderr, /nope/);
});

test('record rejects an observation with no login', () => {
  const { code, stderr } = run(['record', '--repo-key', 'github.com/o/r'], {
    stdin: JSON.stringify({ observations: [{ auto: true }] }),
  });
  assert.equal(code, 1);
  assert.match(stderr, /login/i);
});

test('record on an empty observation list leaves the config byte-identical', () => {
  const dir = tmpConfigDir(CFG({ 'cursor[bot]': { recipe: 'bugbot' } }));
  const before = fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8');
  const { code } = run(['record', '--repo-key', 'github.com/o/r'], {
    stdin: JSON.stringify({ observations: [] }), configDir: dir,
  });
  assert.equal(code, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), before);
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/reviewer-state.test.mjs
```

Expected: FAIL — `unknown subcommand "record"`

- [ ] **Step 3: 寫實作**

把 `SUBCOMMANDS` 改成 `['detect', 'resolve', 'record']`，並加入：

```javascript
/**
 * Merge observations into the per-repo reviewer cache.
 *
 * Written atomically via a temp file + rename so a crash mid-write cannot
 * truncate the user's config. Sibling repos and sibling features are read back
 * and re-emitted untouched, matching the contract of the shell helper in
 * shared/config.md.
 */
function record({ observations, repoKey }) {
  for (const obs of observations) {
    if (!obs?.login) throw new Error('every observation needs a login');
    if (obs.recipe != null && !recipeFor(obs.recipe)) {
      throw new Error(`unknown recipe "${obs.recipe}"`);
    }
  }

  const cfg = readConfig();
  const target = configPath();

  if (observations.length === 0) {
    // Nothing to merge — do not rewrite the file at all, so an empty round
    // cannot reformat or reorder a config the user hand-edited.
    return cfg?.repos?.[repoKey]?.greenlight?.reviewers ?? {};
  }

  cfg.repos ??= {};
  cfg.repos[repoKey] ??= {};
  cfg.repos[repoKey].greenlight ??= {};
  const reviewers = cfg.repos[repoKey].greenlight.reviewers ??= {};

  for (const { login, ...fields } of observations) {
    reviewers[login] = { ...(reviewers[login] ?? {}), ...fields };
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`);
  fs.renameSync(tmp, target);
  return reviewers;
}
```

在 `main()` 的 dispatch 加入：

```javascript
  if (sub === 'record') {
    const flags = parseFlags(process.argv.slice(3), ['repo-key']);
    if (!flags['repo-key']) usage('record needs --repo-key');
    const input = await readStdin();
    const { observations = [] } = input.trim() ? JSON.parse(input) : {};
    process.stdout.write(`${JSON.stringify(
      record({ observations, repoKey: flags['repo-key'] }),
    )}\n`);
    return;
  }
```

- [ ] **Step 4: 跑測試確認通過**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs
```

Expected: PASS，全部 36 個 test 綠（9 registry + 27 state）

- [ ] **Step 5: 加 CI workflow**

建立 `.github/workflows/validate-greenlight-tests.yml`。`failglob` 與不用 `node --test tests/` 的理由與 preview 那支相同，一併保留註解：

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
    strategy:
      fail-fast: false
      matrix:
        node: ['20', '22', '24']
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5  # v4

      - name: Install Node ${{ matrix.node }}
        uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38  # v6
        with:
          node-version: ${{ matrix.node }}
          # Deliberately no `cache:` — it keys on a lockfile and hard errors
          # when there is none. This repo ships no package.json anywhere and
          # the suite uses Node built-ins only.

      - name: Run the greenlight skill test suite
        working-directory: plugins/solopreneur/skills/greenlight
        run: |
          # failglob, or this gate can pass having run zero tests: with no match
          # bash passes the pattern through literally, Node >= 22.6 treats it as
          # its own glob, matches nothing, and exits 0 on "tests 0".
          shopt -s failglob
          # NOT `node --test tests/`: since Node 22.6 the positional arguments
          # are glob patterns rather than paths, so a bare directory matches
          # itself and Node tries to execute the directory as a test file.
          if ! node --test tests/*.test.mjs; then
            echo
            echo "::error::The greenlight skill's test suite failed on Node ${{ matrix.node }}."
            echo "::error::Reproduce with: cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs"
            exit 1
          fi
```

- [ ] **Step 6: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs \
        plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs \
        .github/workflows/validate-greenlight-tests.yml
git commit -m "feat(greenlight): add reviewer-state record subcommand and CI gate

Observations merge into repos[<key>].greenlight.reviewers atomically,
preserving sibling repos and features. An empty round leaves the file
byte-identical."
```

**PR 1 收尾：** 開 PR，標題 `feat(greenlight): reviewer registry and per-repo state scripts`。內文說明這是純新增、SKILL.md 未接上、行為零變化。

---

## PR 2 — SKILL.md 接上腳本

### Task 5: registry 表格瘦身

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md:1482-1524`（Reviewer Registry 段）

**Interfaces:**
- Consumes: Task 1 的 `RECIPES` 表內容
- Produces: SKILL.md 中指向腳本的 registry 段，後續 Task 供 Phase 3 引用

- [ ] **Step 1: 改寫 Reviewer Registry 段**

把 `SKILL.md:1488-1494` 的表格換成下表，**刪掉 `bot login` 欄與 `wizard eligibility` 欄**（前者是 per-repo 觀測值、後者由 `resolve` 的 `available` 決定）：

| recipe_id | aliases (arg) | kind | trigger | handshake | poll policy |
|---|---|---|---|---|---|
| `codex-bot` | `codex bot` | github-bot | PR comment `@codex review` | 👀 reaction | 60s first, 60s × 20 |
| `gemini` | `gemini` | github-bot | PR comment `/gemini review` | none | 180s first, 120s × 2 |
| `coderabbit` | `coderabbit` | github-bot | PR comment `@coderabbitai review` | none | default |
| `bugbot` | `bugbot`, `cursor` | github-bot | PR comment `bugbot run` (top-level only) | none | default |
| `greptile` | `greptile` | github-bot | PR comment `@greptileai` | none | default |
| `codex-cli` | `codex cli` | local-cli | `codex review --base main` | stdout `[P*]` | n/a |
| `agy` | `agy` | local-cli | `agy --model … --print` | stdout + marker | n/a |

把 `Reviewer kinds` 清單（`SKILL.md:1496-1502`）改成兩類，並刪掉 `passive-bot`：

```markdown
**Reviewer kinds:**
- **github-bot** — triggered by a PR comment and polled for. Whether it also
  reviews automatically on push is *observed*, not declared: see `auto` below.
- **local-cli** — runs locally and is read from stdout. Availability is decided
  by a CLI gate, not by activity detection.

There is deliberately **no bot-login column**. A tool's GitHub login cannot be
known from outside — `cursor[bot]`, `cursor-com[bot]` and `bugbot[bot]` are all
real accounts, and GitHub Copilot posts as `Copilot` with no `[bot]` suffix.
Logins are learned at trigger time and cached per repo. The single source of
truth for this table is `scripts/reviewer-registry.mjs`; keep them in sync.
```

刪除 `SKILL.md:1509-1521` 的 `REVIEWER_BOT_LOGINS` / `CODEX_BOT` / `GEMINI_BOT` / `CODERABBIT_BOT` bash 區塊——那份硬編碼清單被 `type == "Bot"` 過濾取代。

- [ ] **Step 2: 驗證表格與腳本一致**

```bash
cd plugins/solopreneur/skills/greenlight
node -e '
import("./scripts/reviewer-registry.mjs").then(({ RECIPES }) => {
  const md = require("node:fs").readFileSync("SKILL.md", "utf8");
  const missing = Object.keys(RECIPES).filter((id) => !md.includes("`" + id + "`"));
  if (missing.length) { console.error("SKILL.md missing recipe rows:", missing); process.exit(1); }
  console.log("all", Object.keys(RECIPES).length, "recipes present in SKILL.md");
});'
```

Expected: `all 7 recipes present in SKILL.md`

- [ ] **Step 3: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/SKILL.md
git commit -m "refactor(greenlight): trim reviewer registry to vendor knowledge

Drop the bot-login and wizard-eligibility columns plus the hardcoded
REVIEWER_BOT_LOGINS list. Fold passive-bot into github-bot: auto-review
is observed per repo, not a property of the tool."
```

---

### Task 6: detection 改呼叫腳本

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md:1526-1601`（Reviewer activity detection 段）

**Interfaces:**
- Consumes: Task 2 的 `detect`、Task 3 的 `resolve`
- Produces: `DETECTION_STATUS` / `RESOLVED`（`resolve` 的 JSON）供 Task 8–9 的 gate 互動與 poll 窗口使用

- [ ] **Step 1: 改寫採樣與過濾**

`collect_reviewer_activity()` 的三個來源保留（`SKILL.md:1549-1567`），但每個 `--jq` 都加上 `.user.type` 成為三欄 TSV：

```bash
# Source 1: repo-level issue/PR conversation comments
chunk=$(gh api "repos/$OWNER/$REPO/issues/comments?sort=created&direction=desc&per_page=100" \
          --jq '.[] | [.user.login, .user.type, .created_at] | @tsv') || rc=1
# Source 2: repo-level inline review comments
chunk=$(gh api "repos/$OWNER/$REPO/pulls/comments?sort=created&direction=desc&per_page=100" \
          --jq '.[] | [.user.login, .user.type, .created_at] | @tsv') || rc=1
# Source 3: formal reviews, per-PR
chunk=$(gh api "repos/$OWNER/$REPO/pulls/$n/reviews" \
          --jq '.[] | [.user.login, .user.type, .submitted_at] | @tsv') || rc=1
```

把 `SKILL.md:1573-1586` 的 awk + jq 過濾整段換成：

```bash
SCRIPTS="$CLAUDE_PLUGIN_ROOT/skills/greenlight/scripts"
REPO_KEY=$(solopreneur_repo_key)

if ACTIVITY=$(collect_reviewer_activity); then
  DETECTED=$(printf '%s\n' "$ACTIVITY" | node "$SCRIPTS/reviewer-state.mjs" detect)
  DETECTION_STATUS=ok
else
  DETECTED='{"bots":[]}'; DETECTION_STATUS=unavailable
fi

# Merge with the per-repo cache and decide this round's roles. Runs in both
# branches: on `unavailable` the cache alone still yields a usable decision,
# which is what keeps detection an enhancement rather than a gate.
RESOLVED=$(printf '%s' "$DETECTED" \
  | node "$SCRIPTS/reviewer-state.mjs" resolve --repo-key "$REPO_KEY")
```

- [ ] **Step 2: 更新結果解讀表**

把 `SKILL.md:1591-1595` 的表格改成：

| Result | Meaning | What happens |
|---|---|---|
| `DETECTION_STATUS=unavailable` | API failure / rate limit | `resolve` runs on the cache alone; if the cache is empty too, fall through to the default flow below |
| `ok`, `available` empty | No bot has ever acted here and nothing cached | Default flow (current behaviour) |
| `ok`, `available` non-empty | These bots act here | Proceed with `trigger` / `collect` / `gate` from `RESOLVED` |
| `ok`, `needsPrompt` true | More than two available | Run the selection prompt (Task 8) |

保留 `SKILL.md:1597-1601` 的「detection 只列選項、不證明存活」段落——那個論述在新架構下仍然成立，且正是 `triggerable: false` 自我修復存在的理由。

- [ ] **Step 3: 用真 repo 驗證**

```bash
cd /Users/Hana/Agents/nana/repos/solopreneur
OWNER=hanamizuki REPO=solopreneur
{
  gh api "repos/$OWNER/$REPO/issues/comments?sort=created&direction=desc&per_page=100" \
    --jq '.[] | [.user.login, .user.type, .created_at] | @tsv'
  gh api "repos/$OWNER/$REPO/pulls/comments?sort=created&direction=desc&per_page=100" \
    --jq '.[] | [.user.login, .user.type, .created_at] | @tsv'
} | node plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs detect
```

Expected: 三筆 bot——`chatgpt-codex-connector[bot]`、`coderabbitai[bot]`、`gemini-code-assist[bot]`，各帶 `lastSeen`。**沒有** `hanamizuki`（type User 被濾掉）。

- [ ] **Step 4: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/SKILL.md
git commit -m "refactor(greenlight): drive detection through reviewer-state script

Sample three sources as before, but filter on user type via the script
instead of an inline awk/jq pipeline against a hardcoded allowlist."
```

---

### Task 7: config.md 補欄位說明

**Files:**
- Modify: `plugins/solopreneur/shared/config.md`（`greenlight` 範例出現處：`:32`、`:164`、`:178`）

**Interfaces:**
- Consumes: Task 3–4 的 config 形狀
- Produces: 使用者可讀的 `reviewers` 欄位文件

- [ ] **Step 1: 在 greenlight 範例旁補說明**

於 `config.md` 現有 `greenlight` 範例段落後加入：

```markdown
### `greenlight.reviewers`

Per-repo observations about the review bots on that repo. Written by
`skills/greenlight/scripts/reviewer-state.mjs record`, keyed by the bot's
GitHub login:

| Field | Written by | Meaning |
|---|---|---|
| `recipe` | learned on first successful trigger | which registry row this login is; `null` = tool not identified, findings are still collected but it is never triggered and cannot gate |
| `auto` | observation | it comments without being triggered, so greenlight does not prompt it |
| `triggerable` | self-healing | `false` after a trigger got no response; excluded from `available` until removed by hand |

`fallback_order` keeps its meaning but now orders **gate candidates** rather
than the single active reviewer. Entries are recipe ids.

Stale entries are self-correcting: a `triggerable: false` write happens exactly
when a trigger times out, so a removed bot stops being called after one wasted
round rather than every round.
```

- [ ] **Step 2: 驗證文件與腳本欄位名一致**

```bash
cd /Users/Hana/Agents/nana/repos/solopreneur
for f in recipe auto triggerable; do
  grep -q "\`$f\`" plugins/solopreneur/shared/config.md \
    && grep -q "$f" plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs \
    && echo "$f: documented and implemented" || { echo "$f: MISMATCH"; exit 1; }
done
```

Expected: 三行 `documented and implemented`

- [ ] **Step 3: Commit**

```bash
git add plugins/solopreneur/shared/config.md
git commit -m "docs(config): document greenlight.reviewers observation fields"
```

**PR 2 收尾：** 開 PR，標題 `refactor(greenlight): detection-driven reviewers`。內文列出行為變更：CodeRabbit 現在可觸發、未知 bot 的 finding 會被收進來、`REVIEWER_BOT_LOGINS` 已移除。

---

## PR 3 — Gate 互動與 loop 流程

### Task 8: Reviewer 選擇與 gate 互動

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md:1613-1663`（Fallback Logic 段）

**Interfaces:**
- Consumes: Task 3 的 `RESOLVED`（`available` / `needsPrompt` / `gate`）
- Produces: `SELECTED_RECIPES`（逗號分隔）、`GATE_RECIPE`，供 Task 9 的 loop 使用

- [ ] **Step 1: 在 Fallback Logic 段前插入選擇流程**

```markdown
### Reviewer selection (PR mode)

`RESOLVED.needsPrompt` is true when more than two reviewers are available and
the caller gave no explicit selection. Ask two questions in one exchange:

1. **Which reviewers this round?** (multi-select) List every entry in
   `RESOLVED.available` with its `lastSeen`, marking `auto: true` ones as
   "reviews automatically" and `recipe: null` ones as "unidentified — findings
   collected, cannot be triggered or gate".
2. **Which reviewer's clean pass gates the loop?** (single-select) Offer only
   entries with a non-null `recipe`.

Also offer **"add one not listed"**, backed by the recipe table: a bot installed
today has no history, and GitHub gives no way to enumerate installed Apps
(`/user/installations` returns 403 for a `gh` token, `/repos/{o}/{r}/installation`
needs an App JWT, and check-runs only show `github-actions` for the review bots
verified here). The user picks the tool name; its login is learned on the first
trigger, so nothing else is asked.

Feed the answers back into `resolve` — this is also how a caller that already
knows the selection skips the prompt entirely:

```bash
RESOLVED=$(printf '%s' "$DETECTED" | node "$SCRIPTS/reviewer-state.mjs" resolve \
  --repo-key "$REPO_KEY" --select "$SELECTED_RECIPES" --gate "$GATE_RECIPE")
```

Persist the choice so the next run on this repo does not ask again:

```bash
write_solopreneur_repo_config greenlight "{fallback_order:[\"$GATE_RECIPE\"]}"
```

**New skill arguments.** The selection can also arrive as invocation tokens, in
the same `key=value` style as the existing `size=` token (**not** `--flag` — that
form belongs to the Node scripts, not to the skill):

- `select=coderabbit,codex-bot,bugbot` → `SELECTED_RECIPES`
- `gate=codex-bot` → `GATE_RECIPE`

Both must be added to the token-dropping line in Argument Parsing
(`SKILL.md:823`, currently dropping `external` / `unattended` / `size=…`).
Without that, `gate=codex-bot` survives into `reviewer_args` and is taken as a
reviewer name, so `current_reviewer` becomes the literal string `gate=codex-bot`
and every trigger lookup fails. Extend the same line rather than adding a second
parse pass.

**Gate semantics.** The gate decides when the loop ends; the others contribute
findings without holding it open:

| | Behaviour |
|---|---|
| gate reviewer | no new findings from it this round → **loop ends** |
| other selected reviewers | findings collected and fixed, but their silence is not required |
| on exit | any unaddressed findings from non-gate reviewers are listed in the report for the user to judge |

Without a gate, "use all four" would mean "all four must fall silent", which in
practice does not converge.
```

- [ ] **Step 2: 更新 Fallback Logic 段**

把 `SKILL.md:1628-1638`「With config」的敘述改成 gate 候補語意：

```markdown
**With config:** `fallback_order` orders **gate candidates**. The gate is the
first entry present in `RESOLVED.available`; when it fails (trigger got no
response), it is recorded `triggerable: false` and the next entry takes over.
Non-gate reviewers are unaffected by this fallback — they were never the thing
holding the loop open.

**When every gate candidate is exhausted** — each one tried and recorded
`triggerable: false` — the existing escalation applies unchanged: attended runs
ask the user, unattended runs **halt** with `reason_class: transient-dependency`
(`SKILL.md:1637-1638`). Collected findings from `auto` reviewers do **not** rescue
this: without a triggerable gate there is no way to establish that a round
finished, so there is no defensible clean signal. Report what was collected, then
halt.
```

保留 `SKILL.md:1665-1673` 的 unattended 段落，並在其後補一行：

```markdown
For reviewer selection specifically, an unattended run does **not** halt: the
gate becomes the first available `fallback_order` entry and every auto reviewer
is still collected. Blocking on input is worse than picking a defensible gate.
```

保留 `SKILL.md:1675-1682` 的 Gemini sunset 段落原樣——那條 fall-through 訊息在新流程仍然適用。

- [ ] **Step 3: 人工走查（無自動測試）**

這一段是 prompt 而非程式碼，只能讀查。逐項確認：

```bash
cd /Users/Hana/Agents/nana/repos/solopreneur/plugins/solopreneur/skills/greenlight
grep -n "needsPrompt\|GATE_RECIPE\|SELECTED_RECIPES" SKILL.md
```

Expected: 選擇流程、resolve 呼叫、Fallback Logic 三處都出現，變數名一致無錯字。

- [ ] **Step 4: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/SKILL.md
git commit -m "feat(greenlight): add reviewer selection and clean-pass gate

More than two available reviewers prompts for which to use and which one
gates the loop. fallback_order now orders gate candidates."
```

---

### Task 9: Poll 窗口與觀測回寫

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md`（Phase 3 external loop 段，PR mode 部分）

**Interfaces:**
- Consumes: Task 3 的 `trigger` / `collect` / `gate`；Task 4 的 `record`
- Produces: 一輪 loop 的完整流程定義；`record` 的 observations payload

- [ ] **Step 1: 改寫一輪的流程**

在 Phase 3 的 PR mode 迴圈中，把單一 reviewer 的觸發—輪詢改成：

```markdown
Each round:

1. Push the round's fixes.
2. Record the comment-id ceiling for every login in `RESOLVED.collect` — the
   window's lower bound. **Never filter by timestamp** (existing rule).
3. Trigger every entry in `RESOLVED.trigger`, in parallel. Entries absent from
   `trigger` are either `auto` (needs no prompting) or recipe-less (cannot be
   prompted).
4. Open the poll window using the **gate's** `poll` policy from `RESOLVED.gate`.
5. Inside the window, collect new comments from **every** login in
   `collect`, not only the triggered ones.
6. Close the window when the gate produces a new comment, or on timeout. This
   holds when the gate is itself `auto`: the test is "did the gate produce a new
   comment", not "did it answer a trigger", so gating on CodeRabbit works.
7. Write observations (Step 2 below).
8. Merge and dedupe findings across all sources, then hand them to the existing
   finding-processing flow, adversarial verification included.
9. If the gate produced no new findings this round → **clean, exit the loop**.
   Otherwise fix and return to 1.

**Deliberately not waiting for auto reviewers.** The window closes on the gate.
An auto reviewer still mid-review is not waited for — the comment-id ceiling
rises monotonically, so its late findings are picked up next round. Nothing is
lost; it is deferred by one round. This is what keeps "collect four reviewers"
from becoming "wait for the slowest one every round".

`SIZE_MAX_ROUNDS` (S=3 / M=5 / L=10) is unchanged. Size S is external-only with
a single reviewer, which is therefore the gate; the >2 selection prompt cannot
trigger under S.
```

- [ ] **Step 2: 加入觀測回寫**

```markdown
After closing the window, record what this round proved:

```bash
# A login that commented inside the window without being triggered is `auto`.
# A triggered login that stayed silent is recorded untriggerable, which is the
# self-healing path for a bot that was removed or downgraded.
printf '%s' "$OBSERVATIONS" \
  | node "$SCRIPTS/reviewer-state.mjs" record --repo-key "$REPO_KEY"
```

`OBSERVATIONS` is `{"observations":[…]}` built from the window:

| Condition | Field written |
|---|---|
| commented, was not in `trigger` | `auto: true` |
| was in `trigger`, commented | `auto: false` |
| was in `trigger`, silent through the whole window | `triggerable: false` |
| a single new unbound login appeared after triggering recipe R | `recipe: R` |

The last row is how a login gets bound without asking the user. When **more
than one** unbound login appears in the same window the binding is ambiguous:
ask which one in an attended run; in an unattended run bind nothing and leave
them `recipe: null`, so their findings are still collected.
```

- [ ] **Step 3: 用真 PR 驗證（4 項，對應 spec 的〈驗證方式〉）**

需要一個開著的 PR。逐項執行並記錄結果：

```bash
# 1. CodeRabbit 可觸發（驗證 PR 2 的核心主張）
gh pr comment <PR> --body "@coderabbitai review"
# 等 3 分鐘後確認出現新的 coderabbitai[bot] comment
gh api "repos/hanamizuki/solopreneur/pulls/<PR>/comments" \
  --jq '[.[] | select(.user.login=="coderabbitai[bot]")] | length'

# 2. 未安裝的 reviewer 逾時 → 自我修復
#    把 greptile 加進 selection，觸發後應逾時並寫入 triggerable:false
printf '{"observations":[{"login":"greptile[bot]","triggerable":false}]}' \
  | node plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs \
      record --repo-key github.com/hanamizuki/solopreneur
jq '.repos["github.com/hanamizuki/solopreneur"].greenlight.reviewers' \
  "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"

# 3. 觀測回寫格式正確
#    跑完一輪後確認 coderabbitai[bot] 帶 auto:true、codex 帶 recipe

# 4. unattended 不等輸入
#    在有 >2 reviewer 的 repo 上跑 `/greenlight external unattended`，
#    確認沒有互動提示、gate 落在 fallback_order 第一個
```

Expected: 1 有回應（證明 OSS 方案下 chat 指令可用）；2 config 出現 `triggerable: false`；3 欄位齊全；4 全程無提示。

- [ ] **Step 4: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/SKILL.md
git commit -m "feat(greenlight): poll window gated on one reviewer

Trigger non-auto reviewers in parallel, collect from all selected logins,
close the window on the gate's new comment. Late findings from auto
reviewers land next round rather than extending every window."
```

---

### Task 10: Autopilot 整合

**Files:**
- Modify: `plugins/solopreneur/skills/autopilot/SKILL.md:314-322`（dispatch-time 變數解析）
- Modify: `plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md:88-95`（Step 5 Auto Review）

**Interfaces:**
- Consumes: Task 8 的 `select=` / `gate=` 兩個 skill token
- Produces: `{SELECT}` / `{GATE}` 兩個 dispatch-time 模板變數

**現況**（已查證，不要重新假設）：autopilot 不是直接呼叫 greenlight，而是把
`{SIZE}` 之類的變數代入 `references/pr-subagent-template.md`，由被 dispatch 的
worktree subagent 在其 Step 5 執行 `/greenlight size=m`
（`pr-subagent-template.md:90`）。整合點因此在模板，不在 autopilot 本體的流程敘述。
既有的 `size=` 正是要照抄的先例——同樣的 token 風格、同樣的「未設定就整段省略」規則。

- [ ] **Step 1: 加入兩個 dispatch-time 變數**

在 `autopilot/SKILL.md:314-322` 的變數清單中，緊接 `{SIZE}` 之後加入：

```markdown
   - `{SELECT}`    = the planned reviewer selection as a comma-separated recipe
     list — Step 5 of the suffix passes it as `select={SELECT}`. When the plan set
     none, drop the `select={SELECT}` clause entirely (greenlight then resolves
     from config, or prompts if the run is attended).
   - `{GATE}`      = the recipe whose clean pass gates the loop — passed as
     `gate={GATE}`. Drop the clause when unset, exactly as with `{SIZE}`.
```

同一份變數清單在 `SKILL.md:187` 附近的 descriptor 範例也要補上 `select` / `gate`
兩個 optional 欄位，措辭比照現有的 `size:` 註解。

- [ ] **Step 2: 模板的 Auto Review 段加傳 token**

改 `references/pr-subagent-template.md:88-95`，在 `size={SIZE}` 那句之後加入：

```markdown
When the plan recorded a reviewer selection, also pass `select={SELECT}` and
`gate={GATE}` (e.g. `/greenlight size=m select=coderabbit,codex-bot gate=codex-bot`).
These come from the interactive planning phase, where a human was present to
choose; a dispatched run must never stop to ask. With neither token, greenlight
resolves from the per-repo config and — under `unattended` — falls back to the
first available `fallback_order` entry as gate rather than prompting.
```

- [ ] **Step 3: 在規劃階段問一次**

autopilot 的規劃階段是互動的、dispatch 之後不是，所以問答必須發生在規劃時。在產出
descriptor 的步驟中加入：

```markdown
While still interactive, resolve the reviewer selection once for this repo:

```bash
REPO_KEY=$(solopreneur_repo_key)
RESOLVED=$(… | node "$SCRIPTS/reviewer-state.mjs" resolve --repo-key "$REPO_KEY")
```

If `RESOLVED.needsPrompt` is true, ask the two selection questions from
greenlight's "Reviewer selection" section here, and write the answers into the
descriptor's `select` / `gate` fields. Asking now is the whole point: the
dispatched agent cannot.
```

- [ ] **Step 4: 走查一致性**

```bash
cd /Users/Hana/Agents/nana/repos/solopreneur
# 模板傳出的 token 名稱，必須與 greenlight 解析的一致
grep -n "select=\|gate=" plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md
grep -n "select=\|gate=" plugins/solopreneur/skills/greenlight/SKILL.md
# 變數必須在 autopilot 有定義，否則模板代入後留下字面 {SELECT}
grep -n "{SELECT}\|{GATE}" plugins/solopreneur/skills/autopilot/SKILL.md
```

Expected: 三個 grep 都有命中；token 拼法兩邊一致（`select=` / `gate=`，非 `--select`）。

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/autopilot/SKILL.md \
        plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md
git commit -m "feat(autopilot): pass reviewer selection through to greenlight

Resolve the selection during the interactive planning phase and hand it to
the dispatched subagent as select=/gate= tokens, mirroring size=."
```

**PR 3 收尾：** 開 PR，標題 `feat(greenlight): selectable gate and multi-reviewer collection`。內文附 Task 9 Step 3 的四項實跑結果。

---

## 完成後

三個 PR 都 merge 後跑 `/release`，`solopreneur` plugin 取 patch bump（新 skill 腳本 + 行為改善，非里程碑）。依 repo 根 `CLAUDE.md`，版本只由 `/release` 動，這個 plan 的任何 commit 都不碰 `plugin.json`。
