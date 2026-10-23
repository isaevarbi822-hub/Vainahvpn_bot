import SwiftUI
import ClerkKit

@main
struct VainahApp: App {
    static let clerkPublishableKey = (Bundle.main.object(forInfoDictionaryKey:
      "VainahClerkPublishableKey") as? String ?? "").trimmingCharacters(in: .whitespaces)
    static let clerkConfigured = clerkPublishableKey.hasPrefix("pk_")
      && clerkPublishableKey.count > 25

    init() {
        // Public key only. Never bundle a Clerk secret key.
        if Self.clerkConfigured {
            Clerk.configure(publishableKey: Self.clerkPublishableKey)
        }
    }
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(Clerk.shared)
                .preferredColorScheme(.dark)
        }
    }
}
