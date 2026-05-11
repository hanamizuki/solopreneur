//
//  CaptureService.swift
//
//  AVFoundation camera session manager.
//
//  Architecture: `final class : NSObject` with a dedicated serial queue
//  (`sessionQueue`) — AVCaptureSession mutations must run off the main
//  thread, and AVFoundation pre-dates Swift Concurrency. The preview layer
//  is created lazily on first access and is intended to be consumed on the
//  main thread by the SwiftUI / UIKit view layer.
//
//  Public surface:
//    - `start() async throws`           Authorize + configure + run session
//    - `stop()`                         Stop the session
//    - `capturePhoto() async throws`    Capture one photo, returning `Photo`
//    - `setFocus(at:)`                  Tap-to-focus / exposure point
//    - `zoom(factor:)`                  Set video zoom factor (clamped)
//
//  Anything beyond this surface (album write-back, EXIF rewriting, location
//  overlay, post-capture analysis, on-disk persistence) belongs in the
//  ViewModel or in a dedicated service — not here.
//

import Foundation
// `@preconcurrency` is required here because AVFoundation's session and
// device types are not yet annotated as `Sendable` in the public SDK. All
// mutations in this file go through `sessionQueue` (a serial
// DispatchQueue), which is the AVFoundation-recommended pattern. Remove
// the attribute when Apple ships Sendable conformance for these types.
@preconcurrency import AVFoundation
import UIKit

final class CaptureService: NSObject {

    // MARK: - Properties

    /// The shared capture session. All mutations go through `sessionQueue`.
    private let session = AVCaptureSession()

    /// Dedicated serial queue for session / device configuration.
    /// AVCaptureSession mutations are not thread-safe — they must run on a
    /// single serial queue, never on the main thread.
    private let sessionQueue = DispatchQueue(label: "photo-analysis-app.capture-session")

    /// The photo output. Created in `setupSession()`.
    private var photoOutput: AVCapturePhotoOutput?

    /// The current video device input. Retained so we can adjust focus / zoom.
    private var videoDeviceInput: AVCaptureDeviceInput?

    /// Preview layer for the view layer. Lazy-initialized on first access so
    /// the caller (typically a `UIViewRepresentable` on the main thread)
    /// controls construction site.
    private(set) lazy var previewLayer: AVCaptureVideoPreviewLayer = {
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        return layer
    }()

    /// In-flight capture continuation. Set by `capturePhoto()` and resumed
    /// exactly once by the `AVCapturePhotoCaptureDelegate` callbacks below.
    /// Access is confined to `sessionQueue`.
    private var captureContinuation: CheckedContinuation<Photo, Error>?

    // MARK: - Authorization

    /// Asks the user for camera access if not yet determined, and returns
    /// whether the app currently has authorization.
    private var isAuthorized: Bool {
        get async {
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            if status == .authorized { return true }
            if status == .notDetermined {
                return await AVCaptureDevice.requestAccess(for: .video)
            }
            return false
        }
    }

    // MARK: - Lifecycle

