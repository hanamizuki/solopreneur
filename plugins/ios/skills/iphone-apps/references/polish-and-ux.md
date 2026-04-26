# Polish and UX

Haptics, animations, gestures, and micro-interactions for premium iOS apps.

## Haptics

### Impact Feedback

```swift
import UIKit

struct HapticEngine {
    // Impact - use for UI element hits
    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.impactOccurred()
    }

    // Notification - use for outcomes
    static func notification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(type)
    }

    // Selection - use for picker/selection changes
    static func selection() {
        let generator = UISelectionFeedbackGenerator()
        generator.selectionChanged()
    }
}

// Convenience methods
extension HapticEngine {
    static func light() { impact(.light) }
    static func medium() { impact(.medium) }
    static func heavy() { impact(.heavy) }
    static func rigid() { impact(.rigid) }
    static func soft() { impact(.soft) }

    static func success() { notification(.success) }
    static func warning() { notification(.warning) }
    static func error() { notification(.error) }
}
```

### Usage Guidelines

```swift
// Button tap
Button("Add Item") {
    HapticEngine.light()
    addItem()
}

// Successful action
func save() async {
    do {
        try await saveToDisk()
        HapticEngine.success()
    } catch {
        HapticEngine.error()
    }
}

// Toggle
Toggle("Enable", isOn: $isEnabled)
    .onChange(of: isEnabled) { _, _ in
        HapticEngine.selection()
    }

// Destructive action
Button("Delete", role: .destructive) {
    HapticEngine.warning()
    delete()
}

// Picker change
Picker("Size", selection: $size) {
    ForEach(sizes, id: \.self) { size in
        Text(size).tag(size)
    }
}
.onChange(of: size) { _, _ in
    HapticEngine.selection()
}
```

## Animations

### Spring Animations

```swift
// Standard spring (most natural)
withAnimation(.spring(duration: 0.3)) {
    isExpanded.toggle()
}

// Bouncy spring
withAnimation(.spring(duration: 0.5, bounce: 0.3)) {
    showCard = true
}

// Snappy spring
withAnimation(.spring(duration: 0.2, bounce: 0.0)) {
    offset = .zero
}

// Custom response and damping
withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
    scale = 1.0
}
```

### Transitions

```swift
struct ContentView: View {
    @State private var showDetail = false

    var body: some View {
        VStack {
            if showDetail {
                DetailView()
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .leading).combined(with: .opacity)
                    ))
            }
        }
        .animation(.spring(duration: 0.3), value: showDetail)
    }
}

// Custom transition
extension AnyTransition {
    static var slideAndFade: AnyTransition {
        .asymmetric(
            insertion: .move(edge: .bottom).combined(with: .opacity),
            removal: .opacity
        )
    }
}
```

### Phase Animations

```swift
struct PulsingView: View {
    @State private var isAnimating = false

    var body: some View {
        Circle()
            .fill(.blue)
            .scaleEffect(isAnimating ? 1.1 : 1.0)
            .opacity(isAnimating ? 0.8 : 1.0)
            .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true), value: isAnimating)
            .onAppear {
                isAnimating = true
            }
    }
}
```

### Keyframe Animations

```swift
struct ShakeView: View {
    @State private var trigger = false

    var body: some View {
        Text("Shake me")
            .keyframeAnimator(initialValue: 0.0, trigger: trigger) { content, value in
                content.offset(x: value)
            } keyframes: { _ in
                KeyframeTrack {
                    SpringKeyframe(15, duration: 0.1)
                    SpringKeyframe(-15, duration: 0.1)
                    SpringKeyframe(10, duration: 0.1)
                    SpringKeyframe(-10, duration: 0.1)
                    SpringKeyframe(0, duration: 0.1)
                }
            }
            .onTapGesture {
                trigger.toggle()
            }
    }
}
```

## Gestures

### Drag Gesture

```swift
struct DraggableCard: View {
    @State private var offset = CGSize.zero
    @State private var isDragging = false

    var body: some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(.blue)
            .frame(width: 200, height: 300)
            .offset(offset)
            .scaleEffect(isDragging ? 1.05 : 1.0)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        withAnimation(.interactiveSpring()) {
                            offset = value.translation
                            isDragging = true
                        }
                    }
                    .onEnded { value in
                        withAnimation(.spring(duration: 0.3)) {
                            // Snap back or dismiss based on threshold
                            if abs(value.translation.width) > 150 {
                                // Dismiss
                                offset = CGSize(width: value.translation.width > 0 ? 500 : -500, height: 0)
                            } else {
                                offset = .zero
                            }
                            isDragging = false
                        }
                    }
            )
    }
}
```

### Long Press with Preview

```swift
struct ItemRow: View {
    let item: Item
    @State private var isPressed = false

    var body: some View {
        Text(item.name)
            .scaleEffect(isPressed ? 0.95 : 1.0)
            .gesture(
                LongPressGesture(minimumDuration: 0.5)
                    .onChanged { _ in
                        withAnimation(.easeInOut(duration: 0.1)) {
                            isPressed = true
                        }
                        HapticEngine.medium()
                    }
                    .onEnded { _ in
                        withAnimation(.spring(duration: 0.2)) {
                            isPressed = false
                        }
                        showContextMenu()
                    }
            )
    }
}
```

### Gesture Priority

