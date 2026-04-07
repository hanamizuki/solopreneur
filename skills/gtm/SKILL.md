---
name: gtm
description: |
  Generate a complete Go-To-Market strategy by analyzing a codebase and interviewing
  the user. Produces 4 strategy documents covering brand, market landscape, messaging,
  and channel playbook. Supports initial deep research (multi-session with interviews)
  and weekly incremental updates.
  Use when: "gtm", "go to market", "GTM plan", "brand strategy", "market analysis",
  "messaging framework", "generate GTM".
---

# GTM Strategy Generator

A generic, codebase-driven GTM skill. Reads a repository, interviews the user across
multiple sessions, and produces a complete set of strategy documents.

## Output

4 Markdown files in `{repo}/docs/gtm/` plus a state file:

```
docs/gtm/
├── gtm-state.yaml            # Session state (skill internal use)
├── 01-brand-strategy.md       # Who we are
├── 02-market-landscape.md     # The battlefield
├── 03-messaging-framework.md  # How we talk
├── 04-channel-playbook.md     # Where we show up
```

## Modes

| Mode | Trigger | Description |
|------|---------|-------------|
| **Initial** | No `gtm-state.yaml` exists | Deep research: codebase scan → multi-session interviews → draft → review |
| **Update** | `gtm-state.yaml` exists with `status: complete` | Weekly: scan git diff → confirm with user → update affected sections |
| **Resume** | `gtm-state.yaml` exists with `status` != `complete` | Continue from where the last session left off |

---

## State Management

On first run, create `docs/gtm/gtm-state.yaml`:

```yaml
project: {repo name}
repo_path: {absolute path}
created: {YYYY-MM-DD}
last_updated: {YYYY-MM-DD}
last_scan_commit: {commit hash}

status: scanning  # scanning | interviewing | drafting | review | complete

phases:
  scan:
    status: pending      # pending | in_progress | complete
    depth: null           # quick | standard | deep
    completed_at: null
  interview:
    status: pending
    current_topic: null   # product | audience | competition | brand | channels
    completed_topics: []
    pending_topics:
      - product
      - audience
      - competition
      - brand
      - channels
  draft:
    status: pending
    completed_at: null
  review:
    status: pending
    completed_at: null

# Accumulated findings from interviews (append after each session)
findings:
  product: {}
  audience: {}
  competition: {}
  brand: {}
  channels: {}
```

**At the start of every session:**
1. Read `gtm-state.yaml`
2. Display a brief summary: "Last session we covered [X]. Conclusions: [Y]. Today we continue with [Z]."
3. Ask user: continue, go back and revise a topic, or skip to a specific topic.

**After each session:**
1. Update `findings` with new information
2. Update phase statuses
3. Update `last_updated`
4. Commit the state file

---

## Initial Mode: Full Flow

### Phase 0: Codebase Scan

Ask the user first:

> How well-documented is your codebase?
> A) Well-documented (good README, docs/) → Quick scan
> B) Partially documented → Standard scan
> C) Minimal documentation → Deep scan

**Quick scan:**
- Read README.md, CLAUDE.md, docs/ directory
- Scan top-level directory structure
- Read package.json / Podfile / build.gradle for dependencies

**Standard scan:**
- Everything in quick scan, plus:
- Scan 2 levels of source directory structure
- Read key config files (API routes, database schemas, app manifests)
- Identify major feature modules by directory names

**Deep scan:**
- Everything in standard scan, plus:
- Read source code for each identified module (entry points, main classes)
- Identify features by class/function names and comments
- Map data models and API endpoints

**Output:** Draft feature inventory saved to `findings.product.features` in state file.

Update state: `phases.scan.status: complete`

---

### Phase 1: Product & Stage Interview

Present the feature inventory from Phase 0 and ask ONE question at a time.
Wait for the user's response before asking the next question.

**Questions (adapt based on what the codebase already revealed):**

1. "I found these features/modules in your codebase: [list]. Is anything missing — especially features that are planned or in development?"

2. "What stage is the product at?"
   - Pre-launch (no users yet)
   - Has users (people using it, not yet paying)
   - Has paying customers
   - Growth stage

3. "What's your current primary goal?"
   - Get first users
   - Increase retention
   - Monetize / convert free → paid
   - Expand to new segments

4. "In one sentence, how would you explain what this product does to a stranger?"
   - **Push if vague:** "That's broad. Specifically — who is this person, and what problem does it solve that they couldn't solve before?"

5. "What's the single most important thing your product does better than anything else out there?"
   - **Push if generic:** "Could a competitor say the same thing? What's the part that only you can claim?"

After each answer, briefly summarize your understanding and confirm before moving on.

Update state: `phases.interview.completed_topics: [product]`, save findings.