    /// Authorize, configure, and start the capture session.
    ///
    /// Throws `CameraError.unauthorized` if the user denied or has not
    /// granted camera access. Throws other `CameraError` cases when device
    /// or output setup fails.
    func start() async throws {
        guard await isAuthorized else {
            throw CameraError.unauthorized
        }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            sessionQueue.async { [weak self] in
                guard let self else {
                    continuation.resume(returning: ())
                    return
                }
                // Re-check inside the queue. Reading `session.isRunning`
                // outside `sessionQueue` would race with concurrent
                // `start()` calls and could cause `setupSession()` to run
                // twice, which triggers AVFoundation exceptions on the
                // duplicate `addInput` / `addOutput`.
                if self.session.isRunning {
                    continuation.resume(returning: ())
                    return
                }
                do {
                    try self.setupSession()
                    Log.capture.info("Starting capture session")
                    self.session.startRunning()
                    Log.capture.info("Capture session running")
                    continuation.resume(returning: ())
                } catch {
                    Log.capture.error("Capture session setup failed: \(error.localizedDescription)")
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    /// Stop the capture session. Safe to call from any thread.
    ///
    /// If a \`capturePhoto()\` is in flight when this is called (delegate
    /// callback has not yet fired), the pending continuation is resumed
    /// with \`CameraError.captureCancelled\` so the caller does not deadlock
    /// waiting for a photo that will never arrive.
    func stop() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            // Drain any in-flight capture before tearing down the session.
            if let pending = self.captureContinuation {
                Log.capture.notice("Cancelling in-flight capture due to session stop")
                self.captureContinuation = nil
                pending.resume(throwing: CameraError.captureCancelled)
            }
            if self.session.isRunning {
                self.session.stopRunning()
                Log.capture.info("Capture session stopped")
            }
        }
    }

    // MARK: - Session configuration (sessionQueue only)

    /// Build the AVCaptureSession: pick a back camera, add it as input, add
    /// and configure the photo output. Must be called on `sessionQueue`.
    ///
    /// Idempotent: if the session already has inputs (i.e. we ran setup
    /// before and the session was stopped but not torn down), this returns
    /// without re-adding anything. Adding the same input or output twice
    /// raises an AVFoundation exception.
    private func setupSession() throws {
        // Idempotency guard. `start()` can be called again after `stop()`
        // (e.g. a view re-appearing), and AVFoundation will crash on a
        // duplicate `addInput` / `addOutput`. We tolerate the duplicate
        // call but don't redo the work.
        guard session.inputs.isEmpty else { return }

        session.beginConfiguration()
        defer { session.commitConfiguration() }

        // Use the `.photo` preset — this is what enables Zero Shutter Lag
        // on supported hardware and gives us the highest-quality capture.
        session.sessionPreset = .photo

        // Prefer the most capable back camera the device exposes. Triple
        // and dual cameras give smooth optical zoom transitions; otherwise
        // fall back to the standard wide-angle.
        let deviceType: AVCaptureDevice.DeviceType
        if AVCaptureDevice.default(.builtInTripleCamera, for: .video, position: .back) != nil {
            deviceType = .builtInTripleCamera
        } else if AVCaptureDevice.default(.builtInDualCamera, for: .video, position: .back) != nil {
            deviceType = .builtInDualCamera
        } else {
            deviceType = .builtInWideAngleCamera
        }

        guard let camera = AVCaptureDevice.default(deviceType, for: .video, position: .back) else {
            throw CameraError.captureDeviceNotFound
        }
        Log.capture.info("Selected camera: \(deviceType.rawValue)")

        // Configure default focus / exposure on the device itself, before
        // we wrap it in an input. Continuous AF / AE is a sensible default
        // for a still-photo app; the user can override via `setFocus(at:)`.
        try camera.lockForConfiguration()
        if camera.isFocusModeSupported(.continuousAutoFocus) {
            camera.focusMode = .continuousAutoFocus
        }
        if camera.isExposureModeSupported(.continuousAutoExposure) {
            camera.exposureMode = .continuousAutoExposure
        }
        camera.isSubjectAreaChangeMonitoringEnabled = true
        camera.unlockForConfiguration()

        let input = try AVCaptureDeviceInput(device: camera)
        guard session.canAddInput(input) else {
            throw CameraError.addInputFailed
        }
        session.addInput(input)
        videoDeviceInput = input

        let output = AVCapturePhotoOutput()
        guard session.canAddOutput(output) else {
            throw CameraError.addOutputFailed
        }
        session.addOutput(output)
        photoOutput = output

        // Configure the photo output BEFORE `startRunning()`. Apple's
        // docs for both `maxPhotoDimensions` and
        // `isAutoDeferredPhotoDeliveryEnabled` recommend setting them
        // while the session is still being assembled, because changing
        // them after `startRunning()` may trigger a lengthy capture
        // pipeline reconfiguration.
        configurePhotoOutput(output, device: camera)
    }

    /// Apply per-output settings (max dimensions, quality prioritization,
    /// Zero Shutter Lag, Responsive Capture). Called from `setupSession()`
    /// while the session is still in a `beginConfiguration` transaction,
    /// before `startRunning()`.
    private func configurePhotoOutput(_ output: AVCapturePhotoOutput, device: AVCaptureDevice) {
        // Push the highest supported photo dimensions to the output so
        // captures use the full sensor resolution. Setting this property
        // doesn't itself require a session-configuration block, but doing
        // it here keeps all output setup in one place.
        if let maxDimensions = device.activeFormat.supportedMaxPhotoDimensions.last {
            output.maxPhotoDimensions = maxDimensions
            Log.capture.info("Max photo dimensions: \(maxDimensions.width)x\(maxDimensions.height)")
        }

        // `.balanced` keeps Zero Shutter Lag eligible while still
        // producing high-quality images. `.speed` would disable ZSL.
        output.maxPhotoQualityPrioritization = .balanced

        // NOTE: We deliberately do NOT enable `isAutoDeferredPhotoDeliveryEnabled`.
        // When auto-deferred delivery is on, AVFoundation delivers the
        // capture via `photoOutput(_:didFinishCapturingDeferredPhotoProxy:error:)`
        // instead of `didFinishProcessingPhoto`. This template only implements
        // the latter, so enabling auto-deferred delivery would silently hang
        // the capture continuation forever. To opt in, also implement the
        // deferred-proxy delegate callback and resume the same continuation
        // there using `deferredPhotoProxy.fileDataRepresentation()`.

        // Zero Shutter Lag: the system keeps a small ring buffer of frames
        // so the moment the shutter is tapped is closer to "now" than to
        // "after processing". The support flag is available as soon as the
        // output is attached; we don't need to wait for `startRunning()`.
        if output.isZeroShutterLagSupported {
            output.isZeroShutterLagEnabled = true
            Log.capture.info("Zero Shutter Lag enabled")
        }

        // Responsive Capture (iOS 17+) lets the system start preparing
        // the next capture before the previous one finishes processing.
        if #available(iOS 17.0, *) {
            if output.isResponsiveCaptureSupported {
                output.isResponsiveCaptureEnabled = true
                Log.capture.info("Responsive Capture enabled")
            }
        }
    }

