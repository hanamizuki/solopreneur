# Greenlight Reviewer Flexibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 greenlight 的 external reviewer 從硬編碼 login 白名單 + 純序列 fallback，改成通用 bot 偵測 + registry 已驗證 login + per-repo 觀測快取 + 使用者選定的 clean-pass gate。

**Architecture:** detection 的決策目前寫成 inline bash 讓 LLM 每次複製執行（採樣 `greenlight/SKILL.md:1549-1567`、過濾與決策 `SKILL.md:1573-1586`）。這些是純資料處理，抽成兩支 Node 腳本後可測、行為一致。registry 收成純資料表（每工具一行 trigger；已驗證的全域 App login 記在 `knownLogins`）；per-repo 觀測由腳本寫進 config 的獨立 feature key。沿用 `preview` skill 已在 CI 跑的腳本 + `node --test` 架構。

**Tech Stack:** Node.js >= 20（僅 `node:` built-ins）、`node:test` + `node:assert/strict`、`gh` CLI（由 SKILL.md 呼叫，不由腳本呼叫）、GitHub Actions。

**Spec:** `todos/backlog/2026-07-30_greenlight-reviewer-flexibility.md`（本 plan 的每個決策都在那裡有理由；有衝突時 spec 為準）

## Global Constraints

- **Node >= 20，只用 `node:` built-in 模組。** repo 全域沒有 `package.json`、沒有 lockfile、不裝任何依賴（理由見 `.github/workflows/validate-preview-tests.yml:47-49`）。
- **腳本的註解與文件字串一律英文**（repo 根有 `LICENSE`）。plan 與 todos 文件本身維持中文。
- **腳本不呼叫 `gh`、不算 repo-key、不讀 `fallback_order`。** 三者都由 SKILL.md 傳入。`fallback_order` 必須由既有的 `read_solopreneur_config greenlight` 走完整五層取得後傳進來——腳本**不重新實作五層讀取**。
- **單一 writer 原則：** 腳本獨佔 `repos[<key>].greenlight_reviewers`，shell helper 獨佔 `repos[<key>].greenlight` / `default.greenlight`。腳本永遠不寫 `greenlight` 這個 key。
- **config 毀損必須 fail closed。** 只有「檔案不存在」可視為空設定；解析失敗、權限錯誤、頂層不是物件，一律致命錯誤且**不得寫入**。
- **`--json` 是唯一機器可讀契約**（比照 `preview/scripts/config-resolve.mjs:12-14`）。
- **錯誤處理沿用既有慣例：** `process.exitCode` + 讓 process 自然結束，不用 `process.exit()`（`config-resolve.mjs:618,622`）；使用者設定問題用專屬 error 型別印訊息，真正的 bug 才 throw（`config-resolve.mjs:59`）。**Stale 的使用者選擇（`--select` / `--gate` 指到不可用對象）是警告 + 降級，不是錯誤**——這兩個值可能來自幾天前的 autopilot descriptor（理由見 spec〈錯誤處理與降級〉）。
- **腳本路徑一律 `"${CLAUDE_SKILL_DIR}/"scripts/x.mjs`。** 不是 `$CLAUDE_PLUGIN_ROOT`——後者是 per-plugin 而非 per-skill（`todos/done/2026-05-16_vendored-impeccable-path-collision.md:111-114`）。引號位置照 `plugins/solopreneur/scripts/sync-vendored.sh:218-223` 的形式，以承受安裝路徑含空白。
- **測試必須 hermetic**：env 用**白名單**而非 spread `process.env`，且 `HOME` 指向 fixture（照 `config-resolve.test.mjs:92-98` 的 run helper，allowlist 在 `:95`）。
- **不動 post-commit mode 與 uncommitted mode。** 只改 PR mode。
- **不 bump plugin 版本**（版本只由 `/release` 動）。

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `greenlight/scripts/reviewer-registry.mjs` | 廠商知識：每工具的 trigger、handshake、poll、已驗證 login。純資料 + 查詢，無 I/O。 |
| `greenlight/scripts/reviewer-state.mjs` | 三個 subcommand：`detect`（過濾活動樣本並判定 reviewer 資格）、`record`（觀測回寫）、`resolve`（決定這輪角色）。唯一 I/O 是 config 檔與 stdin/stdout。 |
| `greenlight/tests/reviewer-registry.test.mjs` | registry 表格完整性（fails closed）+ alias / login 查詢。 |
| `greenlight/tests/reviewer-state.test.mjs` | 三個 subcommand 的 CLI 契約 + config 安全。 |
| `greenlight/tests/skill-sync.test.mjs` | SKILL.md 的人讀表格與 registry 一致（CI 常駐，取代一次性手動檢查）。 |
| `.github/workflows/validate-greenlight-tests.yml` | CI gate。 |
| `greenlight/SKILL.md` | registry 瘦身、detection 接上腳本、選擇與 gate、loop 流程、argument token。 |
| `shared/config.md` | `greenlight_reviewers` 欄位說明 + 兩處失真 invariant。 |
| `autopilot/SKILL.md` | dispatch-time 變數。 |
| `autopilot/references/pr-subagent-template.md` | 傳遞 token，明確帶 `unattended`。 |
| `autopilot/references/schemas.md` | plan.yaml 契約，新增 optional 欄位。 |

**PR 邊界（兩個 PR）：**

- **PR 1 = Task 1–7**：腳本 + 測試 + CI + SKILL.md 的 registry/detection 接上 + config.md。上線效果：`type == "Bot"` 通用偵測生效、三個既有 bot 經 `knownLogins` 自動識別、觀測快取開始累積。**loop 語意不變**——既有單一 reviewer 流程照跑，透過 seam 從 `RESOLVED.gate` 取得 reviewer 身分（Task 7 Step 2）。
- **PR 2 = Task 8–10**：選擇與 gate 互動、四個終端狀態的 loop、多 reviewer 收集、autopilot 交接。

原計畫的三 PR 拆法已放棄：純腳本的 PR 沒有 user-facing 價值，而 PR 2 若只接一半會讓 loop 語意處於中間狀態。原設計的 pending 佇列 + 自動綁定子系統於 review 後**整包刪除**——消去法歸屬對已留言過的 bot（含 migration 場景的全部三個既有 bot）永遠失效，且會被窗口雜訊誤綁；由 registry `knownLogins` + attended identify 取代（理由詳見 spec〈識別〉）。

---

## PR 1 — 腳本、測試與 SKILL.md 接上

### Task 1: Reviewer registry

**Files:**
- Create: `plugins/solopreneur/skills/greenlight/scripts/reviewer-registry.mjs`
- Test: `plugins/solopreneur/skills/greenlight/tests/reviewer-registry.test.mjs`

**Interfaces:**
- Consumes: 無
- Produces: `RECIPES`（key = recipe id）、`DEFAULT_POLL`、`recipeFor(idOrAlias) -> {id, ...recipe} | null`、`recipeForLogin(login) -> {id, ...recipe} | null`。Task 3 的 `record` 只 import `recipeFor`；Task 4 的 `resolve` import 兩者。

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
import { RECIPES, DEFAULT_POLL, recipeFor, recipeForLogin } from '../scripts/reviewer-registry.mjs';

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

test('every recipe declares an aliases array', () => {
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

test('every recipe declares a knownLogins array', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(Array.isArray(r.knownLogins), `${id}.knownLogins is not an array`);
  }
});

test('no login is claimed by two recipes', () => {
  const seen = new Map();
  for (const [id, r] of Object.entries(RECIPES)) {
    for (const login of r.knownLogins) {
      assert.ok(!seen.has(login), `login "${login}" claimed by both ${seen.get(login)} and ${id}`);
      seen.set(login, id);
    }
  }
});

test('recipeForLogin resolves a verified login', () => {
  assert.equal(recipeForLogin('coderabbitai[bot]').id, 'coderabbit');
  assert.equal(recipeForLogin('chatgpt-codex-connector[bot]').id, 'codex-bot');
  assert.equal(recipeForLogin('gemini-code-assist[bot]').id, 'gemini');
});

test('recipeForLogin returns null for unknown logins and non-strings', () => {
  for (const input of ['dependabot[bot]', 'hanamizuki', '', undefined, null, 42]) {
    assert.equal(recipeForLogin(input), null, `expected null for ${JSON.stringify(input)}`);
  }
});

