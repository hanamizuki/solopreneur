import SwiftUI

struct RootView: View {
    @AppStorage("onboarded") private var onboarded: Bool = false
    // Bumping this state forces re-evaluation of `allKeysPresent`, which
    // otherwise can't observe Keychain writes (Keychain isn't reactive).
    @State private var keysVersion: Int = 0

    var body: some View {
        Group {
            if onboarded && allKeysPresent {
                DashboardView()
            } else {
                OnboardingView(onComplete: { keysVersion &+= 1 })
            }
        }
    }

    private var allKeysPresent: Bool {
        _ = keysVersion  // create dependency on the trigger
        return KeychainSlot.allCases.allSatisfy { KeychainService.load($0) != nil }
    }
}
