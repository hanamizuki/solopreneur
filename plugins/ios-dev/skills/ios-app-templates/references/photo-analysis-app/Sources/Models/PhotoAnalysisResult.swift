//
//  PhotoAnalysisResult.swift
//
//  Aggregated output of a single capture-and-analyze pass: Vision-extracted
//  signals plus the LLM's textual interpretation. Plain struct — the template
//  stays storage-agnostic, so consumers can persist via SwiftData, Core Data,
//  cloud, or not at all.
//

import Foundation

struct PhotoAnalysisResult: Identifiable, Sendable {
    let id: UUID
    let vision: ComprehensiveVisionData
    let llmResponse: String
    let capturedAt: Date

    init(
        id: UUID = UUID(),
        vision: ComprehensiveVisionData,
        llmResponse: String,
        capturedAt: Date = Date()
    ) {
        self.id = id
        self.vision = vision
        self.llmResponse = llmResponse
        self.capturedAt = capturedAt
    }
}