test('the three newly added tools use the safe defaults', () => {
  for (const id of ['coderabbit', 'bugbot', 'greptile']) {
    assert.ok(RECIPES[id], `${id} missing from registry`);
    assert.equal(RECIPES[id].handshake, 'none');
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
 * that triggers it, whether it acknowledges a trigger, how long to wait, and
 * the login it posts from once that login has been verified. What must NOT be
 * here: anything varying per repo or per user.
 *
 * `knownLogins` holds VERIFIED App logins only. A GitHub App's bot login is
 * app-scoped — the same account posts on every repo — so a verified login is
 * vendor knowledge, not a per-repo observation. But logins must never be
 * guessed: probing found `cursor[bot]`, `cursor-com[bot]` and `bugbot[bot]` to
 * all be real accounts, and GitHub Copilot posts as `Copilot` with no `[bot]`
 * suffix. An empty array means "unverified": the tool still works — detection
 * collects it by user type, and an attended identify binds its login per repo
 * (reviewer-state.mjs `record`).
 *
 * There is no auto-review field. Whether a tool reviews automatically is a
 * per-user setting (Bugbot exposes it in Cursor's personal settings;
 * `@coderabbitai pause` turns CodeRabbit's off), invisible from the repo. It is
 * observed, not declared.
 *
 * Adding a tool is one row whose only required thought is the trigger string:
 * `handshake: 'none'`, `poll: DEFAULT_POLL` and `knownLogins: []` are the safe
 * fallbacks, proven by the `gemini` row which has never had a handshake.
 */

/** Fallback timing for a tool whose acknowledgement behaviour is unverified. */
export const DEFAULT_POLL = Object.freeze({ firstWaitSec: 180, intervalSec: 120, tries: 3 });

export const RECIPES = {
  'codex-bot': {
    aliases: ['codex bot'],
    kind: 'github-bot',
    trigger: '@codex review',
    handshake: 'reaction',            // verified: 👀 on the triggering comment
    knownLogins: ['chatgpt-codex-connector[bot]'],
    poll: { firstWaitSec: 60, intervalSec: 60, tries: 20 },
  },
  gemini: {
    aliases: ['gemini'],
    kind: 'github-bot',
    trigger: '/gemini review',
    handshake: 'none',
    knownLogins: ['gemini-code-assist[bot]'],
    poll: { firstWaitSec: 180, intervalSec: 120, tries: 2 },
  },
  coderabbit: {
    aliases: ['coderabbit'],
    kind: 'github-bot',
    trigger: '@coderabbitai review',  // `full review` re-reviews from scratch
    handshake: 'none',
    knownLogins: ['coderabbitai[bot]'],
    poll: DEFAULT_POLL,
  },
  bugbot: {
    aliases: ['bugbot', 'cursor'],
    kind: 'github-bot',
    trigger: 'bugbot run',            // top-level comment only
    handshake: 'none',
    knownLogins: [],                  // cursor[bot] / cursor-com[bot] / bugbot[bot] all exist; unverified
    poll: DEFAULT_POLL,
  },
  greptile: {
    aliases: ['greptile'],
    kind: 'github-bot',
    trigger: '@greptileai',
    handshake: 'none',
    knownLogins: [],
    poll: DEFAULT_POLL,
  },
  'codex-cli': {
    aliases: ['codex cli'],
    kind: 'local-cli',
    trigger: 'codex review --base',
    handshake: 'stdout',
    knownLogins: [],
  },
  agy: {
    aliases: ['agy'],
    kind: 'local-cli',
    trigger: 'agy --print',
    handshake: 'stdout-marker',
    knownLogins: [],
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

/**
 * Resolve a GitHub login to its recipe via the verified-login list.
 * Exact match only — guessing from the name is exactly what this registry
 * refuses to do. Returns null for anything unverified.
 */
export function recipeForLogin(login) {
  if (typeof login !== 'string' || !login) return null;
  for (const [id, recipe] of Object.entries(RECIPES)) {
    if (recipe.knownLogins.includes(login)) return { id, ...recipe };
  }
  return null;
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/reviewer-registry.test.mjs
```

Expected: PASS，15 個 test 全綠

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/scripts/reviewer-registry.mjs \
        plugins/solopreneur/skills/greenlight/tests/reviewer-registry.test.mjs
git commit -m "feat(greenlight): add reviewer registry as pure data with lookup

One row per tool: trigger, handshake, poll, and the verified app-scoped
login where one is known. Unverified logins stay empty — they are learned
per repo via identify, never guessed."
```

---

### Task 2: `detect` — 過濾活動樣本並判定 reviewer 資格

**Files:**
- Create: `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs`
- Test: `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs`

**Interfaces:**
- Consumes: 無
- Produces: CLI `reviewer-state.mjs detect`。stdin 吃四欄 TSV `login<TAB>type<TAB>iso<TAB>source`，`source` ∈ `conversation` / `review-comment` / `formal-review`。stdout 印 `{"bots":[{"login","lastSeen","evidence"}]}`，依 login 排序。`evidence` 為布林——只有 `review-comment` 或 `formal-review` 算 reviewer 證據。

**背景：** 這取代 `SKILL.md:1573-1586` 的 awk + jq pipeline。兩個行為變更：過濾條件從比對三筆硬編碼 login（`REVIEWER_BOT_LOGINS`，`SKILL.md:1517`）改成 `type == "Bot"`；並保留證據來源，因為 `type == "Bot"` 認的是自動化而非 review 能力——dependabot / CI bot / release bot 全都是 `Bot`，而它們只出現在 conversation channel。

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
{"observations":[{"login":"coderabbitai[bot]","auto":true},
                 {"login":"mystery[bot]","recipe":"bugbot"}]}
```

每筆 observation 逐 login **merge**（`auto` / `triggerable` / `recipe` 三個 optional 欄位），寫進 `repos[<K>].greenlight_reviewers.observed`，stdout 印寫入後的整個 `greenlight_reviewers`。`recipe` 欄是 attended identify 的落點；`triggerable: true` 是被誤標 reviewer 的平反路徑（單向門變雙向，spec〈錯誤處理與降級〉）。

**這個 task 承載兩個 Critical 的修正**：config 毀損 fail closed、觀測值落在獨立 feature key（不與 `greenlight` 同 subtree）。

- [ ] **Step 1: 寫 failing test**

追加到 `tests/reviewer-state.test.mjs`：

```javascript
const KEY = 'github.com/o/r';
const readBack = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'));
const reviewersOf = (dir) => readBack(dir).repos[KEY].greenlight_reviewers;

/** A config with both the shell-owned `greenlight` and script-owned key. */
const CFG = ({ observed = {}, fallbackOrder = ['codex-bot'] } = {}) => ({
  default: { greenlight: { fallback_order: fallbackOrder } },
  repos: {
    [KEY]: {
      preview: { path: 'docs/preview' },
      greenlight: { fallback_order: fallbackOrder },
      greenlight_reviewers: { observed },
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
  const dir = tmpConfigDir(CFG({ observed: { 'gemini-code-assist[bot]': { auto: false } } }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'gemini-code-assist[bot]', triggerable: false }] }),
    configDir: dir,
  });
  assert.equal(reviewersOf(dir).observed['gemini-code-assist[bot]'].triggerable, false);
});

test('record clears triggerable:false when the reviewer acts again', () => {
  // The one-way-door fix: a marked reviewer that produces an item (or is
  // deliberately retried in an attended run) gets triggerable:true written,
  // which resolve's `!== false` filter re-admits.
  const dir = tmpConfigDir(CFG({ observed: { 'gemini-code-assist[bot]': { triggerable: false } } }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'gemini-code-assist[bot]', triggerable: true }] }),
    configDir: dir,
  });
  assert.equal(reviewersOf(dir).observed['gemini-code-assist[bot]'].triggerable, true);
});

test('record stores an identify as a recipe on the observed login', () => {
  const dir = tmpConfigDir(CFG({ observed: { 'mystery[bot]': { auto: true } } }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'mystery[bot]', recipe: 'bugbot' }] }),
    configDir: dir,
  });
  assert.deepEqual(reviewersOf(dir).observed['mystery[bot]'], { auto: true, recipe: 'bugbot' });
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
import { recipeFor, recipeForLogin } from './reviewer-registry.mjs';

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

