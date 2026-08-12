Last updated: 2026-04

# Algorithm & Reach

X open-sourced its full For You feed recommendation system in January 2026 under
the `xai-org/x-algorithm` GitHub repo (updated every ~4 weeks). The system,
codename **Phoenix**, powers the entire pipeline and combines real-time
in-network sourcing (**Thunder**) with ML-based out-of-network discovery. The
core is a ~48M parameter Grok-based transformer that predicts 15+ engagement
probabilities per candidate post.

The platform executes approximately **5 billion individual ranking decisions
per day**. The pipeline is built on a custom Scala framework called **Product
Mixer**, which triggers a sub-service called **Home Mixer** for each session.
The entire computational sequence consumes ~220 CPU-seconds but is delivered
to the user in under 1.5 seconds.

Sources: Open-source code is marked **(Official)**. Third-party studies (Buffer
2026, TweetArchivist, Sprout Social, Rival IQ) are noted. Practitioner
consensus without hard public numbers is marked **(Practitioner)**.

---

## How X Distributes Content

### The Phoenix Pipeline (retrieval → ranking)

**Stage 1: Candidate Sourcing** (~500M posts → ~1,500 candidates in <50ms)

- **Thunder (In-Network, ~50% of candidates):** Real-time index of recent posts
  from accounts you follow. **(Official)**
- **Phoenix Retrieval (Out-of-Network, ~50%):** Two-tower embedding model. One
  tower encodes your interests/behavior (follows, likes, replies, profile
  visits, search history); the other encodes candidate posts. Uses approximate
  nearest-neighbor (ANN) search for fast similarity lookup. **(Official)**

**Community Detection:** The candidate retrieval system uses SimClusters and graph embeddings to map users into behavioral communities. The more consistently you post within a single topic domain, the stronger your embedding becomes in that cluster — making it easier for the algorithm to match your content with interested non-followers. This is why niche consistency is a computational necessity, not just a branding choice.

**Stage 2: Pre-ranking filters** — remove spam, duplicates, blocked/muted
authors, negative signals. **(Official)**

**Stage 3: Phoenix Ranking** — the ~48M parameter Grok transformer predicts
15+ engagement probabilities per candidate (like, reply, retweet, quote,
bookmark, profile click, dwell time, video view, follow-after-view, etc.).
These predictions combine into a single weighted score. A "mixing board" of
heuristics (recency, diversity, author reputation) adjusts the final ranking.
**(Official)**

**Stage 4: Visibility filtering + diversity tuning** → final feed (top
~100–200 posts per load). Total latency <200ms p99. **(Official)**

### For You vs Following

- **For You** — algorithmically ranked. ~50% in-network + ~50% out-of-network.
  Most impressions come from here. Growing accounts must optimize for this feed.
- **Following** — Historically reverse-chronological, but 2026 reports indicate
  X now applies AI-based ranking by predicted engagement even in the Following
  tab (with a user toggle to revert to chronological). Reach remains limited
  to existing followers either way. **(Disputed — monitor for changes.)**

### Non-follower distribution

Purely via Phoenix two-tower retrieval: your user embedding is matched against
global post embeddings. Strong early engagement velocity pushes the post into
more retrieval pools. There is no manual "boost" — purely similarity +
predicted engagement. **(Official, high confidence)**

---

## Key Algorithm Signals

The Phoenix transformer predicts and weights multiple actions. Approximate
relative weights from 2026 code analyses (exact weights are learned, not
hardcoded):

| Signal | Weight (vs Like = 1×) | Confidence | Notes |
|--------|----------------------|------------|-------|
| **Replies** (esp. reply chains) | 13.5–75× | Official | Highest signal. Sparks session depth. Author-engaged replies strongest. |
| **Profile clicks** | ~12× | Official | Strong interest in author — drives follow-after-view. |
| **Bookmarks** | ~10× | Official | "Silent like" + utility signal. Keeps users on platform. |
| **Retweets / Reposts** | 1–20× | Official | Distribution signal. Quote tweets add extra value. |
| **Follow-after-view** | Very high | Official | One of the strongest positive signals in the model. |
| **Dwell time / session depth** | Moderate–high | Official | Time spent reading + back-and-forth threads heavily rewarded. |
| **Engagement velocity** (first 15–60 min) | Very high | Official + studies | 10 replies in first 15 min >> 10 likes over hours. Determines out-of-network spread. |
| **Follower interaction history** | High | Official | Past likes/replies with the author boost the score. |
| **Embedding / topic match** | Core retrieval | Official | Two-tower model — no manual features, purely learned. |

**Negative signals** are extremely punitive: block, mute, report, "not
interested" carry –50 to –1,500 reach units. **(Official)**

**Key insight:** Likes are the weakest positive signal. Replies are 13.5–75×
more valuable. Shift your goal from "get likes" to "start conversations."

---

## What Gets Suppressed

### External Links

Since March 2026, the platform-leakage penalty is severe:

- **Non-Premium accounts** with links in main tweet: **near-zero median
  engagement** (effectively invisible in For You). **(2026 studies, high
  confidence)**
- **Premium accounts** with links: ~0.25–0.3% engagement (still heavily
  reduced). **(2026 studies, high confidence)**
- **High-authority links** (verified journalism/academia) receive lighter
  penalties. **(Practitioner, medium confidence)**

**Workarounds:**
1. Post compelling native content + link in self-reply **(confirmed effective
   2026)**
