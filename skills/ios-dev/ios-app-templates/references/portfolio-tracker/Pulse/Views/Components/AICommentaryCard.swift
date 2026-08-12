import SwiftUI

struct AICommentaryCard: View {
    enum State { case loading, loaded(String), failed }

    let state: State

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle()
                    .fill(Color.green)
                    .frame(width: 6, height: 6)
                    .shadow(color: .green, radius: 4)
                Text(AIPersona.cardTitle)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.green)
                    .textCase(.uppercase).tracking(0.5)
            }
            switch state {
            case .loading:
                Text(AIPersona.loadingText)
                    .font(.footnote)
                    .foregroundStyle(.gray)
            case .loaded(let text):
                Text(text)
                    .font(.footnote)
                    .foregroundStyle(Color(white: 0.92))
                    .lineSpacing(3)
                    .textSelection(.enabled)
            case .failed:
                Text(AIPersona.failedText)
                    .font(.footnote)
                    .foregroundStyle(.gray)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [Color(white: 0.10), Color(white: 0.05)],
                           startPoint: .top, endPoint: .bottom)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color(white: 0.16), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
