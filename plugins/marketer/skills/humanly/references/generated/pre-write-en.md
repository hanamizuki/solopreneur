<!-- AUTO-GENERATED — DO NOT EDIT.
     Sources: ../patterns-en.md + ../word-table-en.md
     Regenerate: python3 plugins/marketer/skills/humanly/scripts/build-pre-write.py -->

# English Pre-write (read before writing)

Read this one file before writing. The principles and examples are for internalizing; the word table lists traps to avoid on sight. The full pattern catalog (loaded during review) lives in `../patterns-en.md`.

## Core Rules

5 principles to keep in mind:

1. **Delete filler phrases**: remove openers and emphasis crutches
2. **Break formulaic structure**: avoid binary contrasts, dramatic setups, rhetorical framing
3. **Vary rhythm**: mix sentence lengths. Two items beat three. Vary paragraph endings
4. **Trust the reader**: state facts directly, skip softening, justifying, and hand-holding
5. **Delete quotable lines**: if it sounds like a pull quote, rewrite it

---

## Personality and Soul

Avoiding AI patterns is only half the job. Sterile, voiceless writing is just as obvious as slop. Good writing has a human behind it.

### Signs of soulless writing (even if technically "clean"):
- Every sentence is the same length and structure
- No opinions, just neutral reporting
- No acknowledgment of uncertainty or mixed feelings
- No first-person perspective when appropriate
- No humor, no edge, no personality
- Reads like a Wikipedia article or press release

### How to add voice:

**Have opinions.** Don't just report facts. React to them. "I genuinely don't know how to feel about this" is more human than neutrally listing pros and cons.

**Vary your rhythm.** Short punchy sentences. Then longer ones that take their time getting where they're going. Mix it up.

**Acknowledge complexity.** Real humans have mixed feelings. "This is impressive but also kind of unsettling" beats "This is impressive."

**Use "I" when it fits.** First person is honest, not unprofessional. "I keep coming back to..." or "Here's what gets me..." signals a real person thinking.

**Let some mess in.** Perfect structure feels algorithmic. Tangents, asides, and half-formed thoughts are human.

**Be specific about feelings.** Instead of "this is concerning," write "there's something unsettling about agents churning away at 3am while nobody's watching."

### Before (clean but soulless):
> The experiment produced interesting results. The agents generated 3 million lines of code. Some developers were impressed while others were skeptical. The implications remain unclear.

### After (has a pulse):
> I genuinely don't know how to feel about this one. 3 million lines of code, generated while the humans presumably slept. Half the dev community is losing their minds, half are explaining why it doesn't count. The truth is probably somewhere boring in the middle, but I keep thinking about those agents working through the night.

A second pair, community-post register:

### Before (community post, soulless):
> The community has come together in a truly remarkable way, showcasing the power of collaboration and demonstrating that when people unite, incredible things can happen.

### After (community post, has a pulse):
> Sixty people showed up on a Tuesday night. Nobody expected that.

---

## Formatting and Rhythm Check

Quick pass after writing:

- **Em dashes** (— and --): replace with commas, periods, or parentheses. Target: zero.
- **Bold**: for scanning, not emphasis on every third phrase.
- **Emoji in headers**: remove entirely.
- **Excessive bullets**: if a list has 3+ items that flow naturally, convert to prose.
- Mix short sentences (3-8 words) with long ones (20+). Fragments are fine.
- Vary paragraph length. Some paragraphs are one sentence. Others need room.
- If text-to-speech could read it without pausing, it's too uniform.

---

## Patterns Writers Most Often Commit (with examples)

### 1. Undue Emphasis on Significance, Legacy, and Broader Trends

**Words to watch:** stands/serves as, is a testament/reminder, a vital/significant/crucial/pivotal/key role/moment, underscores/highlights its importance/significance, reflects broader, symbolizing its ongoing/enduring/lasting, contributing to the, setting the stage for, marking/shaping the, represents/marks a shift, key turning point, evolving landscape, focal point, indelible mark, deeply rooted

**Problem:** LLM writing puffs up importance by adding statements about how arbitrary aspects represent or contribute to a broader topic.

**Before:**
> The Statistical Institute of Catalonia was officially established in 1989, marking a pivotal moment in the evolution of regional statistics in Spain. This initiative was part of a broader movement across Spain to decentralize administrative functions and enhance regional governance.

