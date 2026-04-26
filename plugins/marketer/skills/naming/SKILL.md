---
name: naming
description: |
  Generate a product or company name through structured brief, multi-model
  candidate generation, and two-layer evaluation. Supports greenfield (new
  name) and rebrand (rename existing) modes. Grounded in Lexicon /
  Interbrand / Siegel+Gale methodology plus processing fluency, sound
  symbolism, and iconicity research. Auto-reuses `docs/gtm/` if present.
  Use when: "naming", "取名", "命名", "品牌名", "產品名字", "公司名字",
  "rebrand", "改名", "幫產品命名", "幫公司取名".
---

# Naming Skill

A structured workflow for naming one product, one company, or one brand
where product and company share the same name. Uses multi-model ensemble
(Claude + optional Codex / Gemini) to generate diverse candidates, filters
through a two-layer rubric (Gate + Score), tests with real humans, and
produces a finalist.

## Scope

- **One entity per run.** Name one product, one company, or one brand where
  product and company share the same name (treated as a single entity).
- **Separate entities → run twice.** If product and company need different
  names, run the skill once for each. Do not merge briefs.
- **Language:** English-first. Non-English markets handled only as gate
  check, not name generation.
- **Out of scope:** multi-product portfolio governance (brand architecture,
  nomenclature systems). See `references/out-of-scope.md`.

## Output

5 Markdown files in `{repo}/docs/naming/` plus a state file and test kit:

```text
docs/naming/
├── naming-state.yaml        # Session state (internal)
├── 01-brief.md               # Benefit ladder, personality, constraints
├── 02-namescape.md           # Competitive naming map + no-go zones
├── 03-candidates.md          # All candidates grouped by taxonomy + source model
├── 04-evaluation.md          # Gate survivors + score rubric
├── test-kit.md               # Phase 5 tension test materials (printable)
├── 05-decision.md            # Final choice, rationale, limitations, announcement
└── .raw/                     # Raw model outputs + briefs (per-session, timestamped)
```

**Document schemas** — see `references/templates.md` for the full markdown
template of each output file. Every phase output must match the template
so outputs are consistent across sessions and can be audited or diffed.

---

## Taxonomy Reference (11 Types)

Full definitions and examples: `references/taxonomy.md`. Phases 2 and 3
both depend on this list:

1. Descriptive · 2. Suggestive / Evocative · 3. Invented / Coined ·
4. Metaphorical · 5. Real word out of context · 6. Compound ·
7. Portmanteau · 8. Greek / Latin root · 9. Founder · 10. Acronym ·
11. Misspelled / Truncated.

Phase 2 uses it to classify competitors. Phase 3 uses it as the generation
palette. Always load `references/taxonomy.md` before either phase runs.

---

## First-Run Flow (Mode Ordering)

The state file can only be created after the user tells us whether this
is a greenfield or a rebrand. Order of operations on first run:

1. Ask the **Starting Context** question (A/B/C) below.
2. Ask the **Entity Scope** question (product / company / both-same-name)
   below.
3. Derive `mode` from the Starting Context answer: A or B → `greenfield`,
   C → `rebrand`.
4. Create `docs/naming/naming-state.yaml` with:
   - `mode:` derived from step 3
   - `entity_scope:` from step 2 answer
   - `overall_status:` matching the mode (`brief` for greenfield,
     `rebrand_audit` for rebrand)
   Do not hard-code any of these before the user answers.
5. Check for `docs/gtm/gtm-state.yaml` (see GTM Integration).
6. If rebrand, run Phase 0; otherwise start at Phase 1.

### Starting Context question

> What's your situation?
> - **A)** I have an idea but no code yet.
> - **B)** I have code (or a working product) but no name — or just a placeholder.
> - **C)** I have code and a name, but I want to consider a rebrand.

- **A** → `mode: greenfield`, skip codebase scan, go to Phase 1.
- **B** → `mode: greenfield`, light codebase scan (README, package.json,
  top-level dirs) to pre-fill product description, then Phase 1.
- **C** → `mode: rebrand`, run Phase 0 first.

### Entity Scope question

