---
name: release
description: |
  Bump versions and tag plugins for release in the solopreneur multi-plugin
  marketplace. Detects which sub-plugins changed since their last tag, checks
  whether the root README is stale relative to those changes (offering one
  proposal at a time), asks the user for per-plugin patch/minor bumps,
  composes an outward `CHANGELOG.md` entry from the per-plugin diff (every
  release, user-reviewed), commits the bumps + changelog in a single commit,
  creates double-dash git tags, and pushes commit + tags atomically.
  Optionally creates one GitHub Release on `solopreneur--v<new>` for
  user-visible milestones (skip for routine bumps).

  Use when the user says "release", "ship release", "/release", "tag and
  release", or wants to publish bumped plugins after merging changes to main.
---

# Release

Manual release flow for the solopreneur multi-plugin marketplace.
Implements the release rule documented in `CLAUDE.md` at the repo root.

This skill is **interactive**. Confirm each decision with the user. Do not
autopilot version bumps or release publishing.

## Pre-flight

1. Confirm cwd is the repo root or a worktree of it. Run from the directory
   containing `.claude-plugin/marketplace.json` and `plugins/`.

2. Confirm working tree is clean:

   ```bash
   git status --porcelain
   ```

   If unclean, stop and ask the user to commit or stash first. Don't release
   on top of uncommitted work. The new commit's content depends on the
   working tree.

3. Confirm we're on `main` (the typical release path is "merge → release"):

   ```bash
   git branch --show-current
   ```

   If not on main, ask the user to confirm the branch is intentional.

4. Pull latest:

   ```bash
   git fetch origin && git pull --ff-only
   ```

   If `--ff-only` fails (local has commits), stop and ask the user.

## Step 1: Detect per-plugin changes since last tag

For each sub-plugin, find its last `<plugin>--v*` tag and compare against HEAD.
Plugin directory names match marketplace names 1:1.

```bash
PLUGINS=(solopreneur designer marketer ios-dev android-dev ai-engineer neo4j-dev)
for p in "${PLUGINS[@]}"; do
  LAST_TAG=$(git tag -l "${p}--v*" --sort=-v:refname | head -1)
  # Transitional fallback: the v0.5.x → v0.5.3 rename dropped the `solo-`
  # prefix from sub-plugins. The first /release run after that rename has
  # no `<bare>--v*` tag yet, so look for the legacy `solo-<bare>--v*` tag
  # to avoid a misleading "NO TAG YET" message. Once the new tag exists,
  # this fallback never fires again.
  if [ -z "$LAST_TAG" ] && [ "$p" != "solopreneur" ]; then
    LAST_TAG=$(git tag -l "solo-${p}--v*" --sort=-v:refname | head -1)
  fi
  if [ -z "$LAST_TAG" ]; then
    echo "=== $p: NO TAG YET (first release) ==="
    git log --oneline -- "plugins/$p/"
    continue
  fi
  CHANGED=$(git diff --name-only "$LAST_TAG"..HEAD -- "plugins/$p/" | wc -l | tr -d ' ')
  if [ "$CHANGED" -gt 0 ]; then
    echo "=== $p: $CHANGED files changed since $LAST_TAG ==="
    git log --oneline "$LAST_TAG"..HEAD -- "plugins/$p/"
  else
    echo "=== $p: no changes since $LAST_TAG ==="
  fi
done
```

Also check whether `marketplace.json` changed in a way that affects a plugin
entry (per the rule in CLAUDE.md):

```bash
git diff "$LAST_RELEASE_BASELINE"..HEAD -- .claude-plugin/marketplace.json
```

Use the most recent tag of any plugin as `$LAST_RELEASE_BASELINE`. If the
diff touches a plugin entry's `name` / `source` / `description` / `license`,
flag those plugins for a bump even if their `plugins/<name>/` directory
didn't change.

## Step 1.5: README sync check

Before asking for version bumps, look at whether the changes since
`$LAST_RELEASE_BASELINE` make the root `README.md` stale. Skip this step
entirely if the diff only touches internals (no surface changes).

### What might make README stale

Apply judgment — these are signals, not rules:

- A plugin's `description` in `marketplace.json` or `plugins/<p>/.claude-plugin/plugin.json`
  changed, and the README's row / paragraph for that plugin still quotes the
  old text
- A new plugin directory was added under `plugins/`, and the README's plugin
  table doesn't include it
- A new in-house skill landed in a plugin, and the README's "Bundled skills"
  section for that plugin enumerates skills explicitly (so an addition is
  user-visible)
- A new agent was added under `plugins/<p>/agents/`, and the README mentions
  agents per plugin
- Counts mentioned in the README (e.g. "23 vendored skills") drifted

Examples of cases that don't need a README change:

- Bug fix or refactor inside a skill with no description change
- Vendored skill re-sync with no upstream content drift
- New skill landed but README only says "ships N+ vendored skills" without
  enumerating, and N is still an accurate floor

### Workflow