**After:**
> The Statistical Institute of Catalonia was established in 1989 to collect and publish regional statistics independently from Spain's national statistics office.

### 9. Negative Parallelisms

**Problem:** Constructions like "Not only...but..." or "It's not just about..., it's..." are overused. AI also tends to write symmetrical slogans and balanced contrasts.

**Before:**
> It's not just about the beat riding under the vocals; it's part of the aggression and atmosphere. It's not merely a song, it's a statement.

**After:**
> The heavy beat adds to the aggressive tone.

### 22. Filler Phrases

**Before → After:**
- "In order to achieve this goal" → "To achieve this"
- "Due to the fact that it was raining" → "Because it was raining"
- "At this point in time" → "Now"
- "In the event that you need help" → "If you need help"
- "The system has the ability to process" → "The system can process"
- "It is important to note that the data shows" → "The data shows"

### 24. Generic Positive Conclusions

**Problem:** Vague upbeat endings. AI wraps up with a neat, unassailable conclusion. Real people just stop talking when they're done with the point at hand.

**Before:**
> The future looks bright for the company. Exciting times lie ahead as they continue their journey toward excellence. This represents a major step in the right direction.

**After:**
> The company plans to open two more locations next year.

### 35. Rhythm and Uniformity

**Problem:** AI text is metronomic: uniform sentence length (15-25 words), uniform paragraphs, symmetrical phrasing. Structure is the #1 AI detection signal.

**Before:**
> The platform processes data efficiently. The system handles requests reliably. The architecture scales horizontally. The team maintains quality consistently.

**After:**
> The platform chews through data. Requests? Handled. It scales sideways, and somehow the team hasn't lost their minds yet.

### 37. Therapy-Speak (Emotional Validation)

**Watch for:** your X is valid, your feelings are real, it's not your fault, you deserve to be seen, I see you, your feelings matter, it's okay to feel this way

**Problem:** RLHF-tuned models are trained to be highly empathetic and to avoid contradicting the user, so they pick up two therapist moves: validating the emotion ("your feelings are real") and absolving guilt ("it's not your fault"). Both treat a feeling as something that needs external certification, and the tone talks down instead of across. A real person reassures as a peer. They treat the feeling as ordinary ("of course you're anxious") instead of certifying it ("your anxiety is valid").

**Before:**
> Parents' anxiety is real and valid, and they shouldn't be blamed.

**After:**
> Of course parents get anxious.

**Transform tactics (change the move, not the synonym):**
- Validate → normalize: "your X is valid / real" becomes "of course you feel X" or "it's normal to feel X"
- Absolve → cut or get specific: "it's not your fault" usually just gets deleted, or becomes "anyone would react that way"
- Witness → state the fact: "I see how hard you're working" becomes "you've shown up three months straight"

**Examples:**

| Therapy-speak | What a friend says |
|---|---|
| your anxiety is valid | of course you're anxious |
| your feelings are completely valid | makes sense you'd feel that way |
| none of this is your fault | this really isn't on you |
| I see how hard you've worked | you've been at this every day |

**Test:** Say it to a friend out loud. A friend doesn't certify your emotion. They say "yeah, of course," "who wouldn't," "same here." If the sentence is stamping a feeling as "real" or "valid," it's therapy-speak.

**Distinguishing from #9 and #24:**

| | #9 Negative Parallelism | #24 Generic Positive Conclusions | #37 Therapy-Speak |
|---|---|---|---|
| Trigger | overt syntax markers ("not X, but Y") | upbeat sign-off (bright future, keep going) | validating or absolving emotion ("your X is valid," "not your fault") |
| Register | slogan symmetry | motivational close | therapist reassurance |
| Fix | one clause, just state Y | replace with a concrete fact | normalize the feeling, say it plainly |

### 38. Reframing as a Substitute for Reasoning

**Watch for:** on the surface... but at a deeper level, the real question/problem isn't X, it's Y, the key isn't X, it's Y, you think it's X, but it's actually Y, seemingly paradoxical, paradoxically, what looks like X is actually Y

**Problem:** When asked to write "with a point of view," AI falls into one shape: state a common view, negate or correct it, then present a higher-level take. Contrast should serve analysis. Here contrast becomes the engine that moves the piece forward. No new information, just tone escalation, and the negated X is often a strawman nobody holds. Real thinking distinguishes, qualifies, rebuts, and derives, instead of restating the same thing one level up.