/** This repo's owned block, defaulted. */
function reviewersBlock(cfg, repoKey) {
  const block = cfg?.repos?.[repoKey]?.[FEATURE] ?? {};
  return {
    observed: block.observed && typeof block.observed === 'object' ? block.observed : {},
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
 * Each observation is a per-login field merge over three optional facts:
 *   auto         — it commented without being triggered
 *   triggerable  — false: a trigger got no response inside its own poll
 *                  budget; true: a marked login acted again (the recovery path)
 *   recipe       — an attended identify bound this login to a registry row
 *
 * An empty payload does not rewrite the file at all, so a quiet round cannot
 * reformat or reorder a config the user hand-edited.
 */
function record({ observations = [], repoKey }) {
  for (const obs of observations) {
    if (!obs?.login) throw new InputError('every observation needs a login');
    if (obs.recipe != null && !recipeFor(obs.recipe)) {
      throw new InputError(`unknown recipe "${obs.recipe}"`);
    }
  }

  const cfg = readConfigForWrite();
  const current = reviewersBlock(cfg, repoKey);
  if (observations.length === 0) return current;

  const observed = { ...current.observed };
  for (const { login, ...fields } of observations) {
    observed[login] = { ...(observed[login] ?? {}), ...fields };
  }

  cfg.repos ??= {};
  cfg.repos[repoKey] ??= {};
  cfg.repos[repoKey][FEATURE] = { observed };
  writeConfig(cfg);
  return cfg.repos[repoKey][FEATURE];
}
```

dispatch 加入：

```javascript
  if (sub === 'record') {
    const flags = parseFlags(process.argv.slice(3), ['repo-key']);
    if (!flags['repo-key']) throw new InputError('record needs --repo-key');
    const payload = parseJsonStdin(await readStdin());
    return emit(record({ observations: payload.observations ?? [], repoKey: flags['repo-key'] }));
  }
```

- [ ] **Step 4: 跑測試確認通過**

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs
```

Expected: PASS，共 41 個 test（15 registry + 26 state：11 detect + 15 record）

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs \
        plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs
git commit -m "feat(greenlight): add reviewer-state record subcommand

Observations land in repos[<key>].greenlight_reviewers, a feature key this
script owns exclusively, so neither the five-layer read nor the shell
helper's whole-subtree write can erase them. A malformed or unreadable
config is fatal and never overwritten. triggerable is a two-way door:
false marks a silent reviewer, true is the recovery path."
```

---

### Task 4: `resolve` — 這輪的角色決策

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs`
- Modify: `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `recipeFor` / `recipeForLogin`、Task 2 的 `detect` 輸出、Task 3 的 config 層
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
    {"kind":"bot","id":"brand-new[bot]","login":"brand-new[bot]",
     "recipe":null,"auto":false,"evidence":true,"lastSeen":"...","canGate":false},
    {"kind":"cli","id":"codex-cli","login":null,"recipe":"codex-cli","canGate":true}
  ],
  "trigger": [{"kind":"github-bot","recipe":"codex-bot","triggerText":"@codex review",
               "handshake":"reaction","login":"chatgpt-codex-connector[bot]"}],
  "collect": ["brand-new[bot]","chatgpt-codex-connector[bot]","coderabbitai[bot]"],
  "gate": {"kind":"bot","id":"...","login":"...","recipe":"codex-bot",
           "poll":{"firstWaitSec":60,"intervalSec":60,"tries":20},"handshake":"reaction"},
  "needsPrompt": false,
  "warnings": []
}
```

Task 8 吃 `available` / `needsPrompt` / `warnings`；Task 9 吃 `trigger` / `collect` / `gate`。

**`--fallback-order` 是參數而非讀 config。** `fallback_order` 落在 `.default.greenlight`（現有 writer 是 `write_solopreneur_config`，`SKILL.md:1656`），要正確取得必須走完整五層。SKILL.md 已有 `read_solopreneur_config greenlight` 能做這件事，腳本不重複實作。

**recipe 的解析順序：快取 identify 優先於 registry。** `observed[login].recipe`（使用者明確指認）> `recipeForLogin(login)`（registry 已驗證 login）> `null`（未識別）。快取裡的 stale recipe id 降級為 registry 查詢再 fallback 到 null，附 warning。

**gate 一律被觸發，含 `auto` 的。** clean 訊號需要明確的回應對象；對 auto bot 多發一次 review 指令無害。`auto` 只豁免非 gate reviewer 的觸發（spec〈Reviewer 選擇與 gate〉）。

**stale 的 `--select` / `--gate` 是警告 + 降級，不是錯誤。** 這兩個值可能來自幾天前寫的 autopilot descriptor，期間 reviewer 可能已被標 `triggerable: false`。`--select` 匹配不到任何對象 → 視同未指定；`--gate` 指到不可 gate 的對象 → 落回 fallback-order 梯子。與快取 stale recipe 的降級方向一致。

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
function resolve(extra, { stdin, configDir } = {}) {
  return run(['resolve', '--repo-key', KEY, '--fallback-order', 'codex-bot', ...extra],
    { stdin, configDir });
}

const CODEX = 'chatgpt-codex-connector[bot]';
const RABBIT = 'coderabbitai[bot]';
const GEMINI = 'gemini-code-assist[bot]';

test('resolve merges detected bots with the cache', () => {
  const dir = tmpConfigDir(CFG({ observed: { [RABBIT]: { auto: true } } }));
  const { code, stdout } = resolve([], { stdin: BOTS([CODEX]), configDir: dir });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.deepEqual(out.available.map((r) => r.id).sort(), [RABBIT, CODEX].sort());
});

test('resolve identifies a registry-known login with no config at all', () => {
  // The migration path: on a fresh config the three long-standing bots must be
  // full citizens immediately. An App's login is app-scoped, so the verified
  // knownLogins row applies on every repo with zero learning.
  const { stdout } = resolve([], { stdin: BOTS([RABBIT]) });
  const [bot] = JSON.parse(stdout).available;
  assert.equal(bot.recipe, 'coderabbit');
  assert.equal(bot.canGate, true);
});

test('resolve lets a cached identify override the registry mapping', () => {
  const dir = tmpConfigDir(CFG({ observed: { [RABBIT]: { recipe: 'bugbot' } } }));
  const { stdout } = resolve([], { stdin: BOTS([RABBIT]), configDir: dir });
  assert.equal(JSON.parse(stdout).available[0].recipe, 'bugbot');
});

test('resolve excludes triggerable:false', () => {
  const dir = tmpConfigDir(CFG({ observed: { [GEMINI]: { triggerable: false } } }));
  const { stdout } = resolve([], { stdin: BOTS([RABBIT, GEMINI]), configDir: dir });
  assert.deepEqual(JSON.parse(stdout).available.map((r) => r.id), [RABBIT]);
});

test('resolve drops an unidentified bot with no review evidence', () => {
  // dependabot shape. Without this it would be selected by default and its PR
  // description would enter the finding-processing loop as review feedback.
  const { stdout } = resolve([], {
    stdin: BOTS([{ login: 'dependabot[bot]', evidence: false }, CODEX]),
  });
  assert.deepEqual(JSON.parse(stdout).available.map((r) => r.id), [CODEX]);
});

test('resolve keeps an unidentified bot that has review evidence, but bars it from gating', () => {
  const { stdout } = resolve([], { stdin: BOTS([CODEX, 'brand-new[bot]']) });
  const out = JSON.parse(stdout);
  const fresh = out.available.find((r) => r.id === 'brand-new[bot]');
  assert.equal(fresh.recipe, null);
  assert.equal(fresh.canGate, false);
  assert.ok(out.collect.includes('brand-new[bot]'), 'its findings are still collected');
  assert.ok(!out.trigger.some((t) => t.login === 'brand-new[bot]'), 'but it is never triggered');
});

test('resolve admits an available local CLI and lets it gate', () => {
  const { stdout } = resolve(['--cli-available', 'codex-cli'], { stdin: BOTS([]) });
  const cli = JSON.parse(stdout).available.find((r) => r.kind === 'cli');
  assert.equal(cli.id, 'codex-cli');
  assert.equal(cli.canGate, true);
});

test('resolve marks a local CLI trigger with its kind so SKILL.md can branch', () => {
  const { stdout } = resolve(['--cli-available', 'codex-cli'], { stdin: BOTS([]) });
  const t = JSON.parse(stdout).trigger.find((x) => x.recipe === 'codex-cli');
  assert.equal(t.kind, 'local-cli');
});

test('resolve omits a non-gate auto reviewer from trigger but keeps it in collect', () => {
  const dir = tmpConfigDir(CFG({ observed: { [RABBIT]: { auto: true }, [CODEX]: { auto: false } } }));
  const { stdout } = resolve([], { stdin: BOTS([RABBIT, CODEX]), configDir: dir });
  const out = JSON.parse(stdout);
  assert.deepEqual(out.trigger.map((t) => t.login), [CODEX]);
  assert.ok(out.collect.includes(RABBIT));
});

test('resolve always triggers the gate, auto or not', () => {
  // A clean signal needs an addressable response. Re-requesting a review from
  // an auto bot is harmless, so the gate is exempt from the auto exemption.
  const dir = tmpConfigDir(CFG({ observed: { [RABBIT]: { auto: true } } }));
  const { stdout } = resolve(['--gate', 'coderabbit'], { stdin: BOTS([RABBIT]), configDir: dir });
  const out = JSON.parse(stdout);
  assert.equal(out.gate.login, RABBIT);
  assert.ok(out.trigger.some((t) => t.login === RABBIT), 'the auto gate is still triggered');
});

test('resolve attaches the gate’s own poll policy and handshake', () => {
  const { stdout } = resolve([], { stdin: BOTS([CODEX]) });
  const { gate } = JSON.parse(stdout);
  assert.equal(gate.recipe, 'codex-bot');
  assert.deepEqual(gate.poll, { firstWaitSec: 60, intervalSec: 60, tries: 20 });
  assert.equal(gate.handshake, 'reaction');
});

test('resolve trigger entries carry their handshake', () => {
  const { stdout } = resolve([], { stdin: BOTS([CODEX]) });
  const t = JSON.parse(stdout).trigger.find((x) => x.recipe === 'codex-bot');
  assert.equal(t.handshake, 'reaction');
});

test('resolve picks the gate from fallback-order, skipping unavailable entries', () => {
  const { stdout } = run([
    'resolve', '--repo-key', KEY, '--fallback-order', 'gemini,codex-bot',
  ], { stdin: BOTS([RABBIT, CODEX]) });
  assert.equal(JSON.parse(stdout).gate.recipe, 'codex-bot', 'gemini is not available here');
});

test('resolve degrades a stale --gate to the fallback ladder with a warning', () => {
  // A days-old autopilot descriptor may name a gate that has since been marked
  // unresponsive. Failing hard would leave an unattended run with nothing.
  const { code, stdout } = resolve(['--gate', 'bugbot'], { stdin: BOTS([CODEX]) });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.gate.recipe, 'codex-bot');
  assert.ok(out.warnings.some((w) => w.includes('bugbot')), 'names the stale gate');
});

test('resolve degrades a stale --select to the full set with a warning', () => {
  const { code, stdout } = resolve(['--select', 'greptile'], { stdin: BOTS([CODEX]) });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.deepEqual(out.collect, [CODEX], 'falls back to everything available');
  assert.ok(out.warnings.some((w) => w.includes('greptile')));
});

test('resolve honours a valid --select subset', () => {
  const { stdout } = resolve(['--select', 'coderabbit'], { stdin: BOTS([RABBIT, CODEX]) });
  const out = JSON.parse(stdout);
  assert.deepEqual(out.collect, [RABBIT]);
  assert.equal(out.gate.recipe, 'coderabbit', 'the gate stays inside the selection');
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

test('resolve flags needsPrompt only when nothing can gate', () => {
  // Unidentified bots exist but none can close a round: the attended path asks
  // (identify / retry / add a CLI); the unattended path degrades.
  const { stdout } = resolve([], { stdin: BOTS([{ login: 'brand-new[bot]' }]) });
  assert.equal(JSON.parse(stdout).needsPrompt, true);
});

test('resolve does not prompt when fallback-order resolves a gate', () => {
  // The common case must stay silent, however many reviewers act here.
  const { stdout } = resolve([], { stdin: BOTS([RABBIT, CODEX, GEMINI, 'brand-new[bot]']) });
  const out = JSON.parse(stdout);
  assert.equal(out.needsPrompt, false);
  assert.equal(out.gate.recipe, 'codex-bot');
});

test('resolve reports gate:null with exit 0 when nothing can gate', () => {
  const { code, stdout } = resolve([], { stdin: BOTS([{ login: 'brand-new[bot]' }]) });
  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout).gate, null);
});

test('resolve requires --repo-key and --fallback-order', () => {
  assertFailed(run(['resolve', '--fallback-order', 'codex-bot'], { stdin: BOTS([]) }), /repo-key/);
  assertFailed(run(['resolve', '--repo-key', KEY], { stdin: BOTS([]) }), /fallback-order/);
});

test('resolve never writes to the config', () => {
  const dir = tmpConfigDir(CFG({ observed: { [CODEX]: { auto: false } } }));
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
 * Candidates come from two places that cannot be unified — a GitHub bot has a
 * login, a local CLI never appears in GitHub data at all — so each carries its
 * `kind` and its own gating eligibility:
 *
 *   bot   cached or detected login. Its recipe resolves cache-first (an
 *         explicit identify wins), then via the registry's verified
 *         knownLogins, then null. Gates when a recipe resolved.
 *   cli   a local CLI that passed its availability gate. Gates — it runs
 *         synchronously, so finishing *is* the end of the round.
 *
 * An unidentified bot (no recipe) is collected but never triggered and never
 * gates. It must additionally carry review evidence: `type == "Bot"` proves
 * automation, not code review, and dependabot's PR prose is not review
 * feedback.
 *
 * The gate is always triggered, auto or not: a clean signal needs an
 * addressable response. `auto` only exempts non-gate reviewers.
 *
 * A stale --select or --gate degrades with a warning instead of failing: those
 * values may come from a days-old autopilot descriptor, and a stale token must
 * not turn an unattended run into an empty one.
 */
function resolve({ bots, repoKey, fallbackOrder, cliAvailable, select, gate }) {
  const warnings = [];
  const { observed } = reviewersBlock(readConfig(), repoKey);

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
      if (recipe !== null && !recipeFor(recipe)) {
        warnings.push(`cached recipe "${recipe}" is not in the registry; ignoring it for ${r.login}`);
        recipe = null;
      }
      // A registry-verified login identifies itself: an App's bot login is
      // app-scoped, identical on every repo. The cached recipe (an explicit
      // identify) wins when both exist.
      recipe ??= recipeForLogin(r.login)?.id ?? null;
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

  const available = [...botCandidates, ...cliCandidates]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let wanted = select ? csv(select) : null;
  let selected = wanted
    ? available.filter((r) => wanted.includes(r.recipe) || wanted.includes(r.id))
    : available;
  if (wanted && selected.length === 0) {
    warnings.push(`--select matched no available reviewer (${wanted.join(', ')}); ignoring it`);
    wanted = null;
    selected = available;
  }

  let gateEntry = null;
  if (gate) {
    const found = selected.find((r) => r.recipe === gate || r.id === gate);
    if (found?.canGate) gateEntry = found;
    else warnings.push(`--gate "${gate}" is not an available gate candidate; falling back to fallback-order`);
  }
  if (!gateEntry) {
    for (const id of fallbackOrder) {
      gateEntry = selected.find((r) => r.recipe === id && r.canGate) ?? null;
      if (gateEntry) break;
    }
    gateEntry ??= selected.find((r) => r.canGate) ?? null;
  }

  const trigger = selected
    .filter((r) => {
      if (r.kind === 'cli') return true;
      if (r.recipe === null) return false;
      return !r.auto || r === gateEntry;
    })
    .map((r) => {
      const recipe = recipeFor(r.recipe);
      return {
        kind: recipe.kind,
        recipe: r.recipe,
        triggerText: recipe.trigger,
        handshake: recipe.handshake,
        login: r.login,
      };
    });

  const gatePayload = gateEntry
    ? {
      kind: gateEntry.kind,
      id: gateEntry.id,
      login: gateEntry.login,
      recipe: gateEntry.recipe,
      // The gate's own policy: a github-bot gate defines the poll window; a
      // local-cli gate has none — it runs synchronously and its completion
      // closes the round (SKILL.md branches on `kind`).
      poll: recipeFor(gateEntry.recipe).poll ?? null,
      handshake: recipeFor(gateEntry.recipe).handshake,
    }
    : null;

  return {
    available,
    trigger,
    collect: selected.filter((r) => r.login).map((r) => r.login),
    gate: gatePayload,
    // Ask only when something acts here but nothing can close a round.
    needsPrompt: gateEntry === null && available.length > 0,
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

Expected: PASS，共 63 個 test（15 registry + 48 state：11 detect + 15 record + 22 resolve）

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs \
        plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs
git commit -m "feat(greenlight): add reviewer-state resolve subcommand

Recipes resolve cache-first, then via registry-verified logins, so the
long-standing bots are full citizens on a fresh config. The gate is always
triggered, auto or not, and carries its own poll policy. Stale --select or
--gate values degrade with a warning instead of failing the run."
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

- [ ] **Step 2: 本機驗證**

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

**注意：** `SKILL.md:1509-1521` 的硬編碼 login bash 區塊（`CODEX_BOT` / `GEMINI_BOT` / `CODERABBIT_BOT` / `REVIEWER_BOT_LOGINS` / `BOT_LOGIN`）**在本 task 先不動**——後面的 poll / feedback 段落仍讀 `$BOT_LOGIN`，要等 Task 7 的 seam 給出替代來源才能刪，否則 PR 1 的中間 commit 會留下懸空引用。

- [ ] **Step 1: 換掉表格**

把 `SKILL.md:1488-1494` 的表格換成下表。**刪掉 wizard-eligibility 欄**（由 `resolve` 的 `canGate` 決定）；login 欄改為 **verified login**（僅已驗證的全域 App 帳號，未驗證留 `—`）：

| recipe_id | aliases (arg) | kind | trigger | handshake | poll policy | verified login |
|---|---|---|---|---|---|---|
| `codex-bot` | `codex bot` | github-bot | PR comment `@codex review` | 👀 reaction | 60s first, 60s × 20 | `chatgpt-codex-connector[bot]` |
| `gemini` | `gemini` | github-bot | PR comment `/gemini review` | none | 180s first, 120s × 2 | `gemini-code-assist[bot]` |
| `coderabbit` | `coderabbit` | github-bot | PR comment `@coderabbitai review` | none | default | `coderabbitai[bot]` |
| `bugbot` | `bugbot`, `cursor` | github-bot | PR comment `bugbot run` (top-level only) | none | default | — |
| `greptile` | `greptile` | github-bot | PR comment `@greptileai` | none | default | — |
| `codex-cli` | `codex cli` | local-cli | `codex review --base main` | stdout `[P*]` | n/a | n/a |
| `agy` | `agy` | local-cli | `agy --model … --print` | stdout + marker | n/a | n/a |

- [ ] **Step 2: 改寫 kinds 說明**

把 `SKILL.md:1496-1502` 換成兩類，`passive-bot` 這個分類消失：

```markdown
**Reviewer kinds:**
- **github-bot** — triggered by a PR comment and polled for. Whether it *also*
  reviews automatically on push is **observed**, not declared — see `auto` in
  `shared/config.md`.
- **local-cli** — runs locally and is read from stdout. Availability comes from
  a CLI gate, not from activity detection, because a local CLI never appears in
  GitHub data. It stays a legal PR-mode reviewer and gate.

**Verified login** is the App account a tool posts from. An App's bot login is
app-scoped — identical on every repo — so a verified one is vendor knowledge.
Only observed-and-verified logins are listed; guessing is unsafe
(`cursor[bot]`, `cursor-com[bot]` and `bugbot[bot]` are all real accounts, and
GitHub Copilot posts as `Copilot` with no `[bot]` suffix). A `—` tool still
works: detection collects it by `type == "Bot"`, and an attended identify binds
its login per repo (see Reviewer selection).

`scripts/reviewer-registry.mjs` is the executable copy of this table and the one
the loop actually reads; `tests/skill-sync.test.mjs` fails CI when the two
drift.
```

- [ ] **Step 3: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/SKILL.md
git commit -m "refactor(greenlight): trim reviewer registry to vendor knowledge

Drop the wizard-eligibility column, restrict the login column to verified
app-scoped accounts, and fold passive-bot into github-bot: auto-review is
observed per repo, not a property of the tool."
```

---

### Task 7: detection 接上腳本 + config.md 文件

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md:1526-1601`（detection 段）與 `:1509-1521`（硬編碼 login 區塊，本 task 刪除）
- Create: `plugins/solopreneur/skills/greenlight/tests/skill-sync.test.mjs`
- Modify: `plugins/solopreneur/shared/config.md`

**Interfaces:**
- Consumes: Task 2 的 `detect`、Task 4 的 `resolve`
- Produces: `RESOLVED`（`resolve` 的 JSON）與 PR-1 seam（`BOT_LOGIN`），供既有 loop 與 Task 8–9 使用

- [ ] **Step 1: 採樣加上來源欄**

`collect_reviewer_activity()`（`SKILL.md:1549-1567`）的三個來源保留，每個 `--jq` 加 `.user.type` 並附一個常數來源標記，成為四欄 TSV：

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

- [ ] **Step 2: 過濾與決策改呼叫腳本，並建立 PR-1 seam**

把 `SKILL.md:1573-1586` 的 awk + jq 整段換成：

```bash
SCRIPTS="${CLAUDE_SKILL_DIR}/"scripts
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
# on explicit request (see "Reviewer selection").
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
printf '%s' "$RESOLVED" | jq -r '.warnings[]? | "note: " + .'

# PR-1 seam: the existing single-reviewer loop keeps running unchanged and
# reads its reviewer identity from the resolved gate. PR 2 replaces the
# consumers (trigger / collect / terminal states) and removes this mapping.
BOT_LOGIN=$(printf '%s' "$RESOLVED" | jq -r '.gate.login // empty')
```

**同一步刪掉 `SKILL.md:1509-1521` 整個 bash 區塊**（`CODEX_BOT` / `GEMINI_BOT` / `CODERABBIT_BOT` / `REVIEWER_BOT_LOGINS` / `BOT_LOGIN` 的硬編碼定義）。三筆的白名單被 `detect` 的 `type == "Bot"` 過濾取代；`BOT_LOGIN` 改由上面的 seam 供應，後續 poll / feedback 段落（`SKILL.md:1690` 起）不需要改就能繼續運作。

- [ ] **Step 3: 更新結果解讀表**

把 `SKILL.md:1591-1595` 換成（PR-1 語意——loop 仍是單一 reviewer；PR 2 才接 `trigger` / `collect`）：

| Result | Meaning | What happens (PR 1) |
|---|---|---|
| `DETECTION_STATUS=unavailable` | API failure / rate limit | `resolve` runs on the cache alone; empty cache falls through to the default flow |
| `available` empty | Nothing has ever acted here and nothing cached | Default flow (current behaviour) |
| `available` non-empty | These reviewers act here | The existing single-reviewer loop continues; `RESOLVED.gate` supplies its reviewer (`BOT_LOGIN` seam). PR 2 rewires trigger/collect/terminal states |
| `needsPrompt` true / `gate` null | Nothing eligible to gate | PR 1: fall through to the default flow; PR 2 adds the selection prompt |

保留 `SKILL.md:1597-1601`「detection 只列選項、不證明存活」那段——該論述在新架構下依然成立，且正是 `triggerable: false` 自我修復存在的理由。

- [ ] **Step 4: 加 skill-sync 測試（常駐取代一次性手動檢查）**

`tests/skill-sync.test.mjs`：

```javascript
/**
 * Keeps SKILL.md's human-readable registry table in sync with the executable
 * registry. The trigger string is the one field worth checking mechanically —
 * it is the only per-tool knowledge, and a stale one sends the wrong comment.
 * Runs in the same suite as everything else, so CI enforces it on every PR.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES } from '../scripts/reviewer-registry.mjs';

const md = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'SKILL.md'), 'utf8');

test('every registry row appears in SKILL.md with its trigger', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(md.includes(`\`${id}\``), `missing row: ${id}`);
    assert.ok(md.includes(r.trigger), `trigger for ${id} not in SKILL.md: ${r.trigger}`);
  }
});

