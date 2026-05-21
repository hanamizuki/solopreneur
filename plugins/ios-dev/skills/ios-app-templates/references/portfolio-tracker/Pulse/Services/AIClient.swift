import Foundation

struct AIClient {
    enum AIError: Error, CustomStringConvertible {
        case missingKey
        case badResponse(Int, body: String)
        case emptyContent

        var description: String {
            switch self {
            case .missingKey: return "missingKey"
            case let .badResponse(code, body):
                // Truncated so error UIs / logs don't swallow the screen.
                let trimmed = body.prefix(200).replacingOccurrences(of: "\n", with: " ")
                return "badResponse(\(code)): \(trimmed)"
            case .emptyContent: return "emptyContent"
            }
        }
    }

    private static let endpoint = URL(string: "https://api.anthropic.com/v1/messages")!

    static func commentary(
        for position: Position,
        news: [NewsArticle]
    ) async throws -> String {
        guard let key = KeychainService.load(.anthropic) else { throw AIError.missingKey }

        let userContent = buildUserContent(position: position, news: news)

        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.setValue(key, forHTTPHeaderField: "x-api-key")
        req.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        struct Body: Encodable {
            let model: String
            let max_tokens: Int
            let system: String
            let messages: [Message]
            struct Message: Encodable { let role: String; let content: String }
        }
        let body = Body(
            model: AIPersona.model,
            max_tokens: 500,
            system: AIPersona.systemPrompt,
            messages: [.init(role: "user", content: userContent)]
        )
        req.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            let bodyText = String(data: data, encoding: .utf8) ?? ""
            throw AIError.badResponse(code, body: bodyText)
        }
        struct Resp: Decodable {
            struct ContentBlock: Decodable { let type: String; let text: String? }
            let content: [ContentBlock]
        }
        let resp = try JSONDecoder().decode(Resp.self, from: data)
        guard let text = resp.content.first(where: { $0.type == "text" })?.text, !text.isEmpty else {
            throw AIError.emptyContent
        }
        return text
    }

    private static func buildUserContent(position p: Position, news: [NewsArticle]) -> String {
        let costStr = Formatting.usd(p.avgCost)
        let priceStr = Formatting.usd(p.currentPrice)
        let pnlStr = "\(p.unrealizedPnL >= 0 ? "+" : "")\(Formatting.usd(p.unrealizedPnL))"
        let pctStr = String(format: "%+.1f%%", p.unrealizedPnLPct * 100)
        let qtyStr = Formatting.quantity(p.totalQuantity, type: p.assetType)

        var s = """
        標的：\(p.ticker)（\(p.assetType.label)）
        你的持倉：\(qtyStr)，平均成本 \(costStr)，當前價 \(priceStr)，未實現 \(pctStr)（\(pnlStr)）

        今天的新聞：
        """
        if news.isEmpty {
            s += "\n無"
        } else {
            for (i, a) in news.enumerated() {
                s += "\n\(i+1). 【\(a.title)】\n   \(a.summary)"
            }
        }
        return s
    }
}
