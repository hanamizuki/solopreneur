//
//  Logging.swift
//
//  Unified logging facade wrapping Apple's os.Logger.
//
//  Goals:
//  - Centralize subsystem + category definitions so call sites only use
//    Log.capture / Log.camera / Log.ui / Log.focus.
//  - Logger is thread-safe; safe to call from any thread including the AVFoundation
//    session queue and @MainActor.
//  - Use info / debug / notice / error severities — never print().
//

import Foundation
import os

/// Logging facade: provides per-domain Logger instances.
enum Log {
    /// Subsystem name. Falls back to a literal if the bundle identifier is nil
    /// (which happens in some test or preview contexts).
    private static let subsystem: String = Bundle.main.bundleIdentifier ?? "PhotoAnalysisApp"

    /// Camera capture + AVFoundation layer (session, device).
    static let capture = Logger(subsystem: subsystem, category: "capture")

    /// Camera ViewModel + application state.
    static let camera = Logger(subsystem: subsystem, category: "camera")

    /// UI interactions (gestures, preview taps).
    static let ui = Logger(subsystem: subsystem, category: "ui")

    /// Focus flow + focus indicator.
    static let focus = Logger(subsystem: subsystem, category: "focus")
}
