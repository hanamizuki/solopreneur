---
name: gplay-review-management
description: Review monitoring, filtering, and automated responses for Google Play. Use when managing user reviews and feedback.
---

# Review Management for Google Play

Use this skill when you need to monitor and respond to user reviews.

## List Reviews

### Get all reviews
```bash
gplay reviews list --package com.example.app
```

### Get all reviews with pagination
```bash
gplay reviews list --package com.example.app --paginate
```

### Table output (human-readable)
```bash
gplay reviews list \
  --package com.example.app \
  --output table
```

## Filter Reviews

### By rating
```bash
# Get 1-star reviews
gplay reviews list --package com.example.app \
  | jq '.reviews[] | select(.rating == 1)'

# Get 5-star reviews
gplay reviews list --package com.example.app \
  | jq '.reviews[] | select(.rating == 5)'

# Get reviews with 3 stars or less
gplay reviews list --package com.example.app \
  | jq '.reviews[] | select(.rating <= 3)'
```

### By date
```bash
# Reviews from last 7 days
DATE_7_DAYS_AGO=$(date -u -v-7d +%Y-%m-%dT%H:%M:%SZ)
gplay reviews list --package com.example.app \
  | jq --arg date "$DATE_7_DAYS_AGO" \
    '.reviews[] | select(.comments[0].userComment.lastModified.time > $date)'
```

### By language
```bash
# English reviews only
gplay reviews list --package com.example.app \
  | jq '.reviews[] | select(.comments[0].userComment.language == "en")'
```

### Machine-translated review text
Use the built-in `--translation-language` flag to get review text translated by Google, rather than reading it in the original language:
```bash
gplay reviews list --package com.example.app --translation-language en-US
```

### Reviews containing keywords
```bash
# Find reviews mentioning "crash"
gplay reviews list --package com.example.app \
  | jq '.reviews[] | select(.comments[0].userComment.text | contains("crash"))'
```

## Get Specific Review

```bash
gplay reviews get \
  --package com.example.app \
  --review REVIEW_ID
```

## Reply to Reviews

```bash
gplay reviews reply \
  --package com.example.app \
  --review REVIEW_ID \
  --text "Thank you for your feedback! We've fixed this issue in version 1.2.3."
```

## Automated Review Response

### Script to reply to unreplied 1-star reviews
```bash
#!/bin/bash

PACKAGE="com.example.app"

# Get all unreplied 1-star reviews
gplay reviews list --package $PACKAGE --paginate \
  | jq -r '.reviews[] | select(.rating == 1 and (.comments | length == 1)) | .reviewId' \
  | while read REVIEW_ID; do
    echo "Replying to review: $REVIEW_ID"
    gplay reviews reply \
      --package $PACKAGE \
      --review "$REVIEW_ID" \
      --text "Thank you for your feedback. We're sorry to hear about your experience. Please email support@example.com so we can help resolve this issue."
  done
```

## Review Analytics

### Count reviews by rating
```bash
gplay reviews list --package com.example.app --paginate \
  | jq '[.reviews[] | .rating] | group_by(.) | map({rating: .[0], count: length})'
```

### Average rating calculation
```bash
gplay reviews list --package com.example.app --paginate \
  | jq '[.reviews[].rating] | add / length'
```

### Most common words in reviews
```bash
gplay reviews list --package com.example.app --paginate \
  | jq -r '.reviews[].comments[0].userComment.text' \
  | tr '[:upper:]' '[:lower:]' \
  | tr -s ' ' '\n' \
  | sort | uniq -c | sort -rn | head -20
```

## Monitor for Specific Issues

### Find crash-related reviews
```bash
gplay reviews list --package com.example.app --paginate \
  | jq '.reviews[] | select(.comments[0].userComment.text | test("crash|freeze|hang"; "i"))'
```

### Find reviews mentioning competitors
```bash
gplay reviews list --package com.example.app --paginate \
  | jq '.reviews[] | select(.comments[0].userComment.text | test("competitor_name"; "i"))'
```

### Find reviews with refund requests
```bash
gplay reviews list --package com.example.app --paginate \
  | jq '.reviews[] | select(.comments[0].userComment.text | test("refund|money back"; "i"))'
```

## Monitoring Dashboard

Create a simple review dashboard:

```bash
#!/bin/bash
PACKAGE="com.example.app"

echo "=== Review Dashboard ==="
echo ""

# Total reviews
TOTAL=$(gplay reviews list --package $PACKAGE --paginate | jq '.reviews | length')
echo "Total reviews: $TOTAL"

# Rating distribution
echo ""
echo "Rating distribution:"
gplay reviews list --package $PACKAGE --paginate \
  | jq -r '.reviews[] | .rating' \
  | sort | uniq -c | sort -rn

# Avg rating
AVG=$(gplay reviews list --package $PACKAGE --paginate \
  | jq '[.reviews[].rating] | add / length')
echo ""
echo "Average rating: $AVG"

# Unreplied reviews
UNREPLIED=$(gplay reviews list --package $PACKAGE --paginate \
  | jq '[.reviews[] | select(.comments | length == 1)] | length')
echo ""
echo "Unreplied reviews: $UNREPLIED"

# Recent 1-star
echo ""
echo "Recent 1-star reviews:"
gplay reviews list --package $PACKAGE \
  | jq -r '.reviews[] | select(.rating == 1) | "\(.comments[0].userComment.lastModified.time): \(.comments[0].userComment.text)"' \
  | head -5
```

## Scheduled Review Check

### Daily review check (cron)
```bash
# Add to crontab
0 9 * * * /path/to/check-reviews.sh
```

### check-reviews.sh
```bash
#!/bin/bash
PACKAGE="com.example.app"

# Get unreplied 1-star and 2-star reviews
UNREPLIED=$(gplay reviews list --package $PACKAGE \
  | jq '[.reviews[] | select(.rating <= 2 and (.comments | length == 1))] | length')

if [ "$UNREPLIED" -gt 0 ]; then
  echo "⚠️  You have $UNREPLIED unreplied negative reviews!"
  # Send notification (email, Slack, etc.)
fi
```

## Integration with Support System

Forward reviews to support email:

```bash
#!/bin/bash
# Get reviews mentioning "support" or "help"
gplay reviews list --package com.example.app --paginate \
  | jq -r '.reviews[] | select(.comments[0].userComment.text | test("support|help"; "i")) |
    "Review ID: \(.reviewId)\nRating: \(.rating)\nText: \(.comments[0].userComment.text)\n---"' \
  | mail -s "Support Reviews" support@example.com
```