2. Publish without link, edit hours later to add it
3. Use Premium long-form Articles (no link penalty — it's native content)

### Engagement Bait

Pattern-matched and suppressed: "Like if you agree," "RT if you disagree,"
rage bait, generic "what do you think?" Low-quality patterns trigger heavy
down-ranking. **(Official heuristics)**

### Spam Patterns

- Duplicate content, >2 hashtags, excessive keywords
- Repetitive posting patterns from same account
- Commonly muted terms filtered for large audience segments
- Rapid mass-follow/like/DM actions trigger temporary visibility throttling
  (exact daily rate limits not public)
- AI-generated spam patterns increasingly detected

**(Official heuristics + 2026 analyses, high confidence)**

---

## Premium / Blue Subscriber Advantages

| Benefit | Magnitude | Source |
|---------|-----------|--------|
| Overall visibility boost | 2–4× (in-network ~4×, out-of-network ~2×) | Official open-source notes |
| Reply boost in threads | 30–40% higher impressions in active conversations | 2026 analyses |
| Premium+ reply boost | ~2× the standard Premium boost | 2026 analyses |
| Link penalty reduction | Far less harsh than non-Premium (but still reduced) | 2026 studies |
| Long-form Articles | Up to 25K–100K chars, no link penalty (native content) | Official |
| Verification badge | Trust/credibility signal in ranking | Official |
| Edit functionality | Useful for link-timing workaround | Official |
| Formatting (bold, italic) | Better readability, higher dwell time | Official |

Some 2026 analyses report 4–10× effective reach for verified accounts in
practice. Premium is near-essential for serious growth. **(High confidence)**

---

## Optimal Posting Patterns

### Frequency

- **Sweet spot:** 1–3 posts/day for most accounts. **(Buffer 2026, Rival IQ)**
- **Active accounts:** up to 3–5/day — increases surface area if quality holds.
- **Minimum for growth:** 3–5×/week.
- **Diminishing returns:** >5–10/day may cause self-competition.
- **No direct penalty** for volume if engagement holds — but quality drop kills reach.

### Timing

Recency is a core ranking signal. Best windows (local time):

| Window | Why |
|--------|-----|
| Tue–Thu, 12–6 PM | Peak activity, highest baseline audience |
| Mon 2–3 PM & 5 PM | Strong weekday slots |
| Midday / commute hours | Mobile usage peaks |

Early engagement in the first hour matters more than exact posting time.
**(Buffer 2026, Hootsuite, EverywhereMarketer — medium-high confidence)**

### The First-Hour Rule

Post → spend 30 minutes actively replying to every comment. This:
1. Keeps engagement velocity high (strongest distribution signal)
2. Signals "active conversation" to the algorithm
3. Extends the distribution window

### Format Preferences

Ranked by 2026 data:

| Format | Reach/Engagement | Notes | Source |
|--------|-----------------|-------|--------|
| **Text-only** | Highest median engagement (+30% vs video, +37% vs images) | Platform rewards conversation over visuals | Buffer 2026 |
| **Threads** | 3–5× total engagement, +63% impressions vs single tweets | Extended session-depth signal. 8–15 posts optimal. | TweetArchivist + Buffer |
| **Native video (<60s)** | 10× vs external links; strong but text edges median | Captions essential (most scroll muted) | Buffer 2026 |
| **Images / carousels** | +150% retweets vs text in some datasets | Carousels encourage swiping (dwell time) | Buffer 2026 |
| **Polls** | High interaction velocity | Excellent early signal generator | Practitioner |
| **Long-form Articles** | Rewarded as native content (no link penalty) | Premium-only | Official |
| **External link posts** | Heavily penalized (see §3) | Avoid in main tweet | 2026 studies |

**Surprise finding:** Text-only posts outperform video and images in median
engagement (Buffer 2026). The algorithm rewards conversation starters over
visual spectacles.

---

## Disputed / Evolving Signals

| Signal | 2026 Status | Confidence |
|--------|-------------|------------|
| **Hashtags** | 1–2 max optimal (+21% engagement). >2–3 signals spam → reach drop. Zero is fine for quality posts. | Data-backed, high |
| **"Link in first comment"** | Explicitly effective against main-tweet link penalty. Widely documented 2026. | Practitioner + analyses, high |
| **Alt text on images** | Minor accessibility/SEO signal. Not a major ranking factor in open-source code. | Official, medium |
| **Thread vs single tweet** | Threads strongly outperform (3–5× engagement). | Data-backed, high |
| **Quote tweets vs retweets** | Quotes superior — add commentary, spawn new engagement trees. Plain retweets lower-weighted. | Official weighting, high |
| **Small account advantage** | Algorithm favors engagement rate over raw follower count. Large passive accounts get throttled. | 2026 analyses, high |
| **Irregular posting** | Indirectly penalized — algorithm favors predictable active accounts via recency + consistency in user embeddings. | Practitioner, medium |

---

## Source Notes

- **Official open-source**: `xai-org/x-algorithm` GitHub repo (Jan 2026 release
  + subsequent updates). Very high confidence.
- **2026 third-party studies**: Buffer, TweetArchivist, Sprout Social, Rival IQ,
  Hootsuite, EverywhereMarketer. High confidence (large datasets, reproducible).
- **Practitioner consensus**: Aggregated from growth practitioners without hard
  public datasets. Medium confidence — useful directionally but verify with
  your own analytics.
- **NDSS 2026 paper**: Academic study using view counts to analyze millions of posts. Confirmed systematic visibility penalty for posts containing external links, with severity varying by account type (non-Premium accounts affected more severely). High confidence.
- Algorithm evolves weekly; monitor the repo and @X announcements for changes.
