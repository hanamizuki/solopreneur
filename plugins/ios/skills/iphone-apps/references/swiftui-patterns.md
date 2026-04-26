# SwiftUI Patterns

Modern SwiftUI patterns for iOS 26 with iOS 18 compatibility.

## View Composition

### Small, Focused Views

```swift
// Bad: Massive view
struct ContentView: View {
    var body: some View {
        VStack {
            // 200 lines of UI code
        }
    }
}

// Good: Composed from smaller views
struct ContentView: View {
    var body: some View {
        VStack {
            HeaderView()
            ItemList()
            ActionBar()
        }
    }
}

struct HeaderView: View {
    var body: some View {
        // Focused implementation
    }
}
```

### Extract Subviews

```swift
struct ItemRow: View {
    let item: Item

    var body: some View {
        HStack {
            iconView
            contentView
            Spacer()
            chevronView
        }
    }

    private var iconView: some View {
        Image(systemName: item.icon)
            .foregroundStyle(.accent)
            .frame(width: 30)
    }

    private var contentView: some View {
        VStack(alignment: .leading) {
            Text(item.name)
                .font(.headline)
            Text(item.subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var chevronView: some View {
        Image(systemName: "chevron.right")
            .foregroundStyle(.tertiary)
            .font(.caption)
    }
}
```

## Async Data Loading

### Task Modifier

```swift
struct ItemList: View {
    @State private var items: [Item] = []
    @State private var isLoading = true
    @State private var error: Error?

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if let error {
                ErrorView(error: error, retry: load)
            } else {
                List(items) { item in
                    ItemRow(item: item)
                }
            }
        }
        .task {
            await load()
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            items = try await fetchItems()
        } catch {
            self.error = error
        }
    }
}
```

### Refresh Control

```swift
struct ItemList: View {
    @State private var items: [Item] = []

    var body: some View {
        List(items) { item in
            ItemRow(item: item)
        }
        .refreshable {
            items = try? await fetchItems()
        }
    }
}
```

### Task with ID

Reload when identifier changes:

```swift
struct ItemDetail: View {
    let itemID: UUID
    @State private var item: Item?

    var body: some View {
        Group {
            if let item {
                ItemContent(item: item)
            } else {
                ProgressView()
            }
        }
        .task(id: itemID) {
            item = try? await fetchItem(id: itemID)
        }
    }
}
```

## Lists and Grids

### Swipe Actions

```swift
List {
    ForEach(items) { item in
        ItemRow(item: item)
            .swipeActions(edge: .trailing) {
                Button(role: .destructive) {
                    delete(item)
                } label: {
                    Label("Delete", systemImage: "trash")
                }

                Button {
                    archive(item)
                } label: {
                    Label("Archive", systemImage: "archivebox")
                }
                .tint(.orange)
            }
            .swipeActions(edge: .leading) {
                Button {
                    toggleFavorite(item)
                } label: {
                    Label("Favorite", systemImage: item.isFavorite ? "star.fill" : "star")
                }
                .tint(.yellow)
            }
    }
}
```

### Lazy Grids

```swift
struct PhotoGrid: View {
    let photos: [Photo]
    let columns = [GridItem(.adaptive(minimum: 100), spacing: 2)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(photos) { photo in
                    AsyncImage(url: photo.thumbnailURL) { image in
                        image
                            .resizable()
                            .aspectRatio(1, contentMode: .fill)
                    } placeholder: {
                        Color.gray.opacity(0.3)
                    }
                    .clipped()
                }
            }
        }
    }
}
```

### Sections with Headers

```swift
List {
    ForEach(groupedItems, id: \.key) { section in
        Section(section.key) {
            ForEach(section.items) { item in
                ItemRow(item: item)
            }
        }
    }
}
.listStyle(.insetGrouped)
```

## Forms and Input

### Form with Validation

```swift
struct ProfileForm: View {
    @State private var name = ""
    @State private var email = ""
    @State private var bio = ""

    private var isValid: Bool {
        !name.isEmpty && email.contains("@") && email.contains(".")
    }

    var body: some View {
        Form {
            Section("Personal Info") {
                TextField("Name", text: $name)
                    .textContentType(.name)

                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
            }

            Section("About") {
                TextField("Bio", text: $bio, axis: .vertical)
                    .lineLimit(3...6)
            }

            Section {
                Button("Save") {
                    save()
                }
                .disabled(!isValid)
            }
        }
    }
}
```

