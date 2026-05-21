import Foundation

struct CoinGeckoClient {
    enum CoinGeckoError: Error, CustomStringConvertible {
        case badResponse(Int, body: String)
        case noData
        case unsupportedTicker

        var description: String {
            switch self {
            case let .badResponse(code, body):
                let trimmed = body.prefix(120).replacingOccurrences(of: "\n", with: " ")
                return "badResponse(\(code)): \(trimmed)"
            case .noData: return "noData"
            case .unsupportedTicker: return "unsupportedTicker"
            }
        }
    }

    // Map common tickers → CoinGecko coin ids. Expand as needed.
    // TODO: replace with /search lookup once user adds a less-common coin
    private static let coinIds: [String: String] = [
        "BTC": "bitcoin",
        "ETH": "ethereum",
        "SOL": "solana",
        "DOGE": "dogecoin"
    ]

    /// Attach the Demo key via BOTH header and query param so CoinGecko is
    /// happy whichever path it inspects.
    private static func authedURL(_ comps: URLComponents) -> URL {
        var c = comps
        if let key = KeychainService.load(.coingecko) {
            let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
            var items = c.queryItems ?? []
            items.append(.init(name: "x_cg_demo_api_key", value: trimmed))
            c.queryItems = items
        }
        return c.url!
    }

    private static func authedRequest(_ comps: URLComponents) -> URLRequest {
        var req = URLRequest(url: authedURL(comps))
        if let key = KeychainService.load(.coingecko) {
            let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
            req.setValue(trimmed, forHTTPHeaderField: "x-cg-demo-api-key")
        }
        return req
    }

    /// Historical close on a date, in USD.
    static func closePrice(ticker: String, on date: Date) async throws -> Decimal {
        guard let coinId = coinIds[ticker.uppercased()] else {
            throw CoinGeckoError.unsupportedTicker
        }
        // CoinGecko /history uses dd-MM-yyyy
        let df = DateFormatter()
        df.dateFormat = "dd-MM-yyyy"
        df.timeZone = TimeZone(identifier: "UTC")
        let dateStr = df.string(from: date)

        var comps = URLComponents(string: "https://api.coingecko.com/api/v3/coins/\(coinId)/history")!
        comps.queryItems = [
            .init(name: "date", value: dateStr),
            .init(name: "localization", value: "false")
        ]
        let (data, response) = try await URLSession.shared.data(for: authedRequest(comps))
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            let body = String(data: data, encoding: .utf8) ?? ""
            throw CoinGeckoError.badResponse(code, body: body)
        }
        struct History: Decodable {
            struct MarketData: Decodable {
                struct Prices: Decodable { let usd: Double }
                let current_price: Prices
            }
            let market_data: MarketData?
        }
        let hist = try JSONDecoder().decode(History.self, from: data)
        guard let usd = hist.market_data?.current_price.usd else { throw CoinGeckoError.noData }
        return Decimal(usd)
    }

    /// Current USD price.
    static func currentPrice(ticker: String) async throws -> Decimal {
        guard let coinId = coinIds[ticker.uppercased()] else {
            throw CoinGeckoError.unsupportedTicker
        }
        var comps = URLComponents(string: "https://api.coingecko.com/api/v3/simple/price")!
        comps.queryItems = [
            .init(name: "ids", value: coinId),
            .init(name: "vs_currencies", value: "usd")
        ]
        let (data, response) = try await URLSession.shared.data(for: authedRequest(comps))
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            let body = String(data: data, encoding: .utf8) ?? ""
            throw CoinGeckoError.badResponse(code, body: body)
        }
        struct Simple: Decodable {
            let priceByCoin: [String: [String: Double]]
            init(from decoder: Decoder) throws {
                let single = try decoder.singleValueContainer()
                priceByCoin = try single.decode([String: [String: Double]].self)
            }
        }
        let payload = try JSONDecoder().decode(Simple.self, from: data)
        guard let usd = payload.priceByCoin[coinId]?["usd"] else { throw CoinGeckoError.noData }
        return Decimal(usd)
    }
}
