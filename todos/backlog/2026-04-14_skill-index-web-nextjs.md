# Web / Next.js Agents — Curated List & Extended Index

Build curated sections for `agents/web-dev.md` and `agents/nextjs-dev.md`, and
wire extended index classification for web/Next.js skills.

## Scope

- Audit the local skill inventory for web / Next.js related user-built skills
- Decide generalization + vendor candidates (if any)
- Decide whether `web-dev` and `nextjs-dev` share one curated list or have
  separate ones (current design: two separate agent files)
- Write classification rules for vercel plugin skills (auto-extended, not
  hardcoded in curated per earlier decision)

## Key decisions already made

- **No vercel hardcode in curated** — vercel plugin skills flow through
  extended index only (vercel updates fast; hardcoding rots)
- Extended index file: `~/.claude/solopreneur/skill-index/web.md` and/or `nextjs.md`

## Open questions

- One extended file for both, or split?
- Any user-built web skills worth vendoring?

## Out of scope

- Other platforms
- README update (batched in final phase)

## Status

Backlog.
