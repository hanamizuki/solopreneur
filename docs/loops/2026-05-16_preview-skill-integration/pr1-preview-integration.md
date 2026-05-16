# feat(solopreneur): integrate preview skill with config-backed path persistence

Integrate the in-house `preview` skill (currently developed at
`~/Agents/skills/hana/preview/`, OUTSIDE this repo) into the `solopreneur`
plugin, and replace its hardcoded Hana-specific paths/names with
distribution-safe logic backed by the existing `_shared/config.md` cascade.

## Requirements

### R1 — Copy the skill into the plugin

Copy these files **from** `~/Agents/skills/hana/preview/` (read-only source,
outside this repo — do not modify or delete the source) **into**
`plugins/solopreneur/skills/preview/`, preserving the subtree:

- `SKILL.md`
- `references/libs.md`
- `scripts/preflight.sh`
- `scripts/deploy.sh`
- `assets/template.html`
- `assets/comment-overlay.js`

`chmod +x` both scripts. `preflight.sh` needs **no edits** (already generic).

### R2 — `deploy.sh`: auto-derive the Vercel project name

Currently `PROJECT_NAME="${PREVIEW_PROJECT:-hana-previews}"`. The literal
`hana-previews` default is Hana-specific. Change the default to be **derived
from the working context**:

- If `PREVIEW_PROJECT` env is set → use it verbatim (the skill instructs the
  agent to set it; see R3).
- Else derive: take the basename of `git -C "$DIR" rev-parse --show-toplevel`
  (the proposal dir's enclosing repo); if not in a git repo, take the
  basename of the proposal dir's parent. Append `-preview`.
- Sanitize the derived name to a Vercel-legal project name: lowercase, keep
  only `[a-z0-9-]` (replace others with `-`), collapse repeated `-`, no
  leading/trailing `-`, never contains `---`, max 100 chars. Never let the
  final name be empty — fall back to `cc-preview` if sanitization yields
  nothing.

Update the script's **header comment block** (the lines describing
"hana-previews") to describe the derived-name behaviour instead. Keep the
`$PREVIEW_PROJECT` override documented in the comment.

### R3 — `SKILL.md` Step 2 rewrite: config-backed path resolution

Replace the current Step 2 (`### 2. Decide where the proposal lives, then
create the dir`) so it resolves the proposal parent path via the solopreneur
config cascade, persists the user's choice per repo, and stops re-probing on
subsequent runs in the same repo.

**Inline both helpers** from
`plugins/solopreneur/skills/_shared/config.md` — copy the
`read_solopreneur_config` AND `write_solopreneur_config` function bodies
**verbatim** into a bash block near the top of Step 2, wrapped in the exact
`# --- solopreneur config helpers (inlined from _shared/config.md) ---` /
`# --- end solopreneur config helpers ---` markers used by the other skills.
Match the inlining pattern already used in
`plugins/solopreneur/skills/worktree-handoff/SKILL.md` (read it for the
convention — same marker comments, same placement style).

**Config schema**: a new top-level key `preview` in `solopreneur.json`:

```json
{ "preview": { "paths": { "<repo-key>": "<path>" } } }
```

- `<repo-key>`: `git remote get-url origin` normalized (strip scheme,
  trailing `.git`, and any `git@host:` prefix → `host/owner/repo`); if no
  `origin`, use the absolute git toplevel path; if not in a git repo, use
  `$PWD`.
- `<path>`: stored **relative to the repo root** when the chosen path is
  inside a git repo; absolute otherwise.

**Resolution flow** (replaces the old probe-only logic):

1. Compute `<repo-key>`.
2. `read_solopreneur_config preview` → if `.paths["<repo-key>"]` is present
   and non-empty, resolve it (relative → joined onto repo root) and use it.
   **Skip the probe and the question entirely.**
