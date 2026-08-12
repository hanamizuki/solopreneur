//
//  FocusIndicatorView.swift
//
//  Focus indicator overlay rendered above the camera preview.
//
//  Responsibilities:
//  1. Draw the focus rectangle at a given point.
//  2. Provide visual feedback for focusing / focused / failed states.
//  3. Run the appropriate appear / change / disappear animations.
//
//  Style decisions (shape, color, blink rate) are delegated to
//  FocusIndicatorStyle so the mapping can be unit tested independently
//  of SwiftUI. This file only translates the style descriptor into
//  concrete SwiftUI views and animations.
//

import SwiftUI

/// Focus indicator view component.
struct FocusIndicatorView: View {

    /// Indicator state.
    enum FocusState {
        case idle       // Hidden / not rendered.
        case focusing   // Auto-focus in progress.
        case focused    // Focus locked successfully.
        case failed     // Focus attempt failed.
    }

    let position: CGPoint
    let state: FocusState

    /// Animation parameters.
    @State private var scale: CGFloat = 1.2
    @State private var opacity: Double = 0.0
    @State private var rotation: Double = 0.0

    var body: some View {
        Group {
            switch state {
            case .idle:
                EmptyView()
            case .focusing:
                styledIndicator(for: .focusing)
            case .focused:
                styledIndicator(for: .focused)
            case .failed:
                styledIndicator(for: .failed)
            }
        }
        .position(position)
        .onAppear {
            applyInitialState(for: state)
            // Kick off animations that only run when the view *transitions*
            // into a non-idle state. Without this, a view first rendered
            // with `.focusing` would show as a solid rectangle because the
            // repeating blink is only wired up inside `animateStateChange`.
            if state != .idle {
                animateStateChange(to: state)
            }
        }
        .onChange(of: state) { _, newState in
            animateStateChange(to: newState)
        }
    }

    /// Render the indicator per the style descriptor. Today every state
    /// renders a rounded rectangle; only color and blink behavior differ.
    private func styledIndicator(for visualState: FocusVisualState) -> some View {
        let style = FocusIndicatorStyle.style(for: visualState)
        let color: Color = {
            switch style.colorName {
            case .yellow: return .yellow
            case .red: return .red
            }
        }()
        return ZStack {
            switch style.shape {
            case .rectangle:
                RoundedRectangle(cornerRadius: 4)
                    .stroke(color, lineWidth: 1)
                    .frame(width: 80, height: 80)
                    .scaleEffect(scale)
                    .opacity(opacity)
            }
        }
        // Actual animation behavior is driven by animateStateChange(to:).
    }

    /// Animate transitions between states.
    private func animateStateChange(to newState: FocusState) {
        switch newState {
        case .idle:
            // Fast fade out with a slight shrink.
            withAnimation(.easeOut(duration: 0.15)) {
                opacity = 0.0
                scale = 0.95
                rotation = 0.0
            }
        case .focusing:
            // Focusing: yellow rectangle, fast blink.
            withAnimation(.none) {
                scale = 1.0
                opacity = 1.0
                rotation = 0.0
            }
            let style = FocusIndicatorStyle.style(for: .focusing)
            withAnimation(.easeInOut(duration: style.blinkDuration).repeatForever(autoreverses: true)) {
                // Toggle opacity between 1.0 and 0.2 to produce the fast blink.
                opacity = 0.2
            }
        case .focused:
            // Focused: yellow rectangle, solid.
            withAnimation(.easeOut(duration: 0.12)) {
                scale = 1.0
                opacity = 1.0
                rotation = 0.0
            }
        case .failed:
            // Failed: red rectangle solid, with a tiny bounce for feedback.
            withAnimation(.easeOut(duration: 0.1)) {
                rotation = 0.0
                opacity = 1.0
            }
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6, blendDuration: 0.0)) {
                scale = 1.05
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                withAnimation(.easeOut(duration: 0.1)) {
                    scale = 1.0
                }
            }
        }
    }

    /// Apply the initial animation state so the view does not inherit
    /// leftover values from a previous appearance.
    private func applyInitialState(for state: FocusState) {
        switch state {
        case .idle:
            scale = 1.0
            opacity = 0.0
            rotation = 0.0
        case .focusing:
            scale = 1.0
            opacity = 1.0
            rotation = 0.0
        case .focused:
            scale = 1.0
            opacity = 1.0
            rotation = 0.0
        case .failed:
            scale = 1.0
            opacity = 1.0
            rotation = 0.0
        }
    }
}

/// Convenience constructors.
extension FocusIndicatorView {

    /// Indicator in the focusing state.
    static func focusing(at position: CGPoint) -> FocusIndicatorView {
        FocusIndicatorView(position: position, state: .focusing)
    }

    /// Indicator in the focused (success) state.
    static func focused(at position: CGPoint) -> FocusIndicatorView {
        FocusIndicatorView(position: position, state: .focused)
    }

    /// Indicator in the failed state.
    static func failed(at position: CGPoint) -> FocusIndicatorView {
        FocusIndicatorView(position: position, state: .failed)
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()

        VStack(spacing: 100) {
            FocusIndicatorView.focusing(at: CGPoint(x: 100, y: 100))
            FocusIndicatorView.focused(at: CGPoint(x: 100, y: 200))
            FocusIndicatorView.failed(at: CGPoint(x: 100, y: 300))
        }
    }
}
