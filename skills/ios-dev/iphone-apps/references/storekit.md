# StoreKit 2

In-app purchases, subscriptions, and paywalls for iOS apps.

## Basic Setup

### Product Configuration

Define products in App Store Connect, then load in app:

```swift
import StoreKit

@Observable
class PurchaseService {
    private(set) var products: [Product] = []
    private(set) var purchasedProductIDs: Set<String> = []
    private(set) var subscriptionStatus: SubscriptionStatus = .unknown

    private var transactionListener: Task<Void, Error>?

    enum SubscriptionStatus {
        case unknown
        case subscribed
        case expired
        case inGracePeriod
        case notSubscribed
    }

    init() {
        transactionListener = listenForTransactions()
    }

    deinit {
        transactionListener?.cancel()
    }

    func loadProducts() async throws {
        let productIDs = [
            "com.app.premium.monthly",
            "com.app.premium.yearly",
            "com.app.lifetime"
        ]
        products = try await Product.products(for: productIDs)
            .sorted { $0.price < $1.price }
    }

    func purchase(_ product: Product) async throws -> PurchaseResult {
        let result = try await product.purchase()

        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            await updatePurchasedProducts()
            await transaction.finish()
            return .success

        case .userCancelled:
            return .cancelled

        case .pending:
            return .pending

        @unknown default:
            return .failed
        }
    }

    func restorePurchases() async throws {
        try await AppStore.sync()
        await updatePurchasedProducts()
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw StoreError.verificationFailed(error)
        case .verified(let safe):
            return safe
        }
    }

    func updatePurchasedProducts() async {
        var purchased: Set<String> = []

        // Check non-consumables and subscriptions
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            purchased.insert(transaction.productID)
        }

        purchasedProductIDs = purchased
        await updateSubscriptionStatus()
    }

    private func updateSubscriptionStatus() async {
        // Check subscription group status
        guard let groupID = products.first?.subscription?.subscriptionGroupID else {
            subscriptionStatus = .notSubscribed
            return
        }

        do {
            let statuses = try await Product.SubscriptionInfo.status(for: groupID)
            guard let status = statuses.first else {
                subscriptionStatus = .notSubscribed
                return
            }

            switch status.state {
            case .subscribed:
                subscriptionStatus = .subscribed
            case .expired:
                subscriptionStatus = .expired
            case .inGracePeriod:
                subscriptionStatus = .inGracePeriod
            case .revoked:
                subscriptionStatus = .notSubscribed
            default:
                subscriptionStatus = .unknown
            }
        } catch {
            subscriptionStatus = .unknown
        }
    }

    private func listenForTransactions() -> Task<Void, Error> {
        Task.detached {
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else { continue }
                await self.updatePurchasedProducts()
                await transaction.finish()
            }
        }
    }
}

enum PurchaseResult {
    case success
    case cancelled
    case pending
    case failed
}

enum StoreError: LocalizedError {
    case verificationFailed(Error)
    case productNotFound

    var errorDescription: String? {
        switch self {
        case .verificationFailed:
            return "Purchase verification failed"
        case .productNotFound:
            return "Product not found"
        }
    }
}
```

## Paywall UI

```swift
struct PaywallView: View {
    @Environment(PurchaseService.self) private var purchaseService
    @Environment(\.dismiss) private var dismiss
    @State private var selectedProduct: Product?
    @State private var isPurchasing = false
    @State private var error: Error?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    headerSection
                    featuresSection
                    productsSection
                    termsSection
                }
                .padding()
            }
            .navigationTitle("Go Premium")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task {
                try? await purchaseService.loadProducts()
            }
            .alert("Error", isPresented: .constant(error != nil)) {
                Button("OK") { error = nil }
            } message: {
                Text(error?.localizedDescription ?? "")
            }
        }
    }

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: "crown.fill")
                .font(.system(size: 60))
                .foregroundStyle(.yellow)

            Text("Unlock Premium")
                .font(.title.bold())

            Text("Get access to all features")
                .foregroundStyle(.secondary)
        }
        .padding(.top)
    }

    private var featuresSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            FeatureRow(icon: "checkmark.circle.fill", title: "Unlimited items")
            FeatureRow(icon: "checkmark.circle.fill", title: "Cloud sync")
            FeatureRow(icon: "checkmark.circle.fill", title: "Priority support")
            FeatureRow(icon: "checkmark.circle.fill", title: "No ads")
        }
        .padding()
        .background(.background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var productsSection: some View {
        VStack(spacing: 12) {
            ForEach(purchaseService.products) { product in
                ProductButton(
                    product: product,
                    isSelected: selectedProduct == product,
                    action: { selectedProduct = product }
                )
            }

            Button {
                Task {
                    await purchase()
                }
            } label: {
                if isPurchasing {
                    ProgressView()
                } else {
                    Text("Subscribe")
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(selectedProduct == nil || isPurchasing)

            Button("Restore Purchases") {
                Task {
                    try? await purchaseService.restorePurchases()
                }
            }
            .font(.caption)
        }
    }

    private var termsSection: some View {
        VStack(spacing: 4) {
            Text("Subscription automatically renews unless canceled.")
            HStack {
                Link("Terms", destination: URL(string: "https://example.com/terms")!)
                Text("•")
                Link("Privacy", destination: URL(string: "https://example.com/privacy")!)
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    private func purchase() async {
        guard let product = selectedProduct else { return }

        isPurchasing = true
        defer { isPurchasing = false }

        do {
            let result = try await purchaseService.purchase(product)
            if result == .success {
                dismiss()
            }
        } catch {
            self.error = error
        }
    }
}

struct FeatureRow: View {
    let icon: String
    let title: String

    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(.green)
            Text(title)
            Spacer()
        }
    }
}

struct ProductButton: View {
    let product: Product
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading) {
                    Text(product.displayName)
                        .font(.headline)
                    if let subscription = product.subscription {
                        Text(subscription.subscriptionPeriod.debugDescription)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Text(product.displayPrice)
                    .font(.headline)
            }
            .padding()
            .background(isSelected ? Color.accentColor.opacity(0.1) : Color.clear)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.accentColor : Color.secondary.opacity(0.3), lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}
```

