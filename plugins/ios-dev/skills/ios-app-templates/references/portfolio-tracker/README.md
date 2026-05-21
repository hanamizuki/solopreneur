# Portfolio Tracker (template)

iOS app that tracks crypto + stock positions, fetches current prices and
per-asset news, and runs an Anthropic Claude call to produce a single
piece of plain-language commentary per asset per day.

Built for the **`app-building-demo`** skill — the live 1-hour demo that
takes the audience from "idea" to "running on a real iPhone" in ~40
minutes. The template is intentionally ~95% done so the demo focuses on
customization velocity, not from-scratch implementation.

## What's inside

```
project.yml                  XcodeGen project definition (iOS 18, Swift 6, dark mode)
.gitignore                   Standard Xcode + Swift + secrets ignores
Pulse/
├── PulseApp.swift           @main + SwiftData ModelContainer
├── RootView.swift           Onboarded-and-keys-present gate
├── Info.plist
├── AIPersona.swift          ★ AI voice (system prompt + 3 card labels)
├── Formatting.swift           Decimal → USD string
├── Calendar+DayKey.swift      "YYYY-MM-DD" cache bucket helper
├── Models/                  SwiftData + value types
│   ├── Transaction.swift      @Model — one buy entry
│   ├── Position.swift         struct — derived rollup (qty + cost + PnL)
│   ├── AssetType.swift        enum (.crypto / .stock)
│   ├── NewsArticle.swift      struct
│   ├── AICache.swift          @Model — daily commentary cache
│   └── NewsCache.swift        @Model — daily news cache
├── Services/                Data + integrations
│   ├── KeychainService.swift  Enum-slot Keychain wrapper
│   ├── PortfolioCalculator.swift  Weighted-average cost basis math
│   ├── CoinGeckoClient.swift  Crypto price (historical + current)
│   ├── FinnhubClient.swift    Stock price + per-company news
│   ├── GoogleNewsClient.swift Crypto news via Google News RSS (no key)
│   └── AIClient.swift         Anthropic Messages API (Claude Sonnet 4.6)
└── Views/
    ├── OnboardingView.swift   Paste 3 API keys → Keychain
    ├── DashboardView.swift    Total assets + pie chart + holdings list
    ├── AssetDetailView.swift  Per-asset header + buys + news + AI card
    ├── AddTransactionView.swift  New buy form (price auto-filled by ticker+date)
    └── Components/
        ├── TotalAssetsCard.swift
        ├── HoldingRow.swift
        ├── AllocationPieChart.swift  (uses Apple's Charts framework)
        ├── NewsListItem.swift
        └── AICommentaryCard.swift  3-state result card
```

★ = the single customization file most demos need to touch.

## External services

| Provider | Used for | Key needed |
|---|---|---|
| **CoinGecko** (Demo tier) | Crypto historical + current price | Yes (free Demo) |
| **Finnhub** (Free tier) | Stock historical + current price + company news | Yes (free) |
| **Google News RSS** | Crypto news | No |
| **Anthropic Messages API** | Daily commentary per asset | Yes (paid) |

Keys are entered in-app on first launch and stored in iOS Keychain —
no `.env` files, no committed secrets. The orchestrating skill
(`app-building-demo`) is responsible for any pre-flight verification
before the demo starts; this template only needs the three keys to be
present at runtime.

## How the template is used by the SKILL

When `app-building-demo` is invoked:

1. Intake collects 4 customizations (app name, accent, asset types, AI voice).
2. The SKILL writes a plan whose first task is **"copy this template
   into a worktree of the demo target repo"**.
3. The dispatched subagent does the copy, applies the 4 customizations,
   runs `xcodegen` → `xcodebuild`, then invokes `deploy-to-device` to
   install onto the connected iPhone.

The `customization-points.md` file in this directory is the subagent's
reference for which files to touch and which to leave alone.

## Why this template exists

Most of the demo's value isn't in implementation — it's in the *flow*:
audience sees the AI orchestrator drive a real, polished iOS app from
idea to phone in minutes. To make that possible the heavy lifting (UI,
SwiftData, Keychain, networking, error handling stubs) has to be done
ahead of time. This template is that work.

Without a template the same demo would take hours of subagent
output streaming. With it, the subagent's job shrinks to "copy +
parameterize + build + install" — fast, predictable, low-risk on stage.
