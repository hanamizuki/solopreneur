import SwiftUI

struct NewsListItem: View {
    let article: NewsArticle

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("\(article.source) · \(relativeTime)")
                .font(.system(size: 10).weight(.regular))
                .foregroundStyle(.gray)
                .textCase(.uppercase)
            Text(article.title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color(white: 0.95))
                .lineLimit(2)
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var relativeTime: String {
        // Use the iOS 15+ `.formatted()` API instead of allocating a
        // RelativeDateTimeFormatter on every list-row render.
        article.publishedAt.formatted(
            .relative(presentation: .numeric, unitsStyle: .abbreviated)
        )
    }
}
