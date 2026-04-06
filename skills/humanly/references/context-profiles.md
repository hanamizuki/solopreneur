# Context Profiles

Pass an optional context hint to adjust rule strictness. If none specified, auto-detect from content cues.

## Profile Definitions

| Profile | Description |
|---------|-------------|
| `blog` | Default. Standard long-form prose. All rules at full strength. |
| `social` | Short-form social (Threads, X, LinkedIn). Punchy fragments, visual formatting matter. |
| `social-zh` | Taiwan social media. All `social` rules + strict zh-specific rules (dashes fully banned, no formulaic openings, no echo openers). |
| `technical-blog` | Long-form with code, architecture, APIs. Technical terms get a pass. |
| `investor-email` | High-trust audience. Tighten everything; promotional language is the biggest risk. |
| `docs` | Documentation, READMEs, guides. Clarity over voice. |
| `support-email` | Customer support replies. Sycophantic tone detection high; hedging relaxed. |
| `casual` | Slack messages, internal notes, quick replies. Only catch P0 offenders. |

## Tolerance Matrix

Rules not listed apply at full strength across all profiles.

| Rule | social | social-zh | blog | technical-blog | investor-email | docs | support-email | casual |
|------|--------|-----------|------|----------------|----------------|------|---------------|--------|
| Em dashes | relaxed (2/post) | **strict (zero)** | strict | strict | strict | relaxed | strict | skip |
| Semicolons / colons | relaxed | **strict (zero)** | strict | strict | strict | relaxed | relaxed | skip |
| Bold overuse | relaxed | relaxed | strict | strict | strict | relaxed | skip | skip |
| Emoji in headers | relaxed (1-2 OK) | relaxed (1-2 OK) | strict | strict | strict | skip | skip | skip |
| Excessive bullets | skip | skip | strict | relaxed | strict | skip | skip | skip |
| Hedging | strict | strict | strict | relaxed | strict | relaxed | relaxed | skip |
| Word table | strict | strict | strict | partial* | strict | relaxed | relaxed | P0 only |
| Promotional language | relaxed | strict | strict | strict | **extra strict** | strict | strict | skip |
| Significance inflation | strict | strict | strict | strict | **extra strict** | relaxed | strict | skip |
| Copula avoidance | skip | strict | strict | relaxed | strict | skip | skip | skip |
| Uniform paragraph length | skip | skip | strict | strict | strict | relaxed | skip | skip |
| Rhetorical questions | relaxed (1 hook) | strict | strict | strict | strict | strict | skip | skip |
| Transition phrases | skip | strict | strict | strict | strict | relaxed | relaxed | skip |
| Generic conclusions | skip | strict | strict | strict | **extra strict** | skip | skip | skip |
| Echo openers | relaxed | **strict (zero)** | strict | strict | strict | skip | strict | skip |
| Formulaic openings | relaxed | **strict (zero)** | strict | strict | strict | relaxed | strict | skip |

*Technical-blog word table exceptions: `robust`, `comprehensive`, `seamless`, `ecosystem`, `leverage` (platform APIs), `facilitate`, `underpin`, `streamline` are legitimate in technical context. Still flag: `delve`, `tapestry`, `beacon`, `embark`, `testament to`, `game-changer`, `harness`.

**Extra strict** = flag even borderline instances.
**Skip** = don't audit this category for this profile.

## Auto-detection Cues

| Signal | Profile |
|--------|---------|
| Under 300 words + hashtags or mentions | `social` |
| Under 300 words + 中文 + hashtags | `social-zh` |
| Code blocks, API references, technical architecture | `technical-blog` |
| Salutation + investor/fundraising language | `investor-email` |
| Step-by-step instructions, parameter docs, README | `docs` |
| Salutation + customer service context | `support-email` |
| No strong signals | `blog` (safest default) |

---

Source: Adapted from [avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing) v3.3.0 (MIT License), with `social-zh` and `support-email` profiles added for OpenClaw.
