import Foundation

/// Read-only H1Cloud subscription preflight for the iOS app.
/// Never logs or returns secret profile URIs, UUIDs, hosts, tokens or keys.
/// This does NOT activate NetworkExtension or establish a VPN tunnel.
enum H1SubscriptionDiscovery {
    enum Transport: String, CaseIterable, Hashable {
        case tcp, grpc, xhttp
    }

    struct Summary: Equatable {
        let profiles: Int
        let realityProfiles: Int
        let transports: Set<Transport>
    }

    enum DiscoveryError: Error {
        case unavailable
    }

    private static let maxBytes = 256 * 1024

    static func parse(_ content: String) throws -> Summary {
        guard content.utf8.count <= maxBytes else { throw DiscoveryError.unavailable }
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        let plain: String
        if trimmed.hasPrefix("{") || trimmed.hasPrefix("[") {
            plain = try H1SingBoxJSON.candidates(trimmed).joined(separator: "\n")
        } else if trimmed.contains("vless://") {
            plain = trimmed
        } else if let decoded = Data(base64Encoded: trimmed, options: .ignoreUnknownCharacters),
                  decoded.count <= maxBytes,
                  let text = String(data: decoded, encoding: .utf8) {
            plain = text
        } else {
            throw DiscoveryError.unavailable
        }

        let lines = plain.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard lines.count <= 256 else { throw DiscoveryError.unavailable }

        var transports = Set<Transport>()
        var reality = 0
        for link in lines where link.hasPrefix("vless://") {
            guard let item = URLComponents(string: link),
                  item.scheme == "vless",
                  item.host != nil,
                  let username = item.user,
                  UUID(uuidString: username) != nil else { continue }
            let query = item.queryItems ?? []
            guard query.first(where: { $0.name == "security" })?.value == "reality"
            else { continue }
            reality += 1
            if let name = query.first(where: { $0.name == "type" })?.value,
               let kind = Transport(rawValue: name) {
                transports.insert(kind)
            }
        }
        return Summary(profiles: lines.count, realityProfiles: reality, transports: transports)
    }

    /// Uses streamed reads with a hard byte cap and refuses redirects so the
    /// bearer subscription token is never forwarded to an unexpected origin.
    static func inspect(_ rawURL: String) async throws -> Summary {
        guard let safe = SubscriptionLink.validate(rawURL),
              let url = URL(string: safe) else { throw DiscoveryError.unavailable }

        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 12
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("text/plain", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalCacheData

        do {
            let (bytes, response) = try await session.bytes(
                for: request, delegate: BlockRedirects()
            )
            guard let http = response as? HTTPURLResponse,
                  http.statusCode == 200,
                  http.expectedContentLength <= Int64(maxBytes) else {
                throw DiscoveryError.unavailable
            }
            var data = Data()
            for try await byte in bytes {
                guard data.count < maxBytes else { throw DiscoveryError.unavailable }
                data.append(byte)
            }
            guard let text = String(data: data, encoding: .utf8) else {
                throw DiscoveryError.unavailable
            }
            return try parse(text)
        } catch {
            // Never reflect the URL, host, token, response body or raw error.
            throw DiscoveryError.unavailable
        }
    }
}

private final class BlockRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
