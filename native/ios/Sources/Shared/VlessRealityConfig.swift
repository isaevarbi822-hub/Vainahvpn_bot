import Foundation

/// Validated VLESS/REALITY TCP input for a future sing-box Apple packet
/// engine. Produces *in-memory only* JSON; never log this output or store
/// it in a URL, shared UserDefaults or a plaintext file.
enum VlessRealityConfig {
    struct Node {
        let host: String
        let port: Int
        let uuid: String
        let sni: String
        let publicKey: String
        let shortId: String
        let fingerprint: String
        let flow: String
    }

    static func validate(_ raw: String) -> Bool {
        parse(raw) != nil
    }

    static func parse(_ raw: String) -> Node? {
        guard raw.count <= 8192, let uri = URLComponents(string: raw),
              uri.scheme == "vless", let host = uri.host,
              !host.isEmpty, host.count <= 253,
              let port = uri.port, (1...65535).contains(port),
              let id = uri.user, UUID(uuidString: id) != nil else { return nil }
        let items = uri.queryItems ?? []
        // Reject conflicting duplicate query parameters instead of guessing.
        let names = items.map(\.name)
        guard names.count == Set(names).count else { return nil }
        let query = Dictionary(uniqueKeysWithValues: items.compactMap { item -> (String, String)? in
            guard let value = item.value else { return nil }
            return (item.name, value)
        })
        let sid = query["sid"] ?? ""
        guard query["security"] == "reality",
              ["tcp", "raw"].contains(query["type"] ?? "tcp"),
              let sni = query["sni"], sni.count <= 253, !sni.isEmpty,
              let pbk = query["pbk"], pbk.range(
                of: #"^[A-Za-z0-9_-]{43}$"#, options: .regularExpression
              ) != nil,
              sid.count <= 16,
              sid.count % 2 == 0, sid.range(
                of: #"^[0-9a-fA-F]*$"#, options: .regularExpression
              ) != nil else { return nil }
        let flow = query["flow"] ?? ""
        guard flow.isEmpty || flow == "xtls-rprx-vision" else { return nil }
        let fp = query["fp"] ?? "chrome"
        guard ["chrome", "firefox", "safari", "edge", "ios", "random", "randomized"]
                .contains(fp) else { return nil }
        return Node(host: host, port: port, uuid: id, sni: sni,
                    publicKey: pbk, shortId: sid, fingerprint: fp, flow: flow)
    }

    static func makeConfiguration(_ raw: String) -> Data? {
        guard let n = parse(raw) else { return nil }
        let config: [String: Any] = [
            "log": ["level": "warn"],
            "dns": [
                "servers": [
                    ["type": "local", "tag": "bootstrap-only"],
                    ["type": "https", "tag": "vpn-doh", "server": "1.1.1.1",
                     "path": "/dns-query",
                     "tls": ["enabled": true, "server_name": "cloudflare-dns.com"],
                     "detour": "vainah-proxy"]
                ],
                "final": "vpn-doh"
            ],
            "inbounds": [[
                "type": "tun", "tag": "vainah-tun",
                "address": ["172.18.0.1/30", "fdfe:dcba:9876::1/126"],
                "dns_mode": "hijack", "auto_route": true, "strict_route": true
            ]],
            "outbounds": [[
                "type": "vless", "tag": "vainah-proxy", "server": n.host,
                "server_port": n.port, "uuid": n.uuid,
                "flow": n.flow, "domain_resolver": "bootstrap-only",
                "tls": [
                    "enabled": true, "server_name": n.sni,
                    "utls": ["enabled": true, "fingerprint": n.fingerprint],
                    "reality": ["enabled": true, "public_key": n.publicKey,
                                "short_id": n.shortId]
                ]
            ]],
            "route": [
                "auto_detect_interface": true,
                "rules": [["port": 53, "action": "hijack-dns"]],
                "final": "vainah-proxy"
            ]
        ]
        return try? JSONSerialization.data(withJSONObject: config, options: [.sortedKeys])
    }
}
