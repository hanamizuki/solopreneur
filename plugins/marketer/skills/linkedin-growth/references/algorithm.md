# LinkedIn Algorithm Mechanics

> Last updated: 2026-04

This document explains how LinkedIn's feed ranking works, based on LinkedIn
Engineering papers, official sources, and practitioner research. Understanding
these mechanics helps explain *why* certain tactics work.

## System Architecture: Two-Stage Funnel

LinkedIn's feed is a **retrieval → ranking** pipeline:

1. **Retrieval (Stage 1)**: Multiple candidate sources pull potential content:
   - FollowFeed: content from your connections and followed accounts
   - OON (Out-of-Network): recommended content from outside your network
   - Trending, collaborative filtering, embedding-based retrieval
2. **Ranking (Stage 2)**: Candidates are scored using multi-objective
   optimization (MOO) that balances viewer utility, creator feedback,
   and downstream network effects.

The ranking is NOT a single score — it simultaneously optimizes for:
- **Passive consumption** (dwell time, clicks, "see more" expansions)
- **Active contribution** (comments, reshares, saves)
- **Downstream impact** (does this content spark further conversations?)
- **Creator utility** (does the creator get timely, meaningful feedback?)

Source: LinkedIn Engineering blog posts on feed ranking (2024), MOO framework.

## Core Signal 1: Dwell Time & Skip Probability

Dwell time is one of the most important ranking signals. LinkedIn models both
directions:

- **Short dwell (< threshold)** = marked as "skipped" → P(skip) becomes a
  **negative signal** in the ranking function. Content that makes people scroll
  away quickly gets actively suppressed.
- **Long dwell** = positive signal, especially important because most users are
  passive readers who rarely like/comment but do spend time reading.

**What this means for creators:**
- Clickbait or dwell-bait (artificially delaying the payoff) gets penalized.
  The system specifically targets this.
- Genuine depth — content that rewards reading — gets boosted.
- Formats that naturally extend reading time (document carousels, structured
  long-form posts) have a structural advantage, but only if the content is
  actually worth reading.

"Depth Score" is a practitioner term for the composite of dwell time signals,
"see more" click rate, and saves. LinkedIn doesn't publish this exact term,
but these signals are confirmed in engineering papers.

## Core Signal 2: Contribution & Conversation Quality

The system values **professional conversation** over reaction counts:

- FollowFeed's candidate generation already considers "contribution probability"
  — content likely to generate meaningful comments gets retrieved more.
- The MOO framework weighs rare-but-valuable behaviors (comments, reshares)
  higher than common ones (likes) to prevent high-frequency signals from
  drowning out what matters.
- Comments create a secondary distribution loop: your comment is visible to
  commenters' networks, increasing your profile appearances.

**What this means:**
- Likes are vanity metrics. The algorithm cares about **saves, comments
  (especially 15+ words with substance), reshares, and DM shares**.
- Designing content that invites genuine responses (trade-off questions,
  frameworks to debate, requests for counter-examples) directly aligns with
  ranking objectives.
- Replying to comments on your own posts within the first 60 minutes signals
  active conversation and extends the content's ranking window.

## Core Signal 3: Semantic Understanding & Embedding Retrieval

LinkedIn is moving toward **unified embedding-based retrieval** using LLMs:

- The system generates embeddings from: post text, format, author info
  (headline, company, industry), engagement metrics, freshness, and affinity.
- Numerical signals are bucketed/percentile-encoded so the model can
  interpret them alongside text.
- A dedicated "Post Embeddings" model serves feed ranking, retrieval, and
  out-of-network recommendations.
- This means the system understands your **topic semantically**, not just
  through hashtags. Consistent, clear professional language in your posts
  and profile teaches the system who you are and who to show you to.

**"Topic DNA" / Interest-Based Distribution:**
The system identifies your topical signature from your content + interactions.
When you consistently produce high-quality content in a specific domain, the
system proactively distributes your posts to non-followers interested in that
topic. This is how "going niche" actually works mechanically — the embedding
space clusters you with relevant audiences.

## Core Signal 4: Sequence Ranking & Interaction History

LinkedIn uses **transformer-based sequence models** that treat your entire
interaction history as a signal:

- Who you comment on, what you read, what you skip — all form a behavioral
  "career journey" that the model uses for personalized ranking.
- This means sporadic, inconsistent posting is algorithmically expensive:
  the system needs stable, clean signals to learn your topic distribution.
- A consistent weekly rhythm of posting + engaging trains the model more
  effectively than burst-and-disappear patterns.

Online A/B tests show: time spent +2.10% with transformer-based sequence
ranking vs. previous models. Small percentages at LinkedIn's scale represent
massive impact.

## The Golden 60 Minutes

After publishing, the system shows your post to a small test group (roughly
2-5% of your audience). Their behavior in this window determines whether the
post gets broader distribution:

- If the test group dwells, comments, and saves → wider distribution
- If they skip → the post gets buried
- **Creator behavior matters**: replying to every comment in this window
  signals active conversation and can extend the distribution cycle.

## Algorithm Penalties & Red Flags

Things the algorithm actively suppresses:

1. **External links in post body**: significant reach reduction.
   > **DISPUTED (2026-04)**: Exact penalty magnitude
   > - Grok/Gemini research (2026-04): ~60% reach drop
   > - GPT deep research (2026-04): ~40% initial reach penalty
   > - **Current stance**: Expect 40-60% reduction. Direction is clear
   >   even if exact number varies. Avoid links in post body regardless.
2. **AI-generated generic content**: the 360Brew system (reportedly 150B
   parameter AI) can detect template-heavy, personality-free AI text and
   reduces its distribution.
3. **Engagement pods / artificial reciprocity**: LinkedIn's Professional
   Community Policies explicitly prohibit coordinated engagement schemes.
   Accounts caught face restrictions or bans.
4. **Automation / scraping**: officially prohibited. Any tool that automates
   posting, commenting, connecting, or scraping data violates ToS.
5. **Broad-but-shallow content**: posts designed for mass appeal without
   depth get penalized vs. niche-specific valuable content.

## Disputed / Evolving Signals

These are areas where sources disagree or the situation is changing:

- **Link in first comment**: Previously a common workaround for the external
  link penalty. As of 2026, some sources report this is now being detected
  and partially penalized. Treat as **uncertain** — test on your own account.
- **Hashtags**: LinkedIn removed profile-level topic hashtags in 2024.
  Post hashtags still exist but their retrieval impact is unclear and likely
  declining as embedding-based retrieval takes over. Use 0-3 as lightweight
  categorization, don't rely on them for growth.
- **Posting time**: Research differs (Sprout Social favors midday Tue-Thu,
  Buffer says evenings are trending, Hootsuite says early morning). The real
  answer: use these as priors, then A/B test with your own audience.