---

### Phase 2: Audience Interview (Deepest)

This is the most important phase. Push for specificity — categories are not people.

**Questions:**

1. "Describe your most typical user. Not a category — a person. What's their situation? Why did they come to your product?"
   - **Push:** "Can you name a real user (or composite) and describe a specific day in their life where your product matters?"

2. "Are there other distinct types of users? Describe 1-2 more if they exist."
   - For each: situation, goal, pain points, what JTBD they're hiring your product for

3. "Before your product existed, how did these people solve this problem? What did that workaround look like day-to-day?"
   - **Push:** "What specifically was frustrating about that? What moment made them say 'there has to be a better way'?"

4. "Have you directly heard users describe their pain points? What did they actually say — their exact words?"
   - **Push:** "The exact phrasing matters for messaging. 'I need better health tracking' vs 'I'm terrified the medication isn't working' are completely different messages."

5. "Has any user used your product in a way you didn't expect? What surprised you?"

6. "If your product disappeared tomorrow, who would be most upset? Why?"
   - **Push:** "Would they scramble to find an alternative, or just shrug? That tells us how deep the need is."

Update state: `phases.interview.completed_topics: [product, audience]`, save findings.

---

### Phase 3: Competition Research

This phase happens AFTER Product + Audience because we now know what to search for.

**Step 1: Ask the user**

1. "What do you consider your direct competitors? (Other products solving the same problem for the same people)"

2. "What's their biggest weakness, from your users' perspective?"

3. "What's the one thing about your product that competitors can't easily copy?"
   - **Push:** "A feature list isn't a moat. What's the underlying insight or advantage?"

**Step 2: Online research**

Search the web for:
- "[product category] best apps/tools {current year}"
- "[product category] vs [competitor names]"
- "[product category] reviews complaints"
- "[target audience] [problem] solutions"

Read top 3-5 results. For each competitor found:
- What they do well
- Where they fall short
- How they position themselves
- How our product is different

**Step 3: Synthesize**

Present findings to the user:
- "I found these additional competitors: [list]. Any I should add or remove?"
- "Here's how I see the competitive landscape: [summary]. Does this match your understanding?"

Update state: `phases.interview.completed_topics: [product, audience, competition]`, save findings.

---

### Phase 4: Brand & Voice Interview

**Questions:**

1. "If your product were a person walking into a room, how would others describe them?"
   - **Push for personality axes:** "On a scale: funny vs serious? Formal vs casual? Respectful vs irreverent? Enthusiastic vs matter-of-fact?"

2. "Is there a brand whose tone you admire and want to emulate? Why?"

3. "What style or tone is absolutely off-limits for your brand?"
   - **Push:** "Any specific phrases, vibes, or associations you want to avoid? (e.g., 'salesy', 'clinical', 'corporate', 'try-hard')"

4. "What emotional state are your users in when they interact with your product? (anxious? curious? frustrated? hopeful?)"
   - This informs voice calibration — you don't talk to an anxious person the same way you talk to a curious one.

5. "What are the 3-5 values your brand stands for? Not aspirational — things you actually practice."
   - **Push:** "For each value, can you give me a concrete example of how it shows up in your product or communication?"

Update state: `phases.interview.completed_topics: [product, audience, competition, brand]`, save findings.

---

### Phase 5: Channels Interview

**Questions:**

1. "Where do your users spend their time online? Which platforms, communities, forums?"

2. "Where do they go when they have questions about the problem your product solves?"

3. "Which platforms do you currently have a presence on? How's it going?"

4. "Are there any platforms you've tried and abandoned, or deliberately avoiding? Why?"

Update state: `phases.interview.completed_topics: [product, audience, competition, brand, channels]`, save findings.

---

### Phase 6: Draft & Review

Generate all 4 documents based on accumulated findings. Follow the templates below.

Present to user:
> "I've drafted all 4 GTM documents. Would you like to:
> A) Review them one by one
> B) Review all at once
> C) Focus on a specific document"

Iterate based on feedback. When the user approves:
- Update state: `status: complete`, `phases.review.completed_at: {date}`
- Commit all files

---

## Update Mode: Weekly Refresh

When `gtm-state.yaml` exists with `status: complete`:

1. Run `git log --oneline --since="7 days ago"` (or since `last_scan_commit`)
2. Analyze changes: new features, modified features, removed features
3. Present changelog to user:
   > "Since last scan, I see these codebase changes: [list]. Any strategic direction changes this week?"
4. Update affected documents (usually 01-brand-strategy § Product Profile and 03-messaging-framework)
5. Update `last_updated` and `last_scan_commit` in state file

---

## Document Templates

### 01-brand-strategy.md

