# Symmetric Plugin Source and Package Layout

**Status:** Approved
**Date:** 2026-08-12
**Scope:** all seven plugins and both Claude Code and Codex publication views

## Purpose

Skills must be easy to browse individually without making an install package
the source of truth. Claude Code and Codex also need visibly symmetric package
roots, while Codex must continue excluding skills that have not passed its
compatibility registry.

## Canonical ownership

The repository has two hand-maintained roots:

- `skills/<plugin>/<skill>/` owns every skill body and bundled skill resource.
- `src/<plugin>/` owns the canonical plugin manifest and every non-skill
  component, including agents, shared helpers, maintainer scripts, and vendor
  metadata.

`src/<plugin>/plugin.json` is the only version and manifest source. A skill or
non-skill component must not have a second hand-maintained copy under a package
directory.

## Generated packages

One generator owns all committed installation outputs:

- `plugins/claude/<plugin>/` contains the canonical manifest at the Claude
  manifest path, every skill for that plugin, and all non-skill components.
- `plugins/codex/<plugin>/` contains a Codex manifest, only skills explicitly
  included by `skills-compatibility.json`, declared platform resources, and
  published agent adapters needed by the bootstrap flow.
- `.agents/plugins/marketplace.json` contains only plugins with at least one
  Codex-included skill.
- `.codex/agents/` contains project-local copies of validated Codex agent
  adapters.

Generated files are committed because both plugin installers consume a
repository snapshot and do not run a build step. They are never edited by
hand. Generation validates all canonical inputs before deleting or replacing
an output tree.

## Compatibility bridge

The source migration and the marketplace cutover cannot be published as an
untagged path change. Until the first release after this layout lands, the
Claude marketplace keeps its existing `plugins/<plugin>/` sources and the
Codex marketplace keeps `.codex/plugins/<plugin>/`. The generator produces
those paths as byte-identical compatibility copies of the new package roots.

The first release after the migration is one atomic cutover:

- every Claude marketplace source moves to `plugins/claude/<plugin>/`;
- the generated Codex marketplace moves included plugins to
  `plugins/codex/<plugin>/`;
- all seven plugins receive at least a patch bump;
- the compatibility copies are removed;
- the release commit, changelog, annotated tags, and package bytes are pushed
  together.

A marketplace containing a mix of old and new Claude paths is invalid. The
generator refuses it rather than guessing which compatibility copies to keep.

## Vendored skills

Vendor manifests and licenses live under `src/<plugin>/vendor/`. The shared
sync script resolves the plugin name from its canonical `src/` path and writes
skill bodies only to `skills/<plugin>/`. An automated vendor update regenerates
the install packages before opening its pull request.

## Validation

Required gates are:

1. Every first-level skill directory has a `SKILL.md` and is classified in the
   compatibility registry.
2. Every Claude package skill tree is byte-identical to its canonical
   `skills/<plugin>/` tree.
3. Every Codex package contains exactly the registry-included skill IDs and
   only declared cross-layout resources.
4. During the bridge period, both legacy package trees are byte-identical to
   their symmetric counterparts.
5. Regeneration leaves the committed generated paths clean.
6. A fresh Claude configuration installs all seven plugins from the local
   marketplace.
7. A fresh Codex home installs every entry in the filtered Codex marketplace.
8. Existing custom-agent, bootstrap, shared-config, skill, and vendoring test
   suites continue to pass from their canonical roots.

## Release ownership

Per-plugin change detection considers only `skills/<plugin>/`,
`src/<plugin>/`, and user-visible marketplace entry changes. Generated package
diffs never independently trigger a version bump because they are derivations
of those inputs. Root documentation and generator-only maintenance follow the
existing release policy.
