# Date Format Localization

A pattern for displaying dates correctly across locales (MM/DD vs DD/MM), across vendor-modified Android systems that report broken locales, and across an app whose UI language can differ from the device's system language.

---

## Background

Users outside the US (Australia, UK, most of Europe) expect DD/MM date order. If an app hardcodes US-style formatting or naively uses `DateUtils.formatDateTime()`, these users see the wrong order — and on some devices they see it even after setting the correct locale.

The fix is a small `DateDisplayFormatter` helper that:

1. Reads an **effective locale** robust against MIUI / EMUI / ColorOS quirks
2. Uses `java.time.format.DateTimeFormatter` (not `android.text.format.DateUtils`)
3. Separates *date order* (locale-driven) from *date language* (app-UI-driven)

---

## The MIUI / vendor quirk

Some Android systems (MIUI, Huawei EMUI, OPPO ColorOS, etc.) report locales like this:

```
Locale.getDefault():            en          ← no country code
system Configuration locales:   [en, en_AU] ← en_AU is second
```

Consequences:

- `Locale.getDefault()` returns bare `en`, which defaults to US date order
- `DateUtils.formatDateTime()` reads the Context locale, which may also be countryless
- User selects "English (Australia)" in settings but still sees MM/DD

### Solution — `getEffectiveLocale()`

Pull the real locale from the system `Configuration`, using `ConfigurationCompat` to get a locale with a country code:

```kotlin
private fun getEffectiveLocale(): Locale {
    // 1. If the default locale has a country, use it.
    val defaultLocale = Locale.getDefault()
    if (defaultLocale.country.isNotEmpty()) {
        return defaultLocale
    }

    // 2. Walk the system locale list for one that has a country code.
    //    Use Resources.getSystem() — this is the OS-level config, not the
    //    app's modified config, so it can't be corrupted by Locale.setDefault().
    val systemLocales = ConfigurationCompat.getLocales(Resources.getSystem().configuration)
    for (i in 0 until systemLocales.size()) {
        val locale = systemLocales[i]
        if (locale != null && locale.country.isNotEmpty()) {
            return locale
        }
    }

    // 3. Fall back to whatever the default was.
    return defaultLocale
}
```

### Why `ConfigurationCompat` rather than `LocaleList.getDefault()`

| Source | Modifiable by the app? |
|---|---|
| `LocaleList.getDefault()` | Yes — reflects any `Locale.setDefault()` the app has done |
| `ConfigurationCompat.getLocales(Resources.getSystem().configuration)` | No — OS-level configuration |

You want the OS truth here, not the app's modified view of it.

### Why not `DateUtils.formatDateTime()`

`DateUtils.formatDateTime()` has structural problems for i18n:

1. Doesn't accept a `Locale` parameter — reads from the `Context`
2. The `Context` locale on MIUI may be countryless (see above)
3. No way to override the locale it uses

