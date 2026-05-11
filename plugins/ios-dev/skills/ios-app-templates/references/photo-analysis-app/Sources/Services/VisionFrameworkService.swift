//
//  VisionFrameworkService.swift
//  photo-analysis-app template
//
//  Stateless utility that collects signals from Apple's Vision framework
//  (OCR, face/human/animal detection, classification, saliency, barcodes,
//  rectangles, horizon angle) for a single still image, plus the data
//  models that hold the result.
//
//  Design notes:
//  - Implemented as an `enum` namespace, not a class. Vision requests carry
//    no instance state, so an init would only add ceremony.
//  - All public surface is `static`. Data models are `Sendable` so the
//    result can cross actor boundaries (e.g. into a `@MainActor` view model
//    or a downstream LLM-prompting service).
//  - No persistence layer here. Callers decide whether to cache the
//    `ComprehensiveVisionData` if they want to — this file deliberately
//    has no dependency on any storage stack.
//

import Foundation
import UIKit
import Vision
import os

// MARK: - Logger

private let visionLog = Logger(subsystem: "app.photo-analysis", category: "Vision")

// MARK: - Service Namespace

/// Stateless namespace that exposes Vision-framework collectors.
///
/// Typical usage:
/// ```swift
/// let data = try await VisionFrameworkService.collectComprehensiveVisionData(from: uiImage)
/// let prompt = data.summarizedForPrompt()
/// ```
enum VisionFrameworkService {

    // MARK: Public collectors

    /// Run the full Vision pipeline against a `UIImage`.
    ///
    /// The `CGImage` is extracted on the main actor because `UIImage.cgImage`
    /// is not Sendable; the actual Vision work then runs off the main thread.
    static func collectComprehensiveVisionData(from image: UIImage) async throws -> ComprehensiveVisionData {
        let cgImage = try await MainActor.run { () throws -> CGImage in
            guard let cgImage = image.cgImage else {
                throw PhotoAnalysisError.invalidImage
            }
            return cgImage
        }
        return try await performVisionAnalysis(on: cgImage)
    }

    /// Run the full Vision pipeline against a `CGImage` directly.
    ///
    /// Prefer this overload from background pipelines that already hold a
    /// thread-safe `CGImage`, to avoid bouncing through `UIImage`.
    static func collectComprehensiveVisionData(fromCGImage cgImage: CGImage) async throws -> ComprehensiveVisionData {
        return try await performVisionAnalysis(on: cgImage)
    }

    // MARK: Core analysis