test('the hardcoded login allowlist stays deleted', () => {
  assert.ok(!md.includes('REVIEWER_BOT_LOGINS'), 'hardcoded login list crept back in');
});
```

```bash
cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs
```

Expected: PASS，共 65 個 test（63 + 2 sync）

- [ ] **Step 5: 補 config.md**

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
  "observed": {
    "gemini-code-assist[bot]": { "auto": false, "triggerable": false },
    "mystery[bot]":            { "recipe": "bugbot" }
  }
}
```

| Field | Written when | Meaning |
|---|---|---|
| `observed.<login>.recipe` | attended identify | which registry row this login is. Registry-verified logins (`knownLogins`) resolve automatically and need no entry; `null` / absent with no registry match = unidentified — findings still collected, never triggered, cannot gate |
| `observed.<login>.auto` | observation | it comments without being triggered, so non-gate rounds skip prompting it (the gate is always triggered) |
| `observed.<login>.triggerable` | self-healing | `false` after a trigger got no response within the reviewer's own poll budget; excluded until it acts again or an attended run retries it (both write `true` back) |

`fallback_order` stays in `greenlight` and keeps its meaning, except it now
orders **gate candidates**. The script never reads or writes it — greenlight
resolves it through `read_solopreneur_config` and passes it in.
```

同時修掉兩處會失真的 invariant：

- `config.md:115` 的「Two writers; both write to the primary file only」→ 改為三個 writer，並說明第三個是 Node、只碰 `greenlight_reviewers`。
- `config.md:340-345` 的其他語言 writer 註冊清單 → 新增 `reviewer-state.mjs` 一條，並註明它**會寫**（既有的 `config-resolve.mjs` 一條註明只讀，兩者對比要清楚），因為該清單存在的理由就是 grep 只找得到 bash。

- [ ] **Step 6: 用真 repo 驗證**

```bash
cd /Users/Hana/Agents/nana/repos/solopreneur
OWNER=hanamizuki REPO=solopreneur
{
  gh api "repos/$OWNER/$REPO/issues/comments?sort=created&direction=desc&per_page=100" \
    --jq '.[] | [.user.login, .user.type, .created_at, "conversation"] | @tsv'
  gh api "repos/$OWNER/$REPO/pulls/comments?sort=created&direction=desc&per_page=100" \
    --jq '.[] | [.user.login, .user.type, .created_at, "review-comment"] | @tsv'
} | node plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs detect \
  | node plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs resolve \
      --repo-key github.com/hanamizuki/solopreneur --fallback-order codex-bot,codex-cli \
  | jq .
