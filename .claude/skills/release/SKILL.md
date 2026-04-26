---
name: release
description: |
  Bump versions and tag plugins for release in the solopreneur multi-plugin
  marketplace. Detects which sub-plugins changed since their last tag, asks
  the user for per-plugin patch/minor bumps, commits the bumps in a single
  commit, creates double-dash git tags, and pushes commit + tags atomically.
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

## Step 3: Apply bumps in one commit

For each plugin marked for bump, edit
`plugins/<name>/.claude-plugin/plugin.json`'s `version` field.

Stage all bumped plugin.json files together and commit:

```bash
git add plugins/*/.claude-plugin/plugin.json
git commit -m "$(cat <<EOF
chore(release): <one-line summary of what's shipping>

<plugin1> v<old>→v<new>: <reason>
<plugin2> v<old>→v<new>: <reason>
...
EOF
)"
```

Commit subject convention: `chore(release): <summary>`. The body lists each
plugin's bump and one-line reason. Useful when the same release ships
multiple plugin bumps.

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

2. Compose release notes interactively. Cover:
   - Headline (one sentence)
   - What plugins shipped at what versions
   - Breaking changes (if any) with link to MIGRATION.md
   - New / changed behavior worth knowing

3. Create:

   ```bash
   gh release create "solopreneur--v<new>" \
     --title "v<new>: <theme>" \
     --notes-file <(cat <<'EOF'
   <interactive notes here>
   EOF
   )
   ```

   Or use `--generate-notes` if the user prefers auto-built changelog from
   commit messages.

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
  LICENSE, this `.claude/skills/` directory): no plugin bump needed.
- **Pre-1.0 semver**: minor bumps may be breaking. 1.0.0 is reserved for the
  first stable API cut.
- **Worktree caveat**: If the user is releasing from a worktree on main, the
  push will go through fine. Just make sure `git pull --ff-only` succeeds
  before bumping.
- **Don't `--no-verify`**: this repo doesn't have pre-commit hooks today, but
  if any are added later, never bypass them in a release.
