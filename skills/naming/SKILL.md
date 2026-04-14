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

A structured workflow for naming one product, one company, or one product+company
that share the same name. Uses multi-model ensemble (Claude + optional Codex /
Gemini) to generate diverse candidates, filters through a two-layer rubric
(Gate + Score), tests with real humans, and produces a finalist.

## Scope

- **One entity per run.** Name one product, one company, or one brand where
  product and company share the same name (treated as a single entity).
- **Separate entities → run twice.** If product and company need different
  names, run the skill once for each. Do not merge briefs.
- **Language:** English-first. Non-English markets handled only as gate check,
  not name generation.
- **Out of scope:** multi-product portfolio governance (brand architecture,
  nomenclature systems). See the appendix.

## Output

5 Markdown files in `{repo}/docs/naming/` plus a state file and test kit:

```
docs/naming/
├── naming-state.yaml        # Session state (internal)
├── 01-brief.md               # Benefit ladder, personality, constraints
├── 02-namescape.md           # Competitive naming map + no-go zones
├── 03-candidates.md          # All candidates grouped by taxonomy + source model
├── 04-evaluation.md          # Gate survivors + score rubric
├── test-kit.md               # Phase 5 tension test materials (printable)
└── 05-decision.md            # Final choice, rationale, limitations, announcement
```

**Document schemas** — see `references/templates.md` for the full markdown
template of each output file. Every phase output must match the template so
that `resume` can reliably re-read state.

---

## Modes

| Mode | Trigger | Description |
|------|---------|-------------|
| **Greenfield** | No state file, user naming something new | Full 6-phase flow |
| **Rebrand** | No state file, user has an existing name and wants to change | Phase 0 audit first → if "change" → full flow |
| **Resume** | State file exists with `status != complete` and `status != ended_no_change` | Continue from last phase |

---

## State Management

On first run, create `docs/naming/naming-state.yaml`:

```yaml
project: {repo name}
repo_path: {absolute path}
created: {YYYY-MM-DD}
last_updated: {YYYY-MM-DD}

mode: greenfield              # greenfield | rebrand
entity_scope: product         # product | company | both_same_name
starting_context: B           # A (idea only) | B (code, no name) | C (code, has name → rebrand)
has_gtm_docs: false

# Overall status enum — must be exactly one of these:
# rebrand_audit | brief | namescape | generate | evaluate | tension_test |
# decision | complete | ended_no_change
status: brief

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
  trademark: []                 # names we could not prescreen reliably
  domain: []
  handles: []
  cross_cultural: []
```

**At the start of every session:**
1. Read `naming-state.yaml`.
2. Summarize: "Last session ended at phase [X]. Today we continue with [Y]."
3. Ask user: continue, re-run a specific phase, or skip forward.

**After each meaningful exchange:**
1. Update `findings` and phase status.
2. Bump `last_updated`.
3. Write the relevant phase file using the template from `references/templates.md`.
4. Commit the state file.

### Re-running a phase (invalidation rules)

When the user re-runs phase N, everything downstream is stale. Before
executing, the skill MUST:

1. Mark `phases.{N+1..}.status: pending` and zero their counters.
2. Archive (rename) downstream files: `03-candidates.md` → `03-candidates.v1.md`
   etc. Never silently overwrite.
3. Clear `findings` keys owned by downstream phases.
4. Announce to user: "Re-running Phase N will invalidate [list]. Proceed?"

Dirty state at decision time is a failure mode — not a feature.

---

## Starting Context

On first run (before any phase), ask:

> What's your situation?
> - **A)** I have an idea but no code yet.
> - **B)** I have code (or a working product) but no name — or just a placeholder.
> - **C)** I have code and a name, but I want to consider a rebrand.

- **A** → skip codebase scan, go to Phase 1.
- **B** → light codebase scan (README, package.json, top-level dirs) to pre-fill product description, then Phase 1.
- **C** → set `mode: rebrand`, run Phase 0 first.

## GTM Skill Integration

After context is set, check for `{repo}/docs/gtm/gtm-state.yaml`. **Do not
trust file existence alone** — check the state file for `status: complete`.

**If `gtm-state.yaml` exists AND `status: complete`:**
- Read all three relevant docs:
  - `01-brand-strategy.md` → Mission, Values, Personality, Positioning
  - `02-market-landscape.md` → ICP archetypes, competitors, JTBD
  - `03-messaging-framework.md` → Voice, tone, content pillars
