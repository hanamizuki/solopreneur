import Foundation

/// Finnhub client. Three endpoints in play:
///
/// - `/quote` — current price, **free tier**. Used for live dashboard
///   pricing and as the buy-price fallback in AddTransactionView.
/// - `/company-news` — recent headlines for a ticker, **free tier**.
/// - `/stock/candle` — historical OHLC, **PREMIUM ONLY** since 2024.
///   Free-tier API keys get 403 here. We still expose `closePrice` for
///   completeness, but the caller must handle `premiumRequired` and
///   fall back (currently AddTransactionView falls back to `/quote`).
struct FinnhubClient {
    enum FinnhubError: Error, CustomStringConvertible {
        case missingKey
        case badResponse(Int, body: String)
        case premiumRequired
        case noData

        var description: String {
            switch self {
            case .missingKey: return "missingKey"
            case let .badResponse(code, body):
                let trimmed = body.prefix(120).replacingOccurrences(of: "\n", with: " ")
                return "badResponse(\(code)): \(trimmed)"
            case .premiumRequired: return "premiumRequired (free-tier 403 on /stock/candle)"
            case .noData: return "noData"
            }
        }
    }

    /// Historical close on a date, in USD.
    ///
    /// WARNING: `/stock/candle` is a premium-only endpoint as of 2024;
    /// free-tier keys get 403. The demo path in AddTransactionView is
    /// already wired to swallow `premiumRequired` and fall back to
    /// `currentPrice(ticker:)`. Keep this method around because a
    /// paying customer's key DOES return useful data, and it doubles
    /// as a "what does premium gate cost you" reference.
    static func closePrice(ticker: String, on date: Date) async throws -> Decimal {
        guard let key = KeychainService.load(.finnhub) else { throw FinnhubError.missingKey }

        let cal = Calendar(identifier: .gregorian)
        let from = cal.startOfDay(for: cal.date(byAdding: .day, value: -7, to: date)!)
        let to = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: date))!

        var comps = URLComponents(string: "https://finnhub.io/api/v1/stock/candle")!
        comps.queryItems = [
            .init(name: "symbol", value: ticker.uppercased()),
            .init(name: "resolution", value: "D"),
            .init(name: "from", value: String(Int(from.timeIntervalSince1970))),
            .init(name: "to", value: String(Int(to.timeIntervalSince1970))),
            .init(name: "token", value: key)
        ]
        guard let url = comps.url else { throw FinnhubError.noData }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse else {
            throw FinnhubError.badResponse(-1, body: "")
        }
        if http.statusCode == 403 { throw FinnhubError.premiumRequired }
        guard http.statusCode == 200 else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw FinnhubError.badResponse(http.statusCode, body: body)
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

    /// Current quote, in USD. Free-tier accessible.
    static func currentPrice(ticker: String) async throws -> Decimal {
        guard let key = KeychainService.load(.finnhub) else { throw FinnhubError.missingKey }
        var comps = URLComponents(string: "https://finnhub.io/api/v1/quote")!
        comps.queryItems = [
            .init(name: "symbol", value: ticker.uppercased()),
            .init(name: "token", value: key)
        ]
        guard let url = comps.url else { throw FinnhubError.noData }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            let body = String(data: data, encoding: .utf8) ?? ""
            throw FinnhubError.badResponse(code, body: body)
        }
        struct Quote: Decodable { let c: Double }
        let q = try JSONDecoder().decode(Quote.self, from: data)
        guard q.c > 0 else { throw FinnhubError.noData }
        return Decimal(q.c)
    }

    /// Recent company headlines for a ticker. Free-tier accessible.
    static func companyNews(ticker: String, on date: Date) async throws -> [NewsArticle] {
        guard let key = KeychainService.load(.finnhub) else { throw FinnhubError.missingKey }
        let cal = Calendar(identifier: .gregorian)
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        // Pin to Gregorian + POSIX so non-Gregorian system calendars
        // (Buddhist, Japanese, ROC) don't emit year 2569 etc — Finnhub
        // expects strict YYYY-MM-DD Gregorian.
        df.calendar = Calendar(identifier: .gregorian)
        df.locale = Locale(identifier: "en_US_POSIX")
        let from = df.string(from: cal.date(byAdding: .day, value: -3, to: date) ?? date)
        let to = df.string(from: date)

        var comps = URLComponents(string: "https://finnhub.io/api/v1/company-news")!
        comps.queryItems = [
            .init(name: "symbol", value: ticker.uppercased()),
            .init(name: "from", value: from),
            .init(name: "to", value: to),
            .init(name: "token", value: key)
        ]
        guard let url = comps.url else { throw FinnhubError.noData }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            let body = String(data: data, encoding: .utf8) ?? ""
            throw FinnhubError.badResponse(code, body: body)
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
