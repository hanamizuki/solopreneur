//
//  CameraModel.swift
//
//  ViewModel that composes CaptureService, VisionFrameworkService, and
//  FoundationModelsService into the photo-analysis pipeline:
//      capture → vision → LLM → PhotoAnalysisResult.
//
//  Persistence is intentionally absent — wire your own (SwiftData / Core Data
//  / cloud) at the call site in your app.
//

import Foundation
import SwiftUI
import UIKit
import AVFoundation
import os

@MainActor
@Observable
final class CameraModel {

    // MARK: - Camera state

    var status: CameraStatus = .unknown
    private(set) var captureActivity: CaptureActivity = .idle
    private(set) var zoomFactor: Float = 1.0
    private(set) var isFocusing: Bool = false
    private(set) var focusPoint: CGPoint?
    var error: Error?

    // MARK: - Analysis state

    /// The latest analysis result. Nil until the first capture-and-analyze
    /// pass completes.
    private(set) var analysisResult: PhotoAnalysisResult?

    // MARK: - Services

    private let captureService = CaptureService()
    private let foundationService = FoundationModelsService()

    /// The preview layer to display in the UI.
    var previewLayer: AVCaptureVideoPreviewLayer { captureService.previewLayer }

    // MARK: - Lifecycle

    func start() async {
        do {
            try await captureService.start()
            status = .running
            Log.camera.info("Camera started")
        } catch {
            status = .failed
            self.error = error
            Log.camera.error("Camera start failed: \(error.localizedDescription)")
        }
    }

    func stop() {
        captureService.stop()
        status = .unknown
    }

    // MARK: - Capture

    func capturePhoto() async {
        captureActivity = .capturing
        defer { captureActivity = .idle }

        let photo: Photo
        do {
            photo = try await captureService.capturePhoto()
        } catch {
            self.error = error
            Log.camera.error("Capture failed: \(error.localizedDescription)")
            return
        }

        await analyze(photo: photo)
    }

    // MARK: - Focus + zoom (pass-through)

    func focus(at point: CGPoint) {
        focusPoint = point
        isFocusing = true
        captureService.setFocus(at: point)
        // Reset the indicator after a short delay; UI animation owns timing.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            isFocusing = false
        }
    }

    func zoom(by delta: Float) {
        zoomFactor = max(1.0, min(zoomFactor + delta, 6.0))
        captureService.zoom(factor: CGFloat(zoomFactor))
    }

    // MARK: - Analyze

    private func analyze(photo: Photo) async {
        guard let image = UIImage(data: photo.data) else {
            Log.camera.notice("Captured photo has no decodable UIImage")
            return
        }

        let visionData: ComprehensiveVisionData
        do {
            visionData = try await VisionFrameworkService.collectComprehensiveVisionData(from: image)
        } catch {
            Log.camera.error("Vision collection failed: \(error.localizedDescription)")
            return
        }

        let prompt = """
            Analyze the following visual signals captured from a photo and
            describe the scene in one paragraph. Highlight any text content.

            \(visionData.summarizedForPrompt())
            """

        var llmResponse = ""
        if #available(iOS 26.0, *), FoundationModelsService.isSupported {
            do {
                llmResponse = try await foundationService.generateResponse(prompt: prompt)
            } catch {
                Log.camera.error("FoundationModels failed: \(error.localizedDescription)")
            }
        } else {
            Log.camera.notice("FoundationModels not available on this device; skipping LLM step")
        }

        analysisResult = PhotoAnalysisResult(
            vision: visionData,
            llmResponse: llmResponse,
            capturedAt: photo.timestamp
        )
    }
}