```

Expected: `available` 三筆——`chatgpt-codex-connector[bot]` / `coderabbitai[bot]` / `gemini-code-assist[bot]`，**各自帶正確 recipe**（`knownLogins` 自動識別，無需任何 config）、`evidence` 皆 `true`、`canGate` 皆 `true`；`gate.recipe == "codex-bot"`；**沒有** `hanamizuki`（type User）。

- [ ] **Step 7: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/SKILL.md \
        plugins/solopreneur/skills/greenlight/tests/skill-sync.test.mjs \
        plugins/solopreneur/shared/config.md
git commit -m "refactor(greenlight): drive detection through reviewer-state

Sample the same three sources but tag each with its channel, so review
evidence can be told apart from mere automation. The hardcoded login
allowlist is gone; the existing loop reads its reviewer from the resolved
gate until PR 2 rewires the consumers."
```

**PR 1 收尾：** 開 PR，標題 `feat(greenlight): detection-driven reviewers`。內文列出行為變更：通用偵測取代 login 白名單、三個既有 bot 經 `knownLogins` 自動識別（真 repo 驗證輸出附上）、觀測快取開始累積、loop 終止語意**未變**（gate 與多 reviewer 收集在 PR 2）。

---

## PR 2 — Gate 互動與 loop 語意

