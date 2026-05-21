# Portfolio Tracker — Customization Points

This template is 95% done. On a fresh demo run, the only files that need
touching are listed in **Demo customization** below. Everything else
runs as-is.

The **Universal patterns** section flags modules that are useful as
starting points for unrelated iOS apps — copy them into any new project.

---

## Demo customization (what the Intake asks about)

| What | File | What to change |
|---|---|---|
| App display name | `project.yml`, `Pulse/Info.plist` | `CFBundleDisplayName` and `name:` at top of `project.yml` |
| Bundle ID | `project.yml` | `PRODUCT_BUNDLE_IDENTIFIER` (e.g. `com.example.<demoname>`) |
| AI voice (system prompt + card labels) | `Pulse/AIPersona.swift` | `systemPrompt`, `cardTitle`, `loadingText`, `failedText` |
| AI model | `Pulse/AIPersona.swift` | `model` constant — swap Sonnet 4.6 for Haiku 4.5 (cheaper) or Opus 4.5 (higher quality) |
| Accent color (green / red) | `Pulse/Views/Components/AICommentaryCard.swift` (glow + label), `OnboardingView.swift` (CTA), `DashboardView.swift` (`+` toolbar icon), `HoldingRow.swift` + `AssetDetailView.swift` (PnL up/down), `Pulse/Views/Components/TotalAssetsCard.swift` (total PnL up/down) | Replace `Color.green` for the up/positive state and `Color.red` for the down/negative state. **Do NOT** touch `Color.orange` or `Color.blue` — those are reserved as asset-type chip tints (orange = crypto, blue = stock) and a blind search-replace will recolor the badges. |
| Supported tickers (Crypto) | `Pulse/Services/CoinGeckoClient.swift`, `GoogleNewsClient.swift` | `coinIds`, `queryByTicker` maps |

Five-to-six files, well under ten minutes to customize.

---

## Universal patterns (reusable in any iOS app)

These modules are not tied to portfolio domain — copy into any iOS app
that needs the same capability.

### `Pulse/Services/KeychainService.swift`
Enum-slot keychain with `Bundle.main.bundleIdentifier` as the service ID.
Drop in, define your own `KeychainSlot` enum cases, done. Used by any app
that stores API keys / tokens client-side.

### `Pulse/Views/OnboardingView.swift` + `Pulse/RootView.swift`
Pattern: app gates on `@AppStorage("onboarded")` AND all-keys-present.
The `keysVersion &+= 1` trick forces `RootView` to re-evaluate Keychain
after the user saves (Keychain isn't reactive). Useful for any
paste-your-key-to-continue onboarding.

### `Pulse/Services/AIClient.swift` + `Pulse/AIPersona.swift`
Minimal Anthropic Messages API call. ~70 lines. No streaming (add if
needed). Persona file is the single customization point — change the
prompt and you change the AI's voice for the whole app.

### `Pulse/Views/Components/AICommentaryCard.swift`
3-state SwiftUI card (loading / loaded / failed) with glowing-dot
accent + dark gradient. Drop-in for any "AI generates text, user reads
it" feature.

### `Pulse/Models/AICache.swift` + `NewsCache.swift` + `Pulse/Calendar+DayKey.swift`
SwiftData daily-cache pattern: `@Attribute(.unique) key = "domain|YYYY-MM-DD"`.
Use whenever you want "call expensive API once per day per entity".
The Calendar extension provides `Calendar.todayKey()` for the bucket.

### `Pulse/Formatting.swift`
Tiny utility. Currently only USD currency formatting; add helpers here
rather than scattering NumberFormatter setup across views.

---

## App-specific (don't lift without bringing portfolio domain)

These reference Position / Transaction / asset types — they only make
sense inside a portfolio-tracker-shaped app.

- `Pulse/Models/Position.swift`, `Transaction.swift`, `AssetType.swift`
- `Pulse/Services/PortfolioCalculator.swift`
- `Pulse/Services/CoinGeckoClient.swift`, `FinnhubClient.swift`,
  `GoogleNewsClient.swift` (price + news clients — keep together)
- `Pulse/Views/DashboardView.swift`, `AssetDetailView.swift`,
  `AddTransactionView.swift`
- `Pulse/Views/Components/HoldingRow.swift`, `NewsListItem.swift`,
  `TotalAssetsCard.swift`, `AllocationPieChart.swift`

If you want a different app shape (e.g. habit tracker, recipe collector),
copy the universal modules above + write new domain logic. The universal
set is most of the connective tissue.

---

## What this template deliberately omits

Per MVP charter:

- No unit / UI tests
- No accessibility annotations
- No localization
- No error-state polish (most failures just log + show generic message)
- No loading skeletons / shimmer effects
- No analytics / crash reporting

If hardening is needed later, add those passes against the same plan
file.
