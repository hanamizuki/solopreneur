import Foundation

struct NewsArticle: Identifiable, Hashable, Codable {
    let id: String
    let title: String
    let source: String
    let url: URL?
    let publishedAt: Date
    let summary: String // first 300 chars used for AI prompt
}
