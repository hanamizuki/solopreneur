# Protected List — What a Rewrite May Never Touch

> **Role**: single source of truth for fidelity. The biggest risk in de-AI-ing
> a text is not leaving AI smell behind — it is rewriting a fact into a lie.
> **Read by rewrite / review mode, in every language.** Deliberately shared
> (like `context-profiles.md`): the categories are language-neutral, only the
> output markers differ per language.
> **Adding a protected category or a false-positive case → edit this file only.**

Lock these before the first pass. Verify them again after the last one.

---

## Priority Order

When rules conflict, the higher line wins:

1. **Factual accuracy** — the protected list below
2. **Information completeness** — every fact, number, judgment and action in the source survives
3. **No AI patterns** — the pattern catalog
4. **Voice** — personality and soul

Voice ranks last on purpose. A sentence with a point of view that breaks a fact
is worse than a boring sentence that is correct.

---

## The Five Protected Categories

### 1. Prices and numbers

Pricing, discount codes, percentages, seat counts, dates, deadlines, statistics,
performance figures.

- `早鳥價 4,800 元、折扣碼 EARLY500、只到 3/31` survives verbatim
- Precision may not drift in either direction: `約 42%` does not become
  `超過四成`, and `over 40%` does not become `42%`
- **Never add a number the source does not have.** Being concrete comes from
  facts the author supplied, never from invention

### 2. Proper nouns

Course names, brand names, product names, event names, feature names.

- Exempt from the synonym-cycling rule (patterns zh#11 / en#11). A course named
  《超級個體工作術》 stays 《超級個體工作術》 on its second mention — it does not
  become 「這門課程」. An author's established short form is fine
- Mainland Chinese platform and product names stay as written (小紅書、公眾號、
  嗶哩嗶哩). They are proper nouns, not vocabulary to localize

### 3. URLs and link text

CTA links, signup links, citation links, anchor text.

- The link and its anchor text survive
- One exception, in the other direction: **AI tool parameters get stripped**
  (`utm_source=chatgpt.com`, `utm_source=openai`, `referrer=grok.com`). Those are
  tool residue, not content — see patterns zh#48 / en#40. The author's own
  marketing parameters (`utm_source=newsletter`) are protected

### 4. Real names and anything inside quotation marks

Testimonials, interviews, customer stories, transcripts.

- Real names never blur into 「這位學員」 / "one participant"
- **Quoted speech is verbatim** — including the AI-ish phrasing, mainland
  vocabulary, or half-width punctuation inside it. The value of a quote is that
  it is what the person actually said
- Obvious typos inside a quote get flagged for the author, not fixed

### 5. Commitments

Refund policies, warranties, disclaimers, scope-of-service statements, legal and
compliance wording.

- Only the sentences *around* them may be re-toned; the meaning may not move
- Quantifiers and conditions do not drift: `14 天內`, `全額`, `不需要任何理由`
- Boilerplate that exists for accuracy (`依發卡銀行作業為準`) is not canned AI
  tone. It is a liability boundary

---

## Never Invent

Three things a rewrite is never allowed to manufacture. All three are worse than
the slop they would replace.

| Gap in the source | Wrong fix | Right fix |
|---|---|---|
| A vague claim needs a concrete fact | Make up a plausible number | Placeholder marker (below) |
| A claim needs a source | Attach a real-sounding citation | `[source unverified]` marker |
| A flat passage needs a point of view or a story | Write the author a memory ("I used to think X, then I learned…") | Placeholder marker |

**Voice belongs to the author, not to you.** The personality-and-soul chapter of
the pattern files lists *directions*, not *material*. An invented "I was wrong
about this for two years" is far worse than the empty sentence it replaced —
empty is merely boring; invented is a lie in the author's name.

### Output markers

Use the target language's marker, in place, and keep going:

| | 中文 | English |
|---|---|---|
| Fact the author must supply | `（需作者補充：具體教什麼／來了多少人）` | `(needs author input: which feature, how many users)` |
| Citation that must be checked | `〔需查證來源〕` before the original sentence, which stays verbatim | `[source unverified]` before the original sentence, which stays verbatim |

A rewrite that comes back mostly placeholders is **not a failure**. It is the
correct result for a draft that was all air: the ball goes back to the author.

---

## Likely False Positives

The rule fires, the judgment is wrong, the text gets worse. Let these through.

| Looks like | Actually is | How to tell |
|---|---|---|
| Rule of three | Real contrast carrying real content | Is there a concrete fact under each item? Then keep it |
| Vague attribution | A sourced claim | 「根據我們後台的數據」 has a source. Keep it |
| "Not X, but Y" | The one genuine pivot in the piece | The rule is *at most once*, not zero |
| Canned support tone | Required payment / legal boilerplate | Anything touching money, law or liability stays |
| Repeated sentence shape | Deliberate rhythm in long-form | Is the repetition advancing the narrative? Then it is design |
| AI vocabulary | The word being discussed, not used | 「我戒掉了『賦能』這個詞」 is a mention. Do not touch |
| Stiff officialese | The correct register for a notice | A maintenance announcement is supposed to sound formal |
| Vague 「優化」 | Attached to a concrete action and metric | If it is followed by what changed and by how much, keep it |
| Promotional urgency | A working CTA | Deadlines, seat counts and imperatives are function, not slop (see the sales-page profile). Make them *more* concrete, never weaker |
| Colloquial fragments, unfinished sentences | The human texture you are trying to preserve | Do not touch a word |
| A colon introducing quoted speech (他說：「⋯⋯」 / She said: "…") | Required syntax | The banned colon is the *announcement* colon (「重點是：」, "Here's the thing:"). Introducing a quotation is not that — and a colon inside a protected quote is doubly untouchable |

The general test when unsure: **what does the reader know less about after this
edit?** If they lose any fact, position or emotion, it was not filler. If they
lose nothing, it was.

---

## Fidelity Read-Back

Run after the second-pass audit, before output. Not optional, and not waived by
any automation mode.

1. List what you locked before starting: N prices, N proper nouns, N links,
   N names/quotes, N commitments
2. Search the rewritten text for each one. Confirm it is present and verbatim
3. Confirm no fact, number or source appears that was not in the source text
4. Confirm the author's position did not flip or soften (「我反對」 may not become
   「我持保留態度」)
5. Confirm the register held (a notice still reads as a notice, a post as a post)

Any check fails → fix it. Do not ship.

---

Source: adapted from [speak-human-tw](https://github.com/Raymondhou0917/speak-human-tw)
(MIT License) — protected list, false-positive table, and the "voice belongs to
the author" boundary.
