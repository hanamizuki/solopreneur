# Accessibility

VoiceOver, Dynamic Type, and inclusive design for iOS apps.

## VoiceOver Support

### Basic Labels

```swift
struct ItemRow: View {
    let item: Item

    var body: some View {
        HStack {
            Image(systemName: item.icon)
                .accessibilityHidden(true)  // Icon is decorative

            VStack(alignment: .leading) {
                Text(item.name)
                Text(item.date, style: .date)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if item.isCompleted {
                Image(systemName: "checkmark")
                    .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.name), \(item.isCompleted ? "completed" : "incomplete")")
        .accessibilityHint("Double tap to view details")
    }
}
```

### Custom Actions

```swift
struct ItemRow: View {
    let item: Item
    let onDelete: () -> Void
    let onToggle: () -> Void

    var body: some View {
        HStack {
            Text(item.name)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(item.name)
        .accessibilityAction(named: "Toggle completion") {
            onToggle()
        }
        .accessibilityAction(named: "Delete") {
            onDelete()
        }
    }
}
```

### Traits

```swift
Text("Important Notice")
    .accessibilityAddTraits(.isHeader)

Button("Submit") { }
    .accessibilityAddTraits(.startsMediaSession)

Image("photo")
    .accessibilityAddTraits(.isImage)

Link("Learn more", destination: url)
    .accessibilityAddTraits(.isLink)

Toggle("Enable", isOn: $isEnabled)
    .accessibilityAddTraits(isEnabled ? .isSelected : [])
```

### Announcements

```swift
// Announce changes
func saveCompleted() {
    AccessibilityNotification.Announcement("Item saved successfully").post()
}

// Screen change
func showNewScreen() {
    AccessibilityNotification.ScreenChanged(nil).post()
}

// Layout change
func expandSection() {
    isExpanded = true
    AccessibilityNotification.LayoutChanged(nil).post()
}
```

### Rotor Actions

```swift
struct ArticleView: View {
    @State private var fontSize: CGFloat = 16

    var body: some View {
        Text(article.content)
            .font(.system(size: fontSize))
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment:
                    fontSize = min(fontSize + 2, 32)
                case .decrement:
                    fontSize = max(fontSize - 2, 12)
                @unknown default:
                    break
                }
            }
    }
}
```

## Dynamic Type

### Scaled Fonts

```swift
// System fonts scale automatically
Text("Title")
    .font(.title)

Text("Body")
    .font(.body)

// Custom fonts with scaling
Text("Custom")
    .font(.custom("Helvetica", size: 17, relativeTo: .body))

// Fixed size (use sparingly)
Text("Fixed")
    .font(.system(size: 12).fixed())
```

### Scaled Metrics

```swift
struct IconButton: View {
    @ScaledMetric var iconSize: CGFloat = 24
    @ScaledMetric(relativeTo: .body) var spacing: CGFloat = 8

    var body: some View {
        HStack(spacing: spacing) {
            Image(systemName: "star")
                .font(.system(size: iconSize))
            Text("Favorite")
        }
    }
}
```

### Line Limits with Accessibility

```swift
Text(item.description)
    .lineLimit(3)
    .truncationMode(.tail)
    // But allow more for accessibility sizes
    .dynamicTypeSize(...DynamicTypeSize.accessibility1)
```

### Testing Dynamic Type

```swift
#Preview("Default") {
    ContentView()
}

#Preview("Large") {
    ContentView()
        .environment(\.sizeCategory, .accessibilityLarge)
}

#Preview("Extra Extra Large") {
    ContentView()
        .environment(\.sizeCategory, .accessibilityExtraExtraLarge)
}
```

## Reduce Motion

```swift
struct AnimatedView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isExpanded = false

    var body: some View {
        VStack {
            // Content
        }
        .animation(reduceMotion ? .none : .spring(), value: isExpanded)
    }
}

// Alternative animations
struct TransitionView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showDetail = false

    var body: some View {
        VStack {
            if showDetail {
                DetailView()
                    .transition(reduceMotion ? .opacity : .slide)
            }
        }
        .animation(.default, value: showDetail)
    }
}
```

## Color and Contrast

### Semantic Colors

```swift
// Use semantic colors that adapt
Text("Primary")
    .foregroundStyle(.primary)

Text("Secondary")
    .foregroundStyle(.secondary)

Text("Tertiary")
    .foregroundStyle(.tertiary)

// Error state
Text("Error")
    .foregroundStyle(.red)  // Use semantic red, not custom
```