- Announce: "I see a completed GTM. I'll reuse personality, audience, voice,
  and competitor list. If anything's changed since GTM was written, tell me now."
- Skip overlapping Phase 1B (personality) and Phase 2 competitor discovery.
- Set `has_gtm_docs: true`.

**If `gtm-state.yaml` is missing, incomplete, or unreadable:**
- Run full Phase 1 Brief and Phase 2 Namescape from scratch.
- Do NOT partially use individual GTM files — they may be stale.

---

## Phase 0 (Rebrand only): Keep or Change Audit

Before any naming work, decide if renaming is actually the right move. Default
answer is **no** — brand equity is expensive to rebuild.

Present these 4 triggers. Ask the user which apply:

1. **Strategic drift** — product or market has pivoted; current name is now misleading.
2. **Legal risk** — trademark conflict, can't expand to new class or geography, active dispute.
3. **Systematic friction** — name is unspellable, mispronounced, confused with a competitor, hard to search, or embarrassing to say.
4. **Severe reputation damage** — name itself has become a liability (rename alone rarely fixes this).

**Decision rule:**
- **0 triggers:** Strongly recommend NOT renaming. Set `status: ended_no_change`.
  Write summary to `01-brief.md`. Skill ends cleanly.
- **1 trigger (not Strategic drift):** Caution. Ask user to reconsider. If user
  insists on continuing, record in `disputes` and proceed.
- **Strategic drift, OR 2+ triggers:** Proceed to Phase 1.

Record the triggers and decision in `phases.rebrand_audit`. On `status:
ended_no_change`, `naming-state.yaml` is preserved so the user can re-enter
later by manually setting `status: brief`.

---

## Phase 1: Brief (Discovery)

One question at a time. Skip overlapping questions if GTM docs are loaded.

### A. Benefit Ladder

Climb feature → functional → emotional → ultimate. This produces the creative
springboard — 1-2 words the entire generation phase pivots on.

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

Output: `01-brief.md` (see templates). Update state.

---

## Phase 2: Namescape (Competitive Naming Map)

1. List 20 competitors (reuse from GTM if loaded).
2. Categorize each competitor name by taxonomy type (Phase 3 taxonomy).
3. Identify dominant patterns — which taxonomy types saturate? Which suffixes / prefixes / sound profiles recur?
4. **Declare no-go zones** — patterns so common you'd be invisible.

**If the user disagrees with a taxonomy classification**, record in `disputes`
and accept the user's classification. Agent taxonomy is advisory.

Output: `02-namescape.md`. Update state.

---

## Phase 3: Multi-Model Candidate Generation

Divergent creativity benefits from model diversity. Different models have
different priors for "good name."

### Step 1: Detect available models

Run these probes:

```bash
# Codex CLI
command -v codex && codex login status

# Gemini CLI
command -v gemini
```

Populate `models_available.{claude,codex,gemini}`. Claude is always `true`.

### Step 2: Ask the user

> I detected the following models: [list]. Pick generation ensemble:
>
> - **Claude only** (~100 candidates) — fastest, lower diversity
> - **Claude + 1 other** (~200 candidates) — recommended baseline
> - **All three** (~300 candidates) — maximum diversity
>
> You can also pick custom model set.

Record in `models_selected`. Default `candidates_per_model: 100` (user-tunable).

### Step 3: Model-specific taxonomy assignments

To maximize diversity, each model takes a different slice of the taxonomy
(they overlap slightly on purpose):

| Model | Assigned taxonomy types | Rationale |
|-------|------------------------|-----------|
| **Claude** | Suggestive/Evocative, Metaphorical, Real-word-out-of-context | Literary intuition, metaphor fluency |
| **Codex** | Compound, Descriptive, Misspelled/Truncated | Technical-domain naming conventions |
| **Gemini** | Invented/Coined, Greek/Latin root, Portmanteau | Cross-linguistic + morphology strength |

Always-included types (Founder, Acronym) are only generated if the brief
requires them.

### Step 4: Shared brief for all models

Every model receives the same base brief (JSON or markdown):

```
Ultimate concept: {findings.ultimate_concept}
Personality axes: {findings.personality}
Target markets: {constraints.markets}
Syllable preference: {constraints.syllable_preference}
No-go patterns (skip these): {findings.no_go_patterns}
Your assigned taxonomy types: {...}
Target count: {candidates_per_model}
```

### Step 5: Invocation

