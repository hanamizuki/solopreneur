import Foundation

struct GoogleNewsClient {
    enum GoogleNewsError: Error { case badResponse }

    // Ticker → search query for better hits. Fallback = ticker as-is.
    // TODO: replace with a richer mapping if user adds long-tail coins
    private static let queryByTicker: [String: String] = [
        "BTC": "Bitcoin",
        "ETH": "Ethereum",
        "SOL": "Solana",
        "DOGE": "Dogecoin"
    ]

    static func news(ticker: String) async throws -> [NewsArticle] {
        let query = queryByTicker[ticker.uppercased()] ?? ticker
        var comps = URLComponents(string: "https://news.google.com/rss/search")!
        comps.queryItems = [
            .init(name: "q", value: query),
            .init(name: "hl", value: "en-US"),
            .init(name: "gl", value: "US"),
            .init(name: "ceid", value: "US:en")
        ]
        let (data, response) = try await URLSession.shared.data(from: comps.url!)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw GoogleNewsError.badResponse
        }
        return RSSParser().parse(data: data)
    }
}

// XMLParser-based RSS parser. Google News RSS is stable; this handles
// <item><title/><link/><pubDate/><source/></item>. Returns top 3.
private final class RSSParser: NSObject, XMLParserDelegate {
    private var articles: [NewsArticle] = []
    private var element: String = ""
    private var title = ""
    private var link = ""
    private var pubDate = ""
    private var source = ""
    private var insideItem = false

    func parse(data: Data) -> [NewsArticle] {
        let parser = XMLParser(data: data)
        parser.delegate = self
        parser.parse()
        return Array(articles.prefix(3))
    }

    func parser(_ parser: XMLParser,
                didStartElement el: String,
                namespaceURI: String?,
                qualifiedName: String?,
                attributes: [String: String]) {
        element = el
        if el == "item" {
            insideItem = true
            title = ""; link = ""; pubDate = ""; source = ""
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        guard insideItem else { return }
        switch element {
        case "title": title += string
        case "link": link += string
        case "pubDate": pubDate += string
        case "source": source += string
        default: break
        }
    }

    func parser(_ parser: XMLParser,
                didEndElement el: String,
                namespaceURI: String?,
                qualifiedName: String?) {
        if el == "item" {
            // Google News titles end in " - Source Name"; strip it
            var t = title.trimmingCharacters(in: .whitespacesAndNewlines)
            if let dash = t.range(of: " - ", options: .backwards) {
                t = String(t[..<dash.lowerBound])
            }
            let df = DateFormatter()
            df.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
            df.locale = Locale(identifier: "en_US_POSIX")
            let date = df.date(from: pubDate.trimmingCharacters(in: .whitespacesAndNewlines)) ?? Date()
            let linkStr = link.trimmingCharacters(in: .whitespacesAndNewlines)
            articles.append(NewsArticle(
                id: linkStr,
                title: t,
                source: source.trimmingCharacters(in: .whitespacesAndNewlines),
                url: URL(string: linkStr),
                publishedAt: date,
                summary: t  // RSS gives no body; use title as summary input for AI prompt
            ))
            insideItem = false
        }
        element = ""
    }
}