### Task 8: Reviewer 選擇與 gate 互動

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md:1613-1688`（Fallback Logic 段）
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md:806-843`（PR mode parsing 段）

**Interfaces:**
- Consumes: Task 4 的 `available` / `needsPrompt` / `warnings`
- Produces: `SELECTED_RECIPES`、`GATE_RECIPE`，以及新的 `select=` / `gate=` invocation token

- [ ] **Step 1: 新增選擇流程**

在 Fallback Logic 之前插入：

```markdown
### Reviewer selection (PR mode)

The default is silence: when `RESOLVED.gate` is set, run with it — no prompt,
however many reviewers act here. `RESOLVED.needsPrompt` is true only when bots
act on this repo but none can close a round (all unidentified or marked
unresponsive, no CLI). Attended runs then ask **one** question offering:

- **Identify** an unidentified bot: list every `available` entry with
  `recipe: null` and its `lastSeen`; the user names the registry tool a login
  belongs to. Write it back and re-resolve:

  ```bash
  printf '{"observations":[{"login":"%s","recipe":"%s"}]}' "$LOGIN" "$RECIPE" \
    | node "$SCRIPTS/reviewer-state.mjs" record --repo-key "$REPO_KEY"
  ```

- **Retry** a reviewer marked `triggerable: false` (list these with a
  "marked unresponsive" note — the mark may date from a transient outage).
  Re-selecting clears it:

  > **PR 2 must extend `resolve`'s output to make this list reachable.**
  > `resolve` filters `triggerable !== false` *before* building `available`, so
  > a marked reviewer appears in no output field and `needsPrompt` is computed
  > without it — a repo whose only known reviewer is marked reports
  > `available: []`, `needsPrompt: false`, and this prompt can never offer the
  > retry. Add the marked entries as their own output key (they must stay out of
  > `available`, which feeds `collect` — a marked reviewer's comments must not
  > start being harvested as findings) and include them in the `needsPrompt`
  > condition. Deliberately **not** done in PR 1: the field's shape depends on
  > what this prompt needs to display, and shipping a guessed contract with no
  > consumer is how dead API surface gets locked in by tests.
  > (Raised by Codex CLI on PR #150, round 10.)

  ```bash
  printf '{"observations":[{"login":"%s","triggerable":true}]}' "$LOGIN" \
    | node "$SCRIPTS/reviewer-state.mjs" record --repo-key "$REPO_KEY"
  ```

- **Add `agy`** to `--cli-available` for this run. Offered here and only here:
  it is a local CLI that passes its gate whenever installed, but it is
  Gemini-family — switching model family is the user's call, not something a
  fallback chain should do silently. `codex-cli` needs no such prompt: it is
  the documented successor to `codex-bot` in the same family, and `config.md`'s
  recommended `fallback_order` already pairs them.

- **Try a tool with no history here**: the user picks a registry recipe; post
  its trigger this round — a trigger needs only the recipe string, never a
  login. A responder matching the registry's verified logins identifies
  itself; an unknown responder shows up as an unidentified bot to identify
  next time; a silent window leaves no state behind.

- **Halt.**

After any write, re-run `resolve` and continue. Unattended runs never see this
prompt — see the degradation rule under Fallback Logic.
```

- [ ] **Step 2: 明確選擇的 token 與 persist**

接著上面的段落補：

```markdown
When the caller chose explicitly, pass the choice through:

```bash
RESOLVED=$(printf '%s' "$DETECTED" | node "$SCRIPTS/reviewer-state.mjs" resolve \
  --repo-key "$REPO_KEY" --fallback-order "$FALLBACK_ORDER" \
  --cli-available "$CLI_AVAILABLE" --select "$SELECTED_RECIPES" --gate "$GATE_RECIPE")
```

A stale value (the named reviewer has since been marked unresponsive or never
acted here) degrades inside `resolve` — warning plus fall back to
`fallback_order` — so a days-old autopilot descriptor can never produce an
empty round.

Persist an explicit gate choice so later runs start from it. Read the full
five-layer subtree, move the gate to the front while **keeping the rest of the
order** (truncating to one entry would disable the documented codex-bot →
codex-cli succession), and write the merged subtree to the repo layer. Writing
the whole merged object is what makes the repo layer's wholesale shadowing
harmless — the shadow contains everything the five-layer read would have
returned:

```bash
CURRENT=$(read_solopreneur_config greenlight)
write_solopreneur_repo_config greenlight "$(jq -nc \
  --argjson cur "${CURRENT:-null}" --arg g "$GATE_RECIPE" \
  '($cur // {}) | .fallback_order = ([$g] + ((.fallback_order // []) - [$g]))')"