> What are you naming?
> - **product** — one specific product. Company already has a name.
> - **company** — the company / parent brand. Products stay separate.
> - **both_same_name** — company and flagship product share a single
>   name (e.g., Notion, Linear, Figma). Treated as one naming exercise.

Record the answer in `entity_scope`. This shapes Phase 1 brief framing
(company-level mission/vision vs product-level feature focus) and Phase 6
Final Selection deliverables.

## Modes

| Mode | Trigger |
|------|---------|
| **Greenfield** | First run, user answered A or B |
| **Rebrand** | First run, user answered C |
| **Resume** | State file exists with `overall_status` not `complete` / `ended_no_change` |

---

## State Management

After the Starting Context answer, create `docs/naming/naming-state.yaml`:

```yaml
project: {repo name}
repo_path: {absolute path}
created: {YYYY-MM-DD}
last_updated: {YYYY-MM-DD}

mode: {greenfield|rebrand}     # derived from Starting Context
entity_scope: product          # product | company | both_same_name
starting_context: B            # A | B | C
has_gtm_docs: false

# Top-level enum — must be exactly one of:
# rebrand_audit | brief | namescape | generate | evaluate | tension_test |
# decision | complete | ended_no_change
#
# Initial value depends on mode:
# - greenfield → overall_status: brief
# - rebrand    → overall_status: rebrand_audit  (Phase 0 must run first)
overall_status: brief           # or rebrand_audit when mode: rebrand

# Available model ensemble for Phase 3 generation (filled after detection)
models_available:
  claude: true
  codex: false
  gemini: false
models_selected: [claude]      # user's choice from available models
candidates_per_model: 100      # user-tunable

phases:
  rebrand_audit:                # only in rebrand mode
    status: pending
    triggers_confirmed: []
    decision: null              # keep | change
  brief:
    status: pending
  namescape:
    status: pending
  generate:
    status: pending
    candidate_count: 0
    by_model: {}                # claude: 100, codex: 100, ...
  evaluate:
    status: pending
    gate_survivors: 0
    scored: 0
  tension_test:
    status: pending             # pending | kit_ready | awaiting_user_results | complete | skipped_low_sample
    tester_count: 0
  decision:
    status: pending

findings:
  benefit_ladder: {}            # feature / functional / emotional / ultimate
  ultimate_concept: ""          # 1-2 word creative springboard
  personality: {}
  constraints: {}
  competitors: []
  no_go_patterns: []
  winner: ""

disputes: []                    # any user disagreement; see Dispute Handling

# Fallback flags — any "unverified" entry bubbles up to 05-decision.md Limitations
unverified:
  trademark: []
  domain: []
  handles: []
  cross_cultural: []
```

**Naming note:** the top-level field is `overall_status`; per-phase status
fields (e.g. `phases.tension_test.status`) share the simpler name `status`
because they live under their phase namespace. Read/write consistently.

### Phase transition contract

`overall_status` MUST be advanced at each phase boundary. If a run pauses
between phases, `overall_status` is what Resume mode reads to pick up at
the right place. Leaving it stale corrupts Resume.

| Leaving phase | New `overall_status` |
|---------------|---------------------|
| Rebrand audit → keep | `ended_no_change` (terminal) |
| Rebrand audit → change | `brief` |
| Phase 1 Brief | `namescape` |
| Phase 2 Namescape | `generate` |
| Phase 3 Generate | `evaluate` |
| Phase 4 Evaluate | `tension_test` |
| Phase 5 Tension Test | `decision` |
| Phase 6 Decision | `complete` |

Each phase section below repeats its specific transition for in-context
reference. This table is the authoritative contract.

**At the start of every session:**
1. Read `naming-state.yaml`.
2. Summarize: "Last session ended at phase [X]. Today we continue with [Y]."
3. Ask user: continue, re-run a specific phase, or skip forward.

**After each meaningful exchange:**
1. Update `findings` and phase status.
2. Bump `last_updated`.
3. Write the relevant phase file using the template from `references/templates.md`.
4. **Save the state file. Do not auto-commit** — the user decides when to
   commit naming-state.yaml and phase outputs.

### Re-running a phase (invalidation rules)

When the user re-runs phase N, everything downstream is stale. Before
executing, the skill MUST:

