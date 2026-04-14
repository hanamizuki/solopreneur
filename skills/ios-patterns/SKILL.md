---
name: ios-patterns
description: Use when building iOS/macOS apps with SwiftUI — covers localization (String Catalogs), date/time formatting, JSON date decoding, Previews, state management, sheet/navigation, list spacing, and animation patterns.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# iOS SwiftUI Patterns

A collection of SwiftUI conventions that keep code consistent, localizable,
and resilient to edge cases. Apply these patterns to any iOS/macOS SwiftUI
project. See `references/` for in-depth guides.

## 1. Localization (i18n)

Use **String Catalog** (`.xcstrings`) — not `Localizable.strings` — for all
user-facing text. Reference: `references/i18n-guide.md`.

```swift
// In a View: LocalizedStringKey is inferred
Text("welcome_message")
Text("greeting \(username)")

// In a ViewModel or non-View context, use String(localized:)
let message = String(localized: "error_network")
let formatted = String(localized: "items_count \(count)")
```

### Key naming

Use `snake_case`, grouped by feature: `home_title`, `settings_notification_enabled`,
`error_network_unavailable`. Embed parameters in the key:
`"profile_welcome \(name)"`, `"cart_items_count \(count)"`.

### Avoid

```swift
Text("Welcome")                                    // ❌ hard-coded
let title: LocalizedStringKey = "welcome"          // ❌ only works in Views
let title = String(localized: "welcome")           // ✅ works anywhere
```

## 2. Date & Time Localization

**Never hard-code format strings like `"M/d"` or `"MM/dd"`.** Different locales
order date components differently (US: `12/13`, AU/UK: `13/12`, TW: `12/13`).
Use `setLocalizedDateFormatFromTemplate` so the system picks the correct order.

Centralize formatting behind one utility (e.g. `LocalizedDateFormatter`) that
vends cached `DateFormatter`s keyed by template:

```swift
enum LocalizedDateStyle {
    case monthDayNumeric         // "Md"       → 12/13 or 13/12
    case monthDayAbbreviated     // "MMMd"     → Dec 13 / 13 Dec / 12月13日
    case yearMonthDayAbbreviated // "yMMMd"    → Dec 13, 2025
    case yearMonthDayFull        // "yMMMMd"   → December 13, 2025
    // ...
}

let text = LocalizedDateFormatter.string(from: date, style: .monthDayAbbreviated)
```

### Rules

- Preserve script variants when constructing `Locale` (e.g. `zh-Hant` vs `zh-Hans`)
  so Traditional and Simplified Chinese users see the right format.
- `DateFormatter` is **not thread-safe** — shared cached formatters are main-thread
  only. Background threads must create their own instance.
- Storage/API/logs use fixed ISO formats (`yyyy-MM-dd`, `HH:mm`) — not localized.

## 3. ISO8601 Date Parsing (JSON)

`JSONDecoder.DateDecodingStrategy.iso8601` **does not accept fractional seconds**.
Backends (PostgreSQL `timestamptz`, Supabase, Fider, etc.) may return any of:

```
2025-12-08T10:00:00Z           ✅ supported
2025-12-08T10:00:00.123Z       ❌ fails
2025-12-08T10:00:00.123456Z    ❌ fails
```

The bug is **data-dependent and intermittent** — local fixtures usually don't
reproduce it. Always install a flexible decoder:

```swift
extension JSONDecoder {
    static var withFlexibleDateDecoding: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let s = try container.decode(String.self)
            let f = ISO8601DateFormatter()

            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = f.date(from: s) { return d }

            f.formatOptions = [.withInternetDateTime]
            if let d = f.date(from: s) { return d }

            // Normalize PostgreSQL "yyyy-MM-dd HH:mm:ss.SSSSSS" → ISO8601
            let normalized = s
                .replacingOccurrences(of: " ", with: "T")
                .replacingOccurrences(of: #"(\.\d{3})\d+"#, with: "$1",
                                      options: .regularExpression)
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = f.date(from: normalized) { return d }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unrecognized date format: \(s)")
        }
        return decoder
    }
}
```

## 4. SwiftUI Preview

Every View ships with Previews. Reference: `references/swiftui-preview-guide.md`.

```swift
#Preview("Default")       { MyView() }
#Preview("With Data")     { MyView(items: .mock) }
#Preview("Empty State")   { MyView(items: []) }

#Preview("Dark Mode") {
    MyView().preferredColorScheme(.dark)
}

#Preview("Large Text") {
    MyView().environment(\.dynamicTypeSize, .accessibility3)
}

#Preview("繁體中文") {
    MyView().environment(\.locale, .init(identifier: "zh-Hant"))
}
```

