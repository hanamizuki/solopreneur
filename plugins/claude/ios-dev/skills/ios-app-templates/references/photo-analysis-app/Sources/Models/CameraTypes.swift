//
//  CameraTypes.swift
//
//  Core value types for camera capture: status, activity, photo, and error.
//

import Foundation

/// Authorization + lifecycle state of the camera session.
enum CameraStatus {
    case unknown
    case unauthorized
    case failed
    case running
}

/// Whether the camera is currently capturing.
enum CaptureActivity {
    case idle
    case capturing

    var isCapturing: Bool {
        if case .capturing = self { return true }
        return false
    }
}

/// A captured photo. `data` is the encoded file representation (HEIC/JPEG)
/// produced by `AVCapturePhoto.fileDataRepresentation()` at capture time —
/// not raw pixel bytes.
struct Photo: Sendable {
    let data: Data
    let timestamp: Date

    init(data: Data, timestamp: Date = Date()) {
        self.data = data
        self.timestamp = timestamp
    }

    /// API-symmetric accessor mirroring `AVCapturePhoto.fileDataRepresentation()`.
    /// In this template the encoded bytes are stored eagerly, so this is a
    /// pass-through returning `self.data`. Kept for call-site symmetry with
    /// AVFoundation; you can also use `photo.data` directly.
    func fileDataRepresentation() -> Data? {
        return data
    }
}

/// Errors thrown by the capture pipeline.
enum CameraError: LocalizedError {
    case setupFailed
    case captureDeviceNotFound
    case addInputFailed
    case addOutputFailed
    /// The capture pipeline (photo output) is not configured. Typically means
    /// `start()` has not run or it failed to add the photo output.
    case captureNotConfigured
    /// `AVCapturePhoto.fileDataRepresentation()` returned nil — the captured
    /// photo could not be encoded into file data.
    case photoDataExtractionFailed
    /// Another capture is already in flight. Callers should disable the
    /// shutter while a capture is pending and re-enable it once the
    /// continuation resolves.
    case captureInProgress
    /// The capture session was torn down (e.g. \`stop()\`) while a capture
    /// was in flight, before AVFoundation produced a final photo. The
    /// pending continuation is resolved with this error so the caller can
    /// distinguish "cancelled" from "hardware/encoder failure".
    case captureCancelled
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .setupFailed:               return "Camera setup failed."
        case .captureDeviceNotFound:     return "No capture device found."
        case .addInputFailed:            return "Unable to add capture input."
        case .addOutputFailed:           return "Unable to add capture output."
        case .captureNotConfigured:      return "Capture pipeline is not configured."
        case .photoDataExtractionFailed: return "Failed to extract photo file data."
        case .captureInProgress:         return "Another capture is already in progress."
        case .captureCancelled:          return "Capture was cancelled before the photo was delivered."
        case .unauthorized:              return "Camera access is not authorized."
        }
    }
}