```markdown
# Brand Strategy

> Generated by GTM skill · Last updated: {date}

## 1. Product Profile

### What It Does
{One paragraph: what the product is and the core problem it solves}

### Core Features
{Table: Feature | Description | Platform | Status (shipped/beta/planned)}

### Value Transformation
**Input:** {What the user brings — data, time, effort}
**Magic:** {What the product does with it}
**Output:** {What the user gets — outcome, feeling, capability}

## 2. Stage & Traction

### Current Stage
{Pre-launch / Early users / Paying customers / Growth}

### Primary Goal
{What the team is focused on right now}

### Honest Assessment
{Strengths and weaknesses, stated directly. What's working, what's not, what's risky.}

## 3. Brand Foundation

### Mission
{Why we exist — one sentence}

### Vision
{Where we're going — one sentence}

### Values
{3-5 values, each with a one-line "why" and a concrete example}

### Brand Promise
{What we guarantee to our users — one sentence}

## 4. Brand Personality

### Character
{A paragraph describing the brand as a person — personality, backstory if relevant, how they make people feel}

### Personality Axes
| Axis | Position | Notes |
|------|----------|-------|
| Funny ↔ Serious | {position} | {brief explanation} |
| Formal ↔ Casual | {position} | |
| Respectful ↔ Irreverent | {position} | |
| Enthusiastic ↔ Matter-of-fact | {position} | |

### Three Words
{Three words that summarize the brand personality}

## 5. Positioning (Dunford Framework)

### Competitive Alternatives
{What users do today instead of using our product}

### Key Unique Attributes
{What we have that alternatives don't}

### Differentiated Value
{The value those attributes create for users}

### Best-Fit Customers
{Who cares most about that value}

### Market Category
{The category we compete in — or are creating}

### Positioning Statement
{For [best-fit customers] who [need/struggle], [product] is a [category] that [key differentiated value]. Unlike [alternatives], we [unique attribute].}
```

### 02-market-landscape.md

```markdown
# Market Landscape

> Generated by GTM skill · Last updated: {date}

## 1. Target Audience

### ICP Archetypes

#### Archetype 1: {Name}
*{One-line description}*

| Field | Detail |
|-------|--------|
| Situation | {Who they are, what stage they're in} |
| Goal | {What they're trying to achieve} |
| Pain Points | {What frustrates them — specific, behavioral} |
| JTBD | {When I [situation], I want to [motivation], so I can [outcome]} |
| Current Workaround | {How they solve this today without our product} |
| Best Message | {The one sentence that would stop them scrolling} |

{Repeat for each archetype — typically 3-5}

### Cross-Cutting Behaviors
{Behaviors shared across archetypes — e.g., price sensitivity, community reliance, privacy concerns}

### User Journey Map
{Stages from awareness → first use → habit → advocacy, with emotional state at each stage}

## 2. Voice of Customer

### Pain Points & Frustrations
{Direct quotes from users — their actual words, not your summary}

### Positive Signals
{What users say when the product is working for them}

### Search Queries
{What users type into Google/Reddit/forums when looking for solutions}

## 3. Competitive Analysis

### Market Gaps
{What no one in the market is doing well — the opportunities}

### Direct Competitors

#### {Competitor Name} — {URL}
{One-line description}

**Strengths:** {bullets}
**Weaknesses:** {bullets}
**Differentiation vs Us:** {How we're specifically different — not a feature list, an insight}

{Repeat for each competitor}

### Status Quo Spectrum

| Stage | Method | Friction |
|-------|--------|---------|
| Do Nothing | {How people cope without any tool} | {What's painful about it} |
| DIY Stacked | {Cobbled-together tool combinations} | {Why it breaks down} |
| Point Solutions | {Dedicated tools in this space} | {Where they fall short} |
| Full Service | {Agencies, services, premium solutions} | {Why it's not ideal} |

## 4. Differentiation Matrix

| Capability | Us | {Competitor A} | {Competitor B} | {Competitor C} |
|-----------|-----|----------------|----------------|----------------|
| {capability 1} | ✅ | ⚠️ | ❌ | ❌ |
| {capability 2} | ... | ... | ... | ... |
```

### 03-messaging-framework.md