### Pickers

```swift
struct SettingsView: View {
    @State private var selectedTheme = Theme.system
    @State private var fontSize = 16.0

    var body: some View {
        Form {
            Picker("Theme", selection: $selectedTheme) {
                ForEach(Theme.allCases) { theme in
                    Text(theme.rawValue).tag(theme)
                }
            }

            Section("Text Size") {
                Slider(value: $fontSize, in: 12...24, step: 1) {
                    Text("Font Size")
                } minimumValueLabel: {
                    Text("A").font(.caption)
                } maximumValueLabel: {
                    Text("A").font(.title)
                }
                .padding(.vertical)
            }
        }
    }
}
```

## Sheets and Alerts

### Sheet Presentation

```swift
struct ContentView: View {
    @State private var showingSettings = false
    @State private var selectedItem: Item?

    var body: some View {
        List(items) { item in
            Button(item.name) {
                selectedItem = item
            }
        }
        .toolbar {
            Button {
                showingSettings = true
            } label: {
                Image(systemName: "gear")
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
        }
        .sheet(item: $selectedItem) { item in
            ItemDetail(item: item)
        }
    }
}
```

### Confirmation Dialogs

```swift
struct ItemRow: View {
    let item: Item
    @State private var showingDeleteConfirmation = false

    var body: some View {
        HStack {
            Text(item.name)
            Spacer()
            Button(role: .destructive) {
                showingDeleteConfirmation = true
            } label: {
                Image(systemName: "trash")
            }
        }
        .confirmationDialog(
            "Delete \(item.name)?",
            isPresented: $showingDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                delete(item)
            }
        } message: {
            Text("This action cannot be undone.")
        }
    }
}
```

## iOS 26 Features

### Liquid Glass

```swift
struct GlassCard: View {
    var body: some View {
        VStack {
            Text("Premium Content")
                .font(.headline)
        }
        .padding()
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        // iOS 26 glass effect
        .glassEffect()
    }
}

// Availability check
struct AdaptiveCard: View {
    var body: some View {
        if #available(iOS 26, *) {
            GlassCard()
        } else {
            StandardCard()
        }
    }
}
```

### WebView

```swift
import WebKit

// iOS 26+ native WebView
struct WebContent: View {
    let url: URL

    var body: some View {
        if #available(iOS 26, *) {
            WebView(url: url)
                .ignoresSafeArea()
        } else {
            WebViewRepresentable(url: url)
        }
    }
}

// Fallback for iOS 18
struct WebViewRepresentable: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        WKWebView()
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.load(URLRequest(url: url))
    }
}
```

### @Animatable Macro

```swift
// iOS 26+
@available(iOS 26, *)
@Animatable
struct PulsingCircle: View {
    var scale: Double

    var body: some View {
        Circle()
            .scaleEffect(scale)
    }
}
```

## Custom Modifiers

### Reusable Styling

```swift
struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(.background)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardModifier())
    }
}

// Usage
Text("Content")
    .cardStyle()
```

### Conditional Modifiers

```swift
extension View {
    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}

// Usage
Text("Item")
    .if(isHighlighted) { view in
        view.foregroundStyle(.accent)
    }
```

## Preview Techniques

### Multiple Configurations

```swift
#Preview("Light Mode") {
    ItemRow(item: .sample)
        .preferredColorScheme(.light)
}

#Preview("Dark Mode") {
    ItemRow(item: .sample)
        .preferredColorScheme(.dark)
}

#Preview("Large Text") {
    ItemRow(item: .sample)
        .environment(\.sizeCategory, .accessibilityExtraLarge)
}
```

### Interactive Previews

```swift
#Preview {
    @Previewable @State var isOn = false

    Toggle("Setting", isOn: $isOn)
        .padding()
}
```

### Preview with Mock Data

```swift
extension Item {
    static let sample = Item(
        name: "Sample Item",
        subtitle: "Sample subtitle",
        icon: "star"
    )

    static let samples: [Item] = [
        Item(name: "First", subtitle: "One", icon: "1.circle"),
        Item(name: "Second", subtitle: "Two", icon: "2.circle"),
        Item(name: "Third", subtitle: "Three", icon: "3.circle")
    ]
}

#Preview {
    List(Item.samples) { item in
        ItemRow(item: item)
    }
}
```
