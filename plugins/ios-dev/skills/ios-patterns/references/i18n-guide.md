# Localization (i18n) — Extended Guide

Expands on the i18n section of `SKILL.md`. Only content that isn't already
there: project setup, pluralization, pseudo-locales, and subtle pitfalls.

## Why String Catalog (not `.strings`)

- One `Localizable.xcstrings` instead of per-locale `.strings` + `.stringsdict`.
- Development language is the source of truth; translations sit alongside.
- Pluralization and device-variant rules are first-class.
- Xcode extracts keys from `Text(...)` / `String(localized:)` on every build.

## Project Setup

1. **File → New File → String Catalog** → `Localizable.xcstrings` in the app target.
2. Target's *Info* pane → add languages you ship (e.g. `en`, `zh-Hant`, `ja`).
3. Set `CFBundleDevelopmentRegion` (Info.plist) to the development language.
4. Build settings → enable **Use Compiler to Extract Swift Strings** so Xcode
   auto-populates the catalog on every build.

## Pluralization & Variants

Keys with `\(value)` become argument slots. For pluralization, switch the
catalog entry to **Vary by Plural** and fill in each form per locale:

```swift
Text("cart_items_count \(count)")
```

| Locale    | Form  | Text                      |
|-----------|-------|---------------------------|
| `en`      | one   | `1 item`                  |
| `en`      | other | `\(count) items`          |
| `zh-Hant` | other | `\(count) 件商品`          |
| `ru`      | few   | `\(count) товара`         |
| `ru`      | many  | `\(count) товаров`        |

For gender or device-idiom variants, use the other **Vary by** options in the
catalog editor.

## Attributed / Markdown Strings

```swift
Text(try! AttributedString(markdown: String(localized: "terms_markdown")))
```

Translators see the raw markdown — brief them on which tokens are formatting
and must not be translated.

## Pseudo-locales & Testing

- **RTL**: scheme → Options → App Language → `Right-to-Left Pseudolanguage`.
- **Long text**: App Language → `Double-Length Pseudolanguage` to expose
  truncation and line-wrapping bugs.
- Add a locale-specific `#Preview` for every major language you ship.

## Pitfalls Beyond the Basics

- **Runtime key construction.** Never `"error_\(code)"` — the compiler can't
  extract it and translators never see the full set. Enumerate every key.
- **String concatenation across sentences.** `"Hello, " + name + "!"` breaks
  in languages where the subject comes last. Always interpolate inside one key.
- **Format specifiers.** Let the argument slot render numbers — `%lld`, `%@`
  are generated automatically. Passing a pre-formatted number loses
  locale-aware grouping (e.g. `1,234` vs `1.234`).
- **Missing-localization warning.** Enable *Localization Export Supported* so
  new hard-coded literals are flagged at build time.
- **Lint for `Text("Welcome")`.** A simple regex rule in CI (`Text\("[A-Z]`)
  catches most accidental hard-codes — your team's real enforcement comes
  from reviews, not hope.
