# feat(preview): config v2 schema + path-based resolver

## Requirements

Implement the v2 configuration foundation for the preview Library architecture:
the machine-verifiable JSON Schema plus the path-based resolver that every later
script (builder, deploy-library, deploy-share) will read from.

**Scope discipline — this PR is schema + resolver + tests + docs ONLY.** The
migrator (`config-migrate.mjs`) and `setup.mjs` are separate follow-up PRs and
MUST NOT be implemented here. This PR is deliberately network-free: no Vercel
API calls, no deployment logic.

### Resolver contract (`config-resolve.mjs`)

Resolution order, first hit wins:

1. `$SOLOPRENEUR_CONFIG` — explicit path
2. Nearest ancestor `.solopreneur.json` **that contains a `preview` block**, walking up from the anchor
3. `~/.config/solopreneur/config.json`
4. Legacy `${CLAUDE_CONFIG_DIR}/solopreneur.json`
5. Legacy `~/.claude/solopreneur.json`

Anchor rules:

- Anchor is `--from <path>` when given, otherwise `process.cwd()`.
- Resolve the anchor to its **physical path (realpath) before walking up**. This
  workspace is a large symlink tree; a logical path and its physical path must
  never resolve to different configs.
- Walk-up does **not** stop at a git toplevel, and deliberately crosses nested
  repo boundaries. The stop point is the filesystem root.
- A `.solopreneur.json` that has no `preview` block is skipped and the walk
  continues upward — that file may configure other features.

Path rules:

- A relative `root` resolves against **the directory of the config file that
  declared it** — never the git root, never the current working directory.
- An absolute `root` is honored as-is.
- Do **not** expand a leading `~` inside JSON values.
- The nearest `preview` block **wholly replaces** any ancestor's. No deep merge.

Failure rules — every one must fail loudly and must never silently fall through
to an ancestor config:

- Malformed JSON, or a config that fails schema validation → exit non-zero, with
  stderr naming the offending file path and the specific validation problem.
- More than one entry under `targets` → explicit error (v1 supports one target).
- Any `provider` other than `"vercel"` → explicit error.
- A `--from` path that is not under the resolved `root` → error naming both the
  nearest config and its resolved root.

Output, via `--json`, is a structured object so every agent sees the same
decision:

- Keys: `configPath` (absolute, or null), `mode` (`"v2" | "legacy" | "none"`),
  `root` (absolute), `defaultTarget`, `target`
  (`{name, provider, project, visibility, include}`), `collections`.
- A missing `visibility` resolves to `"private"`.
- Without `--json`, print the same facts in human-readable form, one per line.

Legacy mode (layers 4–5): do **not** synthesize a v2 config from a legacy file.
Report `mode: "legacy"` along with the legacy config path and the preview-related
values found, so the existing `deploy.sh` flow keeps working untouched. Both
legacy shapes must be recognized: the `default.preview.projects.*` shape and the
older flat `preview.paths.<repo-key>` shape.

### Schema (`config.schema.json`)

- A Draft 2020-12 JSON Schema validating **only** `.solopreneur.json` (the v2
  file). It must not attempt to describe the legacy `solopreneur.json` feature
  configs — those are a separate file and a separate schema regime.
- Describes: `schemaVersion` (const `2`), `preview.root`, `preview.defaultTarget`,
  `preview.collections` (v1: `active` and `archive`, each `{path, label}`),
  `preview.targets` (a map; each entry
  `{provider: "vercel", project, visibility?: "private"|"public", include: string[]}`).
- Keep structural room for later growth (`targets` stays a map, `provider` stays
  a field). The **single-target v1 limit is enforced in the resolver**, not by
  narrowing the schema — that is deliberate, so the file format does not have to
  change when multi-target arrives.

### Constraints

- Node.js built-ins only. No new dependencies, no `package.json` changes.
- Declare the minimum Node version in a header comment of each `.mjs`.
- This is an open-source repo: all code comments and documentation in **English**.
- Do not modify `deploy.sh`, `preflight.sh`, `SKILL.md`, or `comment-overlay.js`.
- Do not create `setup.mjs`, `config-migrate.mjs`, `build-library.mjs`,
  `deploy-library.mjs`, or `deploy-share.mjs`.
- Do not bump any `plugin.json` version — releases are handled separately by the
  `/release` skill (see repo `CLAUDE.md`).

## Acceptance Criteria

- [x] Test command passes: `cd plugins/solopreneur/skills/preview && node --test` exits 0
      (the spec originally said `node --test tests/`; see "Corrections" below —
      a bare directory argument cannot work on Node >= 22.6)