3. If absent, run the existing probe to compute a *suggested* path
   (preserve the current logic: read the repo's `AGENTS.md` / `CLAUDE.md` /
   `README` for an explicit docs/RFC/specs location and match its spirit;
   else reuse an existing `docs/proposals/` `docs/rfcs/` `proposals/`
   `design-docs/` dir if present; else default `<git_root>/docs/preview/`).
   Keep the **fork-safety check** (an `upstream` remote → don't write into
   someone else's history).
   - **No git repo**: suggest a workspace-relative `docs/preview/` if the
     cwd is inside a recognizable agent workspace; final fallback
     `~/.claude/previews/`. **Remove** the old `~/Agents/proposals/` default
     and the `git_root == ~/Agents` special case entirely.
4. Use `AskUserQuestion` to confirm: present the suggested path with options
   — `確認並記住` / `改別的路徑` / `每次都問（不記住）`.
5. On `確認並記住` or `改別的路徑` → `write_solopreneur_config preview` with
   the merged `paths` map (re-read existing `preview` subtree, set
   `.paths["<repo-key>"]`, write back — do not clobber other repos' entries).
6. On `每次都問` → do not persist; use the suggested path for this run only.
7. Preserve the rest of Step 2's behaviour (per-proposal dir =
   `<parent>/<YYYY-MM-DD>-<short-slug>/`, immutable-URL note, the
   inside-a-repo handling: commit as normal doc, append
   `**/comment-overlay.js` to `.gitignore`, tell the user).

Also update **Step 1**'s "先看 local" fallback: it currently writes to
`~/Agents/proposals/…/` — change it to use the same resolved path from Step 2
(no `~/Agents/proposals/` anywhere in the final SKILL.md).

### R4 — Remove the TODO section

Delete the entire trailing `## TODO — future integration with solopreneur
plugin` section from `SKILL.md` (it is now implemented by R3).

### R5 — Soften the `web-artifacts-builder` reference

In `SKILL.md` "What not to do", the bullet that says "fall back to
`web-artifacts-builder` and deploy its `bundle.html`" must not name a skill
that isn't shipped in this marketplace. Reword to something like: "if a
proposal genuinely needs React + shadcn level complexity, fall back to a
heavier multi-file builder skill if one is available and deploy its built
HTML bundle via `deploy.sh`." Keep the single-file-is-the-whole-stack point.

### R6 — `SKILL.md` Step 4 wording

Step 4 currently states "All previews share one Vercel project
(`hana-previews`)". Update it to reflect R2/R3: the project name is derived
per working context (or `$PREVIEW_PROJECT` if the agent sets it), and
instruct the agent that it MAY set `PREVIEW_PROJECT=<workspace-or-agent-name>-preview`
when it knows its workspace/agent identity (e.g. `mojo-preview`).

### R7 — README connective updates

In `README.md`:

- Line ~12: `15 in-house skills` → `16 in-house skills`.
- Line ~73: `just 15 / 16 skills` — bump the count to `16`.
- Add a row to the **Your Virtual Product Team** table (the table starting
  at line ~78). Role label: **Presenter.** Description: turns any
  proposal/plan/idea into an interactive HTML page, deploys to Vercel for a
  shareable URL, with an in-page comment overlay for in-context feedback.
- Add one line to the `How core skills work together` ASCII diagram (place
  it sensibly near the review/handoff stage, e.g. a `/preview ── Make it
  human-reviewable, collect in-context feedback` branch).
- Add a bullet to the `solopreneur` **Requirements** section: **Vercel CLI**
  — *optional*; `/preview` deploys previews to a shareable URL when present,
  and gracefully degrades to a local `open` of the HTML when absent.

## Files to Read

- `~/Agents/skills/hana/preview/SKILL.md` (source skill — outside repo, read-only)
- `~/Agents/skills/hana/preview/scripts/deploy.sh` (source script)
- `plugins/solopreneur/skills/_shared/config.md` (verbatim helper source + conventions)
- `plugins/solopreneur/skills/worktree-handoff/SKILL.md` (inlining-pattern reference)
- `README.md` lines 1-160 (skill counts, Virtual Product Team table, diagram, Requirements)
- `CLAUDE.md` (versioning rules — confirms NO plugin.json bump)

## Files to Create/Modify

- `plugins/solopreneur/skills/preview/SKILL.md` — new (copied + R3/R4/R5/R6 rewrites)
- `plugins/solopreneur/skills/preview/references/libs.md` — new (verbatim copy)
- `plugins/solopreneur/skills/preview/scripts/preflight.sh` — new (verbatim copy, +x)
- `plugins/solopreneur/skills/preview/scripts/deploy.sh` — new (copy + R2 edits, +x)
- `plugins/solopreneur/skills/preview/assets/template.html` — new (verbatim copy)
- `plugins/solopreneur/skills/preview/assets/comment-overlay.js` — new (verbatim copy)
- `README.md` — R7 edits

## Acceptance Criteria

- [ ] `ls plugins/solopreneur/skills/preview/{SKILL.md,references/libs.md,scripts/preflight.sh,scripts/deploy.sh,assets/template.html,assets/comment-overlay.js}` all exist
- [ ] `test -x plugins/solopreneur/skills/preview/scripts/preflight.sh && test -x plugins/solopreneur/skills/preview/scripts/deploy.sh`
- [ ] `bash -n plugins/solopreneur/skills/preview/scripts/preflight.sh && bash -n plugins/solopreneur/skills/preview/scripts/deploy.sh` (syntax OK)
- [ ] `grep -rn 'hana-previews' plugins/solopreneur/skills/preview/` returns nothing (default genericized)
- [ ] `grep -rn '~/Agents/proposals' plugins/solopreneur/skills/preview/SKILL.md` returns nothing
- [ ] `grep -n 'TODO — future integration' plugins/solopreneur/skills/preview/SKILL.md` returns nothing
- [ ] `grep -n 'web-artifacts-builder' plugins/solopreneur/skills/preview/SKILL.md` returns nothing
- [ ] SKILL.md Step 2 contains both `read_solopreneur_config` and `write_solopreneur_config` inlined between the standard `# --- solopreneur config helpers` markers, and references the `preview` config key with a `paths` map
- [ ] `README.md` shows `16 in-house skills` (line ~12) and the count bumped at line ~73; a `/preview` row exists in the Virtual Product Team table; a Vercel CLI optional bullet exists in Requirements
- [ ] `git diff plugins/solopreneur/.claude-plugin/plugin.json` is empty (NO version bump — bumping is a `/release` action per CLAUDE.md)
- [ ] No files outside the repo were modified or deleted (the `~/Agents/skills/hana/preview/` source copy is left intact; its removal is handled separately by the main session post-merge)

## Notes

- This is a docs/skill-content + bash change, not application code; there is
  no unit test suite — verification is the grep/`bash -n` checks above plus a
  careful read of the rewritten SKILL.md for internal consistency.
- Do **not** bump `plugins/solopreneur/.claude-plugin/plugin.json`. Per
  `CLAUDE.md`, version bumps happen only through `/release`, never in a
  feature commit — even when adding a skill.
- Do **not** touch `.claude-plugin/marketplace.json` (the marketplace entry
  description is unchanged; adding a skill inside an existing plugin does not
  alter its marketplace metadata).
- The source skill lives OUTSIDE this repo at `~/Agents/skills/hana/preview/`.
  Reading/copying from it is expected and allowed; do not `cd` into it, do
  not modify it, do not delete it.
- Keep the long bilingual `description:` frontmatter of `SKILL.md` as-is
  (consistent with other solopreneur skills like `mvp`).