1. Mark `phases.{N+1..}.status: pending` and zero their counters.
2. Archive downstream files with version suffix. Scan for the highest
   existing `.vN.md` for that phase file and archive to `.v(N+1).md`
   (e.g. if `03-candidates.v1.md` and `03-candidates.v2.md` exist,
   archive current to `03-candidates.v3.md`). Never silently overwrite.
3. Before archiving, **only if the repo is git-tracked**
   (`git rev-parse --is-inside-work-tree` succeeds), check `git status`
   for the file. If it has uncommitted changes, warn the user and ask
   whether to commit or discard before proceeding. **In non-git
   projects**, skip the git check and instead ask the user directly:
   "The current `0N-*.md` will be archived as `.v(N+1).md`. Any unsaved
   edits? Confirm proceed."
4. Clear `findings` keys owned by downstream phases.
5. Announce to user: "Re-running Phase N will invalidate [list]. Proceed?"

Dirty state at decision time is a failure mode — not a feature.

---

## GTM Skill Integration

After the state file is created, check for `{repo}/docs/gtm/gtm-state.yaml`.
**Do not trust file existence alone** — check the state file for
`status: complete`.

**If `gtm-state.yaml` exists AND `status: complete`:**
- Read all three relevant docs:
  - `01-brand-strategy.md` → Mission, Values, Personality, Positioning
  - `02-market-landscape.md` → ICP archetypes, competitors, JTBD
  - `03-messaging-framework.md` → Voice, tone, content pillars
- Announce: "I see a completed GTM. I'll reuse personality, audience,
  voice, and competitor list. If anything's changed since GTM was written,
  tell me now."
- **Skip Phase 1B (personality) and Phase 2 competitor discovery.**
  Phase 2 still runs taxonomy classification + no-go zone analysis on
  the reused competitor list — those are naming-specific and GTM does
  not produce them.
- Set `has_gtm_docs: true`.

**If `gtm-state.yaml` is missing, incomplete, or unreadable:**
- Run full Phase 1 Brief and Phase 2 Namescape from scratch.
- Do NOT partially use individual GTM files — they may be stale.

---

## Phase 0 (Rebrand only): Keep or Change Audit

Before any naming work, decide if renaming is actually the right move.
Default answer is **no** — brand equity is expensive to rebuild.

Present these 4 triggers. Ask the user which apply:

1. **Strategic drift** — product or market has pivoted; current name is now misleading.
2. **Legal risk** — trademark conflict, can't expand to new class or geography, active dispute.
3. **Systematic friction** — name is unspellable, mispronounced, confused with a competitor, hard to search, or embarrassing to say.
4. **Severe reputation damage** — name itself has become a liability (rename alone rarely fixes this).

**Decision rule:**
- **0 triggers:** Strongly recommend NOT renaming. Set
  `overall_status: ended_no_change`. Write summary to `01-brief.md`.
  Skill ends cleanly.
- **1 trigger (not Strategic drift):** Caution. Ask user to reconsider.
  If user insists on continuing, record in `disputes` and proceed.
- **Strategic drift, OR 2+ triggers:** Proceed to Phase 1. **Advance
  state: `overall_status: brief`.**

Record the triggers and decision in `phases.rebrand_audit`. On
`overall_status: ended_no_change`, `naming-state.yaml` is preserved so the
user can re-enter later by manually setting `overall_status: brief`.

---

## Phase 1: Brief (Discovery)

One question at a time. Skip overlapping questions if GTM docs are loaded.

### A. Benefit Ladder

Climb feature → functional → emotional → ultimate. This produces the
creative springboard — 1-2 words the entire generation phase pivots on.

1. **Feature:** What does the product actually do? (mechanics)
2. **Functional benefit:** What problem does that solve?
3. **Emotional benefit:** How does the user feel after using it?
4. **Ultimate benefit:** What bigger identity or aspiration does that connect to?

**Push once if the user stops at feature level:**
> "That's what it does. How does it make them feel after they use it — not in marketing words, in their own words?"

**Example** (project management tool):
- Feature: tasks + collaboration
- Functional: projects ship on time
- Emotional: in control, less chaos
- Ultimate: **clarity** — everything is handled

"Clarity" gives 100× more creative fuel than "project management."

