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
    /// Threading model:
    /// - `VNImageRequestHandler.perform(_:)` is **synchronous** — by the time
    ///   it returns, every request's completion handler has fired. We do
    ///   NOT need a pending-counter / `hasResumed` trick.
    /// - `perform()` itself may run for hundreds of ms. We must NOT call it
    ///   on the main actor; do it via `Task.detached` on a background
    ///   executor so the @MainActor view model stays responsive.
    /// - Vision is free to invoke individual completion handlers on whatever
    ///   internal queues it chooses, and there is no documented guarantee
    ///   that those callbacks are serialized with respect to each other.
    ///   We therefore mutate the result through a small lock-guarded
    ///   accumulator (`VisionDataAccumulator`), and only read its final
    ///   snapshot after `perform()` returns.
    private static func performVisionAnalysis(on cgImage: CGImage) async throws -> ComprehensiveVisionData {
        // Box the CGImage for Sendable transfer into the detached task.
        // CGImage is reference-typed and not marked Sendable, but it is
        // documented as thread-safe for read-only access (which is all
        // Vision does); wrap it so the compiler stops asking.
        let imageBox = UncheckedSendableBox(cgImage)

        return try await Task.detached(priority: .userInitiated) { () throws -> ComprehensiveVisionData in
            let acc = VisionDataAccumulator()

            // 1. Image classification (also opportunistically flags documents
            //    by keyword match on the top classifications).
            let classifyRequest = VNClassifyImageRequest { request, error in
                defer { acc.markPerformed("classification", error: error, requestName: "classification") }
                guard let observations = request.results as? [VNClassificationObservation] else { return }
                let mapped = observations.prefix(10).map {
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
                acc.setClassifications(Array(mapped), hasDocument: hasDocumentClassification)
            }

            // 2. Face detection with capture-quality scoring.
            let faceRequest = VNDetectFaceCaptureQualityRequest { request, error in
                defer { acc.markPerformed("face", error: error, requestName: "face detection") }
                guard let observations = request.results as? [VNFaceObservation] else { return }
                let faces = observations.map { obs in
                    FaceData(
                        quality: obs.faceCaptureQuality ?? 0.0,
                        boundingBox: obs.boundingBox
                    )
                }
                acc.setFaces(faces)
            }

            // 3. Human-body rectangle detection.
            let humanRequest = VNDetectHumanRectanglesRequest { request, error in
                defer { acc.markPerformed("human", error: error, requestName: "human detection") }
                guard let observations = request.results as? [VNHumanObservation] else { return }
                let humans = observations.map { obs in
                    HumanData(
                        pose: "detected",
                        boundingBox: obs.boundingBox,
                        confidence: safeConfidence(from: obs)
                    )
                }
                acc.setHumans(humans)
            }

            // 4. Animal recognition (cats, dogs, etc.).
            let animalRequest = VNRecognizeAnimalsRequest { request, error in
                defer { acc.markPerformed("animal", error: error, requestName: "animal recognition") }
                guard let observations = request.results as? [VNRecognizedObjectObservation] else { return }
                let animals = observations.compactMap { obs -> AnimalData? in
                    guard let label = obs.labels.first else { return nil }
                    return AnimalData(
                        type: label.identifier,
                        confidence: label.confidence,
                        boundingBox: obs.boundingBox
                    )
                }
                acc.setAnimals(animals)
            }

            // 5. OCR. Configured for accurate recognition with automatic
            //    language detection over the device's full supported set.
            let textRequest = VNRecognizeTextRequest { request, error in
                defer { acc.markPerformed("ocr", error: error, requestName: "text recognition") }
                guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
                let recognizedTexts = observations.enumerated().compactMap { index, observation -> RecognizedTextBlock? in
                    guard let candidate = observation.topCandidates(1).first else { return nil }
                    let bbox = observation.boundingBox

                    if index < 3 {
                        Log.vision.debug("OCR[\(index)]: '\(candidate.string.prefix(20))...' bbox=(\(String(format: "%.3f", bbox.origin.x)), \(String(format: "%.3f", bbox.origin.y)), \(String(format: "%.3f", bbox.width)), \(String(format: "%.3f", bbox.height)))")
                    }

                    return RecognizedTextBlock(
                        textId: String(format: "text_%03d", index + 1),
                        text: candidate.string,
                        boundingBox: bbox,
                        confidence: candidate.confidence,
                        language: nil
                    )
                }
                acc.setRecognizedTexts(recognizedTexts)
                if !recognizedTexts.isEmpty {
                    Log.vision.debug("OCR captured \(recognizedTexts.count) text blocks")
                }
            }

            // OCR parameters must be set after the request is constructed but
            // before it is performed.
            textRequest.recognitionLevel = .accurate
            textRequest.usesLanguageCorrection = true
            textRequest.automaticallyDetectsLanguage = true

            do {
                let supportedLanguages = try textRequest.supportedRecognitionLanguages()
                if !supportedLanguages.isEmpty {
                    textRequest.recognitionLanguages = supportedLanguages
                    Log.vision.info("OCR automatic language detection enabled with \(supportedLanguages.count) candidate languages")
                } else {
                    textRequest.recognitionLanguages = ["ja-JP", "zh-Hant", "zh-Hans", "en-US", "ko-KR"]
                    Log.vision.notice("OCR supportedRecognitionLanguages returned empty list; using default fallback")
                }
            } catch {
                // Don't swallow — log the diagnostic, then fall back so OCR
                // still runs against a sensible default set.
                Log.vision.error("OCR supportedRecognitionLanguages() failed: \(error.localizedDescription); using default fallback")
                textRequest.recognitionLanguages = ["ja-JP", "zh-Hant", "zh-Hans", "en-US", "ko-KR"]
            }

            // 6. Barcode detection.
            let barcodeRequest = VNDetectBarcodesRequest { request, error in
                defer { acc.markPerformed("barcode", error: error, requestName: "barcode detection") }
                guard let observations = request.results as? [VNBarcodeObservation] else { return }
                let barcodes = observations.compactMap { $0.payloadStringValue }
                acc.setBarcodes(barcodes)
            }

            // 7. Rectangle detection. Detected rectangles also count as a
            //    document signal (receipts, business cards, paper, etc.).
            let rectangleRequest = VNDetectRectanglesRequest { request, error in
                defer { acc.markPerformed("document", error: error, requestName: "rectangle detection") }
                guard let observations = request.results as? [VNRectangleObservation] else { return }
                let rectangles = observations.map { obs in
                    RectangleData(
                        boundingBox: obs.boundingBox,
                        confidence: safeConfidence(from: obs)
                    )
                }
                acc.setRectangles(rectangles, hasDocument: !observations.isEmpty)
            }

            // 8. Attention-based saliency (where a human would look).
            let salientRequest = VNGenerateAttentionBasedSaliencyImageRequest { request, error in
                defer { acc.markPerformed("attention_saliency", error: error, requestName: "attention saliency") }
                guard let results = request.results as? [VNSaliencyImageObservation],
                      let object = results.first,
                      let salientObjects = object.salientObjects else { return }
                let mapped = salientObjects.map { obs in
                    SalientObjectData(
                        boundingBox: obs.boundingBox,
                        confidence: safeConfidence(from: obs),
                        objectType: "unknown"
                    )
                }
                acc.setSalientObjects(mapped)
            }

            // 9. Objectness-based saliency (where the dominant object is).
            let boundingBoxSaliency = VNGenerateObjectnessBasedSaliencyImageRequest { request, error in
                defer { acc.markPerformed("objectness_saliency", error: error, requestName: "objectness saliency") }
                guard let results = request.results as? [VNSaliencyImageObservation],
                      let object = results.first,
                      let salientObjectsList = object.salientObjects,
                      let region = salientObjectsList.first else { return }
                let box = region.boundingBox
                let formatted = "x:\(String(format: "%.2f", box.origin.x)), y:\(String(format: "%.2f", box.origin.y)), w:\(String(format: "%.2f", box.size.width)), h:\(String(format: "%.2f", box.size.height))"
                acc.setSaliencyRegion(formatted)
            }

            // 10. Horizon angle (useful for landscape composition).
            let horizonRequest = VNDetectHorizonRequest { request, error in
                defer { acc.markPerformed("horizon", error: error, requestName: "horizon detection") }
                guard let results = request.results as? [VNHorizonObservation],
                      let horizon = results.first else { return }
                acc.setHorizonAngle(Float(horizon.angle))
            }

            let handler = VNImageRequestHandler(cgImage: imageBox.value, options: [:])
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

            // `perform` is synchronous: by the time it returns, every
            // completion handler above has been invoked. If it throws,
            // propagate the error directly.
            try handler.perform(requests)

            let snapshot = acc.snapshot()
            Log.vision.info("All Vision requests finished")
            return snapshot
        }.value
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

        // VNHumanObservation inherits from VNDetectedObjectObservation. Use
        // a direct downcast (preferred over `String(describing:).contains`
        // which is brittle across SDK versions and breaks under stripped
        // symbols).
        if let humanObs = observation as? VNHumanObservation {
            return humanObs.confidence
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

        // Unknown subtype — return nil rather than reflecting on the value
        // with Mirror, since `VNObservation` is an Objective-C class and
        // Mirror inspection of imported types is not a stable contract.
        return nil
    }
}

// MARK: - Lock-guarded accumulator
//
// Vision request completion handlers can fire on internal queues without a
// documented serialization guarantee. `VisionDataAccumulator` collects all
// per-request results behind an `NSLock` so concurrent callbacks cannot
// race when mutating the aggregate. It is `final` + non-`Sendable`-but-safe
// via internal locking, captured by reference in the completion closures.

private final class VisionDataAccumulator: @unchecked Sendable {
    private let lock = NSLock()
    private var data = ComprehensiveVisionData()

    func setClassifications(_ values: [String], hasDocument: Bool) {
        lock.lock(); defer { lock.unlock() }
        data.classifications = values
        if hasDocument { data.hasDocument = true }
    }

    func setFaces(_ values: [FaceData]) {
        lock.lock(); defer { lock.unlock() }
        data.faces = values
    }

    func setHumans(_ values: [HumanData]) {
        lock.lock(); defer { lock.unlock() }
        data.humans = values
    }

    func setAnimals(_ values: [AnimalData]) {
        lock.lock(); defer { lock.unlock() }
        data.animals = values
    }

    func setRecognizedTexts(_ values: [RecognizedTextBlock]) {
        lock.lock(); defer { lock.unlock() }
        data.recognizedTexts = values
    }

    func setBarcodes(_ values: [String]) {
        lock.lock(); defer { lock.unlock() }
        data.barcodes = values
    }

    func setRectangles(_ values: [RectangleData], hasDocument: Bool) {
        lock.lock(); defer { lock.unlock() }
        data.rectangles = values
        if hasDocument { data.hasDocument = true }
    }

    func setSalientObjects(_ values: [SalientObjectData]) {
        lock.lock(); defer { lock.unlock() }
        data.salientObjects = values
    }

    func setSaliencyRegion(_ value: String) {
        lock.lock(); defer { lock.unlock() }
        data.saliencyRegion = value
    }

    func setHorizonAngle(_ value: Float) {
        lock.lock(); defer { lock.unlock() }
        data.horizonAngle = value
    }

    /// Mark a Vision request as performed and log any error. Centralizes the
    /// per-callback bookkeeping that used to live in the original `defer` +
    /// `handleError` closures.
    func markPerformed(_ label: String, error: Error?, requestName: String) {
        if let error {
            Log.vision.error("\(requestName) failed: \(error.localizedDescription)")
        }
        lock.lock(); defer { lock.unlock() }
        data.performedAnalyses.insert(label)
    }

    /// Return a snapshot of the accumulated data. Call after all Vision
    /// completion handlers have fired (i.e. after `perform` returns).
    func snapshot() -> ComprehensiveVisionData {
        lock.lock(); defer { lock.unlock() }
        return data
    }
}

// MARK: - Sendable box for non-Sendable Core Graphics types
//
// `CGImage` is a Core Foundation type and not marked Sendable, but it is
// documented as safe for concurrent read-only access. To pass it across an
// actor / Task boundary we box it in an `@unchecked Sendable` wrapper.

private struct UncheckedSendableBox<T>: @unchecked Sendable {
    let value: T

    init(_ value: T) {
        self.value = value
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
