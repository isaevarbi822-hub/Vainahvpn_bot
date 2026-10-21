import Foundation

/// Accept only reviewed VLESS Reality outbounds from H1Cloud sing-box JSON.
/// The JSON's DNS, TUN, routing, experimental and admin settings are ignored:
/// MobileRealityConfig creates our audited config from a validated share link.
/// Never print private hosts, UUIDs, links or full parser errors.
enum H1SingBoxJSON {
    enum ParseError: Error { case unavailable }
    private static let outboundKeys: Set<String> = [
        "type", "tag", "server", "server_port", "uuid", "tls", "flow", "transport"
    ]
    private static let tlsKeys: Set<String> = [
        "enabled", "server_name", "reality", "utls", "insecure", "disable_sni"
    ]
    private static let realityKeys: Set<String> = ["enabled", "public_key", "short_id"]
    private static let utlsKeys: Set<String> = ["enabled", "fingerprint"]
    private static let transportKeys: Set<String> = ["type", "service_name"]

    private static func allowed(_ obj: [String: Any], _ names: Set<String>) -> Bool {
        Set(obj.keys).isSubset(of: names)
    }

    static func candidates(_ raw: String) throws -> [String] {
        guard raw.utf8.count <= 256 * 1024,
              let data = raw.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data),
              let entries = (parsed as? [[String: Any]]) ??
                (parsed as? [String: Any])?["outbounds"] as? [[String: Any]],
              entries.count <= 256
        else { throw ParseError.unavailable }

        let links = entries.compactMap { entry -> String? in
            guard entry["type"] as? String == "vless" else { return nil }
            return candidate(entry)
        }
        guard !links.isEmpty else { throw ParseError.unavailable }
        return links
    }

    private static func candidate(_ o: [String: Any]) -> String? {
        guard allowed(o, outboundKeys),
              let server = o["server"] as? String,
              let uuid = o["uuid"] as? String,
              let port = o["server_port"] as? Int, (1...65535).contains(port),
              let tls = o["tls"] as? [String: Any], allowed(tls, tlsKeys),
              tls["enabled"] as? Bool == true,
              tls["insecure"] as? Bool != true,
              tls["disable_sni"] as? Bool != true,
              let serverName = tls["server_name"] as? String,
              let reality = tls["reality"] as? [String: Any],
              allowed(reality, realityKeys),
              reality["enabled"] as? Bool == true,
              let key = reality["public_key"] as? String
        else { return nil }

        let sid: String
        if let value = reality["short_id"] {
            guard let text = value as? String else { return nil }
            sid = text
        } else {
            sid = ""
        }
        var fingerprint = "chrome"
        if let u = tls["utls"] {
            guard let utls = u as? [String: Any], allowed(utls, utlsKeys),
                  utls["enabled"] as? Bool == true,
                  let fp = utls["fingerprint"] as? String
            else { return nil }
            fingerprint = fp
        }

        let transport: String
        var serviceName: String?
        if let rawTransport = o["transport"] {
            guard let t = rawTransport as? [String: Any],
                  allowed(t, transportKeys),
                  let kind = t["type"] as? String,
                  ["tcp", "grpc"].contains(kind) else { return nil }
            transport = kind
            if kind == "grpc" {
                guard let service = t["service_name"] as? String else { return nil }
                serviceName = service
            } else if t["service_name"] != nil {
                return nil
            }
        } else {
            transport = "tcp"
        }

        var components = URLComponents()
        components.scheme = "vless"
        components.host = server
        components.port = port
        components.user = uuid
        var query = [
            URLQueryItem(name: "security", value: "reality"),
            URLQueryItem(name: "type", value: transport),
            URLQueryItem(name: "sni", value: serverName),
            URLQueryItem(name: "pbk", value: key),
            URLQueryItem(name: "sid", value: sid),
            URLQueryItem(name: "fp", value: fingerprint)
        ]
        if let flow = o["flow"] {
            guard let value = flow as? String else { return nil }
            if !value.isEmpty { query.append(URLQueryItem(name: "flow", value: value)) }
        }
        if let service = serviceName {
            query.append(URLQueryItem(name: "serviceName", value: service))
        }
        components.queryItems = query
        return components.string
    }
}