### B. Brand Personality (skip if GTM loaded)

- 4 personality axes (-5 to +5):
  - Funny ↔ Serious
  - Formal ↔ Casual
  - Respectful ↔ Irreverent
  - Enthusiastic ↔ Matter-of-fact
- 3–5 words describing the brand as a person
- Tone to avoid

### C. Constraints

- Target markets (countries / languages)
- Domain requirement — must be `.com`? Or `.io` / `.ai` / `.co` acceptable?
- Syllable preference — 1–2 ideal, 3 acceptable, 4+ hard sell
- Naming conventions explicitly off-limits

### D. Ultimate Benefit Concept

Distill to 1–2 words. Write into `findings.ultimate_concept`.

Output: `01-brief.md` (see templates). **Advance state:
`overall_status: namescape`.**

---

## Phase 2: Namescape (Competitive Naming Map)

1. **Competitor list:**
   - If GTM loaded (`has_gtm_docs: true`): reuse competitor list from
     `02-market-landscape.md`.
   - Otherwise: discover 20 competitors from scratch.
2. Classify each competitor name by taxonomy type (see
   `references/taxonomy.md`). This step runs regardless of GTM state —
   GTM does not produce taxonomy classifications.
3. Identify dominant patterns — which taxonomy types saturate? Which
   suffixes / prefixes / sound profiles recur?
4. **Declare no-go zones** — patterns so common you'd be invisible. This
   also runs regardless of GTM state.

**If the user disagrees with a taxonomy classification**, record in
`disputes` and accept the user's classification. Agent taxonomy is
advisory.

Output: `02-namescape.md`. **Advance state:
`overall_status: generate`.**

---

## Phase 3: Multi-Model Candidate Generation

Divergent creativity benefits from model diversity. Different models have
different priors for "good name."

### Step 1: Detect available models

Run these availability probes, then (separately) auth probes:

```bash
# Codex CLI — availability
command -v codex && codex --version

# Gemini CLI — availability
command -v gemini && gemini --version
```