    // MARK: - Capture

    /// Capture a single photo and return its encoded file representation.
    ///
    /// The returned `Photo.data` is whatever
    /// `AVCapturePhoto.fileDataRepresentation()` produces — typically
    /// HEIC on modern devices, JPEG as a fallback. The View / ViewModel
    /// is responsible for deciding what to do with the bytes (display,
    /// hand to an analyzer, persist, etc.).
    func capturePhoto() async throws -> Photo {
        try await withCheckedThrowingContinuation { continuation in
            sessionQueue.async { [weak self] in
                guard let self else {
                    continuation.resume(throwing: CameraError.captureNotConfigured)
                    return
                }
                guard let output = self.photoOutput else {
                    Log.capture.error("capturePhoto called before photoOutput was configured")
                    continuation.resume(throwing: CameraError.captureNotConfigured)
                    return
                }

                // Refuse to overlap captures — the delegate model here
                // assumes one in-flight photo at a time. The View should
                // disable the shutter button while a capture is pending.
                if self.captureContinuation != nil {
                    Log.capture.notice("capturePhoto called while another capture is in flight; rejecting")
                    continuation.resume(throwing: CameraError.captureInProgress)
                    return
                }

                self.captureContinuation = continuation
                let settings = self.makePhotoSettings(for: output)
                output.capturePhoto(with: settings, delegate: self)
            }
        }
    }

