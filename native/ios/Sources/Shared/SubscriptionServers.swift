import Foundation

/// Read-only HTTPS subscription preview; never expose bearer URLs or VLESS keys in the UI.
private final class NoSubscriptionRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

enum SubscriptionServers {
    static func load(_ raw: String) async throws -> [String] {
        guard let link=SubscriptionLink.validate(raw), let url=URL(string:link) else {
            throw NSError(domain:"Subscription",code:1)
        }
        var request=URLRequest(url:url)
        request.timeoutInterval=8
        request.setValue("text/plain",forHTTPHeaderField:"Accept")
        let config=URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest=8
        let session=URLSession(configuration:config, delegate:NoSubscriptionRedirect(), delegateQueue:nil)
        defer { session.invalidateAndCancel() }
        let (data,response)=try await session.data(for:request)
        guard let http=response as? HTTPURLResponse,http.statusCode==200,
              http.url?.absoluteString==url.absoluteString,data.count<=262144 else {
            throw NSError(domain:"Subscription",code:2)
        }
        let content=String(decoding:data,as:UTF8.self).trimmingCharacters(in:.whitespacesAndNewlines)
        let decoded:String
        if content.hasPrefix("vless://") { decoded=content }
        else if let bytes=Data(base64Encoded:content.filter { !$0.isWhitespace }),
                let text=String(data:bytes,encoding:.utf8) { decoded=text }
        else { decoded=content }
        let lines=decoded.split(whereSeparator: \.isNewline).map(String.init)
        guard lines.count<=50 else {throw NSError(domain:"Subscription",code:3)}
        let matches=lines.filter { line in
            guard let parts=URLComponents(string:line),
                  parts.scheme == "vless",
                  parts.host != nil,
                  let port=parts.port, (1...65535).contains(port),
                  let user=parts.user, UUID(uuidString:user) != nil else {return false}
            let options=Dictionary(parts.queryItems?.compactMap { item -> (String,String)? in
                guard let value=item.value else {return nil}
                return (item.name,value)
            } ?? [],uniquingKeysWith:{ first,_ in first })
            return options["security"] == "reality" &&
                (options["type"] == nil || options["type"] == "tcp" || options["type"] == "raw") &&
                !(options["pbk"] ?? "").isEmpty && !(options["sni"] ?? "").isEmpty
        }
        guard !matches.isEmpty else {throw NSError(domain:"Subscription",code:4)}
        return matches.indices.map { "Сервер \($0+1) · VLESS REALITY" }
    }
}
