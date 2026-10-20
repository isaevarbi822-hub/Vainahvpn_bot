import Foundation
import Security

/// Device-only Keychain storage. No UserDefaults, logs or analytics.
enum SecureSubscription {
    private static let service = "app.vainah.vpn.subscription"
    private static let account = "profile-url-v1"

    static func save(_ raw: String) -> Bool {
        guard let link = SubscriptionLink.validate(raw),
              let data = link.data(using: .utf8) else { return false }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        var payload = query
        payload[kSecValueData as String] = data
        payload[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(payload as CFDictionary, nil) == errSecSuccess
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true
        ]
        var value: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess,
              let data = value as? Data,
              let raw = String(data: data, encoding: .utf8)
        else { return nil }
        return SubscriptionLink.validate(raw)
    }

    static func remove() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
