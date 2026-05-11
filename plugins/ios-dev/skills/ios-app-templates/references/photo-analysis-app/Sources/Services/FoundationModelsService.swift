//
//  FoundationModelsService.swift
//
//  Thin wrapper around Apple Intelligence on-device LLM (iOS 26+).
//
//  Multimodal note: The public Foundation Models API currently accepts text
//  prompts only. Vision-extracted signals are serialized into the prompt by
//  callers (see CameraModel + ComprehensiveVisionData.summarizedForPrompt()).
//
//  Fallback: On devices that do not support Apple Intelligence, swap this
//  service with a backend-LLM client preserving the
//  `generateResponse(prompt:) async throws -> String` signature.
//

import Foundation
import os

#if canImport(FoundationModels)
import FoundationModels
#endif

@MainActor
final class FoundationModelsService {

    /// Whether Foundation Models is available on the current build + OS.
    static var isSupported: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) { return true }
        #endif
        return false
    }

    /// Generate a text response from a text prompt.
    /// - Parameter prompt: The full prompt text. Callers serialize any
    ///   structured signals (Vision results, metadata) into this string.
    /// - Returns: Raw text response from the model.
    @available(iOS 26.0, *)
    func generateResponse(prompt: String) async throws -> String {
        #if canImport(FoundationModels)
        Log.camera.info("FoundationModels: starting response generation")
        Log.camera.debug("FoundationModels: prompt length=\(prompt.count) chars")

        let model = SystemLanguageModel.default
        let availability = model.availability

        Log.camera.debug("FoundationModels availability=\(String(describing: availability))")

        // `SystemLanguageModel.Availability` is an enum with an associated
        // value on the `.unavailable` case — it is NOT `Equatable`, so the
        // previous `availability == .available` comparison did not compile.
        // Use pattern matching instead.
        guard case .available = availability else {
            Log.camera.notice("FoundationModels unavailable: \(String(describing: availability))")
            throw FoundationModelsError.modelNotAvailable(status: String(describing: availability))
        }

        do {
            // `LanguageModelSession` has no zero-arg init: per the public
            // API the only init is
            //   `init(model:tools:@InstructionsBuilder instructions:)`
            // where `instructions` has no default. Pass a brief system-style
            // instruction string here — callers customize via `prompt`.
            let session = LanguageModelSession(instructions: "You analyze visual signals extracted from a photo and describe what you see.")
            let promptObject = Prompt(prompt)
            let response = try await session.respond(to: promptObject)
            let text = response.content
            guard !text.isEmpty else {
                Log.camera.error("FoundationModels returned empty response")
                throw FoundationModelsError.emptyResponse
            }
            Log.camera.info("FoundationModels response ok (\(text.count) chars)")
            return text
        } catch let error as FoundationModelsError {
            throw error
        } catch {
            Log.camera.error("FoundationModels call failed: \(error.localizedDescription)")
            throw FoundationModelsError.apiError(underlying: error)
        }
        #else
        Log.camera.notice("FoundationModels framework not present in this build")
        throw FoundationModelsError.frameworkNotAvailable
        #endif
    }

    /// Returns a human-readable availability description.
    @available(iOS 26.0, *)
    func checkAvailability() -> String {
        #if canImport(FoundationModels)
        let model = SystemLanguageModel.default
        // `Availability` is `enum { case available, case unavailable(UnavailableReason) }`
        // — exhaustive switch with the associated value bound on the
        // `.unavailable` case.
        switch model.availability {
        case .available:
            return "available"
        case .unavailable(let reason):
            return "unavailable(\(String(describing: reason)))"
        }
        #else
        return "framework-not-imported"
        #endif
    }
}

enum FoundationModelsError: LocalizedError {
    case frameworkNotAvailable
    case modelNotAvailable(status: String)
    case emptyResponse
    case apiError(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .frameworkNotAvailable:
            return "Foundation Models framework unavailable (requires iOS 26.0+)."
        case .modelNotAvailable(let status):
            return "Foundation Models unavailable (status: \(status))."
        case .emptyResponse:
            return "Foundation Models returned an empty response."
        case .apiError(let error):
            return "Foundation Models API error: \(error.localizedDescription)"
        }
    }
}