Availability check answers "is the binary installed and runnable?" If that
passes, try a cheap authenticated smoke test (e.g. a trivial prompt with a
1-token max output, or the vendor's recommended auth-check command). If
the smoke test fails, report the specific reason and instruct the user:

- codex: "codex installed but auth check failed — run `codex login`."
- gemini: "gemini installed but auth check failed — re-auth with your
  usual flow."

Populate `models_available.{claude,codex,gemini}` based on the combined
availability + auth result. Claude is always `true`.

### Step 2: Ask the user

> I detected the following models: [list]. Pick generation ensemble:
>
> - **Claude only** (~100 candidates) — fastest, lower diversity
> - **Claude + 1 other** (~200 candidates) — recommended baseline
> - **All three** (~300 candidates) — maximum diversity
>
> You can also pick a custom model set.

Record in `models_selected`. Default `candidates_per_model: 100`
(user-tunable).

### Step 3: Shared brief for all models

**All selected models receive the same full brief.** Diversity comes from
model priors, not from forced taxonomy assignments. Each model generates
`candidates_per_model` candidates across whichever taxonomy types it
considers fit for the brief.

The brief (markdown). **All placeholder paths are relative to
`naming-state.yaml` — use the full dotted path when substituting.**

```yaml
Ultimate concept: {findings.ultimate_concept}
Personality axes: {findings.personality}
Target markets: {findings.constraints.markets}
Syllable preference: {findings.constraints.syllable_preference}
No-go patterns (skip these): {findings.no_go_patterns}
Taxonomy palette: see references/taxonomy.md (11 types)
Target count: {candidates_per_model}
```

### Step 4: Invocation

**Never string-interpolate the brief into a shell command.** The brief
contains free-form user text and would be a command-injection vector.
Always write the brief to a file first with the Write tool, then pass it
to the external CLI via stdin heredoc or (if supported) a `--file` flag.

1. Generate a session timestamp: `TS=$(date +%Y%m%dT%H%M%S)`.
2. **Ensure the `.raw/` directory exists** before any writes:
   `mkdir -p docs/naming/.raw`. On first run the project may only have
   `naming-state.yaml`; without this step the brief write and CLI stdout
   redirect both fail with "No such file or directory".
3. Write the brief to `docs/naming/.raw/brief-${TS}.md` using the Write
   tool — not via shell `echo`/`cat <<EOF`. **Use `${TS}` throughout —
   the Write path MUST match the read paths in Step 4.**
4. Invoke each selected external model, reading that file.
   **Codex requires a git repository by default** (OpenAI Codex
   non-interactive docs). In greenfield mode A (no code yet) or any
   non-git workspace, add `--skip-git-repo-check`. Detect:
   `git rev-parse --is-inside-work-tree 2>/dev/null` — falsy means add
   the flag.

```bash
# Detect git workspace once
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && CODEX_GIT_FLAG="" \
  || CODEX_GIT_FLAG="--skip-git-repo-check"

# Codex — read brief from file via stdin
codex exec $CODEX_GIT_FLAG - < docs/naming/.raw/brief-${TS}.md \
  > docs/naming/.raw/codex-${TS}.txt
CODEX_EXIT=$?

# Gemini — read brief from file via stdin
gemini -m "gemini-3-pro-preview" < docs/naming/.raw/brief-${TS}.md \
  > docs/naming/.raw/gemini-${TS}.txt
GEMINI_EXIT=$?
```

Claude (the skill executor) generates in-session against the same brief.

### Step 5: Guard each external invocation

External CLIs fail for many reasons (rate limit, auth expiry, network,
model outage). **Never silently proceed on failure.** After each
invocation, in this order:

1. Check exit code. Non-zero → failure.
2. **Parse the output into a candidate list first, then count.**
   Models may emit one-per-line, numbered lists, bullets, wrapped
   paragraphs, or comma-separated — count the parsed candidates, not
   raw `wc -l`. The brief instructs models to output one candidate per
   line (see Step 3 brief template), but tolerate the common
   alternatives: strip bullets/numbering, split on commas inside a
   wrapped paragraph, merge multi-line bullets. Require at least
   **`candidates_per_model * 0.5`** parsed candidates (e.g., 100
   requested → 50 minimum, 30 requested → 15 minimum). Fewer than
   that → truncation or error response.
3. On failure: (a) downgrade `models_selected` by removing the failed
   model; (b) notify the user explicitly with the reason; (c) ask
   whether to retry, drop the model, or abort Phase 3. Do not merge the
   failed model's output into `03-candidates.md`.

### Step 6: Merge + dedupe

Claude reads all successful outputs and dedupes. Dedupe rules:

Apply in order — first rule that matches wins:

1. **Case-insensitive exact match** → drop duplicate.
2. **Names < 5 characters** → exact match only. Different spellings are
   kept (short names legitimately diverge at low edit distance).
3. **Names = 5 characters, Levenshtein distance = 1** → drop duplicate
   (preserve the one with clearer etymology or lower taxonomy saturation).
4. **Names = 5 characters, Levenshtein distance = 2** → borderline: keep
   both and flag in `04-evaluation.md` for human review.
5. **Names ≥ 6 characters, Levenshtein distance ≤ 2** → drop duplicate
   (same preservation rule as #3).
6. **Phonetically near-identical spellings** regardless of Levenshtein
   (e.g., Kava / Cava, Klair / Clare) → borderline: keep both and flag.

Write `03-candidates.md` grouped by taxonomy type. Each entry records its
source model so later analysis can see which model tends to win.

### Generation Discipline

**During generation, do not self-judge.** LLM-failure-mode penalties
(generic suffixes, stitched portmanteaus, etc.) are applied in Phase 4
Gate — not here. This preserves the approximate-thinking zone.

Use these angles when generating:

1. Synonyms of ultimate benefit.
2. Latin / Greek roots (etymonline.com).
3. Adjacent fields (e.g. "clarity" → optics, water, weather, music).
4. Sound patterns (K/T/P strong; L/M/S soft; V daring).
5. Metaphors and physical objects.

Output: `03-candidates.md`. **Advance state:
`overall_status: evaluate`.**

---

## Phase 4: Two-Layer Evaluation

### Layer 1: Gate (Binary Filter)

Cut any candidate that fails. No scoring — pass or cut.

| Gate | Rule |
|------|------|
| **Pronounceability** | Say the name aloud 3 times. If it still stumbles, cut. |
| **Spelling-on-hearing** | Can you spell it after hearing once? If not, cut. |
| **Competitor echo** | Sounds similar to a direct competitor? Cut. |
| **Literal description** | Just names the function? Cut (unless brief required descriptive). |
| **Cross-cultural red flag (quick pass)** | Quick LLM-based check across Spanish, French, Chinese, German, Japanese. LLM knowledge is unreliable here — mark `unverified` liberally rather than cutting. Known case: Mitsubishi Pajero = Spanish slur. ⚠ Urban-legend warning: Chevy Nova → "no va" is documented false (Snopes). Do not cut on superficial syllable overlap. The authoritative cross-cultural check runs at Phase 5 entry via WebSearch. |
| **Core domain unavailable** | If brief requires `.com` and no reasonable modifier works, cut. Otherwise flag `unverified` and keep. |
| **Trademark knockout** | USPTO Public Search for exact matches and confusing similarity in target class. If you lack tooling to query, mark `unverified` and keep. |

**LLM-failure-mode auto-penalties** (cut at Gate):

| Failure mode | Signal |
|--------------|--------|
| Too generic | Uses overused stems: Hub, Flow, Sync, Verse, Lab, Stack, Box, ly-suffix |
| Too stitched | Obvious portmanteau seams (InnoLyze, TechVerse, AIify) |
| Sound-deaf | Phonetic profile contradicts brand intent |
| Over-invented | Random consonant soup with no semantic hook |
| Trend-chasing | Copies a pattern peaking now (every 2026 AI startup ending in `.ai`) |
| Culture-blind | Cross-cultural gate was skipped without `unverified` flag |

Expected survivors: **30–50** out of 100–300.

### Layer 2: Score (100 pts, weighted)

Score each gate survivor 1–10 on each dimension × weight:

| Dimension | Weight | Definition |
|-----------|--------|------------|
| **Strategy fit** | 25 | Connects to positioning + ultimate benefit |
| **Memorability / fluency** | 20 | Easy to say, spell, recall (Alter & Oppenheimer 2006; Lewis & Frank 2016) |
| **Sound symbolism fit** | 15 | Phonetic profile matches desired perception (Klink 2000) |
| **Extensibility** | 15 | Survives future pivots + line extensions |
| **Ownability** | 10 | Trademark + domain + handle realistically achievable |
| **Cross-cultural portability** | 10 | No obvious landmines in target markets |
| **Aesthetic / vibe** | 5 | "Do I want to say this every day?" |

**Weight rationale:** Strategy fit and memorability dominate because those
are the hardest dimensions to retrofit after launch — you can re-skin
aesthetics and chase ownability with modifiers, but a name that doesn't
connect to positioning or that people can't remember is a permanent tax.
Aesthetic sits lowest because personal taste is the least predictive
signal for market success. If your category has different priors (e.g.
consumer fashion where aesthetic is load-bearing), adjust the weights and
record the deviation.

### Funnel shape

```text
100–300 candidates
  → Gate filter → 30–50 survivors
  → Score (weighted 100 pt) → rank all survivors
  → Take top 15 → user picks 10 for tension test
```

### Phase 4 outcome

Output only: top 15 scored, user picks 10 to advance. The winner is NOT
selected in this phase — that happens in Phase 6 after the tension test.

Output: `04-evaluation.md` — full rubric for top 15, shortlist of 10 for
tension testing. **Advance state: `overall_status: tension_test`.**

---

## Phase 5: Tension Test (Human Required)

Skill cannot execute this — it requires real humans reacting cold. Skill
produces a test kit, pauses, and interprets returns.

### Phase 5 entry: cross-cultural WebSearch (authoritative)

Before emitting the test kit, for each of the **top 10–15 survivors** from
the Score rubric, run WebSearch for:

- `{name} meaning in {language}` for each target market language.
- `{name} slang {language}` for each target market language.

This is the authoritative cross-cultural check. Phase 4's Gate pass was
LLM-knowledge-only and deliberately conservative; this step catches things
like regional slang, cultural associations, and trademark collisions the
LLM did not know. Only names that come back clean (or clean-with-context)
proceed to the tension test. Flagged names move to `unverified.cross_cultural`
or are cut here depending on severity.

Do NOT run this search on all 30–50 gate survivors — it's expensive and
unnecessary before the Score filter narrows the field.

### Tester requirements

- **Recommended:** 5–10 testers (mix of ideal customers + trusted advisors).
- **Minimum:** 3 testers. Below 3, tension test is unreliable and skipped.
- **Exclude:** co-founders, team members, anyone with internal context.

### Test Kit (skill produces `test-kit.md`)

1. **Selection guidance** — who to invite, how to frame the ask.
2. **Protocol** — show each name cold: no logo, no tagline, no pitch.
3. **Questions** (in order):
   - "What does this name make you feel?" (NOT "do you like it")
   - "What kind of company or product do you imagine?"
   - "If you saw this on a billboard, would you remember it tomorrow?"
4. **Recording table** — columns: name × person × feeling × imagined-category × memorability (Y/N).

Set `phases.tension_test.status: awaiting_user_results`. This phase can
pause for days or weeks.

### Interpretation (when user returns results)

| Pattern | Interpretation | Action |
|---------|----------------|--------|
| Half love, half hate | Tension zone — energy is real | SHORTLIST |
| Uniform "yeah it's fine" | Invisible zone | CUT |
| Uniform negative | Dead on arrival | CUT |
| Imagined as wrong category | Category mismatch | CUT |
| Imagined as correct category + positive feeling | Strong candidate | SHORTLIST |
| Nobody remembers next day | Fails memorability | CUT |

### Contradictory results

When patterns conflict, use this precedence:

1. **ICP vs advisor disagreement** → ICP wins. Advisors don't buy.
2. **Memorability vs feeling** → memorability wins. You can reshape feeling with positioning; you can't reshape forgettable.
3. **Category mismatch + positive feeling** → CUT. Wrong category is a harder problem than wrong mood.
4. **Polarizing ICP reactions** → SHORTLIST. Tension is the signal.

### Completion rule

Phase 5 is **done** when either:

- The user explicitly confirms the results are final, OR
- `tester_count ≥ 3` **AND** the user confirms no more responses are
  coming.

Never auto-advance based on tester count alone. Waiting is the default;
the user decides when to close the window.

### Low-sample fallback

If only 3 testers responded and user closes: set
`phases.tension_test.status: complete` with `tester_count: 3` and note in
Limitations. Weight tension test signals less heavily in final decision.

If fewer than 3: set `phases.tension_test.status: skipped_low_sample`.
Final decision proceeds on Score rubric alone, with explicit "not
validated with users" warning in `05-decision.md`.

Narrow to top 3 finalists. **Advance state:
`overall_status: decision`.**

---

## Phase 6: Decision

### Finalist Development

For each of the top 3:

- **Brand origin story** — 2–3 paragraphs: where the name came from, what
  it means, how it ties to ultimate benefit. This is the story you'll tell
  at every pitch and interview for the next decade.
- **Tagline candidates** — 3–5 short taglines leaning on the name.
- **Domain strategy** — exact `.com`, then `.co` / `.io` / `.ai`, then
  modifiers (`get{name}.com`, `{name}hq.com`, `{name}app.com`).
  ⚠ **`.io` faces long-term uncertainty.** The UK announced in October
  2024 the transfer of Chagos Islands sovereignty to Mauritius, which
  could eventually trigger ISO 3166-1 removal of the BIOT code and
  ICANN's ccTLD retirement policy. As of ICANN's November 2024 blog, IO
  still persists in ISO 3166-1 — no immediate action required, but watch
  the space before committing `.io` as primary.
- **Social handle check** — X, LinkedIn, Instagram, TikTok, GitHub.
- **International risk flags** — WIPO Global Brand Database scan + quick
  translation check across major languages.
- **Trademark prescreen** — USPTO Public Search (knockout only; full
  clearance requires a lawyer).

Any field that can't be verified → mark `unverified` and bubble to
Limitations.

### Winner Selection Rule (Critical)

**The winner is NOT the highest average.** A balanced 7-across-the-board
name is the invisible zone — safe, forgettable, friction.

**The winner meets ALL three criteria:**

1. **Raw** score **9 or 10 (out of 10)** on Strategy fit in the Phase 4
   rubric. ⚠ This is the raw 1–10 rating the rubric asks for BEFORE
   multiplying by the 25-point weight — not 9 out of the weighted 25.
2. **Raw** score **9 or 10 (out of 10)** on Memorability / fluency
   (before the ×20 weight is applied).
3. Landed in the **tension zone** during Phase 5 (polarizing reactions,
   not uniform approval).

**Exception — `skipped_low_sample` runs:** when Phase 5 was skipped
because fewer than 3 testers responded, criterion 3 cannot be evaluated.
Waive it and decide on criteria 1 + 2 alone, but explicitly add
"Not validated with users — tension zone unverified" to the
`05-decision.md` Limitations block so the user treats the pick as
provisional.

If no candidate meets all three (or both, in the low-sample case),
present the closest matches and escalate to the user — do not silently
pick the highest total. Remarkable beats balanced (Placek / Andy Grove
on Pentium).

### Final Selection

Present the 3 finalists. User picks. Skill produces `05-decision.md`:

- **Chosen name** + why it won over the other two.
- **Full brand origin story.**
- **Limitations block** (top of doc) — list every `unverified` field with
  explicit instruction: "Before filing trademark / launching, do X."
- **Announcement draft** (rebrand mode only) — see
  `references/rebrand-announcement.md` for the three-stage rollout
  playbook and equity-preservation guidance by company stage.
- **30-day launch checklist** — register trademark, secure domains, claim
  handles, update README / site / packaging.

Update state: `overall_status: complete`.

---

## Honest Limits

This skill is an accelerant, not a replacement for professional services.
Be explicit with the user about what it does NOT do:

- **Not legal trademark clearance.** The Gate does knockout-level USPTO
  prescreen at best. Full clearance (including foreign jurisdictions,
  common-law marks, related-goods analysis) requires a trademark attorney.
- **Not professional domain acquisition.** Domain availability changes
  daily. The skill reports a snapshot; negotiate premium domains through
  a broker if needed.
- **Not a naming firm.** Lexicon / Lunour / Siegel+Gale engagements run
  $30K–$200K precisely because they add linguist panels, multi-country
  consumer research, brand-architecture strategy, and legal co-ordination
  this skill does not.
- **Not qualified for multilingual naming.** Output is English-first;
  non-English markets get a gate check plus Phase 5 WebSearch only. For
  Chinese / Japanese / Arabic markets, hire a native-speaker naming
  consultant.
- **Tension test is small-sample.** 3–10 testers is directional, not
  statistically significant. Treat results as signal, not proof.

Every `unverified` field in state must appear in `05-decision.md`
Limitations with a clear "you need to X before doing Y" instruction.

---

## Dispute Handling

Users can disagree with agent judgment at any phase. The skill must:

1. Record disagreement in `disputes[]` with phase, topic, agent position,
   user position.
2. Accept the user's call — they own the brand.
3. Proceed with the user's choice, not the agent's.
4. Surface unresolved disputes in `05-decision.md` under a "Decisions you
   overrode" section, so future rebrand audits have the history.

Common dispute points:

- Rebrand audit verdict (user insists on renaming despite 0 triggers).
- Taxonomy classification in Phase 2.
- Gate cuts in Phase 4 ("this one was unfairly killed").
- Tension test interpretation.

---

## Interview Style Guide

- **Collaborative but specific.** Don't be confrontational, don't accept vague answers.
- **Show work first.** Present inferred benefit ladder from codebase before asking.
- **One question at a time.** Wait for the response.
- **Push once.** If still vague, note and move on.
- **Summarize after each phase.** Confirm before proceeding.
- **Respect rich answers.** Skip next topic if current answer already covers it.
- **Update state file after every meaningful exchange** (save only — no
  auto-commit).

---

## References

- `references/templates.md` — per-phase markdown schemas.
- `references/taxonomy.md` — 11 naming taxonomy types (used by Phase 2 + 3).
- `references/methodology.md` — practitioners, books, and research behind
  the rubric.
- `references/out-of-scope.md` — multi-product brand architecture pointers.
- `references/rebrand-announcement.md` — three-stage rollout + equity
  preservation by company stage (rebrand mode only).