- [x] Tests cover each of these as a distinct case: explicit `$SOLOPRENEUR_CONFIG`;
      nearest ancestor wins over a farther ancestor; a `.solopreneur.json` with no
      `preview` block is skipped during walk-up; a relative `root` resolves against
      the config file's directory and **not** cwd (assert by running with cwd set
      somewhere else); an absolute `root`; a symlinked anchor resolves to the same
      config as its physical path; walk-up crosses a nested `.git` boundary;
      malformed JSON exits non-zero with the offending path on stderr; two
      `targets` entries exit non-zero; a non-`vercel` provider exits non-zero; a
      `--from` outside the root exits non-zero and names the root; a missing
      `visibility` resolves to `"private"`; legacy fallback reports
      `mode: "legacy"` for both the `default.preview.projects.*` and the flat
      `preview.paths.*` shapes
- [x] Structured output contains every documented key
- [x] Public plugin carries no Hana-specific defaults:
      `grep -rniE 'hana|~/Agents|mojo-apps' plugins/solopreneur/shared/config.schema.json plugins/solopreneur/skills/preview/scripts/config-resolve.mjs` returns no matches (exit 1)
- [x] A test asserts the schema validates a minimal generic config (single
      `private` target, both collections) and rejects a config missing
      `preview.root`
- [x] `git diff --stat` shows no modification to `deploy.sh`, `preflight.sh`,
      `SKILL.md`, `comment-overlay.js`, or any `plugin.json`

## Notes

- Phase 0 of this architecture is complete and Gates A–D all passed on
  2026-07-24, which is why Phase 1 can start.
- `PREVIEW_PROJECT` remains the highest-priority override for the **legacy
  per-page flow only**. This PR must not change that behavior — just do not
  break it.
- The v2 `.solopreneur.json` is a **separate file** from the legacy
  `solopreneur.json`. They coexist during migration. Do not merge, rewrite, or
  read-modify-write the legacy file anywhere in this PR.

## Corrections to this spec

Two things in the spec as written turned out to be wrong. Recorded here so the
follow-up PRs inherit the corrected version.

**`node --test tests/` cannot pass on a current Node.** Since Node 22.6 the
positional arguments to `--test` are glob patterns, not paths, so a bare
directory matches the directory itself and Node then tries to execute it as a
test file — verified failing on Node 26 with
`Error: Cannot find module '.../tests'`, zero tests run. The portable
invocations are `node --test` (default discovery from the skill directory) or
`node --test tests/*.test.mjs` (shell-expanded, so it is a real file path on
Node 20 and a matching glob on Node 26). Both verified passing.

**`plugins/designer/skills/impeccable/scripts/` is not in-repo precedent.**
Those `.mjs` files are vendored — `plugins/designer/vendor/manifest.json` pins
them to an upstream commit and `.github/workflows/validate-vendored.yml` fails
the build on hand-edit drift. They are upstream's house style, not this repo's,
and must not be edited. The real precedent for this PR is
`skills/preview/scripts/deploy.sh`: its header block shape (`Usage:` /
`Output:` / numbered resolution order), its `<script-name>: message` on stderr
with exit 1, and its fail-closed error text that names the exact config keys to
set (`deploy.sh:150-155`). Also note there is no repo-authored `.mjs` anywhere
and no CI workflow installs Node, so the test suite is currently a local gate
only — wiring it into CI is deliberately left out of this PR's file scope.

## Review outcomes

Five internal reviewers ran against the first implementation. The findings that
changed the code are folded into the sections below; these are the ones that
were **declined**, recorded so they are not re-litigated in PR2+:

- **Emit the `targets` map instead of a flattened `target`.** The output shape
  is specified by this document and asserted by the acceptance criteria. The
  "structural room" rule is about the **file format** — `targets` does stay a
  map in the schema. The resolver's output is a script-side shape versioned
  with the scripts, so it can grow when multi-target actually lands.
- **Close `provider` to an `enum: ["vercel"]` in the schema.** Directly against
  the spec's "the single-target v1 limit is enforced in the resolver, not by
  narrowing the schema".
- **Use `node:util` `parseArgs`.** It only became stable in Node 20.16, and this
  file declares a floor of 20, where it prints an `ExperimentalWarning` onto the
  stderr this CLI reserves for errors. The one concrete gap it would have closed
  — `--from=value` — was implemented directly instead.
- **Compare `dev`+`ino` for containment instead of paths.** Raised for
  case-insensitive filesystems, where a wrong-case `--from` is rejected. It
  fails *closed* with an error naming the root, and no reviewer could construct
  a false accept. `path.relative` was adopted instead, which also fixes
  containment when `root` is `/`.
- **Guard `toLines` against deep recursion.** A ~2000-level-deep legacy config
  is not a real scenario and the failure is already loud.
- **Convert the tests to in-process calls for speed.** Subprocess isolation is a
  deliberate choice (below); 1.8s is not a problem worth trading it for.
- **Factor the test fixtures into a shared builder.** Each test's explicit
  setup is its documentation; the duplication is the readable kind.

