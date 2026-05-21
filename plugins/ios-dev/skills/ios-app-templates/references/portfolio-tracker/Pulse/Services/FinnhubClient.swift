import Foundation

struct FinnhubClient {
    enum FinnhubError: Error { case missingKey, badResponse, noData }

    // Stock close on a specific date (UTC). Falls back to nearest prior trading day.
    // TODO: handle backfill failure (return nil for now if no data within 7 trading days back)
    static func closePrice(ticker: String, on date: Date) async throws -> Decimal {
        guard let key = KeychainService.load(.finnhub) else { throw FinnhubError.missingKey }

        let cal = Calendar(identifier: .gregorian)
        let from = cal.startOfDay(for: cal.date(byAdding: .day, value: -7, to: date)!)
        let to = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: date))!

        var comps = URLComponents(string: "https://finnhub.io/api/v1/stock/candle")!
        comps.queryItems = [
            .init(name: "symbol", value: ticker),
            .init(name: "resolution", value: "D"),
            .init(name: "from", value: String(Int(from.timeIntervalSince1970))),
            .init(name: "to", value: String(Int(to.timeIntervalSince1970))),
            .init(name: "token", value: key)
        ]
        let (data, response) = try await URLSession.shared.data(from: comps.url!)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw FinnhubError.badResponse
        }

        struct Candle: Decodable { let c: [Double]?; let t: [Int]?; let s: String }
        let candle = try JSONDecoder().decode(Candle.self, from: data)
        guard candle.s == "ok", let closes = candle.c, let stamps = candle.t,
              !closes.isEmpty, closes.count == stamps.count
        else { throw FinnhubError.noData }

        // Find the close at-or-before `date`.
        let target = Int(cal.startOfDay(for: date).timeIntervalSince1970)
        var best: Double?
        for (i, ts) in stamps.enumerated() where ts <= target + 86400 {
            best = closes[i]
        }
        guard let close = best else { throw FinnhubError.noData }
        return Decimal(close)
    }
}

extension FinnhubClient {
    static func currentPrice(ticker: String) async throws -> Decimal {
        guard let key = KeychainService.load(.finnhub) else { throw FinnhubError.missingKey }
        var comps = URLComponents(string: "https://finnhub.io/api/v1/quote")!
        comps.queryItems = [
            .init(name: "symbol", value: ticker),
            .init(name: "token", value: key)
        ]
        let (data, response) = try await URLSession.shared.data(from: comps.url!)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw FinnhubError.badResponse
        }
        struct Quote: Decodable { let c: Double }
        let q = try JSONDecoder().decode(Quote.self, from: data)
        return Decimal(q.c)
    }
}

extension FinnhubClient {
    static func companyNews(ticker: String, on date: Date) async throws -> [NewsArticle] {
        guard let key = KeychainService.load(.finnhub) else { throw FinnhubError.missingKey }
        let cal = Calendar.current
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        let from = df.string(from: cal.date(byAdding: .day, value: -3, to: date)!)
        let to = df.string(from: date)

        var comps = URLComponents(string: "https://finnhub.io/api/v1/company-news")!
        comps.queryItems = [
            .init(name: "symbol", value: ticker),
            .init(name: "from", value: from),
            .init(name: "to", value: to),
            .init(name: "token", value: key)
        ]
        let (data, response) = try await URLSession.shared.data(from: comps.url!)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw FinnhubError.badResponse
        }
        struct Item: Decodable {
            let id: Int
            let datetime: Int
            let headline: String
            let summary: String
            let source: String
            let url: String
        }
        let items = try JSONDecoder().decode([Item].self, from: data)
        return items.prefix(3).map {
            NewsArticle(
                id: String($0.id),
                title: $0.headline,
                source: $0.source,
                url: URL(string: $0.url),
                publishedAt: Date(timeIntervalSince1970: TimeInterval($0.datetime)),
                summary: String($0.summary.prefix(300))
            )
        }
    }
}