1. Pull the changed-files list scoped to surface signals:
   ```bash
   git diff --name-only "$LAST_RELEASE_BASELINE"..HEAD | grep -E \
     '(\.claude-plugin/(plugin|marketplace)\.json|/skills/[^/]+/SKILL\.md|/agents/.*\.md|^README\.md)$'
   ```

2. Read `README.md` plus each changed surface file. Compare. For each
   plugin whose surface changed, decide: does the README still describe
   this plugin accurately?

3. For every potential README change, ask the user as a single question:
   > "README line N currently says: `<current>`.
   >  Based on the diff, suggest: `<proposed>`.
   >  (a) apply  (b) skip  (c) let me edit"

4. Apply accepted changes inline via `Edit`. For "let me edit", read the
   user's replacement text and apply that instead.

5. If any README updates were applied, commit them as a separate commit
   BEFORE the version-bump commit (so the README change has its own
   reviewable history):
   ```bash
   git add README.md
   git commit -m "docs: sync README with plugin changes for upcoming release"
   ```
   The Step 5 `git push --follow-tags` will publish this commit together
   with the bump commit and tags.

6. If nothing needs updating, proceed straight to Step 2.

## Step 2: Decide per-plugin bump

Present the change list to the user, one plugin at a time, with the commit
log scoped to that plugin. For each plugin with changes, ask:

- `patch` (e.g. 0.3.0 → 0.3.1): bug fix / docs / refactor
- `minor` (e.g. 0.3.0 → 0.4.0): new skill, agent, user-visible behavior;
  pre-1.0 minor may be breaking
- `skip`: don't release this plugin yet
- `abort`: stop the whole release

Use the table in `CLAUDE.md` § "Release rule" as the source of truth.

Default suggestions from the LLM are useful. Propose the bump you'd pick
based on the commit messages, then confirm with the user.

## Step 2.5: Compose CHANGELOG

Every release — not just milestones — gets a public-facing, plain-language
note in the repo-root `CHANGELOG.md`. You author it from the actual
per-plugin diff, distilled into outward, user-readable content. This is
**not** a restatement of the Step 2 bump reasons and **not** a raw git
log. The user is the reviewer/approver, not the typist.

> **Cost is intentional.** This makes `/release` heavier — you must read
> and comprehend each bumped plugin's diff every release. Accepted on
> purpose: a public changelog deserves human-grade narrative, not
> boilerplate. Do not shortcut it back into reason-restatement.

**Format** — Keep a Changelog style. If `CHANGELOG.md` is absent, create
it with a one-time header note: "Versions before `<this release's
earliest-touched version>` predate this changelog — see git tags / GitHub
Releases." Prepend each release as a dated section with a per-plugin
subsection for **only** the plugins bumped this cycle:

```
## <YYYY-MM-DD>

