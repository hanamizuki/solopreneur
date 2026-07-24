# feat(preview): provenance resolver — Claude adapter + caller override

Follows the Phase 1 config work (PR #134–#137) and the Phase 2 builder
(PR #138, `build-library.mjs`). Second PR of Phase 2. It adds
`resolve-provenance.mjs`: normalize a preview's "who produced / who last updated"
into display-safe values so the builder can render a provenance footer without
leaking a raw session id or a local path.

It is the resolver module + tests + docs ONLY. It does NOT implement
`preview-shell.js`, the library index, comment-overlay changes, or any deploy
step, and it modifies none of `deploy.sh`, `config-resolve.mjs`,
`config-migrate.mjs`, `vercel-protect.mjs`, `setup.mjs`, `build-library.mjs`,
`config.schema.json`, or any `plugin.json`.

## Requirements

Resolve, for a `createdBy` and a `lastUpdatedBy`, a display object
`{ agent, platform, sessionTitle }` — where `sessionTitle` is omitted (not
guessed) when unavailable.

### v1 scope — deliberately small

Implement ONLY the **Claude adapter** and the **caller-override** path. Codex /
Hermes / OpenClaw adapters are NOT implemented this PR — they return a graceful
"unrecorded" fallback, never a guess. Their real adapters are a later, as-needed
PR; the `ADAPTERS` map is the clearly-named seam they slot into.

### Resolution priority (first hit wins, never guess)

1. **Caller-explicit** — a `sessionTitle` the caller passed in directly (the
   owning agent knows who it is). Highest priority, and platform-independent.
2. **Platform adapter** — deterministic normalization from platform data.
   - **Claude** (implemented): from a Claude hook-style payload carrying
     `session_id` / `session_title`, derive the display `sessionTitle` from
     `session_title`. The raw `session_id` is never read here and never reaches
     the output.
   - **Codex / Hermes / OpenClaw** (not implemented): no adapter → `sessionTitle`
     resolves to the "unrecorded" fallback (absent), while caller-supplied
     `agent` / `platform` still pass through.
3. **Missing** — nothing resolves → `sessionTitle` absent; the footer reads
   "unrecorded" downstream. Never fabricated.

### The collapse (display shape the module owns)

`resolveProvenance({ createdBy, lastUpdatedBy })` returns:

- `{ producedBy }` when the two parties resolve identically (all of `agent` /
  `platform` / `sessionTitle` match) — the common case of an item no one else has
  revised; the footer shows a single "Produced by" line.
- `{ createdBy, lastUpdatedBy }` otherwise — the footer shows separate "Created
  by" and "Last updated by" lines.

The module resolves DISPLAY values; it does not own the create/update lifecycle
(which party is immutable, when `lastUpdatedBy` advances) — that is the item's
metadata, handled elsewhere.

## Acceptance Criteria

- [x] `cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs`
      exits 0 — 261 tests (237 baseline: 235 pass + 2 skipped; + 24 new).
- [x] **Caller-override** beats the platform adapter (an explicit caller value
      wins), and works for a platform with no adapter.
- [x] **Claude adapter** derives `sessionTitle` from a `session_title` payload;
      the returned object NEVER contains the raw `session_id` or `transcript_path`.
- [x] **Codex / Hermes / OpenClaw** inputs return the "unrecorded" fallback (not a
      guess), passing through caller-supplied `agent` / `platform`.
- [x] **Collapse**: creator == updater → `{ producedBy }`; creator != updater →
      `{ createdBy, lastUpdatedBy }`.
- [x] **Missing everything** → `sessionTitle` absent, no fabrication; missing
      provenance → `{ producedBy: {} }` (a single "unrecorded" line).
- [x] **Sanitization sweep** — a test asserts a raw session id / transcript path /
      absolute path never appears in any returned object, including hostile blobs.
- [x] `grep -rniE 'hana|~/Agents|mojo-apps'` over the new `.mjs` + test returns no
      matches.
- [x] `git diff --stat` shows no change to the protected files above or any
      `plugin.json`.

## Implementation decisions

**Pure, total, no CLI.** The module is a deterministic normalizer with no I/O and
no network — the builder's `injectEntry` seam imports `resolveProvenance` to
render the footer, so there is nothing to run from a shell (no shebang, no
`main`). It NEVER throws: a footer resolver must degrade to "unrecorded" on a
malformed provenance blob, not abort a publish. Its siblings throw typed errors
because a bad CONFIG or a torn CONTENT snapshot must stop the build; a weird
provenance blob must not. This is the deliberate difference from
`config-resolve.mjs` / `build-library.mjs`.

**Sanitize by construction.** Every returned object is assembled key by key from
the allowlist (`agent` / `platform` / `sessionTitle`); the input is never spread.
A raw `session_id`, a `transcript_path`, a `payload`, or an absolute path
therefore cannot ride along — the same "pick, never spread" discipline
`build-library.mjs` uses for `directory.json`.

**`Object.hasOwn` on the adapter lookup.** A bare `ADAPTERS[platform]` walks the
prototype chain, so `platform: "toString"` / `"constructor"` would resolve an
inherited function and, when called, fabricate a title like `"[object
Undefined]"` — the exact "never guess" violation. The lookup is guarded with
`Object.hasOwn`, matching the `in`-vs-`hasOwn` discipline the sibling resolvers
already apply.

**The `ADAPTERS` map is the seam.** Only `claude` is implemented; a future PR
adds one function per platform. The header names each platform's known source
(`CODEX_THREAD_ID` → `session_index.jsonl`; Hermes state; OpenClaw
`SessionEntry`) so the next PR has the pointer.

## Vetting note

Verified against the Claude Code hooks reference that `session_title` is the
correct field name (not `session_name` / `title`) and is present only once a
session has been named — which is exactly why the graceful "absent → unrecorded"
path is the common case, not an edge case. `session_id` / `transcript_path` /
`cwd` are confirmed standard payload fields, so the sanitization concern is
concrete: a real Claude payload carries an absolute local path.