```

Because the persisted gate lands at the head of `fallback_order`, the next
run's plain `resolve` picks it without `--gate` — the prompt never returns for
a repo that has a working gate.
```

- [ ] **Step 3: 新增 invocation token**

greenlight 的參數是 token 風格（`external`、`unattended`、`size=m`），**不是** `--flag`（那是腳本層）。新增兩個：

- `select=coderabbit,codex-bot,bugbot` → `SELECTED_RECIPES`
- `gate=codex-bot` → `GATE_RECIPE`

兩者**必須**加進 `SKILL.md:823` 的 token-dropping 行（目前丟掉 `external` / `unattended` / `size=…`）。否則 `gate=codex-bot` 會 survive 進 `reviewer_args`，被當成 reviewer 名字，`current_reviewer` 變成字面字串 `gate=codex-bot`，之後每次查表都失敗。擴充同一行，不要加第二輪解析。

- [ ] **Step 4: 更新 Fallback Logic**

把 `SKILL.md:1628-1638`「With config」改成：

```markdown
**With config:** `fallback_order` orders **gate candidates**. The gate is the
first entry that is available *and* `canGate`; when it times out, it is
recorded `triggerable: false` and the next entry takes over. Non-gate
reviewers are untouched by this fallback — they were never holding the loop
open.

Because `config.md`'s recommended order is `["codex-bot", "codex-cli"]`, a dead
Codex bot falls to Codex CLI automatically: same model family, no prompt.

**When every gate candidate is exhausted** — each tried and recorded
`triggerable: false` — or when `RESOLVED.gate` is null to begin with, the
existing escalation applies unchanged: attended runs ask (the selection prompt
above), unattended runs **halt** with `reason_class: transient-dependency`
(`SKILL.md:1637-1638`). Findings collected from `auto` reviewers do **not**
rescue this: with no triggerable gate there is no way to establish that a
round finished, so there is no defensible clean signal. Report what was
collected, then halt.
```

在 unattended 段（`SKILL.md:1665-1673`）後補：

```markdown
For reviewer selection specifically an unattended run does **not** halt while a
gate is resolvable: the gate is the first available `fallback_order` entry and
every auto reviewer is still collected. Unattended runs never identify, never
retry a marked reviewer, and never add `agy` — those are attended decisions.
Blocking on input is worse than a defensible default gate.
```

保留 `SKILL.md:1675-1682` 的 Gemini sunset 段原樣。

- [ ] **Step 5: 走查一致性**

```bash
cd /Users/Hana/Agents/nana/repos/solopreneur/plugins/solopreneur/skills/greenlight
# 新 token 必須同時出現在解析與丟棄兩處
grep -n "select=\|gate=" SKILL.md
# 舊的 wizard 用語不該再出現（wizard eligibility 已由 canGate 取代）
grep -n "wizard eligibility" SKILL.md || echo "ok: no stale wizard-eligibility reference"
```

Expected: `select=` / `gate=` 在選擇流程、resolve 呼叫、PR mode parsing 的丟棄行都出現；無殘留 `wizard eligibility`。

- [ ] **Step 6: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/SKILL.md
git commit -m "feat(greenlight): add reviewer selection and clean-pass gate

The default is silence: a resolvable gate runs without prompting. The
prompt appears only when nothing can gate, and offers identify, retry,
agy, or halt. An explicit gate choice is persisted by prepending it to the
merged fallback_order at the repo layer, so succession survives."
```

---

### Task 9: Poll 窗口、終端狀態與觀測回寫

**Files:**
- Modify: `plugins/solopreneur/skills/greenlight/SKILL.md`（Phase 3 external loop，PR mode 部分；含 Feedback Detection Strategy 段 `SKILL.md:1690` 起的參數化）

**Interfaces:**
- Consumes: Task 4 的 `trigger` / `collect` / `gate`；Task 3 的 `record`
- Produces: 一輪的完整流程與 `record` 的 payload；移除 Task 7 的 PR-1 seam

**兩個必須保留的既有機制**（改寫時整段覆蓋掉就是 regression）：

1. **👀 handshake 確認梯**（`SKILL.md:1786-1799`）：`@codex review` 有時觸發不了 bot，無 👀 要重貼（上限 2 次）。新流程按 `trigger[].handshake == "reaction"` 套用，`none` 的發一次即可。
2. **👍-only clean 訊號**（Feedback Detection priority 2.5，`SKILL.md:1831-1844`）：codex bot 有時不留言只按 👍。「gate 回應了」的判定必須含 👍 reaction，否則健康 bot 的 clean pass 會被分類成 `timeout` → 被誤標 `triggerable: false`。quota 關鍵字表與「匹配到 quota/clean 時印前三行人工確認」的警告（`SKILL.md:1846-1854`）一併保留，逐 login 參數化（原本吃單一 `$BOT_LOGIN`）。

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
   - `github-bot` → post `triggerText` as a top-level PR comment, then run the
     handshake for that entry: `reaction` → the existing 👀 ladder (wait 30s,
     recheck once, re-comment on silence, max 2 retries); `none` → post once.
   - `local-cli` → run it via the existing Flow B (synchronous, read stdout).
   Entries absent from `trigger` are non-gate `auto` reviewers (need no
   prompting) or recipe-less (cannot be prompted). The gate itself is always
   in `trigger` — auto or not.
4. Open the wait window from **`RESOLVED.gate`**:
   - `gate.kind == "bot"` → poll on `gate.poll`.
   - `gate.kind == "cli"` → no poll window: the CLI's synchronous completion
     closes the round. After it returns, do one collection sweep across the
     three channels for the other selected logins.
5. Inside the window scan each channel's new items. The scan itself is
   **unfiltered** (observation write-back needs to see every Bot login);
   findings are taken only from logins in `collect`. Check the gate's 👍
   reaction alongside its comments (priority 2.5).
6. Close the window when the gate produces a new item **or a 👍-only
   reaction**, or on timeout.
7. **Classify before touching anything** — exactly one terminal state by the
   precedence table below. Fixing before classifying would let the loop end on
   a diff no reviewer has seen.
8. Act on the state: `findings` → merge, dedupe, hand to the existing
   finding-processing flow (adversarial verification included), then next
   round. `clean` → one final sweep for late arrivals, report anything
   unprocessed (do **not** fix it — fixing now would end the loop on an
   unreviewed diff), end. `timeout` / `quota` → observation write-back, next
   gate candidate or halt.
9. Write observations (Step 2 below).

**Deliberately not waiting for auto reviewers.** The window closes on the gate.
An auto reviewer still mid-review is not waited for — every channel's ceiling
rises monotonically, so its late findings arrive next round; on the final
round they land in the closing report instead of vanishing. This is what stops
"collect four reviewers" from becoming "wait for the slowest one, every
round".
```

- [ ] **Step 2: 觀測回寫**

```markdown
After closing the window, build `$OBSERVATIONS` from the unfiltered channel
scan (Bot-typed logins only) plus `RESOLVED`:

| Condition | Payload |
|---|---|
| Bot login produced an item, was **not** in `trigger` | `{login, auto: true}` |
| login was in `trigger` **because non-auto** and produced an item | `{login, auto: false}` (the gate's forced trigger never rewrites `auto` — check the entry's `auto` in `RESOLVED.available`) |
| login was in `trigger`, stayed silent all window, **and** the window covered its own recipe's poll budget | `{login, triggerable: false}` (the gate always qualifies — the window *is* its budget; a non-gate reviewer slower than the gate's window is simply unobserved this round, not unresponsive) |
| a cached `triggerable: false` login produced any item | `{login, triggerable: true}` (self-healing back) |
| an unidentified Bot login produced an evidence-shaped item (review comment / formal review) | attended: offer identify (may also be done at the next selection prompt); unattended: nothing — findings from unidentified bots are already collected |

Then:

```bash
printf '%s' "$OBSERVATIONS" \
  | node "$SCRIPTS/reviewer-state.mjs" record --repo-key "$REPO_KEY"