**Before:**
> On the surface, this is an efficiency problem; at a deeper level, it's really a trust problem. The real key isn't the tooling, it's whether the team dares to hand over decisions.

**After:**
> After the deploy pipeline went from three days to half a day, overtime didn't drop, because every PR still waits for the manager's personal sign-off. The bottleneck is the manager not delegating review, not the tooling.

**Test:** Ask "what does Y say that X didn't?" If Y is just X restated one level up, or nobody actually holds X, delete the frame, state Y directly, and back it with a concrete example or causal chain. A contrast that lands after the reasoning is human. A contrast that replaces the reasoning is the tell. Legitimate contrasts stay: keep any distinction that gives a criterion, a qualifier, or can say exactly how the two sides differ.

**Density rule:** At most one of these frames per piece. Two or more means the piece is advancing on tone pivots. Go to #36 and rewrite.

**Distinguishing from #9 Negative Parallelisms:**

| | #9 Negative Parallelisms | #38 Reframing as a Substitute for Reasoning |
|---|---|---|
| Catches | form (symmetry, slogan feel) | reasoning (the contrast adds no new information) |
| Test | does it sound like a slogan? | what does Y say that X didn't? |
| Example | "It's not luck, it's skill" | "On the surface it's efficiency, deeper down it's trust" |
| Fix | one clause, just state Y | cut the frame, argue Y with examples and causation |

---

## Tier 1 — Always Replace