    /// Build the per-capture settings. Kept simple in the template:
    /// prefer HEVC, no flash, no red-eye reduction. Customize as needed.
    private func makePhotoSettings(for output: AVCapturePhotoOutput) -> AVCapturePhotoSettings {
        let settings: AVCapturePhotoSettings
        if output.availablePhotoCodecTypes.contains(.hevc) {
            settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.hevc])
        } else {
            settings = AVCapturePhotoSettings()
        }
        settings.flashMode = .off
        settings.isAutoRedEyeReductionEnabled = false
        return settings
    }

    // MARK: - Focus

    /// Set the focus + exposure point of interest. `point` is in device
    /// coordinates (0,0 = top-left of the sensor, 1,1 = bottom-right).
    /// The View layer is responsible for converting tap locations in
    /// preview-layer space via `previewLayer.captureDevicePointConverted(fromLayerPoint:)`.
    func setFocus(at point: CGPoint) {
        sessionQueue.async { [weak self] in
            guard let self, let device = self.videoDeviceInput?.device else {
                Log.focus.error("setFocus called before capture device was available")
                return
            }

            // Validate the device-coordinate input — silently no-op on
            // out-of-range values rather than crashing AVFoundation.
            guard point.x >= 0, point.x <= 1, point.y >= 0, point.y <= 1 else {
                Log.focus.notice("Ignoring out-of-range focus point: \(String(describing: point))")
                return
            }

            do {
                try device.lockForConfiguration()
                defer { device.unlockForConfiguration() }

                if device.isFocusPointOfInterestSupported,
                   device.isFocusModeSupported(.autoFocus) {
                    device.focusPointOfInterest = point
                    device.focusMode = .autoFocus
                    Log.focus.info("Focus point set: \(String(describing: point))")
                }

                if device.isExposurePointOfInterestSupported {
                    if device.isExposureModeSupported(.autoExpose) {
                        device.exposurePointOfInterest = point
                        device.exposureMode = .autoExpose
                    } else if device.isExposureModeSupported(.continuousAutoExposure) {
                        device.exposurePointOfInterest = point
                        device.exposureMode = .continuousAutoExposure
                    }
                }

                // Re-enable subject-area-change monitoring so the device
                // automatically falls back to continuous AF / AE if the
                // composition changes substantially.
                device.isSubjectAreaChangeMonitoringEnabled = true
            } catch {
                Log.focus.error("setFocus failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Zoom

    /// Set the video zoom factor on the active device. The value is
    /// clamped to the device's supported range; invalid devices are
    /// silently ignored.
    func zoom(factor: CGFloat) {
        sessionQueue.async { [weak self] in
            guard let self, let device = self.videoDeviceInput?.device else {
                Log.capture.error("zoom called before capture device was available")
                return
            }
            let minZoom = device.minAvailableVideoZoomFactor
            let maxZoom = device.maxAvailableVideoZoomFactor
            let clamped = min(max(factor, minZoom), maxZoom)
            do {
                try device.lockForConfiguration()
                defer { device.unlockForConfiguration() }
                device.videoZoomFactor = clamped
            } catch {
                Log.capture.error("zoom failed: \(error.localizedDescription)")
            }
        }
    }
}

// MARK: - AVCapturePhotoCaptureDelegate

extension CaptureService: AVCapturePhotoCaptureDelegate {

    /// Final delegate callback — called after AVFoundation has finished
    /// processing the captured frame into a deliverable photo. The
    /// `captureContinuation` is resumed exactly once and then cleared so
    /// the next `capturePhoto()` call can proceed.
    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        // Hop to the session queue so reads / writes of
        // `captureContinuation` are serialized with `capturePhoto()`.
        sessionQueue.async { [weak self] in
            guard let self else { return }
            guard let continuation = self.captureContinuation else {
                // No pending continuation — either we were cancelled or
                // delivered a duplicate callback. Drop silently.
                return
            }
            self.captureContinuation = nil

            if let error {
                Log.capture.error("Photo processing failed: \(error.localizedDescription)")
                continuation.resume(throwing: error)
                return
            }

            guard let data = photo.fileDataRepresentation() else {
                Log.capture.error("AVCapturePhoto.fileDataRepresentation() returned nil")
                continuation.resume(throwing: CameraError.photoDataExtractionFailed)
                return
            }

            continuation.resume(returning: Photo(data: data))
        }
    }
}
