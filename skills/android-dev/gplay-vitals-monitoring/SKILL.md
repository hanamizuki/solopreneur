---
name: gplay-vitals-monitoring
description: Monitor Android app stability and performance from the Play Developer Reporting API via gplay vitals. Use to query crash/ANR rates, detect release regressions with anomaly detection, filter error issues/reports with AIP-160 expressions, and break down startup/rendering/battery metrics by dimension. Use when asked to check crash rates, ANR rates, error trends, performance data, or to gate a release on stability.
---

# App Vitals Monitoring

`gplay vitals` hits the **Play Developer Reporting API** (separate from the Android Publisher API used by most other commands). Every subcommand outputs **JSON by default**; add `--output table|markdown` for humans or `--pretty` to indent JSON. Dates are ISO 8601 (`YYYY-MM-DD`).

## Preconditions
- Credentials set (`gplay auth login` or `GPLAY_SERVICE_ACCOUNT`).
- Service account needs "View app information and download bulk reports" permission.
- The app must have enough installs to generate vitals data (small apps return empty sets).

## The real surface
There are exactly three groups. There is **no** `crashes list/get`, no `errors list/get`, no `performance overview/permissions`, no `--cluster-id`, `--version-code`, `--start-time/--end-time`, `--severity`, or `--error-id`.

| Command | Purpose |
|---------|---------|
| `vitals crashes query` | Crash / ANR **rate** metrics over a date range |
| `vitals crashes anomalies` | Auto-detected regressions — the release gate |
| `vitals performance startup\|rendering\|battery` | Performance metric breakdowns |
| `vitals errors issues` | Grouped error **issues** (AIP-160 filterable) |
| `vitals errors reports` | Individual error **reports** with stack traces |

## Crash & ANR rate metrics

`gplay vitals crashes query` returns rate metrics, not a cluster list. Switch metric with `--type crash|anr`; group with `--dimension`.

```bash
# Crash rate for a window
gplay vitals crashes query --package com.example.app --from 2026-06-01 --to 2026-06-30 --output table

# ANR rate
gplay vitals crashes query --package com.example.app --type anr --output table

# Break down by version to spot a bad build
gplay vitals crashes query --package com.example.app --dimension versionCode --output table

# By device model
gplay vitals crashes query --package com.example.app --dimension deviceModel --paginate
```

Other valid dimensions include `deviceModel`, `deviceBrand`, `apiLevel`, `countryCode`. Use `--paginate` to pull every page.

## Anomaly detection — the regression / release gate

`gplay vitals crashes anomalies` lists automatically detected deviations that likely indicate a regression from a new release. This is the command to run in a post-release watch or a CI gate — it does the "is this worse than baseline?" judgement for you across crash, ANR, error, and performance metric sets.

```bash
# All anomalies in the last 7 days (default window)
gplay vitals crashes anomalies --package com.example.app --output table

# Just ANR regressions, most recent 20
gplay vitals crashes anomalies --package com.example.app --type anr --limit 20

# Scope to a release window
gplay vitals crashes anomalies --package com.example.app --from 2026-06-25 --to 2026-07-02
```

`--type` accepts `crash`, `anr`, `errors`, `performance`, or `all` (default). `--limit` is 1–1000 (default 50).

## Performance metrics

Three subcommands, each with an optional `--dimension` (e.g. `apiLevel`, `deviceModel`, `country`):

```bash
# Cold/warm/hot startup percentiles, broken down by API level
gplay vitals performance startup --package com.example.app --dimension apiLevel --output table

# Slow (16ms) and frozen (700ms) frame rates
gplay vitals performance rendering --package com.example.app --from 2026-06-01 --to 2026-06-30

# Battery: excessive wakeups vs. stuck wake locks (choose with --type)
gplay vitals performance battery --package com.example.app --type wakeup --output table
gplay vitals performance battery --package com.example.app --type wakelock
```

## Errors: issues vs. reports, filtered with AIP-160

- **`errors issues`** — reports grouped into issues (counts, distinct users). Start here to triage.
- **`errors reports`** — individual reports with stack traces and device info. Drill in from an issue.

Both filter via a single `--filter` AIP-160 expression. Supported fields: `errorIssueType` (`CRASH`, `ANR`, `NON_FATAL`), `apiLevel`, `versionCode`, `deviceModel`, `deviceBrand`, `deviceType`, `appProcessState` (`FOREGROUND`, `BACKGROUND`), `isUserPerceived`; `reports` additionally supports `errorIssueId` and `errorReportId`.

```bash
# Top crash issues by report count
gplay vitals errors issues --package com.example.app \
  --filter 'errorIssueType = CRASH' \
  --order-by 'errorReportCount desc' --page-size 10 --output table

# ANR issues most impacting distinct users
gplay vitals errors issues --package com.example.app \
  --filter 'errorIssueType = ANR' --order-by 'distinctUsers desc'

# Compound filter: crashes on a specific version, foreground only
gplay vitals errors reports --package com.example.app \
  --filter 'errorIssueType = CRASH AND versionCode = 105 AND appProcessState = FOREGROUND'

# All reports belonging to one issue (drill-down)
gplay vitals errors reports --package com.example.app \
  --filter 'errorIssueId = 1234567890' --page-size 20
```

`--order-by` (issues only) accepts `errorReportCount` / `distinctUsers` with `asc`/`desc`. Use `--paginate` for everything.

## JSON + jq extraction

Default JSON is meant to be piped:

```bash
# Pull the errorIssueId of the worst crash issue
WORST=$(gplay vitals errors issues --package com.example.app \
  --filter 'errorIssueType = CRASH' --order-by 'errorReportCount desc' --page-size 1 \
  | jq -r '.errorIssues[0].name')

# Count anomalies flagged in the release window
gplay vitals crashes anomalies --package com.example.app --from 2026-06-25 --to 2026-07-02 \
  | jq '.anomalies | length'
```

Field names vary by endpoint — inspect once with `--pretty` before scripting against a path.

## Stability workflow

1. **Watch after every release.** Run `vitals crashes anomalies` scoped to the rollout window first — it surfaces regressions without you setting thresholds.
2. **Confirm the trend.** `vitals crashes query --type crash` and `--type anr` for the rate; add `--dimension versionCode` to confirm the new build is the culprit.
3. **Triage.** `vitals errors issues --filter 'errorIssueType = CRASH' --order-by 'errorReportCount desc'` to rank by impact.
4. **Drill in.** Take the issue id and run `vitals errors reports --filter 'errorIssueId = <id>'` for stack traces and device breakdown.
5. **Track ANRs separately** — they weigh heavily on Play ranking; always check `--type anr` distinctly.

## CI/CD stability gate

Prefer `anomalies` over hand-rolled thresholds. Note `--rollout` is a **fraction 0.0–1.0**, never a percent.

```bash
ANOMALIES=$(gplay vitals crashes anomalies \
  --package com.example.app --type all --from "$RELEASE_DATE" \
  | jq '.anomalies | length')

if [ "$ANOMALIES" -gt 0 ]; then
  echo "Vitals anomalies detected ($ANOMALIES). Halting promotion."
  exit 1
fi

# Clean — promote beta to a 10% staged production rollout
gplay promote --package com.example.app --from beta --to production --rollout 0.1
```