### Increase Contrast

```swift
struct ContrastAwareView: View {
    @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor
    @Environment(\.accessibilityIncreaseContrast) private var increaseContrast

    var body: some View {
        HStack {
            Circle()
                .fill(increaseContrast ? .primary : .secondary)

            if differentiateWithoutColor {
                // Add non-color indicator
                Image(systemName: "checkmark")
            }
        }
    }
}
```

### Color Blind Support

```swift
struct StatusIndicator: View {
    let status: Status
    @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor

    var body: some View {
        HStack {
            Circle()
                .fill(status.color)
                .frame(width: 10, height: 10)

            if differentiateWithoutColor {
                Image(systemName: status.icon)
            }

            Text(status.label)
        }
    }
}

enum Status {
    case success, warning, error

    var color: Color {
        switch self {
        case .success: return .green
        case .warning: return .orange
        case .error: return .red
        }
    }

    var icon: String {
        switch self {
        case .success: return "checkmark.circle"
        case .warning: return "exclamationmark.triangle"
        case .error: return "xmark.circle"
        }
    }

    var label: String {
        switch self {
        case .success: return "Success"
        case .warning: return "Warning"
        case .error: return "Error"
        }
    }
}
```

## Focus Management

### Focus State

```swift
struct LoginView: View {
    @State private var username = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?

    enum Field {
        case username, password
    }

    var body: some View {
        Form {
            TextField("Username", text: $username)
                .focused($focusedField, equals: .username)
                .submitLabel(.next)
                .onSubmit {
                    focusedField = .password
                }

            SecureField("Password", text: $password)
                .focused($focusedField, equals: .password)
                .submitLabel(.done)
                .onSubmit {
                    login()
                }
        }
        .onAppear {
            focusedField = .username
        }
    }
}
```

### Accessibility Focus

```swift
struct AlertView: View {
    @AccessibilityFocusState private var isAlertFocused: Bool

    var body: some View {
        VStack {
            Text("Important Alert")
                .accessibilityFocused($isAlertFocused)
        }
        .onAppear {
            isAlertFocused = true
        }
    }
}
```

## Button Shapes

```swift
struct AccessibleButton: View {
    @Environment(\.accessibilityShowButtonShapes) private var showButtonShapes

    var body: some View {
        Button("Action") { }
            .padding()
            .background(showButtonShapes ? Color.accentColor.opacity(0.1) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
```

## Smart Invert Colors

```swift
Image("photo")
    .accessibilityIgnoresInvertColors()  // Photos shouldn't invert
```

## Audit Checklist

### VoiceOver
- [ ] All interactive elements have labels
- [ ] Decorative elements are hidden
- [ ] Custom actions for swipe gestures
- [ ] Headings marked correctly
- [ ] Announcements for dynamic changes

### Dynamic Type
- [ ] All text uses dynamic fonts
- [ ] Layout adapts to large sizes
- [ ] No text truncation at accessibility sizes
- [ ] Touch targets remain accessible (44pt minimum)

### Color and Contrast
- [ ] 4.5:1 contrast ratio for text
- [ ] Information not conveyed by color alone
- [ ] Works with Increase Contrast
- [ ] Works with Smart Invert

### Motion
- [ ] Animations respect Reduce Motion
- [ ] No auto-playing animations
- [ ] Alternative interactions for gesture-only features

### General
- [ ] All functionality available via VoiceOver
- [ ] Logical focus order
- [ ] Error messages are accessible
- [ ] Time limits are adjustable

## Testing Tools

### Accessibility Inspector
1. Open Xcode > Open Developer Tool > Accessibility Inspector
2. Point at elements to inspect labels, traits, hints
3. Run audit for common issues

### VoiceOver Practice
1. Settings > Accessibility > VoiceOver
2. Use with your app
3. Navigate by swiping, double-tap to activate

### Voice Control
1. Settings > Accessibility > Voice Control
2. Test all interactions with voice commands

### Xcode Previews

```swift
#Preview {
    ContentView()
        .environment(\.sizeCategory, .accessibilityExtraExtraExtraLarge)
        .environment(\.accessibilityReduceMotion, true)
        .environment(\.accessibilityDifferentiateWithoutColor, true)
}
```
