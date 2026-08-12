# Tools & Tracking Guide

> Last updated: 2026-04

## KPI Framework: Funnel-Based Metrics

Don't just track likes. Structure your metrics as a funnel that maps to
LinkedIn's ranking signals:

### Engagement Rate Denominator Warning

Different reports use different denominators, causing wildly different numbers:
- Socialinsider (2026, 1.3M posts, **by impressions**): ~5.20% overall, ~7% for documents
- Hootsuite (2025, **per post / by followers**): ~2-4% across industries, ~3.4% average

Neither is "wrong" — they measure different things. When citing benchmarks
in plans or reports, always specify the denominator. Don't compare a 5.2%
(by impressions) with a 3.4% (by followers) as if they're the same metric.

### Layer 1: Exposure Metrics
- **Impressions per post** (median, P75, P90 — avoid being misled by outliers)
- **Profile appearances** (how often your name shows up in search, feeds, comments)
- **Search appearances** (how often you appear in LinkedIn search results)

### Layer 2: Engagement Metrics
- **Comment rate** = comments / impressions (most important engagement metric)
- **Deep comment rate** = comments >20 words / total comments
- **Save rate** (if visible in your analytics)
- **Repost rate** = reposts / impressions
- **"See more" click rate** (proxy for dwell time — tracks hook effectiveness)
- **Document page-through rate** (for carousels)
- **Video average watch %** (for video content)

### Layer 3: Conversion Metrics
- **Profile views / profile appearances** (conversion from exposure to interest)
- **New followers per week**
- **Newsletter subscribers** (growth rate + per-edition engagement)
- **DM conversations started** (inbound)
- **CTA clicks** (custom button, if Premium)
- **Event registrations and attendance**

### Goal-Specific KPIs

| Goal | Primary KPI | Secondary KPIs |
|------|-------------|----------------|
| Lead generation | Inbound DMs / month | Profile views, CTA clicks, newsletter subscribers |
| Personal brand | Followers growth rate | Impressions, comment rate, search appearances |
| Job search | Recruiter profile views | Search appearances, InMail received |
| Recruiting | Application clicks | Job post views, company page followers |
| Community | Comment depth + frequency | Event attendance, newsletter open rate |

## Dashboard Setup

Build a simple tracking dashboard. Don't over-engineer — a Google Sheet
works perfectly. Update weekly (Sunday or Monday).

### Recommended Columns

| Column | Source | Why |
|--------|--------|-----|
| Week # | Manual | Track trends over time |
| Posts published | Count | Ensure consistency |
| Total impressions | LinkedIn Analytics | Volume metric |
| Median impressions/post | Calculate | More reliable than average |
| Total comments | LinkedIn Analytics | Engagement quality |
| Comment rate | Calculate | Normalize for reach |
| Profile views | LinkedIn Analytics | Interest signal |
| New followers | LinkedIn Analytics | Growth metric |
| Top post link | Manual | Build your swipe file |
| Top post format | Manual | Find winning patterns |
| Top post hook type | Manual | Refine hook strategy |
| Comments left on others | Manual | Track engagement effort |
| Connections sent | Manual | Track outreach effort |

### Monthly Review Process

Every 4 weeks, do a deeper analysis:

1. **Top 10 posts**: What do they have in common? (format, topic, hook style,
   posting time, day of week)
2. **Bottom 5 posts**: What went wrong? (weak hook, off-topic, wrong format,
   bad timing)
3. **Engagement patterns**: Which days/times get the most comments? Which
   audience segment engages most?
4. **Content pillar performance**: Which pillar drives the most engagement?
   Which drives the most profile views? These might be different pillars.
5. **A/B test results**: Review any tests you ran (hook styles, formats,
   posting times) and draw conclusions.

Save the top 10 posts as a "Swipe File" — you'll reference these when
planning next month's content.

## A/B Testing Framework

### What to Test (Priority Order)

1. **Hook type**: Story vs. data vs. contrarian vs. question
   - KPI: "See more" click rate, comment rate
   - Duration: 4 posts each style (2 weeks)

2. **Content format**: Text vs. carousel vs. video vs. poll
   - KPI: Impressions, dwell proxy (comments/saves), profile views
   - Duration: 2 of each format per week (4 weeks)

3. **Posting time**: Morning vs. afternoon vs. evening
   - KPI: First-hour engagement, total impressions at 24h
   - Duration: 2 weeks per time slot

4. **CTA style**: Question vs. save prompt vs. DM invitation vs. no CTA
   - KPI: Comment rate, DM rate, save rate
   - Duration: 3 posts each (3 weeks)

5. **Link strategy**: No link vs. link in comment vs. DM for link
   - KPI: Impressions (does the link penalty apply?), click-through
   - Duration: 2 weeks

### How to Run Clean Tests

- Change only one variable at a time
- Keep topic/pillar consistent within the test
- Run each variant at least 3 times before concluding
- Account for day-of-week effects (compare same-day results)
- Log everything in your dashboard

## Recommended Tools

### Free
- **LinkedIn Analytics** (built-in): Impressions, engagement rate, demographics,
  profile views, search appearances
- **Google Sheets**: Dashboard and swipe file tracking
- **Canva** (free tier): Banner, carousel/document design
- **LinkedIn native scheduler**: Queue posts in advance

### Paid (Optional)

| Tool | What it does | Best for | Price range |
|------|-------------|----------|-------------|
| **Taplio** | Content scheduling, analytics, engagement tracking | Serious creators wanting detailed analytics | $$ |
| **Shield** | Deep analytics: dwell time estimates, post performance over time | Data-driven creators | $$ |
| **HeyReach** | LinkedIn outreach analytics and campaign tracking (note: some automation features may violate LinkedIn ToS — use analytics features only, avoid automated actions) | Sales teams | $$$ |
| **Sales Navigator** | Advanced search, lead lists, InMail | B2B lead generation | $$$ |
| **Canva Pro** | Advanced design, brand kit, templates | Frequent carousel creators | $ |

### Using AI Tools for Content

AI (like Claude) is great for:
- Analyzing your top-performing posts for patterns
- Brainstorming content ideas and angles
- Drafting initial versions that you then personalize
- Rephrasing for different audiences or formats
- Creating carousel outline structures

AI should NOT:
- Write your final posts directly (the algorithm and your audience can tell)
- Replace your authentic voice and personal experiences
- Generate generic "thought leadership" content
- Automate your commenting (violates ToS and is detectable)

**Best practice**: Use AI as a brainstorming partner and first-draft tool,
then rewrite in your own voice with specific personal details, opinions,
and experiences that only you can provide.

## Compliance & Risk Notes

- Any tool that automates actions on LinkedIn (auto-commenting, auto-connecting,
  auto-messaging, scraping) violates LinkedIn's Terms of Service
- LinkedIn can and does restrict accounts that use these tools
- The risk is not worth it — your entire content archive, followers, and
  network can be wiped
- "Growth hacking" tools that seem too good to be true usually are
- Stick to tools that help you create better content and analyze your
  performance, not tools that automate platform behavior