Provide `mock` static values on models so Previews stay trivial:

```swift
extension User {
    static let mock = User(id: UUID(), name: "Alice", email: "a@example.com")
    static let mockList: [User] = [.mock, /* ... */]
}
```

## 5. State Management

```swift
@State private var isExpanded = false            // local view state
@Binding var selectedItem: Item?                 // mutable state from parent
@StateObject private var vm = MyViewModel()      // owner of a VM
@ObservedObject var vm: MyViewModel              // passed-in VM
@Environment(\.dismiss) private var dismiss
```

### ViewModel template

```swift
@MainActor
final class MyViewModel: ObservableObject {
    @Published private(set) var items: [Item] = []
    @Published private(set) var isLoading = false
    @Published var error: Error?

    func loadItems() async {
        isLoading = true
        defer { isLoading = false }
        do { items = try await service.fetchItems() }
        catch { self.error = error }
    }
}
```

## 6. Modifier Order

Apply modifiers in a consistent order: content style → size → padding →
background → shape → shadow → gesture.

```swift
Text("Hello")
    .font(.headline)
    .frame(maxWidth: .infinity)
    .padding()
    .background(.blue)
    .cornerRadius(8)
    .shadow(radius: 4)
    .onTapGesture { }
```

## 7. Sheet & Navigation

Pick the sheet configuration by purpose:

| Kind | Detents | Drag indicator | Dismissable by swipe |
|------|---------|----------------|----------------------|
| **Info** (short explanation) | `[.fraction(0.3–0.5)]` | visible | yes |
| **Content** (detail view) | `[.medium, .large]` | visible | yes |
| **Management** (data list) | `[.medium, .large]` | visible | yes |
| **Edit** (form with unsaved input) | default or `.large` | hidden | **no** — `.interactiveDismissDisabled()` |

```swift
// Edit sheet — must commit via explicit Save/Cancel
.sheet(isPresented: $showEdit) {
    EditFormView(onSave: save, onCancel: { showEdit = false })
        .interactiveDismissDisabled()
}
```

### NavigationStack

- Tab roots with multi-level drill-down: use `NavigationStack`.
- Single-page tabs that delegate subflows to sheets: no `NavigationStack`.
- Inside a sheet: usually no `NavigationStack`; prefer multiple sheets over
  nested sheet navigation. Avoid stacking sheets more than 2 levels deep.

## 8. List Section Spacing (iOS 17+)

When a `Section` has a `footer`, set `.listSectionSpacing(.custom(24))` so the
small footer text isn't crammed against the next section:

```swift
Section {
    TextField("name", text: $name)
} header: {
    Text("basic_info")
} footer: {
    Text("basic_info_hint")
}
.listSectionSpacing(.custom(24))
```

Individual `Section` settings override a `Form`-level `.listSectionSpacing(...)`.

## 9. Expandable Content Animation

Inside `Form`/`List`, conditionally rendering content with `if isExpanded { ... }`
causes the whole list to reflow and the content to slide in from above,
overlapping the first row.

**Fix:** always render; toggle `frame(maxHeight:)` and `opacity`:

```swift
VStack(alignment: .leading, spacing: 8) {
    Button { isExpanded.toggle() } label: {
        HStack { Text("title"); Spacer(); Text(isExpanded ? "less" : "more") }
    }
    .buttonStyle(.plain)

    Text("expanded_body_copy")
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxHeight: isExpanded ? nil : 0, alignment: .top)
        .opacity(isExpanded ? 1 : 0)
        .clipped()
}
.animation(.easeInOut(duration: 0.15), value: isExpanded)
```

Keep `.animation(_:value:)` on the container — don't wrap the toggle in
`withAnimation`. For simple disclosure UI, prefer the built-in `DisclosureGroup`.

## 10. Keyboard Done Button

All keyboard-input screens should share one "Done" affordance. Implement it
once as a `ViewModifier` using `safeAreaInset(edge: .bottom)` — it is more
reliable than `.toolbar(placement: .keyboard)`, which has a known iOS 18 bug
where the toolbar fails to appear on first focus.

```swift
// ✅ Apply to the outermost container (NavigationStack / Form)
NavigationStack {
    Form {
        TextField("name", text: $name)
        TextField("amount", value: $amount, formatter: .decimal)
    }
}
.keyboardDoneButton()

// ✅ Run extra logic on dismiss
.keyboardDoneButton(onDone: { focusedField = nil })
```

## References

- `references/i18n-guide.md` — String Catalog workflow, pluralization, testing
- `references/swiftui-preview-guide.md` — Preview patterns, providers, device matrices