This is a known Android limitation — the Signal Android app [ran into the same issue](https://github.com/signalapp/Signal-Android/issues/2684) and switched to `SimpleDateFormat`. The recommended modern replacement is `java.time.format.DateTimeFormatter` driven by `getEffectiveLocale()`.

---

## Formatter API shape

A small static helper, e.g. `DateDisplayFormatter`, exposes locale-aware methods. Example surface:

### `LocalDate` formatting

| Method | Purpose | en_US | en_AU | zh_TW |
|---|---|---|---|---|
| `formatMonthDay(date, FULL)` | Month + day (full name) | `December 13` | `13 December` | `12月13日` |
| `formatMonthDay(date, ABBREV)` | Month + day (abbrev) | `Dec 13` | `13 Dec` | `12月13日` |
| `formatMonthDay(date, NUMERIC)` | Numeric month/day | `12/13` | `13/12` | `12/13` |
| `formatFullDate(date, MEDIUM)` | Year + month + day | `Dec 13, 2025` | `13 Dec 2025` | `2025年12月13日` |
| `formatFullDate(date, LONG)` | Year + month + day (long) | `December 13, 2025` | `13 December 2025` | `2025年12月13日` |
| `formatYearMonth(ctx, date)` | Year + month (needs Context) | `Dec 2025` | `Dec 2025` | `2025年12月` |
| `formatYearMonthTitle(date)` | Year + month (no Context, for ViewModel) | `Dec 2025` | `Dec 2025` | `2025年12月` |

### `Instant` / ISO string formatting

| Method | Purpose | en_US | en_AU |
|---|---|---|---|
| `formatInstant(instant, LONG)` | Instant → date | `December 13, 2025` | `13 December 2025` |
| `formatInstantWithTime(instant)` | Instant → date + time | `Dec 13, 2025, 3:30 PM` | `13 Dec 2025, 3:30 pm` |
| `formatISODateString(iso, LONG)` | ISO string → date | `December 13, 2025` | `13 December 2025` |

### Helpers

| Method | Purpose |
|---|---|
| `isDayBeforeMonth(locale)` | `true` for locales that use DD/MM order |
| `getEffectiveLocale()` | MIUI-safe locale resolution |

---

## App language vs system locale — separating *order* and *language*

When the app's UI language can differ from the system locale, you need to split two concepts:

| Aspect | Driven by | Source |
|---|---|---|
| App UI text | Android resources | Limited to the languages you ship |
| Date **order** (DD/MM vs MM/DD) | System locale | `getEffectiveLocale()` |
| Date **language** (words: `月日` vs `MMM`) | App UI language | `LocalConfiguration.current.locales[0]` |

### Why separate them?

**Scenario:** system language is Chinese, but the app is set to English.

| Strategy | Shown | Problem |
|---|---|---|
| Date fully follows system locale | `12月27日` | ❌ Chinese date inside English UI — jarring |
| Order follows system, language follows app | `Dec 27` | ✅ Consistent with UI language |

When calling `formatMonthDay()` from a composable, pass the app locale explicitly as `displayLocale`:

```kotlin
val appLocale = LocalConfiguration.current.locales[0]
DateDisplayFormatter.formatMonthDay(date, MonthDayStyle.ABBREV, appLocale)
```

### Unsupported-language fallback

If the user's system language (say `fr-FR`) isn't one the app ships:

| Layer | Result |
|---|---|
| App UI text | English (resource fallback) |
| Date language | French (`13 déc. 2025`) |
| Date order | DD/MM (European) |

This is the **correct** i18n behaviour: "my app might not have my language, but dates should still match what I'm used to."

### English variants

| Variant | Locale | Date order |
|---|---|---|
| English (US) | `en_US` | MM/DD |
| English (UK) | `en_GB` | DD/MM |
| English (Australia) | `en_AU` | DD/MM |
| English (no country) | `en` | MM/DD (default) |

---

## Applying the pattern when adding a new date display

Checklist before calling a formatter:

1. ✅ Get the app locale from the composable scope:
   ```kotlin
   val appLocale = LocalConfiguration.current.locales[0]
   ```

2. ✅ Pass `displayLocale`:
   ```kotlin
   DateDisplayFormatter.formatMonthDay(date, MonthDayStyle.ABBREV, appLocale)
   ```

3. ✅ Don't call the `displayLocale`-less overload unless you explicitly want system-language dates.

### Common mistake

```kotlin
// ❌ Uses system locale — can conflict with the app's UI language
DateDisplayFormatter.formatMonthDay(date, MonthDayStyle.ABBREV)

// ✅ Uses app locale
val appLocale = LocalConfiguration.current.locales[0]
DateDisplayFormatter.formatMonthDay(date, MonthDayStyle.ABBREV, appLocale)
```

### Exceptions — when `displayLocale` is not needed

- Numeric axis labels on charts (no words, just numbers)
- Non-UI use (logging, API payloads, ISO storage)

---

## What *not* to localize

Keep these in ISO / numeric form:

- **Time-only formats** (`HH:mm`) — API requests, raw timestamps
- **Storage formats** — ISO strings in backup files, serialization, database columns
- **Internal keys** — `LazyColumn` keys, state identifiers that happen to be dates

If a string is crossing a machine boundary (disk, network, Kotlin→Kotlin data model), use ISO. Localize only at the display layer.

---

## Testing

### Standard Android device

1. Settings → System → Languages → add **English (Australia)**
2. Drag it to the top
3. Relaunch the app

### MIUI device

MIUI's language list doesn't include Australia. Use **English (United Kingdom)** — both `en_GB` and `en_AU` produce DD/MM order, so the test is equivalent.

1. Settings → Additional Settings → Languages and input
2. Select English (United Kingdom)
3. Relaunch the app

### Verification

Spot-check these surfaces:

- Chart X-axis → `13/12`
- Date switcher / compact date → `13 Dec`
- Edit sheets with full dates → `13 Dec 2025`
- Account / subscription expiry (long form) → `13 December 2025`

### In-app language switch

1. System language = Chinese
2. In the app, switch UI language to English
3. Verify dates render with English words (`Dec 27`, not `12月27日`)

---

## Summary

- Use `DateTimeFormatter`, not `DateUtils`, for display formatting.
- Resolve locale via `ConfigurationCompat.getLocales(Resources.getSystem().configuration)` — it survives MIUI/EMUI quirks.
- Separate *date order* (system locale) from *date language* (app UI locale) and pass a `displayLocale` from every composable that shows a date.
- Keep storage/ISO formats untouched — localize only at the display layer.