| Replace | With |
|---|---|
| delve / delve into | explore, dig into, look at |
| landscape (metaphor) | field, space, industry, world |
| tapestry | (describe the actual complexity) |
| realm | area, field, domain |
| paradigm | model, approach, framework |
| embark | start, begin |
| beacon | (rewrite entirely) |
| testament to | shows, proves, demonstrates |
| robust | strong, reliable, solid |
| comprehensive | thorough, complete, full |
| cutting-edge | latest, newest, advanced |
| leverage (verb) | use |
| pivotal | important, key, critical |
| underscores | shows, points to |
| meticulous / meticulously | careful, detailed, precise |
| seamless / seamlessly | smooth, easy, without friction |
| game-changer / game-changing | describe what specifically changed and why it matters |
| utilize | use |
| watershed moment | turning point, shift (or describe what changed) |
| marking a pivotal moment | (state what happened) |
| the future looks bright | (cut — say something specific or nothing) |
| only time will tell | (cut — say something specific or nothing) |
| nestled | is located, sits, is in |
| vibrant | (describe what makes it active, or cut) |
| thriving | growing, active (or cite a number) |
| despite challenges… continues to thrive | (name the challenge and the response, or cut) |
| showcase / showcasing | show, demonstrate (or cut the clause) |
| deep dive / dive into | look at, examine, explore |
| unpack / unpacking | explain, break down, walk through |
| bustling | busy, active (or cite what makes it busy) |
| intricate / intricacies | complex, detailed (or name the specific complexity) |
| complexities | (name the actual complexities, or use "problems" / "details") |
| ever-evolving | changing, growing (or describe how) |
| enduring | lasting, long-running (or cite how long) |
| daunting | hard, difficult, challenging |
| holistic / holistically | complete, full, whole (or describe what's included) |
| actionable | practical, useful, concrete |
| impactful | effective, significant (or describe the impact) |
| learnings | lessons, findings, takeaways |
| thought leader / thought leadership | expert, authority (or describe their actual contribution) |
| best practices | what works, proven methods, standard approach |
| at its core | (cut — just state the thing) |
| synergy / synergies | (describe the actual combined effect) |
| interplay | relationship, connection, interaction |
| additionally / moreover / furthermore | also, and, plus (or just start the sentence) |
| garner | get, earn, attract |
| in order to | to |
| due to the fact that | because |
| serves as | is |
| features (verb) | has, includes |
| boasts | has |
| presents (inflated) | is, shows, gives |
| commence | start, begin |
| ascertain | find out, determine, learn |
| endeavor | effort, attempt, try |
| keen (as intensifier) | interested, eager, enthusiastic (or cut) |
| symphony (metaphor) | (describe the actual coordination or combination) |
| embrace (metaphor) | adopt, accept, use, switch to |
| your X is valid / your feelings are real (about emotion) | of course you feel X, it's normal (tactic: see patterns #37) |
| it's not your fault / don't blame yourself | (cut, or "anyone would react that way") |
| you deserve to be seen / your feelings matter | (cut, or state what you actually see) |

---

## Appendix: one-line index of all patterns

Full definitions and before/after examples: `../patterns-en.md`.

- #1 Undue Emphasis on Significance, Legacy, and Broader Trends — don't promote routine events into milestones or broader trends; state what happened
- #2 Undue Emphasis on Notability and Media Coverage — don't stack media mentions to prove notability; cite one specific source and what it said
- #3 Superficial Analyses with -ing Endings — don't tack "-ing" phrases (symbolizing, reflecting...) onto sentences for fake depth
- #4 Promotional and Advertisement-like Language — no tourism-brochure prose; describe, don't sell
- #5 Vague Attributions and Weasel Words — "experts argue" means nothing; name the source or drop the claim
- #6 Outline-like "Challenges and Future Prospects" Sections — don't write formulaic "despite challenges... continues to thrive" sections; report specific events
- #7 Overused "AI Vocabulary" Words — swap high-frequency AI words (additionally, crucial, pivotal...); full table in word-table-en.md
- #8 Avoidance of "is"/"are" (Copula Avoidance) — prefer plain "is/has" over "serves as / boasts / features"
- #9 Negative Parallelisms — "it's not X, it's Y" is a crutch; usually just state Y
- #10 Rule of Three Overuse — don't force ideas into groups of three; two or four reads more natural
- #11 Elegant Variation (Synonym Cycling) — repeat the clear word instead of cycling synonyms
- #12 False Ranges — "from X to Y" needs a meaningful scale; otherwise just list the items
- #13 Em Dash Overuse — em dashes are an AI tell; target zero, use commas or periods
- #14 Overuse of Boldface — bold is for scanning, not for emphasizing every third phrase
- #15 Inline-Header Vertical Lists — don't write "**Header:** explanation" bullet lists; fold into prose
- #16 Title Case in Headings — use sentence case in headings, not Title Case
- #17 Emojis — don't decorate headings or bullets with emojis
- #18 Curly Quotation Marks — use straight quotes, not curly quotes
- #19 Collaborative Communication Artifacts — "I hope this helps!" is chatbot correspondence, not content; delete
- #20 Knowledge-Cutoff Disclaimers — delete cutoff disclaimers ("as of my last update"); state the fact
- #21 Sycophantic/Servile Tone — cut sycophantic openers ("Great question! You're absolutely right")
- #22 Filler Phrases — openers, announcements, and restatements are filler; if cutting it changes nothing, cut it
- #23 Excessive Hedging — don't stack qualifiers ("could potentially possibly"); keep one
- #24 Generic Positive Conclusions — don't wrap up with a neat upbeat conclusion; stop when the point is made
- #25 Novelty Inflation — don't present established concepts as brand-new discoveries
- #26 Emotional Flatline — don't claim emotions ("what surprised me most"); convey them with concrete facts
- #27 False Concession — "while X is impressive, Y remains a challenge" weighs nothing; give specifics
- #28 Rhetorical Question Openers — don't stall with rhetorical questions; lead with the point
- #29 Parenthetical Hedging — parenthetical asides "(and, increasingly, Z)" are fake nuance; cut or inline
- #30 Numbered List Inflation — don't default to "N reasons why" lists; tell one or two concrete things
- #31 Reasoning Chain Artifacts — "let me break this down" is reasoning scaffolding; keep it out of prose
- #32 Acknowledgment Loops — don't restate the question before answering; just answer
- #33 "Let's" Constructions — "let's explore..." is a false-collaborative opener; start with the point
- #34 Excessive Structure — don't pack short text with headers; 3+ under 300 words is too many
- #35 Rhythm and Uniformity — uniform sentence and paragraph length is the #1 AI signal; break the meter
- #36 Rewrite-vs-Patch Threshold — 5+ word flags, 3+ pattern categories, uniform rhythm → rewrite, don't patch
- #37 Therapy-Speak (Emotional Validation) — don't certify feelings ("your anxiety is valid" → "of course you're anxious"); cut absolving lines
- #38 Reframing as a Substitute for Reasoning — "on the surface X, deeper down Y" / "the real problem is" fakes insight through tone escalation; cut the frame, add the reasoning
