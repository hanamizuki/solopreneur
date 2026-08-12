//
//  FocusIndicatorStyle.swift
//
//  Pure data describing the focus indicator's visual style.
//
//  Style decisions live here (shape, color, blink behavior) so they can
//  be unit tested without depending on SwiftUI. FocusIndicatorView reads
//  this struct and maps it to actual SwiftUI primitives + animations.
//

import Foundation

/// Focus visual state (mirrors FocusIndicatorView.FocusState minus `.idle`).
enum FocusVisualState {
    case focusing
    case focused
    case failed
}

/// Indicator shape. Only rectangle is used today; enum exists so future
/// shapes (circle, crosshair) can be added without touching call sites.
enum FocusIndicatorShape: Equatable {
    case rectangle
}

/// Color name kept as a symbolic value rather than a SwiftUI Color so
/// tests can assert on it without importing SwiftUI.
enum FocusIndicatorColorName: Equatable {
    case yellow
    case red
}

/// Indicator style descriptor.
struct FocusIndicatorStyle: Equatable {
    let shape: FocusIndicatorShape
    let colorName: FocusIndicatorColorName
    let blinking: Bool
    /// Blink half-period in seconds. Zero when `blinking` is false.
    let blinkDuration: Double
}

extension FocusIndicatorStyle {
    /// Spec mapping:
    /// - focusing: yellow rectangle, fast blink
    /// - focused:  yellow rectangle, solid (no blink)
    /// - failed:   red rectangle, solid (no blink)
    static func style(for state: FocusVisualState) -> FocusIndicatorStyle {
        switch state {
        case .focusing:
            return FocusIndicatorStyle(
                shape: .rectangle,
                colorName: .yellow,
                blinking: true,
                // 0.15-0.25s counts as "fast blink"; 0.18 is the sweet spot.
                blinkDuration: 0.18
            )
        case .focused:
            return FocusIndicatorStyle(
                shape: .rectangle,
                colorName: .yellow,
                blinking: false,
                blinkDuration: 0.0
            )
        case .failed:
            return FocusIndicatorStyle(
                shape: .rectangle,
                colorName: .red,
                blinking: false,
                blinkDuration: 0.0
            )
        }
    }
}
