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

/// A captured photo wrapping its raw data representation.
struct Photo: Sendable {
    let data: Data
    let timestamp: Date

    init(data: Data, timestamp: Date = Date()) {
        self.data = data
        self.timestamp = timestamp
    }

    /// Returns the photo file data representation suitable for writing or further processing.
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
    case captureFailed
    case photoCaptureFailed
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .setupFailed:           return "Camera setup failed."
        case .captureDeviceNotFound: return "No capture device found."
        case .addInputFailed:        return "Unable to add capture input."
        case .addOutputFailed:       return "Unable to add capture output."
        case .captureFailed:         return "Capture failed."
        case .photoCaptureFailed:    return "Photo capture processing failed."
        case .unauthorized:          return "Camera access is not authorized."
        }
    }
}
