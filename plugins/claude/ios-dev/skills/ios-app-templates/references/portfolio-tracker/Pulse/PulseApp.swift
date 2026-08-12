import SwiftUI
import SwiftData

@main
struct PulseApp: App {
    let container: ModelContainer

    init() {
        do {
            container = try ModelContainer(for: Transaction.self, AICache.self, NewsCache.self)
        } catch {
            // MVP-acceptable: failing to open the local store is unrecoverable
            // for this demo. A production app would present an error UI and
            // offer recovery (e.g. wipe + recreate) instead of crashing.
            fatalError("Failed to set up SwiftData: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
        }
        .modelContainer(container)
    }
}
