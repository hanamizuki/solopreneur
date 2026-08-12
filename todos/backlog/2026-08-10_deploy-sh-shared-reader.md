# preview/deploy.sh: read config through the shared helper

**Created:** 2026-08-10
**Source:** CodeRabbit on PR #158 (valid, deferred as out of scope there)
**Size:** the reviewer's own label was "heavy lift"

## Problem

`skills/solopreneur/preview/scripts/deploy.sh` carries its own
`read_preview_config`, which falls back **per dotted key** across config homes.
The shared `read_solopreneur_config <feature>` instead returns the first
non-null **whole feature subtree**, so it can never mix values from two files.

With deploy.sh's reader, `projects.default` can come from one home while
`autoProtect` comes from another. The repo's stated convention is the shared
five-layer, first-non-null-subtree precedence (`shared/config.md:122`,
root `CLAUDE.md:23`).

This predates the Codex config home; PR #158 widened the search from two homes
to three without changing the reader's character.

## Why it was not fixed in PR #158

That PR's job was making config resolvable on Codex at all. Converting
deploy.sh means restructuring how it reads config: the shared helper has no
dotted-key form, so each call site (`projects.<bucket>`, `autoProtect`) has to
move to extracting from one returned subtree — and `deploy.sh` is on the
publishing path, where a silent config change deploys to the wrong project.

## Shape of the fix

Call `read_solopreneur_config preview` once, then pull the nested keys out of
that single subtree with `jq`. Keep the existing lookup semantics for callers.
Note that the shared helper lives in a markdown reference, so deploy.sh has to
either inline the block like the SKILL.md consumers do, or — better, since it
is a real script — read it from `shared/` the way
`preview/scripts/config-resolve.mjs` already reads `shared/config.schema.json`.

`shared/config.md:380-384` recommends exactly that for new code.