- **Claude** (this skill's executor) — generate in-session, batched by type.
- **Codex:**
  ```bash
  echo "{brief}" | codex exec - > /tmp/naming-codex-batch.txt
  ```
- **Gemini:**
  ```bash
  gemini -p "{brief}" -m "gemini-3-pro-preview" > /tmp/naming-gemini-batch.txt
  ```

### Step 6: Merge + dedupe

Claude (as the skill executor) reads all outputs, dedupes (case-insensitive
string match + near-spelling variants), and writes `03-candidates.md`
grouped by taxonomy type. Each entry records its source model so later
analysis can see which model tends to win.

### Generation Discipline

**During generation, do not self-judge.** LLM-failure-mode penalties
(generic suffixes, stitched portmanteaus, etc.) are applied in Phase 4
Gate — not here. This preserves the approximate-thinking zone.

Use these angles when generating:
1. Synonyms of ultimate benefit
2. Latin / Greek roots (etymonline.com)
3. Adjacent fields (e.g. "clarity" → optics, water, weather, music)
4. Sound patterns (K/T/P strong; L/M/S soft; V daring)
5. Metaphors and physical objects

### Taxonomy reference (11 types)

| # | Type | Definition | Examples |
|---|------|------------|----------|
| 1 | Descriptive | Literally describes function | Hotels.com, Whole Foods |
| 2 | Suggestive / Evocative | Evokes feeling, not literal | Netflix, Gatorade, Amazon |
| 3 | Invented / Coined | Pure new word | Kodak, Xerox, Häagen-Dazs |
| 4 | Metaphorical | Borrowed concept | Apple, Nike, Impossible Foods |
| 5 | Real word out of context | Existing word, new category | Orange (telecom), Square, BlackBerry |
| 6 | Compound | Two words joined | Facebook, YouTube, DoorDash |
| 7 | Portmanteau | Fragments fused | Pinterest, Instagram, Microsoft |
| 8 | Greek/Latin root | Classical morphemes | Pentium, Vercel, Verizon |
| 9 | Founder | Person's name | Ford, Disney |
| 10 | Acronym | Initial letters | IBM, BBC, 3M |
| 11 | Misspelled / Truncated | Deliberate variant | Lyft, Flickr, Tumblr |

Output: `03-candidates.md`. Update state.

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
| **Cross-cultural red flag** | Check meanings in Spanish, French, Chinese, German, Japanese (major markets). Known case: Mitsubishi Pajero = Spanish slur. ⚠ Urban-legend warning: Chevy Nova → "no va" is documented false (Snopes). Do not cut on superficial syllable overlap. Mark `unverified` if you cannot check reliably. |
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

### Funnel shape

```
100–300 candidates
  → Gate filter → 30–50 survivors
  → Score (weighted 100 pt) → rank all survivors
  → Take top 15 → user picks 10 for tension test
```

### Decision Rule (Critical)

**The winner is NOT the highest average.** A balanced 7-across-the-board
name is the invisible zone — safe, forgettable, friction.

**The winner scores 9–10 on Strategy fit AND Memorability AND creates
tension in Phase 5** (polarizing reactions). Remarkable beats balanced
(Placek / Andy Grove on Pentium).

Output: `04-evaluation.md` — full rubric for top 15, shortlist of 10 for
tension testing.

---

## Phase 5: Tension Test (Human Required)

Skill cannot execute this — it requires real humans reacting cold. Skill
produces a test kit, pauses, and interprets returns.

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

### Low-sample fallback

If only 3 testers responded: set `phases.tension_test.status: complete`
with `tester_count: 3` and note in Limitations. Weight tension test
signals less heavily in final decision.

If fewer than 3: set `status: skipped_low_sample`. Final decision proceeds
on Score rubric alone, with explicit "not validated with users" warning
in `05-decision.md`.

Narrow to top 3 finalists.

---

## Phase 6: Decision

### Finalist Development

For each of the top 3:

- **Brand origin story** — 2–3 paragraphs: where the name came from, what
  it means, how it ties to ultimate benefit. This is the story you'll tell
  at every pitch and interview for the next decade.
- **Tagline candidates** — 3–5 short taglines leaning on the name.
- **Domain strategy** — exact `.com`, then `.co` / `.io` / `.ai`, then
  modifiers (`get{name}.com`, `{name}hq.com`, `{name}app.com`). ⚠ `.io`
  has long-term geopolitical risk (ICANN 2024: BIOT code may be removed
  from ISO 3166-1, triggering retirement policy).
- **Social handle check** — X, LinkedIn, Instagram, TikTok, GitHub.
- **International risk flags** — WIPO Global Brand Database scan + quick
  translation check across major languages.
- **Trademark prescreen** — USPTO Public Search (knockout only; full
  clearance requires a lawyer).

Any field that can't be verified → mark `unverified` and bubble to
Limitations.

### Final Selection

Present the 3 finalists. User picks. Skill produces `05-decision.md`:

- **Chosen name** + why it won over the other two
- **Full brand origin story**
- **Limitations block** (top of doc) — list every `unverified` field with
  explicit instruction: "Before filing trademark / launching, do X."
- **Announcement draft** (rebrand mode only)
- **30-day launch checklist** — register trademark, secure domains, claim
  handles, update README / site / packaging

### Rebrand Announcement Template (rebrand mode only)

Three-stage rollout:

1. **Pre-announce (internal, 2–4 weeks)** — trademark filed, domains
   secured, handles claimed, team trained, landing page staged. Nothing public.
2. **Announce (external, day 0)** — one blog post, one reason. Not "we
   wanted to feel modern." Instead: strategic pivot, architecture clarity,
   or legal necessity. Template: Vercel's "Zeit is now Vercel" (2020).
3. **Transition (dual-brand, 3–12 months)** — every mention is
   "{New}, formerly {Old}" in press, docs, app stores. Domain 301-redirect.
   Old social handles rename rather than delete.

**Equity preservation by stage:**
- **Pre-Series B:** minimal equity, rename is cheap. Do it now.
- **Growth stage:** need transition story + customer-by-customer outreach.
  Expect 3–6 month SEO dip.
- **Mature:** only if current name is actively harmful. Bar is high
  (Tribune → tronc → Tribune as cautionary tale).

Update state: `status: complete`.

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
  non-English markets get a gate check only. For Chinese / Japanese /
  Arabic markets, hire a native-speaker naming consultant.
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
- Rebrand audit verdict (user insists on renaming despite 0 triggers)
- Taxonomy classification in Phase 2
- Gate cuts in Phase 4 ("this one was unfairly killed")
- Tension test interpretation

---

## Interview Style Guide

- **Collaborative but specific.** Don't be confrontational, don't accept vague answers.
- **Show work first.** Present inferred benefit ladder from codebase before asking.
- **One question at a time.** Wait for the response.
- **Push once.** If still vague, note and move on.
- **Summarize after each phase.** Confirm before proceeding.
- **Respect rich answers.** Skip next topic if current answer already covers it.
- **Update state file after every meaningful exchange.**

---

## Out of Scope

This skill names **one entity**. When you have 2+ products sharing brand
equity, naming becomes an architecture problem — a different discipline
with its own frameworks.

If you reach that point, read:

- **Brand architecture** (Branded House / Sub-brands / Endorsed / House of Brands): Aaker & Joachimsthaler, *Brand Leadership* (2000)
- **Brand hierarchy** (Corporate → Family → Individual → Modifier): Keller, *Strategic Brand Management*, Chapter 11
- **Nomenclature systems** for product lines: Siegel+Gale, Lippincott, Landor, Wolff Olins case studies

**Patterns worth studying:**
- Alphabet / Google (2015) — Sub-brand architecture
- Block / Square (2021) — House of Brands pivot
- Meta / Facebook (2021) — Branded House at corporate, House of Brands at product
- Adobe Creative Cloud — Endorsed Brand with 30-year sub-brand equity

When your portfolio grows to 3+ products, treat it as architecture, not a
single name.

---

## Methodology Sources

**Practitioners:**
- David Placek / Lexicon Branding — tension zone, sound symbolism, processing power (Vercel, BlackBerry, Swiffer, Pentium, Impossible Foods)
- Scott Bair / Lunour — "How to Name Your Company" playbook (2026)
- Anthony Shore / Operative Words — concepts before words
- Eli Altman / A Hundred Monkeys — distillation, writerly naming
- Interbrand, *In a Word* — funnel methodology
- Siegel+Gale — naming strategy / nomenclature / validation

**Books:**
- Alexandra Watkins, *Hello My Name Is Awesome* — SMILE / SCRATCH
- Rob Meyerson, *Brand Naming* (2021) — process handbook

**Research:**
- Alter & Oppenheimer (2006) — processing fluency and short-term judgments
- Klink (2000) — sound symbolism in brand names
- Motoki et al. (2022) — connotative meaning framework
- Lewis & Frank (2016) — word length reflects conceptual complexity
- Köhler (1929) / Ramachandran & Hubbard (2001) — Bouba-Kiki effect
