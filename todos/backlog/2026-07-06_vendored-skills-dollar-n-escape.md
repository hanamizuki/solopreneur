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
vendored skill teaches broken code (strips the regex capture group). See memory
`claude-code-skill-dollar-n-substitution` for full mechanism.

## Affected vendored files (7, across 3 plugins)

- `designer`: `taste-redesign` (`$100.00`, `$99.00`), `taste-skill` (`$10/user`),
  `taste-soft` (`$150k` ×2) — dollar amounts in prose
- `ios-dev`: `asc-shots-pipeline` (bash `local UDID="$1"` etc.),
  `ios-patterns` (Swift regex `with: "$1"`)
- `android-dev`: `gplay-screenshot-automation` (bash `local NAME="$1"` … `$4`),
  `gplay-ppp-pricing` (`$4.99`/`$9.99` … pricing tables)

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