```markdown
# Messaging Framework

> Generated by GTM skill · Last updated: {date}

## 1. Value Proposition
{One sentence that captures what we offer and why it matters}

### Tagline Candidates
{3-5 short taglines — punchy, memorable, testable}

## 2. Messaging Pillars

### Pillar 1: {Name}
**Theme:** {What this pillar is about}
**Proof Points:** {Evidence from the product — features, data, user stories}
**Example Messages:**
- {Social post angle}
- {Landing page headline}
- {Email subject line}

### Pillar 2: {Name}
{Same structure}

### Pillar 3: {Name}
{Same structure}

{3-5 pillars total}

## 3. Per-ICP Messaging

### {Archetype 1 Name}
| Element | Message |
|---------|---------|
| Hook | {What grabs their attention — speaks to their specific pain} |
| Value | {What we promise — specific to their situation} |
| Proof | {Why they should believe us — evidence they'd find credible} |

### {Archetype 2 Name}
{Same structure}

{Repeat for each ICP archetype}

## 4. Voice & Tone

### Primary Tone
{4-5 descriptors with brief explanations}

### Avoid
{What we never sound like — specific anti-patterns, not just "don't be boring"}

### Do / Don't Examples

| Context | Do ✅ | Don't ❌ |
|---------|-------|---------|
| {situation 1} | {good example} | {bad example} |
| {situation 2} | {good example} | {bad example} |

### Scene Examples
{Per-context voice calibration — how the tone shifts across different touchpoints}

| Context | Posture | Length | Personality Level | Key Rule |
|---------|---------|--------|-------------------|----------|
| Social media post | {description} | {range} | {low/med/high} | {one rule} |
| App UI copy | {description} | {range} | {low/med/high} | {one rule} |
| Customer support | {description} | {range} | {low/med/high} | {one rule} |
| Marketing email | {description} | {range} | {low/med/high} | {one rule} |

### Brand Guardrails
{Non-negotiable rules — legal, ethical, or brand-critical constraints}

## 5. Content Pillars

### Pillar 1: {Name}
**What:** {Description of this content theme}
**Why it works:** {Which ICPs it serves, which JTBDs it addresses}
**Example topics:** {3-5 specific content ideas}

{Repeat for each pillar — typically 3-5}
```

### 04-channel-playbook.md

```markdown
# Channel Playbook

> Generated by GTM skill · Last updated: {date}

## 1. Platform Selection

| Platform | Why | Complexity | Priority |
|----------|-----|-----------|----------|
| {platform} | {rationale tied to ICP behavior} | {1-5} | {P0/P1/P2} |

## 2. Per-Platform Strategy

### {Platform Name}

#### Format & Vibe
{What content looks like here, what the culture expects}

#### Algorithm DNA
{How content gets distributed — what the platform rewards}

#### Operational Playbook
1. {Step 1 — what to monitor}
2. {Step 2 — what to track}
3. {Step 3 — how to engage}
4. {Step 4 — how to measure}

#### Growth Vectors

| Vector | Strength | Why | Actions |
|--------|----------|-----|---------|
| Communities | {Low/Med/High} | {explanation} | {what to do} |
| ICP Content | {Low/Med/High} | {explanation} | {what to do} |
| Founder/Brand | {Low/Med/High} | {explanation} | {what to do} |
| Competitor | {Low/Med/High} | {explanation} | {what to do} |
| Intent Search | {Low/Med/High} | {explanation} | {what to do} |

#### Key Communities / Accounts
{Specific groups, hashtags, influencers, forums to watch and engage with}

{Repeat for each platform}

## 3. Keyword Clusters

### Pain Points
| Keyword |
|---------|
| {keyword related to user frustrations} |

### ICP Identifiers
| Keyword |
|---------|
| {keyword that signals someone is our target user} |

### JTBD Terms
| Keyword |
|---------|
| {keyword related to jobs users are trying to do} |

### Competitor Complaints
| Keyword |
|---------|
| {keyword related to competitor dissatisfaction} |

## 4. Post Strategy

### Primary Goal
{What we're optimizing for — awareness, installs, trust, community}

### Content Pillar → Platform Mapping
| Content Pillar | Best Platforms | Format | Frequency |
|---------------|---------------|--------|-----------|
| {pillar} | {platforms} | {format} | {cadence} |

## 5. Reply Strategy

### Target Communities
{Where to engage in conversations — specific groups, threads, hashtags}

### KOL Targets
{Key opinion leaders to follow, engage with, and build relationships with}

### Engagement Rules
{How to show up — add value, don't sell; match the vibe; when to stay silent}
```

---

## Interview Style Guide

- **Collaborative but specific.** Don't be confrontational, but don't accept vague answers.
- **Show your work first.** Before asking, present what you inferred from the codebase. This reduces user burden and demonstrates competence.
- **One question at a time.** Wait for the response before asking the next.
- **Push once.** If the answer is vague, ask for specificity once. If the user can't be more specific, note it and move on — they may not have the data yet.
- **Summarize after each topic.** Before moving to the next phase, present a brief summary of what you learned and get confirmation.
- **Respect the user's time.** If they give rich answers quickly, don't artificially slow down. If a topic's answers already cover the next topic, skip it.
- **Mark progress.** After each meaningful exchange, update the state file so the next session can resume cleanly.
