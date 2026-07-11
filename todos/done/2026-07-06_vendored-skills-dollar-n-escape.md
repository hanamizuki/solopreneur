# Vendored skills: escape bare $N (same bug PR #87 fixed for native plugins)

PR #87 (merged 2026-07-06) escaped bare `$N` → `\$N` in the **native** plugins
(`solopreneur`, `marketer`). The **vendored** plugins have the identical bug but
could not be fixed in that PR — `validate-vendored.yml` re-runs
`sync-vendored.sh --pinned` and fails CI on any hand-edit drift, and the next sync
would clobber the edit anyway.

## The bug (verified, not theoretical)

Claude Code substitutes `$N` (= `$ARGUMENTS[N]`) in a SKILL.md body on **every**
load (slash-command AND model-invoked), no-arg → `$digit` collapses to empty.
Verified live: `ios-dev:ios-patterns` currently renders its Swift
`.replacingOccurrences(..., with: "$1", ...)` as `with: ""` — i.e. the shipped
skill teaches broken code (strips the regex capture group). See memory
`claude-code-skill-dollar-n-substitution` for full mechanism.

## Affected files (7, across 3 plugins)

Vendored (6) — fixed by the sync-time escape:

- `designer`: `taste-redesign` (`$100.00`, `$99.00`), `taste-skill` (`$10/user`),
  `taste-soft` (`$150k` ×2) — dollar amounts in prose
- `ios-dev`: `asc-shots-pipeline` (bash `local UDID="$1"` etc.)
- `android-dev`: `gplay-screenshot-automation` (bash `local NAME="$1"` … `$4`),
  `gplay-ppp-pricing` (`$4.99`/`$9.99` … pricing tables)

Native (1) — hand-edited, same as PR #87 did for the other native skills:

- `ios-dev`: `ios-patterns` (Swift regex `with: "$1"`). Despite living in a
  vendored plugin, this skill is **not** vendored — no `_VENDOR.md`, absent
  from `skills/_vendored/manifest.json`, so `sync-vendored.sh` never touches
  it and a hand-edit cannot drift. Four other native skills hide inside the
  vendored plugins the same way (`ios-app-templates`, `android-patterns`,
  `ai-app-templates`, `langgraph`); none of them carry a bare `$N`. PR #87's
  "the other plugins are vendored" was a plugin-level generalization that does
  not hold per skill — worth knowing for the `_vendored/` → `vendor/` move.

(ai-engineer, neo4j-dev are also vendored but have no bare `$N` — nothing to fix.)

Locate current occurrences:
`grep -rEn '(^|[^\\])\$[0-9]' plugins/{designer,ios-dev,android-dev}/skills/**/SKILL.md`

## Options (decide before starting)

1. **Sync-time escape rewrite** (likely best): add a mechanical `\$N` escape step to
   each vendored plugin's `scripts/sync-vendored.sh`, alongside the existing path
   rewrite. Fixes all vendored skills automatically, survives re-sync, no
   third-party PRs. Cost: touches vendoring infra across plugins + needs the
   escape to be idempotent (don't double-escape already-escaped upstream tokens);
   update `validate-vendored` expectations accordingly.
2. **Fix upstream + bump pinned rev**: PR each upstream, then re-vendor. Problem:
   some upstreams are third-party (android-dev ← github.com/android/skills) — not
   maintainer-controlled, slow/uncertain.
3. **Accept**: leave the vendored corruption (guidance text + some code examples).

Recommendation: option 1, but scoped as its own PR with a careful look at
`sync-vendored.sh` idempotency and the `validate-vendored` drift check first.

## Done when

`grep -rEn '(^|[^\\])\$[0-9]'` over all `plugins/*/skills/**/SKILL.md` returns 0,
AND `validate-vendored` CI stays green (i.e. the escape is produced by the sync,
not a hand-edit).

## Resolution

Option 1, as recommended. `sync-vendored.sh` gained an idempotent escape pass
that rewrites bare `$0`-`$9` to `\$0`-`\$9` in each vendored `SKILL.md` after
the existing path rewrite, and all five vendored plugins were re-synced with
`--pinned` (no upstream rev moved). The lone native offender, `ios-patterns`,
was hand-edited.

Two things worth carrying forward:

- The escape scans a line left to right and consumes only up to and including
  the `$`, leaving the digit to serve as the "preceding char" for the next
  match. A single `sed -E 's/(^|[^\\])\$([0-9])/…/g'` would miss the second
  token of an adjacent pair (`$1$2`) because the consuming left-context group
  eats the boundary. Idempotency is what keeps the drift check green.
- The escape is deliberately confined to `SKILL.md`. `references/*.md` are read
  at runtime with the Read tool, which returns raw bytes and never substitutes,
  so escaping them would only plant a stray backslash in text meant to be
  copied verbatim.