### <plugin> <old> → <new>
<plain outward description — what this means for someone who installs
this plugin>
(#<PR>, #<PR>) — thanks @<external-contributor>!
```

**Compose** — for each bumped plugin:

1. `git diff "<plugin>--v<old>".."HEAD" -- "plugins/<plugin>/"`
   (per-plugin scope; baseline = that plugin's previous tag, the same
   `LAST_TAG` resolved in Step 1).
2. Comprehend the diff and distill into plain outward text. Condense
   vendored re-sync churn (e.g. "re-synced N vendored skills from
   upstream") — never enumerate files. Describe real features in user
   language.
3. Attach the mechanical scaffold automatically: the date header, the
   `<old> → <new>` subsection heading, and PR-number links parsed from
   `(#NN)` in the merge commits across `<old>..HEAD`.
4. Resolve external contributors. For each PR number collected in
   step 3, look up its author:

   ```bash
   gh pr view <NN> --json author --jq .author.login
   ```

   Drop the repo maintainer (`gh api user --jq .login`) and dedupe
   across the plugin's PRs. If any external contributors remain,
   append `— thanks @<handle>!` (or `— thanks @<h1>, @<h2>!`) to the
   line carrying the PR references. No externals → omit the thanks
   line entirely; never render an empty "thanks " tail.

**Review gate** — present the full drafted section to the user:

> "CHANGELOG draft for this release:
>  <draft>
>  (a) apply  (b) I edit a section  (c) rewrite a plugin's section"

Apply accepted text. For (b)/(c), take the user's replacement and re-present
until they pick (a). Do **not** stage or commit yet — `CHANGELOG.md` is
committed together with the bumps in Step 3.

## Step 3: Apply bumps in one commit

For each plugin marked for bump, edit
`plugins/<name>/.claude-plugin/plugin.json`'s `version` field.

Stage all bumped plugin.json files **together with the `CHANGELOG.md`
update from Step 2.5** and commit them in one commit, so the Step 4 tags
point at a commit that already contains the changelog (zero gap).

Use the **subject + body two-`-m` form** below — NOT a
`-m "$(cat <<EOF ...)"` heredoc. The product-repo worktree guard hook
sanctions a release commit on `main` only when `chore(release):` appears
immediately after the `-m` quote; a heredoc / command-substitution between
`-m` and the message hides the prefix and the commit gets blocked. With the
direct form the subject matches, and `CHANGELOG.md` (markdown) plus the
`plugin.json` bumps land in one commit on `main`:

```bash
git add plugins/*/.claude-plugin/plugin.json CHANGELOG.md
git commit \
  -m "chore(release): <one-line summary of what's shipping>" \
  -m "<plugin1> v<old>→v<new>: <reason>
<plugin2> v<old>→v<new>: <reason>
..."
```

Commit subject convention: `chore(release): <summary>`. The body lists each
plugin's bump and one-line reason. Useful when the same release ships
multiple plugin bumps. `CHANGELOG.md` rides in this same commit — it is
never a separate commit and never lands after the tags.

## Step 4: Create tags

For each bumped plugin, create an annotated tag pointing at the bump commit:

```bash
for p in "${BUMPED[@]}"; do
  VERSION=$(jq -r .version "plugins/$p/.claude-plugin/plugin.json")
  git tag -a "${p}--v${VERSION}" -m "${p} v${VERSION}: <one-line>"
done
```

Use the same one-line summary the user provided in Step 2 for each plugin.
The double-dash format is mandatory. Claude Code's dependency resolver
parses it.

## Step 5: Push atomically

```bash
git push --follow-tags
```

`--follow-tags` only pushes annotated tags reachable from the pushed commit,
exactly what we want here. If push splits or rejects:

- Rejected (non-fast-forward): something landed on origin/main between
  pre-flight and now. Stop, ask user to investigate. Do not force-push.
- Tag push failed but commit pushed: retry tags only with
  `git push origin <tag1> <tag2> ...`. Do not let the gap persist.
  Installs in the gap will hit `no-matching-tag`.

## Step 6: GitHub Release (optional, milestones only)

Ask the user: **"Is this a milestone worth a GitHub Release?"**

Reference for "milestone" (matches superpowers' tag:release ≈ 6:1 cadence):

- New sub-plugin shipped (e.g. a `rust` plugin joins the family)
- Breaking change users need to know about
- New skill family or major feature
- Coordinated multi-plugin release with a coherent theme

For routine patch bumps or single-skill additions, **skip the Release**.
Tags alone are enough; Claude Code only needs tags for resolution.

If the user says yes:

1. The Release attaches to **one** tag. Use `solopreneur--v<new>` as the
   umbrella, even if core didn't change much. (Repo's "Latest release"
   surface should look like a single coherent version, not six per drop.)

   If `solopreneur` core wasn't bumped this cycle, attach to whichever
   plugin's tag best represents the milestone, but warn the user that the
   umbrella tag is typically core.

2. **Do not re-author notes.** The outward note was already written and
   user-reviewed in Step 2.5 and lives in `CHANGELOG.md`. The Release
   reuses that release's CHANGELOG section verbatim plus a link back to
   the full file — no second hand-authoring, no `--generate-notes`. If
   the milestone needs extra framing (breaking-change callout, MIGRATION
   link), prepend a short headline above the copied section; do not
   rewrite the per-plugin bodies.

3. Extract this release's section from `CHANGELOG.md` (the top dated
   `## <YYYY-MM-DD>` block) and create the Release with it:

   ```bash
   gh release create "solopreneur--v<new>" \
     --title "v<new>" \
     --notes-file <(cat <<'EOF'
   <this release's CHANGELOG.md section, verbatim>

   ---
   Full changelog: <repo URL>/blob/main/CHANGELOG.md
   EOF
   )
   ```

## Final report

```
Released: <list of <plugin>@<version> shipped>
Tags pushed: <list>
GitHub Release: <URL or "skipped">
Commit: <SHA>
```

## Notes

- **Per-plugin independence**: only bump plugins whose files actually changed
  (or whose marketplace entry changed). Don't bump everyone every release.
- **Docs-only changes at repo root** (README.md, MIGRATION.md, CLAUDE.md,
  LICENSE, CHANGELOG.md, this `.claude/skills/` directory): no plugin bump
  needed. `CHANGELOG.md` is a release output, not plugin content — it
  rides in the bump commit but never itself triggers a bump.
- **CHANGELOG cost is deliberate.** Step 2.5 makes every release heavier:
  you read and comprehend each bumped plugin's diff to write an outward,
  plain-language note. This is an accepted tradeoff — a public changelog
  is worth human-grade narrative. Do not regress it into restating the
  Step 2 bump reasons or dumping the git log.
- **Pre-1.0 semver**: minor bumps may be breaking. 1.0.0 is reserved for the
  first stable API cut.
- **Worktree caveat**: If the user is releasing from a worktree on main, the
  push will go through fine. Just make sure `git pull --ff-only` succeeds
  before bumping.
- **Don't `--no-verify`**: this repo doesn't have pre-commit hooks today, but
  if any are added later, never bypass them in a release.
