import Foundation
import Security

/// A validated VLESS Reality profile is a bearer credential.
/// Share it exclusively in an entitlement-restricted, device-local Keychain
/// group accessible to the app and its Packet Tunnel extension.
enum SharedTunnelProfile {
    private static let service = "app.vainah.vpn.packet-tunnel-profile"
    private static let account = "selected-vless-reality-v1"
    // Xcode entitlements give both targets exactly the same default Keychain
    // access group with the signing Team ID prefix. Do not hardcode a prefix.

    private static func query() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    /// No raw VLESS URL is ever written to a UserDefaults suite, plist or log.
    @discardableResult
    static func save(_ raw: String) -> Bool {
        guard VlessRealityConfig.parse(raw) != nil,
              let data = raw.data(using: .utf8) else { return false }
        let selector = query()
        var item = selector
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] =
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let update = [kSecValueData as String: data]
        let result = SecItemAdd(item as CFDictionary, nil)
        if result == errSecSuccess { return true }
        if result == errSecDuplicateItem {
            return SecItemUpdate(selector as CFDictionary,
                                 update as CFDictionary) == errSecSuccess
        }
        return false
    }

    static func load() -> String? {
        var selection = query()
        selection[kSecMatchLimit as String] = kSecMatchLimitOne
        selection[kSecReturnData as String] = true
        var response: CFTypeRef?
        guard SecItemCopyMatching(selection as CFDictionary, &response) == errSecSuccess,
              let data = response as? Data,
              let raw = String(data: data, encoding: .utf8),
              VlessRealityConfig.parse(raw) != nil else { return nil }
        return raw
    }

    static func clear() {
        SecItemDelete(query() as CFDictionary)
    }
}