## Implementation decisions

Decisions taken while implementing, recorded because later PRs depend on them.

**Schema validation without a dependency.** Node ships no JSON Schema validator
and the repo has no `package.json`, so `config-resolve.mjs` carries a ~60-line
validator that *interprets `config.schema.json` itself* rather than hand-coding
the same rules twice. It implements only the keywords the schema uses
(`$ref`, `type`, `const`, `enum`, `required`, `properties`,
`additionalProperties`, `items`, `minItems`, `minLength`, plus boolean schemas).
Keeping the schema file as the single source of truth is what makes the
acceptance criterion "the schema validates …" literally true. If the schema ever
needs keywords outside that subset, swap the function for `ajv` at that point.

The interpreter **fails closed on the schema itself**, in a whole-schema audit
that runs once at load time. It rejects an unrecognized keyword, a `type` value
it does not implement, a keyword whose value has the wrong shape, a `$ref` that
is not a resolvable local `#/$defs/` pointer, and a `$ref` carrying sibling
keywords (Draft 2020-12 applies those; this interpreter resolves and returns, so
a sibling would be silently dropped). Without this, adding `oneOf` or
`"type": "integer"` to the schema later would silently validate *less* than the
schema claims — the one failure mode a hand-coded validator does not have.

The audit has to be a **load-time sweep, not a check inside `validate`**: a
per-node check only ever sees the subschemas a particular config reaches, so an
unsupported keyword on an optional field would sit unnoticed until some config
happened to set that field. Verified by injecting `"type": "integer"` on a field
the probe config does not even set — it still fails immediately.

**Absence is `undefined`, never `null`.** `readJsonIfPresent` returns
`undefined` for a missing file, because `JSON.parse("null")` returns `null` and
a config file whose entire content is `null` must be **rejected**, not mistaken
for a missing file. A `.solopreneur.json` that parses to a non-object is broken,
not "a config for another feature", so it stops the walk rather than being
stepped over.

**Presence is classified by `stat`, but readability is proven by reading.**
`stat` decides missing-vs-present and rejects anything that is not a regular
file (a FIFO or a symlink to a device would otherwise block the process
forever). It is never used to decide a file is *readable* — `stat` succeeds on
files the process cannot open, so the read itself is what proves that, and its
failure is fatal rather than a silent skip.

**No `additionalProperties: false` anywhere in the schema.** Phase 1 of the
architecture plan has `setup.mjs` writing `projectId` and `teamId` into each
target (target identity contract, finding F9). A closed schema would reject
those the day they land. Unknown keys are therefore allowed; the required-key
and type checks carry the validation weight, and the fields whose absence is
silent (`visibility`) fail closed to `private`.

**`collections` is required, with both `active` and `archive`.** v1 fixes the
collection set, `include` entries are meaningless without declared collections,
and the documented minimal config already carries both. The schema stays open
for a third collection later.

**Tests spawn the CLI with a from-scratch environment.** Each case runs the real
script through `spawnSync` with an env built from nothing but `PATH`, a `HOME`
pointing at an empty fixture, and whatever the case needs — never a spread of
`process.env`. That is what keeps the developer's own `SOLOPRENEUR_CONFIG`,
`CLAUDE_CONFIG_DIR` or `HOME` from deciding an outcome, and it is why layer 3
needed no `XDG_CONFIG_HOME` escape hatch: overriding `HOME` already relocates
`~/.config`. Failures assert exit code `1` exactly with an empty stdout, not
merely "non-zero" — a crash or a signal death also satisfies "non-zero".

**A non-existent `--from` is an error.** The anchor is realpath'd before walk-up,
and the anchor is by contract a content source path (or cwd) — both exist. A
typo'd path is reported rather than silently resolved against a parent.

**`root` is realpath'd when it exists.** The anchor is physical after realpath,
so the root must be physical too or the containment check would produce false
negatives whenever the root or one of its parents is a symlink. When the root
does not exist yet (a fresh setup), the lexically resolved absolute path is used.

**Containment is checked only when `--from` was given.** That is what the spec
states, and it is also the only workable behavior: enforcing it on the cwd anchor
would make `--json` inspection fail from anywhere outside the preview root.

**Malformed JSON is fatal at every layer, including the legacy ones.** The rule
"never silently fall through" does not become safe just because the offending
file is a legacy one. `deploy.sh` keeps its own tolerant `jq` reader and is not
touched by this PR.

**Legacy mode reports raw subtrees, never a synthesized v2 config.** The
`legacy` key carries whatever preview-related values were found — `default`
(the `default.preview.*` shape), `preview` (the older flat `preview.paths.*`
shape) and `repos` (per-repo `preview` subtrees). A legacy file carrying no
preview-related values at all is not treated as a preview config; the walk
continues to the next layer.
