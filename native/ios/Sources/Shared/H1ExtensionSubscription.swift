import Foundation

/// Transient HTTPS reader for the NetworkExtension process. No disk cache,
/// credentials in UserDefaults, redirects, cookies or plaintext diagnostics.
enum H1ExtensionSubscription {
    enum FetchFailure: Error { case invalid, unavailable, tooLarge }
    static let maximumBytes = 256 * 1024

    private final class DenyRedirects: NSObject, URLSessionTaskDelegate {
        func urlSession(
            _ session: URLSession,
            task: URLSessionTask,
            willPerformHTTPRedirection response: HTTPURLResponse,
            newRequest request: URLRequest,
            completionHandler: @escaping (URLRequest?) -> Void
        ) {
            // A bearer token must not be forwarded to another origin.
            completionHandler(nil)
        }
    }

    static func download(_ untrusted: String) async throws -> String {
        guard let validated = SubscriptionLink.validate(untrusted),
              let url = URL(string: validated) else {
            throw FetchFailure.invalid
        }

        let config = URLSessionConfiguration.ephemeral
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 15
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 10
        request.setValue("text/plain", forHTTPHeaderField: "Accept")

        do {
            let (bytes, response) = try await session.bytes(
                for: request,
                delegate: DenyRedirects()
            )
            guard let http = response as? HTTPURLResponse,
                  http.statusCode == 200 else {
                throw FetchFailure.unavailable
            }
            if http.expectedContentLength > Int64(maximumBytes) {
                throw FetchFailure.tooLarge
            }

            var data = Data()
            for try await octet in bytes {
                if data.count >= maximumBytes { throw FetchFailure.tooLarge }
                data.append(octet)
            }
            guard let plaintext = String(data: data, encoding: .utf8) else {
                throw FetchFailure.invalid
            }
            return plaintext
        } catch {
            // Do not pass URLSession errors up; NSError can embed credential
            // URLs in localizedDescription and response metadata.
            throw FetchFailure.unavailable
        }
    }
}
