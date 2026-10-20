import Foundation

/// An HTTPS subscription URL is a bearer credential. Never print it or share it.
public enum SubscriptionLink {
    public static func validate(_ raw: String) -> String? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (12...2048).contains(value.utf8.count),
              !value.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) || CharacterSet.controlCharacters.contains($0) }),
              let parts = URLComponents(string: value),
              parts.scheme?.lowercased() == "https",
              let host = parts.host, !host.isEmpty,
              host.count <= 253, !host.contains(".."), !host.contains("\\"),
              parts.user == nil, parts.password == nil,
              parts.fragment == nil,
              parts.url != nil
        else { return nil }
        if let port = parts.port, !(1...65535).contains(port) { return nil }
        return value
    }
}
