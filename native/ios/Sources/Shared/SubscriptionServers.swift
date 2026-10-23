import Foundation

/// A node URI is a bearer credential: keep it in memory and out of logs,
/// notifications, watch payloads and diagnostic reports.
struct SubscriptionServer: Identifiable, Equatable {
    let uri: String
    let label: String
    var id: String { uri }
}

/// Read-only H1Cloud subscription import. No cross-origin redirects, cookies,
/// plaintext HTTP, or more than 256 KiB are accepted.
private final class NoSubscriptionRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSession,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

enum SubscriptionServers {
    enum ImportError: Error {
        case invalidSubscription, invalidResponse, unsupportedTransport
    }

    /// Backward-compatible UI preview interface.
    static func load(_ raw: String) async throws -> [String] {
        try await loadProfiles(raw).map(\.label)
    }

    static func loadProfiles(_ raw: String) async throws -> [SubscriptionServer] {
        guard let link = SubscriptionLink.validate(raw),
              let url = URL(string: link) else { throw ImportError.invalidSubscription }
        var request = URLRequest(url: url)
        request.timeoutInterval = 8
        request.setValue("text/plain, application/json", forHTTPHeaderField: "Accept")
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 8
        configuration.timeoutIntervalForResource = 12
        let session = URLSession(configuration: configuration,
                                 delegate: NoSubscriptionRedirect(),
                                 delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse,
              http.statusCode == 200,
              http.url?.absoluteString == url.absoluteString else {
            throw ImportError.invalidResponse
        }
        return try parse(data)
    }

    /// Pure parser for SUB plain/base64 and supported Xray/sing-box JSON.
    /// Only VLESS REALITY TCP/RAW is allowed; never silently reinterpret gRPC.
    static func parse(_ data: Data) throws -> [SubscriptionServer] {
        guard data.count <= 262_144,
              let source = String(data: data, encoding: .utf8) else {
            throw ImportError.invalidSubscription
        }
        let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\u{FEFF}", with: "")
        let payload: String
        if trimmed.hasPrefix("vless://") || trimmed.hasPrefix("{") ||
            trimmed.hasPrefix("[") { payload = trimmed }
        else if let decoded = decodeBase64(trimmed), let text = String(data: decoded, encoding: .utf8) {
            payload = text.trimmingCharacters(in: .whitespacesAndNewlines)
        } else { payload = trimmed }
        var urls: [String] = []
        if payload.hasPrefix("{") || payload.hasPrefix("[") {
            guard let json = try? JSONSerialization.jsonObject(with: Data(payload.utf8)) else {
                throw ImportError.invalidSubscription
            }
            urls = jsonLinks(json)
        } else {
            urls = payload.components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { $0.hasPrefix("vless://") }
        }
        guard urls.count <= 200 else { throw ImportError.invalidSubscription }
        var nodes: [SubscriptionServer] = []
        var seen = Set<String>()
        for url in urls {
            if !seen.contains(url), let node = parseVless(url, index: nodes.count + 1) {
                seen.insert(url)
                nodes.append(node)
                if nodes.count > 50 { throw ImportError.invalidSubscription }
            }
        }
        guard !nodes.isEmpty else { throw ImportError.unsupportedTransport }
        return nodes
    }

    private static func decodeBase64(_ source: String) -> Data? {
        let compact = source.filter { !$0.isWhitespace }
        guard !compact.isEmpty,
              compact.range(of: #"^[A-Za-z0-9+/_=-]+$"#, options: .regularExpression) != nil else {
            return nil
        }
        let normalized = compact.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let padded = normalized + String(repeating: "=", count: (4 - normalized.count % 4) % 4)
        let decoded = Data(base64Encoded: padded)
        return decoded?.count ?? 0 <= 262_144 ? decoded : nil
    }

    private static func jsonLinks(_ input: Any) -> [String] {
        let array: [Any]
        if let values = input as? [Any] { array = values }
        else if let dict = input as? [String: Any] {
            array = (dict["outbounds"] as? [Any])
                ?? (dict["profiles"] as? [Any])
                ?? (dict["servers"] as? [Any])
                ?? (dict["nodes"] as? [Any])
                ?? (dict["links"] as? [Any]) ?? []
        } else { return [] }
        guard array.count <= 200 else { return [] }
        var urls: [String] = []
        for item in array {
            if let raw = item as? String {
                if raw.hasPrefix("vless://") { urls.append(raw) }
                continue
            }
            guard let obj = item as? [String: Any] else { continue }
            if let raw = (obj["uri"] as? String) ?? (obj["link"] as? String),
                raw.hasPrefix("vless://") { urls.append(raw) }
            if let xray = xrayLink(obj) { urls.append(xray) }
            if let singBox = singBoxLink(obj) { urls.append(singBox) }
        }
        return urls
    }

    private static func xrayLink(_ obj: [String: Any]) -> String? {
        guard obj["protocol"] as? String == "vless",
              let stream = obj["streamSettings"] as? [String: Any],
              stream["security"] as? String == "reality",
              ["tcp", "raw"].contains(stream["network"] as? String ?? "tcp"),
              let reality = stream["realitySettings"] as? [String: Any],
              let settings = obj["settings"] as? [String: Any],
              let next = settings["vnext"] as? [[String: Any]],
              next.count == 1,
              let host = next[0]["address"] as? String,
              let port = next[0]["port"] as? Int,
              let users = next[0]["users"] as? [[String: Any]],
              users.count == 1,
              let uuid = users[0]["id"] as? String,
              let sni = reality["serverName"] as? String,
              let pbk = reality["publicKey"] as? String else { return nil }
        return compose(uuid: uuid, host: host, port: port, sni: sni, pbk: pbk,
                       sid: reality["shortId"] as? String ?? "",
                       fingerprint: reality["fingerprint"] as? String ?? "chrome",
                       flow: users[0]["flow"] as? String ?? "",
                       label: obj["tag"] as? String ?? "")
    }

    private static func singBoxLink(_ obj: [String: Any]) -> String? {
        guard obj["type"] as? String == "vless",
              let transport = obj["transport"] as? [String: Any] else {
            // Missing transport is valid raw TCP; unsupported transport is not.
            return singBoxTCP(obj)
        }
        guard ["tcp", "raw"].contains(transport["type"] as? String ?? "") else { return nil }
        return singBoxTCP(obj)
    }

    private static func singBoxTCP(_ obj: [String: Any]) -> String? {
        guard obj["type"] as? String == "vless",
              let tls = obj["tls"] as? [String: Any],
              tls["enabled"] as? Bool == true,
              let reality = tls["reality"] as? [String: Any],
              reality["enabled"] as? Bool == true,
              let uuid = obj["uuid"] as? String,
              let host = obj["server"] as? String,
              let port = obj["server_port"] as? Int,
              let sni = tls["server_name"] as? String,
              let pbk = reality["public_key"] as? String else { return nil }
        let utls = tls["utls"] as? [String: Any]
        return compose(uuid: uuid, host: host, port: port, sni: sni, pbk: pbk,
                       sid: reality["short_id"] as? String ?? "",
                       fingerprint: utls?["fingerprint"] as? String ?? "chrome",
                       flow: obj["flow"] as? String ?? "",
                       label: obj["tag"] as? String ?? "")
    }

    private static func compose(
        uuid: String, host: String, port: Int, sni: String, pbk: String,
        sid: String, fingerprint: String, flow: String, label: String
    ) -> String? {
        guard UUID(uuidString: uuid) != nil, host.count <= 253,
              !host.isEmpty, (1...65535).contains(port), !sni.isEmpty,
              !pbk.isEmpty, pbk.count <= 256 else { return nil }
        var components = URLComponents()
        components.scheme = "vless"
        components.user = uuid
        components.host = host
        components.port = port
        components.queryItems = [
            URLQueryItem(name: "security", value: "reality"),
            URLQueryItem(name: "type", value: "tcp"),
            URLQueryItem(name: "sni", value: sni),
            URLQueryItem(name: "pbk", value: pbk),
            URLQueryItem(name: "fp", value: fingerprint)
        ]
        if !sid.isEmpty { components.queryItems?.append(URLQueryItem(name:"sid", value:sid)) }
        if !flow.isEmpty { components.queryItems?.append(URLQueryItem(name:"flow", value:flow)) }
        if safeLabel(label) != nil { components.fragment = label }
        return components.string
    }

    private static func safeLabel(_ value: String) -> String? {
        guard !value.isEmpty && value.count <= 80 &&
                value.rangeOfCharacter(from: .controlCharacters) == nil &&
                !value.contains("://") &&
                !value.contains("@") && !value.contains("?") &&
                !value.contains("#") else { return nil }
        return value
    }

    private static func parseVless(_ uri: String, index: Int) -> SubscriptionServer? {
        guard uri.count <= 8192,
              let parts = URLComponents(string: uri), parts.scheme == "vless",
              parts.host != nil,
              let port = parts.port, (1...65535).contains(port),
              let user = parts.user, UUID(uuidString: user) != nil else { return nil }
        let options = Dictionary(parts.queryItems?.compactMap { item -> (String, String)? in
            guard let value = item.value else { return nil }
            return (item.name, value)
        } ?? [], uniquingKeysWith: { first, _ in first })
        guard options["security"] == "reality",
              ["tcp", "raw"].contains(options["type"] ?? "tcp"),
              !(options["pbk"] ?? "").isEmpty,
              !(options["sni"] ?? "").isEmpty else { return nil }
        let label = safeLabel(parts.fragment ?? "") ?? "Сервер \(index) · VLESS REALITY"
        return SubscriptionServer(uri: uri, label: label)
    }
}