    /// Dispatch all Vision requests in a single `VNImageRequestHandler.perform`
    /// call and collect their results into a `ComprehensiveVisionData`.
    ///
    /// We use a continuation that resolves once all request completion handlers
    /// have fired. Each handler increments a "completed" counter; when it
    /// reaches `totalRequests`, we resume. `hasResumed` guards against the
    /// double-resume that would happen if `handler.perform` throws after some
    /// callbacks have already run.
    private static func performVisionAnalysis(on cgImage: CGImage) async throws -> ComprehensiveVisionData {
        return try await withCheckedThrowingContinuation { continuation in
            var data = ComprehensiveVisionData()
            var pendingRequests = 0
            var hasResumed = false

            let totalRequests = 10
            let checkCompletion = { (requestName: String) in
                pendingRequests -= 1
                let completed = totalRequests - pendingRequests
                visionLog.debug("Vision request finished [\(completed)/\(totalRequests)]: \(requestName)")
                if pendingRequests == 0 && !hasResumed {
                    hasResumed = true
                    visionLog.info("All Vision requests finished")
                    continuation.resume(returning: data)
                }
            }

            func handleError(_ error: Error?, requestName: String) {
                if let error = error {
                    Task { @MainActor in
                        visionLog.error("\(requestName) failed: \(error.localizedDescription)")
                    }
                }
                checkCompletion(requestName)
            }

            // 1. Image classification (also opportunistically flags documents
            //    by keyword match on the top classifications).
            let classifyRequest = VNClassifyImageRequest { request, error in
                defer {
                    data.performedAnalyses.insert("classification")
                    handleError(error, requestName: "classification")
                }
                guard let observations = request.results as? [VNClassificationObservation] else { return }
                data.classifications = observations.prefix(10).map {
                    "\($0.identifier) (\(String(format: "%.2f", $0.confidence)))"
                }
                let documentKeywords = [
                    "document", "receipt", "paper", "ticket", "printed_page",
                    "invoice", "bill", "menu", "text"
                ]
                let hasDocumentClassification = observations.prefix(5).contains { observation in
                    documentKeywords.contains { keyword in
                        observation.identifier.lowercased().contains(keyword)
                    }
                }
                if hasDocumentClassification {
                    data.hasDocument = true
                    visionLog.debug("Classification suggests document content")
                }
            }
            pendingRequests += 1

            // 2. Face detection with capture-quality scoring.
            let faceRequest = VNDetectFaceCaptureQualityRequest { request, error in
                defer {
                    data.performedAnalyses.insert("face")
                    handleError(error, requestName: "face detection")
                }
                guard let observations = request.results as? [VNFaceObservation] else { return }
                data.faces = observations.map { obs in
                    FaceData(
                        quality: obs.faceCaptureQuality ?? 0.0,
                        boundingBox: obs.boundingBox
                    )
                }
            }
            pendingRequests += 1

            // 3. Human-body rectangle detection.
            let humanRequest = VNDetectHumanRectanglesRequest { request, error in
                defer {
                    data.performedAnalyses.insert("human")
                    handleError(error, requestName: "human detection")
                }
                guard let observations = request.results as? [VNHumanObservation] else { return }
                data.humans = observations.map { obs in
                    HumanData(
                        pose: "detected",
                        boundingBox: obs.boundingBox,
                        confidence: safeConfidence(from: obs)
                    )
                }
            }
            pendingRequests += 1

            // 4. Animal recognition (cats, dogs, etc.).
            let animalRequest = VNRecognizeAnimalsRequest { request, error in
                defer {
                    data.performedAnalyses.insert("animal")
                    handleError(error, requestName: "animal recognition")
                }
                guard let observations = request.results as? [VNRecognizedObjectObservation] else { return }
                data.animals = observations.compactMap { obs in
                    guard let label = obs.labels.first else { return nil }
                    return AnimalData(
                        type: label.identifier,
                        confidence: Float(label.confidence),
                        boundingBox: obs.boundingBox
                    )
                }
            }
            pendingRequests += 1

            // 5. OCR. Configured for accurate recognition with automatic
            //    language detection over the device's full supported set.
            let textRequest = VNRecognizeTextRequest { request, error in
                defer {
                    data.performedAnalyses.insert("ocr")
                    handleError(error, requestName: "text recognition")
                }
                guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
                let recognizedTexts = observations.enumerated().compactMap { index, observation -> RecognizedTextBlock? in
                    guard let candidate = observation.topCandidates(1).first else { return nil }
                    let bbox = observation.boundingBox

                    if index < 3 {
                        visionLog.debug("OCR[\(index)]: '\(candidate.string.prefix(20))...' bbox=(\(String(format: "%.3f", bbox.origin.x)), \(String(format: "%.3f", bbox.origin.y)), \(String(format: "%.3f", bbox.width)), \(String(format: "%.3f", bbox.height)))")
                    }

                    return RecognizedTextBlock(
                        textId: String(format: "text_%03d", index + 1),
                        text: candidate.string,
                        boundingBox: bbox,
                        confidence: Float(candidate.confidence),
                        language: nil
                    )
                }
                data.recognizedTexts = recognizedTexts
                if !recognizedTexts.isEmpty {
                    visionLog.debug("OCR captured \(recognizedTexts.count) text blocks")
                }
            }

            // OCR parameters must be set after the request is constructed but
            // before it is performed.
            textRequest.recognitionLevel = .accurate
            textRequest.usesLanguageCorrection = true
            textRequest.automaticallyDetectsLanguage = true

            if let supportedLanguages = try? textRequest.supportedRecognitionLanguages(),
               !supportedLanguages.isEmpty {
                textRequest.recognitionLanguages = supportedLanguages
                visionLog.info("OCR automatic language detection enabled with \(supportedLanguages.count) candidate languages")
            } else {
                // Fallback when the device cannot enumerate languages.
                textRequest.recognitionLanguages = ["ja-JP", "zh-Hant", "zh-Hans", "en-US", "ko-KR"]
                visionLog.notice("OCR using default language fallback list")
            }

            pendingRequests += 1

            // 6. Barcode detection.
            let barcodeRequest = VNDetectBarcodesRequest { request, error in
                defer {
                    data.performedAnalyses.insert("barcode")
                    handleError(error, requestName: "barcode detection")
                }
                guard let observations = request.results as? [VNBarcodeObservation] else { return }
                data.barcodes = observations.compactMap { $0.payloadStringValue }
            }
            pendingRequests += 1

            // 7. Rectangle detection. Detected rectangles also count as a
            //    document signal (receipts, business cards, paper, etc.).
            let rectangleRequest = VNDetectRectanglesRequest { request, error in
                defer {
                    data.performedAnalyses.insert("document")
                    handleError(error, requestName: "rectangle detection")
                }
                guard let observations = request.results as? [VNRectangleObservation] else { return }
                data.rectangles = observations.map { obs in
                    RectangleData(
                        boundingBox: obs.boundingBox,
                        confidence: safeConfidence(from: obs)
                    )
                }
                if !observations.isEmpty {
                    data.hasDocument = true
                    visionLog.debug("Rectangle detection suggests document content")
                }
            }
            pendingRequests += 1

            // 8. Attention-based saliency (where a human would look).
            let salientRequest = VNGenerateAttentionBasedSaliencyImageRequest { request, error in
                defer {
                    data.performedAnalyses.insert("attention_saliency")
                    handleError(error, requestName: "attention saliency")
                }
                guard let results = request.results as? [VNSaliencyImageObservation],
                      let object = results.first else { return }
                if let salientObjects = object.salientObjects {
                    data.salientObjects = salientObjects.map { obs in
                        SalientObjectData(
                            boundingBox: obs.boundingBox,
                            confidence: safeConfidence(from: obs),
                            objectType: "unknown"
                        )
                    }
                }
            }
            pendingRequests += 1

            // 9. Objectness-based saliency (where the dominant object is).
            let boundingBoxSaliency = VNGenerateObjectnessBasedSaliencyImageRequest { request, error in
                defer {
                    data.performedAnalyses.insert("objectness_saliency")
                    handleError(error, requestName: "objectness saliency")
                }
                guard let results = request.results as? [VNSaliencyImageObservation],
                      let object = results.first else { return }

                if let salientObjectsList = object.salientObjects,
                   !salientObjectsList.isEmpty,
                   let region = salientObjectsList.first {
                    let box = region.boundingBox
                    data.saliencyRegion = "x:\(String(format: "%.2f", box.origin.x)), y:\(String(format: "%.2f", box.origin.y)), w:\(String(format: "%.2f", box.size.width)), h:\(String(format: "%.2f", box.size.height))"
                }
            }
            pendingRequests += 1

            // 10. Horizon angle (useful for landscape composition).
            let horizonRequest = VNDetectHorizonRequest { request, error in
                defer {
                    data.performedAnalyses.insert("horizon")
                    handleError(error, requestName: "horizon detection")
                }
                guard let results = request.results as? [VNHorizonObservation],
                      let horizon = results.first else { return }
                data.horizonAngle = Float(horizon.angle)
            }
            pendingRequests += 1

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            let requests: [VNRequest] = [
                classifyRequest,
                faceRequest,
                humanRequest,
                animalRequest,
                textRequest,
                barcodeRequest,
                rectangleRequest,
                salientRequest,
                boundingBoxSaliency,
                horizonRequest
            ]

            do {
                try handler.perform(requests)
            } catch {
                if !hasResumed {
                    hasResumed = true
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    // MARK: - Safe confidence access
    //
    // Different `VNObservation` subclasses expose `confidence` with very
    // different semantics. For some types (e.g. `VNRectangleObservation`,
    // `VNPixelBufferObservation`) the value is hard-coded to 1.0 and carries
    // no real information; for others it is the actual model score. We
    // normalize that here: return `nil` whenever the value is not meaningful,
    // so downstream code can decide how to render "unknown confidence".

    /// Safely read `confidence` from a Vision observation, returning `nil`
    /// when the underlying observation type does not produce a meaningful
    /// confidence score.
    private static func safeConfidence(from observation: VNObservation) -> Float? {
        // These types report 1.0 by contract; not informative.
        if observation is VNPixelBufferObservation ||
           observation is VNCoreMLFeatureValueObservation {
            return nil
        }

        // VNRectangleObservation's confidence is typically a constant 1.0.
        if let rectangleObs = observation as? VNRectangleObservation {
            let confidence = rectangleObs.confidence
            return confidence == 1.0 ? nil : confidence
        }

        // VNHumanObservation inherits from VNDetectedObjectObservation but is
        // not always directly castable across SDK versions; gate on class name.
        if String(describing: type(of: observation)).contains("Human") {
            if let detectedObs = observation as? VNDetectedObjectObservation {
                return detectedObs.confidence
            }
            return nil
        }

        if let faceObs = observation as? VNFaceObservation {
            return faceObs.confidence
        }

        if let classObs = observation as? VNClassificationObservation {
            return classObs.confidence
        }

        if let recognizedObs = observation as? VNRecognizedObjectObservation {
            if let firstLabel = recognizedObs.labels.first {
                return firstLabel.confidence
            }
            return recognizedObs.confidence
        }

        if let detectedObs = observation as? VNDetectedObjectObservation {
            return detectedObs.confidence
        }

        // Saliency observations are heat maps; no per-pixel confidence.
        if observation is VNSaliencyImageObservation {
            return nil
        }

        // Last-resort: reflect on the value in case a newer SDK adds an
        // observation type we have not special-cased.
        let mirror = Mirror(reflecting: observation)
        for child in mirror.children {
            if child.label == "confidence",
               let confidenceValue = child.value as? Float {
                return confidenceValue
            }
        }

        return nil
    }
}

// MARK: - Data Models

/// Aggregate result of one full pass of the Vision pipeline over an image.
///
/// Every field is optional or defaults to empty, so a partially-failed run
/// still produces a usable value. `performedAnalyses` records which Vision
/// requests actually completed (e.g. `"ocr"`, `"face"`, `"classification"`),
/// which lets cache layers tell "ran and found nothing" apart from
/// "did not run".
struct ComprehensiveVisionData: Codable, Sendable {
    var classifications: [String] = []
    var faces: [FaceData] = []
    var humans: [HumanData] = []
    var animals: [AnimalData] = []
    var recognizedTexts: [RecognizedTextBlock] = []
    var barcodes: [String] = []
    var rectangles: [RectangleData] = []
    var salientObjects: [SalientObjectData] = []
    var saliencyRegion: String? = nil
    var horizonAngle: Float? = nil
    var hasDocument: Bool = false

    /// Names of analyses that ran successfully (request callback fired).
    /// Used by cache layers to decide whether a stored result satisfies a
    /// caller's data requirements.
    var performedAnalyses: Set<String> = []

    /// Convenience flat view of recognized text strings.
    var texts: [String] {
        recognizedTexts.map { $0.text }
    }
}

/// A single OCR text block with its bounding box (Vision-normalized,
/// origin in lower-left) and confidence.
struct RecognizedTextBlock: Codable, Sendable {
    let textId: String
    let text: String
    let boundingBox: CGRect
    /// VNRecognizedTextObservation always provides confidence, so this is
    /// non-optional.
    let confidence: Float
    let language: String?

    init(
        textId: String,
        text: String,
        boundingBox: CGRect,
        confidence: Float,
        language: String? = nil
    ) {
        self.textId = textId
        self.text = text
        self.boundingBox = boundingBox
        self.confidence = confidence
        self.language = language
    }
}

/// A detected face with Vision's capture-quality score (0...1, higher is
/// better) and bounding box.
struct FaceData: Codable, Sendable {
    let quality: Float
    let boundingBox: CGRect
}

/// A detected human body region. `confidence` is optional because some SDK
/// versions do not expose a meaningful value for `VNHumanObservation`.
struct HumanData: Codable, Sendable {
    let pose: String
    let boundingBox: CGRect
    let confidence: Float?

    init(pose: String, boundingBox: CGRect, confidence: Float? = nil) {
        self.pose = pose
        self.boundingBox = boundingBox
        self.confidence = confidence
    }
}

/// A recognized animal (cat, dog, etc.) with its label confidence.
struct AnimalData: Codable, Sendable {
    let type: String
    let confidence: Float?
    let boundingBox: CGRect
}

/// A rectangle detected in the image (often a document, card, or screen).
/// `confidence` is optional because `VNRectangleObservation`'s confidence
/// is typically a non-informative constant 1.0.
struct RectangleData: Codable, Sendable {
    let boundingBox: CGRect
    let confidence: Float?
}

/// A salient object region. `confidence` is optional because saliency
/// observations do not always carry a meaningful score. `objectType` is
/// a hint string that callers may fill in from classification results.
struct SalientObjectData: Codable, Sendable {
    let boundingBox: CGRect
    let confidence: Float?
    let objectType: String
}

// MARK: - Errors

/// Errors thrown by the Vision pipeline. Kept narrow on purpose; callers
/// typically only need to distinguish "bad input" from "Vision failed".
enum PhotoAnalysisError: LocalizedError {
    case invalidImage
    case imageLoadFailed
    case imageProcessingFailed
    case analysisFailed
    case aiNotSupported

    var errorDescription: String? {
        switch self {
        case .invalidImage:
            return "Invalid image format"
        case .imageLoadFailed:
            return "Failed to load image"
        case .imageProcessingFailed:
            return "Failed to process image"
        case .analysisFailed:
            return "Analysis failed"
        case .aiNotSupported:
            return "This device does not support AI features"
        }
    }
}

// MARK: - Prompt Summarization

extension ComprehensiveVisionData {

    /// Produce a deterministic, human-readable summary of the Vision data,
    /// suitable for embedding inside an LLM prompt.
    ///
    /// Sections with no entries are omitted entirely (no `"Detected objects (0):"`
    /// lines). Confidence values are formatted to two decimals. The output
    /// order is fixed so prompts stay stable across runs of the same input.
    func summarizedForPrompt() -> String {
        var lines: [String] = []

        // OCR text blocks
        if !recognizedTexts.isEmpty {
            lines.append("OCR text blocks (\(recognizedTexts.count)):")
            for block in recognizedTexts {
                let confidenceStr = String(format: "%.2f", block.confidence)
                lines.append(" - \"\(block.text)\" (confidence \(confidenceStr))")
            }
        }

        // Image classifications (already include their own confidence string,
        // emitted by the collector as "identifier (0.xx)").
        if !classifications.isEmpty {
            lines.append("Detected objects (\(classifications.count)):")
            for classification in classifications {
                lines.append(" - \(classification)")
            }
        }

        // Animals
        if !animals.isEmpty {
            lines.append("Animals (\(animals.count)):")
            for animal in animals {
                if let confidence = animal.confidence {
                    let confidenceStr = String(format: "%.2f", confidence)
                    lines.append(" - \(animal.type) (confidence \(confidenceStr))")
                } else {
                    lines.append(" - \(animal.type)")
                }
            }
        }

        // Faces — just a count plus an average quality score, since the
        // bounding boxes are rarely useful in a prompt.
        if !faces.isEmpty {
            lines.append("Faces detected: \(faces.count)")
        }

        // Humans
        if !humans.isEmpty {
            lines.append("Humans detected: \(humans.count)")
        }

        // Salient regions
        if !salientObjects.isEmpty {
            lines.append("Salient regions: \(salientObjects.count)")
        }

        // Rectangles (document/card candidates)
        if !rectangles.isEmpty {
            lines.append("Rectangles: \(rectangles.count)")
        }

        // Barcodes
        if !barcodes.isEmpty {
            lines.append("Barcodes (\(barcodes.count)):")
            for code in barcodes {
                lines.append(" - \(code)")
            }
        }

        // Document hint
        if hasDocument {
            lines.append("Document content: yes")
        }

        // Horizon angle (radians, signed)
        if let angle = horizonAngle {
            lines.append("Horizon angle (radians): \(String(format: "%.2f", angle))")
        }

        return lines.joined(separator: "\n")
    }
}
