# SwiftUI Preview — Extended Guide

Expands on the Preview section of `SKILL.md`. Only content that isn't already
there: ViewModel previews, interactive wrappers, container context, and
troubleshooting.

## ViewModel Previews

For views backed by a ViewModel, expose a mock VM rather than stubbing the
network layer. Keep the factory functions next to the production code so they
stay in sync:

```swift
@MainActor
final class MyViewModel: ObservableObject {
    @Published private(set) var items: [Item] = []
    @Published private(set) var isLoading = false

    static func previewLoaded() -> MyViewModel {
        let vm = MyViewModel()
        vm.items = .mockList
        return vm
    }

    static func previewLoading() -> MyViewModel {
        let vm = MyViewModel()
        vm.isLoading = true
        return vm
    }
}

#Preview("Loaded")  { MyView(viewModel: .previewLoaded()) }
#Preview("Loading") { MyView(viewModel: .previewLoading()) }
```

Guard heavy fixture generation behind `#if DEBUG` if you don't want it in
release builds.

## Interactive Wrappers for Bindings

Binding-heavy views need a small stateful wrapper so you can actually exercise
the binding in the canvas:

```swift
#Preview("Interactive") {
    struct PreviewWrapper: View {
        @State private var text = ""
        var body: some View { MyTextField(text: $text) }
    }
    return PreviewWrapper()
}
```

## Container Context

Views that only make sense inside a specific container (`NavigationStack`,
`Form`, `List`, `TabView`) must preview inside that container — otherwise
spacing, row separators, and typography will look wrong:

```swift
#Preview {
    NavigationStack {
        Form {
            Section { MyFormRow() }
        }
    }
}
```

## State Matrix Beyond the Happy Path

Aim for one Preview per non-trivial state. A View without a `.error` or
`.empty` preview is a red flag in review:

```swift
#Preview("Loading") { MyView(state: .loading) }
#Preview("Loaded")  { MyView(state: .loaded(.mockList)) }
#Preview("Empty")   { MyView(state: .empty) }
#Preview("Error")   { MyView(state: .error(SampleError.network)) }
```

## Troubleshooting

- **Compile errors only inside `#Preview`** — usually a runtime dependency
  (network, Keychain, `FileManager` writes) in `init`. Extract a protocol and
  pass a mock.
- **Preview hangs** — a `Task {}` that loops forever, or `@State`
  initializers that perform I/O. Move work into `.task { }` so the canvas can
  render the initial frame.
- **Crash: missing environment** — Previews don't set up `@Environment` values
  like `\.modelContext` or `@EnvironmentObject` automatically. Provide them
  explicitly inside the Preview closure.
- **Snapshots look stale** — Xcode canvas can hold stale type info after a
  model change. Clean build folder (⇧⌘K) and restart Previews.