```swift
struct ZoomableImage: View {
    @State private var scale: CGFloat = 1.0
    @State private var offset = CGSize.zero

    var body: some View {
        Image("photo")
            .resizable()
            .scaledToFit()
            .scaleEffect(scale)
            .offset(offset)
            .gesture(
                // Magnification takes priority
                MagnificationGesture()
                    .onChanged { value in
                        scale = value
                    }
                    .onEnded { _ in
                        withAnimation {
                            scale = max(1, scale)
                        }
                    }
                    .simultaneously(with:
                        DragGesture()
                            .onChanged { value in
                                offset = value.translation
                            }
                            .onEnded { _ in
                                withAnimation {
                                    offset = .zero
                                }
                            }
                    )
            )
    }
}
```

## Loading States

### Skeleton Loading

```swift
struct SkeletonView: View {
    @State private var isAnimating = false

    var body: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(
                LinearGradient(
                    colors: [.gray.opacity(0.3), .gray.opacity(0.1), .gray.opacity(0.3)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .frame(height: 20)
            .mask(
                Rectangle()
                    .offset(x: isAnimating ? 300 : -300)
            )
            .animation(.linear(duration: 1.5).repeatForever(autoreverses: false), value: isAnimating)
            .onAppear {
                isAnimating = true
            }
    }
}

struct LoadingListView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(0..<5) { _ in
                HStack {
                    SkeletonView()
                        .frame(width: 50, height: 50)
                    VStack(alignment: .leading, spacing: 8) {
                        SkeletonView()
                            .frame(width: 150)
                        SkeletonView()
                            .frame(width: 100)
                    }
                }
            }
        }
        .padding()
    }
}
```

### Progress Indicators

```swift
struct ContentLoadingView: View {
    let progress: Double

    var body: some View {
        VStack(spacing: 16) {
            // Circular progress
            ProgressView(value: progress)
                .progressViewStyle(.circular)

            // Linear progress with percentage
            VStack {
                ProgressView(value: progress)
                Text("\(Int(progress * 100))%")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Custom circular
            ZStack {
                Circle()
                    .stroke(.gray.opacity(0.2), lineWidth: 8)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(.blue, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut, value: progress)
            }
            .frame(width: 60, height: 60)
        }
    }
}
```

## Micro-interactions

### Button Press Effect

```swift
struct PressableButton: View {
    let title: String
    let action: () -> Void
    @State private var isPressed = false

    var body: some View {
        Text(title)
            .padding()
            .background(.blue)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .scaleEffect(isPressed ? 0.95 : 1.0)
            .brightness(isPressed ? -0.1 : 0)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        withAnimation(.easeInOut(duration: 0.1)) {
                            isPressed = true
                        }
                    }
                    .onEnded { _ in
                        withAnimation(.spring(duration: 0.2)) {
                            isPressed = false
                        }
                        action()
                    }
            )
    }
}
```

### Success Checkmark

```swift
struct SuccessCheckmark: View {
    @State private var isComplete = false

    var body: some View {
        ZStack {
            Circle()
                .fill(.green)
                .frame(width: 80, height: 80)
                .scaleEffect(isComplete ? 1 : 0)

            Image(systemName: "checkmark")
                .font(.system(size: 40, weight: .bold))
                .foregroundStyle(.white)
                .scaleEffect(isComplete ? 1 : 0)
                .rotationEffect(.degrees(isComplete ? 0 : -90))
        }
        .onAppear {
            withAnimation(.spring(duration: 0.5, bounce: 0.4).delay(0.1)) {
                isComplete = true
            }
            HapticEngine.success()
        }
    }
}
```

### Pull to Refresh Indicator

```swift
struct CustomRefreshView: View {
    @Binding var isRefreshing: Bool

    var body: some View {
        if isRefreshing {
            HStack(spacing: 8) {
                ProgressView()
                Text("Updating...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
    }
}
```

## Scroll Effects

### Parallax Header

```swift
struct ParallaxHeader: View {
    let minHeight: CGFloat = 200
    let maxHeight: CGFloat = 350

    var body: some View {
        GeometryReader { geometry in
            let offset = geometry.frame(in: .global).minY
            let height = max(minHeight, maxHeight + offset)

            Image("header")
                .resizable()
                .scaledToFill()
                .frame(width: geometry.size.width, height: height)
                .clipped()
                .offset(y: offset > 0 ? -offset : 0)
        }
        .frame(height: maxHeight)
    }
}
```

### Scroll Position Effects

```swift
struct FadeOnScrollView: View {
    var body: some View {
        ScrollView {
            LazyVStack {
                ForEach(0..<50) { index in
                    Text("Item \(index)")
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(.background.secondary)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .scrollTransition { content, phase in
                            content
                                .opacity(phase.isIdentity ? 1 : 0.3)
                                .scaleEffect(phase.isIdentity ? 1 : 0.9)
                        }
                }
            }
            .padding()
        }
    }
}
```

## Empty States

```swift
struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String
    let actionTitle: String?
    let action: (() -> Void)?

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 60))
                .foregroundStyle(.secondary)

            Text(title)
                .font(.title2.bold())

            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
                    .padding(.top)
            }
        }
        .padding(40)
    }
}

// Usage
if items.isEmpty {
    EmptyStateView(
        icon: "tray",
        title: "No Items",
        message: "Add your first item to get started",
        actionTitle: "Add Item",
        action: { showNewItem = true }
    )
}
```

## Best Practices

### Respect Reduce Motion

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

var body: some View {
    Button("Action") { }
        .scaleEffect(isPressed ? 0.95 : 1.0)
        .animation(reduceMotion ? .none : .spring(), value: isPressed)
}
```

### Consistent Timing

Use consistent animation durations:
- Quick feedback: 0.1-0.2s
- Standard transitions: 0.3s
- Prominent animations: 0.5s

### Haptic Pairing

Always pair animations with appropriate haptics:
- Success animation → success haptic
- Error shake → error haptic
- Selection change → selection haptic