## Subscription Management

### Check Subscription Status

```swift
extension PurchaseService {
    var isSubscribed: Bool {
        subscriptionStatus == .subscribed || subscriptionStatus == .inGracePeriod
    }

    func checkAccess(for feature: Feature) -> Bool {
        switch feature {
        case .basic:
            return true
        case .premium:
            return isSubscribed || purchasedProductIDs.contains("com.app.lifetime")
        }
    }
}

enum Feature {
    case basic
    case premium
}
```

### Show Manage Subscriptions

```swift
Button("Manage Subscription") {
    Task {
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
            try? await AppStore.showManageSubscriptions(in: windowScene)
        }
    }
}
```

### Handle Subscription Renewal

```swift
extension PurchaseService {
    func getSubscriptionRenewalInfo() async -> RenewalInfo? {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  transaction.productType == .autoRenewable else { continue }

            guard let renewalInfo = try? await transaction.subscriptionStatus?.renewalInfo,
                  case .verified(let info) = renewalInfo else { continue }

            return RenewalInfo(
                willRenew: info.willAutoRenew,
                expirationDate: transaction.expirationDate,
                isInBillingRetry: info.isInBillingRetry
            )
        }
        return nil
    }
}

struct RenewalInfo {
    let willRenew: Bool
    let expirationDate: Date?
    let isInBillingRetry: Bool
}
```

## Consumables

```swift
extension PurchaseService {
    func purchaseConsumable(_ product: Product, quantity: Int = 1) async throws {
        let result = try await product.purchase()

        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)

            // Grant content
            await grantConsumable(product.id, quantity: quantity)

            // Must finish transaction for consumables
            await transaction.finish()

        case .userCancelled, .pending:
            break

        @unknown default:
            break
        }
    }

    private func grantConsumable(_ productID: String, quantity: Int) async {
        // Add to user's balance (e.g., coins, credits)
        // This should be tracked in your own storage
    }
}
```

## Promotional Offers

```swift
extension PurchaseService {
    func purchaseWithOffer(_ product: Product, offerID: String) async throws -> PurchaseResult {
        // Generate signature on your server
        guard let keyID = await fetchKeyID(),
              let nonce = UUID().uuidString.data(using: .utf8),
              let signature = await generateSignature(productID: product.id, offerID: offerID) else {
            throw StoreError.offerSigningFailed
        }

        let result = try await product.purchase(options: [
            .promotionalOffer(
                offerID: offerID,
                keyID: keyID,
                nonce: UUID(),
                signature: signature,
                timestamp: Int(Date().timeIntervalSince1970 * 1000)
            )
        ])

        // Handle result same as regular purchase
        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            await updatePurchasedProducts()
            await transaction.finish()
            return .success
        case .userCancelled:
            return .cancelled
        case .pending:
            return .pending
        @unknown default:
            return .failed
        }
    }
}
```

## Testing

### StoreKit Configuration File

Create `Configuration.storekit` for local testing:

1. File > New > File > StoreKit Configuration File
2. Add products matching your App Store Connect configuration
3. Run with: Edit Scheme > Run > Options > StoreKit Configuration

### Test Purchase Scenarios

```swift
#if DEBUG
extension PurchaseService {
    func simulatePurchase() async {
        purchasedProductIDs.insert("com.app.premium.monthly")
        subscriptionStatus = .subscribed
    }

    func clearPurchases() async {
        purchasedProductIDs.removeAll()
        subscriptionStatus = .notSubscribed
    }
}
#endif
```

### Transaction Manager (Testing)

Use Transaction Manager in Xcode to:
- Clear purchase history
- Simulate subscription expiration
- Test renewal scenarios
- Simulate billing issues

## App Store Server Notifications

Configure in App Store Connect to receive:
- Subscription renewals
- Cancellations
- Refunds
- Grace period events

Handle on your server to update user access accordingly.

## Best Practices

### Always Update UI After Purchase

```swift
func purchase(_ product: Product) async throws -> PurchaseResult {
    let result = try await product.purchase()
    // ...
    await updatePurchasedProducts()  // Always update
    return result
}
```

### Handle Grace Period

```swift
if purchaseService.subscriptionStatus == .inGracePeriod {
    // Show warning but allow access
    showGracePeriodBanner()
}
```

### Finish Transactions Promptly

```swift
// Always finish after granting content
await transaction.finish()
```

### Test on Real Device

StoreKit Testing is great for development, but always test with sandbox accounts on real devices before release.