```

An empty payload is legal and rewrites nothing.
```

- [ ] **Step 3: 四個終端狀態（優先序判定）**

```markdown
**Silence is not a pass.** Classify every round into exactly one state by
walking this table top-down; the first matching row wins:

| Precedence | State | Condition | Action |
|---|---|---|---|
| 1 | `findings` | new findings from **any** collected reviewer, gate included | fix, next round |
| 2 | `quota` | no new findings, and the gate's response is a quota / rate-limit notice | next gate candidate; candidates exhausted → halt |
| 3 | `timeout` | no new findings, and the gate stayed silent through the whole window (no item, no 👍) | record `triggerable: false`, next gate candidate; exhausted → halt. **Never clean** |
| 4 | `clean` | the gate responded (item or 👍) and nobody produced a new finding | final sweep, report leftovers, end the loop |

`findings` outranking `clean` is load-bearing: when the gate passes but another
reviewer found something, that round must loop — fixing and then declaring
clean would end the loop on a diff no reviewer has reviewed. The other
direction (a dead reviewer counting as a pass) is blocked by row 3.

`SIZE_MAX_ROUNDS` (S=3 / M=5 / L=10) is unchanged and is what bounds a chatty
auto reviewer stretching the loop; at the cap the unresolved items go into the
closing report. Size S is external-only with a single reviewer — its gate
resolves straight from `fallback_order`, so the nothing-can-gate prompt cannot
trigger under S.
```

同步移除 Task 7 的 PR-1 seam（`BOT_LOGIN` mapping）——本 task 之後 poll / feedback 消費端直接吃 `RESOLVED.gate` 與 `collect`，逐 login 參數化。

- [ ] **Step 4: 實跑驗證（需要一個開著的 PR）**

四項，各對應一個設計主張。逐項記錄結果：

```bash
# 1. CodeRabbit 可觸發（動機 1 的核心主張，也驗證 OSS 方案下 chat 指令可用）
gh pr comment <PR> --body "@coderabbitai review"
sleep 180
gh api "repos/hanamizuki/solopreneur/pulls/<PR>/comments" \
  --jq '[.[] | select(.user.login=="coderabbitai[bot]")] | length'
#    若過程中出現 CodeRabbit 的 rate-limit 通知，抄下原文措辭，
#    對照 quota 關鍵字表確認匹配得到（M6：新 bot 的 quota 偵測未驗證過）

# 2. timeout 不等於 clean
#    把 gate 設成一個已知不會回應的 reviewer（gemini，consumer 方案已 sunset），
#    確認該輪回報 timeout、寫入 triggerable:false、換下一個 gate 候補、
#    且**沒有**結束 loop
jq '.repos["github.com/hanamizuki/solopreneur"].greenlight_reviewers' \
  "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"

# 3. 無歷史工具的完整路徑——不可手動塞入猜測的 login 代替
#    attended 跑一輪，走「Try a tool with no history」選 greptile：
#    確認發出了 `@greptileai`；整窗無回應後**沒有任何狀態被寫入** config；
#    （若有回應則走 identify，確認寫入 observed[login].recipe）

# 4. unattended 不等待輸入
#    在多 reviewer 的 repo 上跑 `/greenlight external unattended`，全程無提示，
#    gate 為 fallback_order 第一個可用者
```

Expected: 1 有回應；2 回報 `timeout`、標記寫入、gate 換手、loop 未結束；3 無回應時 config 逐位元不變；4 全程無提示。

**自動化測不到的兩處，只能走查**（誠實記錄，不要假裝有覆蓋）：

| 行為 | 為什麼測不到 | 怎麼確認 |
|---|---|---|
| 終端狀態的優先序分類 | `clean` / `findings` / `timeout` 的判定發生在 prompt 層 | 上面實跑第 2 項；另確認 Step 3 的表把 `findings` 放在第 1 列、沉默沒有任何一列導向 `clean` |
| 觀測 payload 的組裝 | 六種條件對應的 payload 由 SKILL.md 決定，腳本只驗證欄位合法性 | 讀 Step 2 的表格逐列對照；腳本層保證的是 `record` 不憑空發明欄位（Task 3 的 empty-payload 與 schema 驗證測試） |

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/greenlight/SKILL.md
git commit -m "feat(greenlight): per-channel poll window with four terminal states

Trigger everything in parallel (the gate always included, auto or not),
collect from all selected logins across all three channels, close on the
gate's item or thumbs-up. findings outranks clean so the loop never ends
on an unreviewed diff; a silent gate is a timeout, never a pass, and
triggerable is written only within a reviewer's own poll budget."
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

**現況**（已查證）：autopilot 不直接呼叫 greenlight。它把變數代入 `references/pr-subagent-template.md`，由被 dispatch 的 worktree subagent 在其 Step 5 執行 `/greenlight size=m`（`pr-subagent-template.md:90`）。plan.yaml 的完整 schema 在 `references/schemas.md`（`autopilot/SKILL.md:176` 指向它），新欄位必須在那裡定義；既有的 `size` 欄（`schemas.md:16` 範例、`:52` 欄位表）是要照抄的先例。

**刻意不做規劃期預解析**：原設計在 autopilot 規劃階段跨 sibling skill 呼叫 `resolve` 並複製選擇 UX，代價是路徑拼接的脆弱性與第二份互動流程，而收益只有「descriptor 可以預填」。規劃者**可以**把使用者明講的偏好寫進 `select` / `gate`（optional 欄位），解析與降級一律由 greenlight 自己做——stale 值在 `resolve` 內降級（Task 4），unattended 的預設 gate 由 `fallback_order` 決定（Task 8）。

- [ ] **Step 1: schema 定義新欄位**

在 `references/schemas.md` 的 PR descriptor 定義中新增兩個 optional 欄位，措辭比照既有 `size`：

```markdown
| `select` | optional | Comma-separated reviewer recipe ids for `/greenlight`. Set it only when the user stated a preference during planning; omit to let greenlight resolve from per-repo config. Stale ids degrade with a warning at run time. |
| `gate`   | optional | The recipe whose clean pass gates the review loop. Omit to use the first available `fallback_order` entry. Stale values degrade the same way. |
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

- [ ] **Step 3: 模板傳遞 token 並明確帶 `unattended`**

改 `references/pr-subagent-template.md:88-95`。除了新 token，**還要明確加上 `unattended`**——目前的 invocation 沒有它（`pr-subagent-template.md:90` 只有 `size={SIZE}`），而新的降級行為（不問、不 halt、用預設 gate）是綁在該 token 上的：

```markdown
Invoke the /greenlight skill with the `unattended` token — a dispatched run has
no human to answer a selection prompt, and `unattended` is what makes greenlight
pick a defensible default gate instead of blocking. When the plan set a size,
pass `size={SIZE}`; when it recorded a reviewer selection, also pass
`select={SELECT}` and `gate={GATE}`. For example:

    /greenlight unattended size=m select=coderabbit,codex-bot gate=codex-bot

With no selection tokens, greenlight resolves from the per-repo config and falls
back to the first available `fallback_order` entry as gate. Stale tokens (a
reviewer marked unresponsive since planning) degrade with a warning — they
never fail the run.
```

- [ ] **Step 4: 走查一致性**

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

- [ ] **Step 5: Commit**

```bash
git add plugins/solopreneur/skills/autopilot/SKILL.md \
        plugins/solopreneur/skills/autopilot/references/schemas.md \
        plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md
git commit -m "feat(autopilot): pass reviewer selection through to greenlight

Optional select=/gate= descriptor fields mirror size=, filled only from a
user-stated preference during planning. The dispatched invocation now
carries unattended explicitly, which is what the no-prompt fallback is
keyed on; stale tokens degrade inside greenlight instead of failing."
```

**PR 2 收尾：** 開 PR，標題 `feat(greenlight): selectable gate and multi-reviewer collection`。內文附 Task 9 Step 4 的四項實跑結果。

---

## 完成後

兩個 PR 都 merge 後跑 `/release`，`solopreneur` plugin 取 patch bump。依 repo 根 `CLAUDE.md`，版本只由 `/release` 動，本 plan 的任何 commit 都不碰 `plugin.json`。
