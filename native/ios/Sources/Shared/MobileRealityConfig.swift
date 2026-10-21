import Foundation

/// Prepares in-memory sing-box configuration for a future iOS libbox service.
/// The result contains secret server and subscriber credentials: do not log,
/// persist, send to SwiftUI or include in errors/analytics.
/// Creating a config does NOT establish a VPN tunnel.
enum MobileRealityConfig {
    enum ConfigError: Error { case unavailable }

    private static let maxBytes = 256 * 1024
    private static let allowed = Set([
        "security", "type", "sni", "pbk", "sid", "fp",
        "flow", "encryption", "headerType", "serviceName"
    ])
    private static let fingerprints = Set([
        "chrome", "firefox", "safari", "ios", "android", "edge"
    ])

    private static func matches(_ value: String, pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }

    static func fromSubscription(_ input: String) throws -> String {
        guard input.utf8.count <= maxBytes else { throw ConfigError.unavailable }
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let plain: String
        if trimmed.contains("vless://") {
            plain = trimmed
        } else {
            guard matches(trimmed, pattern: "^[A-Za-z0-9+/=\\r\\n]+$"),
                  let data = Data(base64Encoded: trimmed, options: .ignoreUnknownCharacters),
                  data.count <= maxBytes,
                  let output = String(data: data, encoding: .utf8)
            else { throw ConfigError.unavailable }
            plain = output
        }
        let lines = plain.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard lines.count <= 256 else { throw ConfigError.unavailable }
        // Prefer the proven TCP profile; accept genuine gRPC only if
        // no supported TCP server exists. Never map XHTTP to another type.
        for preferred in ["tcp", "grpc"] {
            for line in lines where line.hasPrefix("vless://") {
                let transport = URLComponents(string: line)?.queryItems?
                    .first(where: { $0.name == "type" })?.value
                guard transport == preferred else { continue }
                if let result = try? fromVlessLink(line) { return result }
            }
        }
        throw ConfigError.unavailable
    }

    static func fromVlessLink(_ link: String) throws -> String {
        guard (40...8192).contains(link.utf8.count),
              !link.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              let uri = URLComponents(string: link),
              uri.scheme == "vless",
              let rawUser = uri.user,
              let parsedUUID = UUID(uuidString: rawUser),
              let host = uri.host,
              let port = uri.port, (1...65535).contains(port),
              matches(host, pattern: "^[a-zA-Z0-9.-]{1,253}$")
        else { throw ConfigError.unavailable }
        // Keep the original UUID representation; do not derive or mutate it.
        _ = parsedUUID

        var query: [String: String] = [:]
        for item in uri.queryItems ?? [] {
            guard allowed.contains(item.name), query[item.name] == nil,
                  let value = item.value
            else { throw ConfigError.unavailable }
            query[item.name] = value
        }
        guard query["security"] == "reality",
              let transport = query["type"], ["tcp", "grpc"].contains(transport),
              let pbk = query["pbk"],
              let sni = query["sni"],
              matches(pbk, pattern: "^[a-zA-Z0-9_-]{43}$"),
              matches(sni, pattern: "^[a-zA-Z0-9.-]{1,253}$"), sni.contains("."),
              matches(query["sid"] ?? "", pattern: "^(?:[0-9a-fA-F]{2}){0,8}$"),
              fingerprints.contains(query["fp"] ?? "chrome"),
              (transport == "tcp"
                ? (["", "xtls-rprx-vision"].contains(query["flow"] ?? "") &&
                   query["serviceName"] == nil)
                : ((query["flow"] ?? "").isEmpty &&
                   matches(query["serviceName"] ?? "",
                           pattern: "^[a-zA-Z0-9._/-]{1,128}$"))),
              (query["encryption"] ?? "none") == "none",
              (query["headerType"] ?? "none") == "none"
        else { throw ConfigError.unavailable }

        var outbound: [String: Any] = [
            "type": "vless",
            "tag": "vainah-primary",
            "server": host,
            "server_port": port,
            "uuid": rawUser,
            "tls": [
                "enabled": true,
                "server_name": sni,
                "utls": [
                    "enabled": true,
                    "fingerprint": query["fp"] ?? "chrome"
                ],
                "reality": [
                    "enabled": true,
                    "public_key": pbk,
                    "short_id": query["sid"] ?? ""
                ]
            ] as [String: Any]
        ]
        if let flow = query["flow"], !flow.isEmpty {
            outbound["flow"] = flow
        }
        if transport == "grpc", let service = query["serviceName"] {
            outbound["transport"] = [
                "type": "grpc",
                "service_name": service
            ]
        }
        let config: [String: Any] = [
            "log": ["level": "error"],
            "dns": [
                "servers": [
                    ["type": "local", "tag": "bootstrap"],
                    ["type": "https", "tag": "private-dns",
                     "server": "1.1.1.1", "server_port": 443,
                     "path": "/dns-query", "detour": "vainah-primary"]
                ],
                "rules": [
                    ["domain": [host], "action": "route", "server": "bootstrap"]
                ],
                "final": "private-dns"
            ] as [String: Any],
            "inbounds": [[
                "type": "tun", "tag": "vainah-tun",
                "address": ["172.29.86.1/30", "fd00:86:29::1/126"],
                "mtu": 1400, "auto_route": true, "dns_mode": "hijack"
            ] as [String: Any]],
            "outbounds": [outbound],
            "route": [
                "auto_detect_interface": true,
                "default_domain_resolver": "bootstrap",
                "rules": [["protocol": "dns", "action": "hijack-dns"]],
                "final": "vainah-primary"
            ] as [String: Any]
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: config, options: [.sortedKeys]),
              let result = String(data: data, encoding: .utf8)
        else { throw ConfigError.unavailable }
        return result
    }
}
