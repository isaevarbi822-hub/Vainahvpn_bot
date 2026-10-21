import Foundation

/// CLI schema test for the exact Swift config builder compiled into iOS.
/// Synthetic profiles only: no H1Cloud credentials, tunneling or network access.
@main
struct VerifyNativeIOSRealitySchema {
    static func main() throws {
        guard CommandLine.arguments.count == 2 else {
            throw NSError(domain: "VainahSchemaTest", code: 1)
        }
        let dir = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        let uuid = "123e4567-e89b-42d3-a456-426614174000"
        let key = String(repeating: "A", count: 43)
        let base = "vless://\(uuid)@vpn.example.org:443?security=reality&sni=www.example.org&pbk=\(key)&sid=abcd&fp=chrome&encryption=none"
        let cases = [
            ("tcp", base + "&type=tcp&flow=xtls-rprx-vision"),
            ("grpc", base + "&type=grpc&serviceName=vainah-svc")
        ]
        for (transport, uri) in cases {
            let source = try MobileRealityConfig.fromVlessLink(uri)
            guard let data = source.data(using: .utf8),
                  let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let outbound = (object["outbounds"] as? [[String: Any]])?.first,
                  let reality = (outbound["tls"] as? [String: Any])?["reality"] as? [String: Any],
                  reality["enabled"] as? Bool == true,
                  let tun = (object["inbounds"] as? [[String: Any]])?.first,
                  tun["auto_route"] as? Bool == true,
                  (object["route"] as? [String: Any])?["final"] as? String == "vainah-primary"
            else {
                throw NSError(domain: "VainahSchemaTest", code: 2)
            }
            if transport == "grpc" {
                guard let grpc = outbound["transport"] as? [String: Any],
                      grpc["type"] as? String == "grpc",
                      grpc["service_name"] as? String == "vainah-svc" else {
                    throw NSError(domain: "VainahSchemaTest", code: 3)
                }
            } else if outbound["transport"] != nil {
                throw NSError(domain: "VainahSchemaTest", code: 4)
            }
            let output = dir.appendingPathComponent("vainah-ios-\(transport).json")
            try data.write(to: output, options: [.atomic])
        }
        // Ensure a URL with only XHTTP cannot silently become TCP/gRPC.
        do {
            _ = try MobileRealityConfig.fromSubscription(
                base + "&type=xhttp"
            )
            throw NSError(domain: "VainahSchemaTest", code: 5)
        } catch MobileRealityConfig.ConfigError.unavailable {
            // Expected unsupported transport.
        }
        print("Swift iOS TCP + gRPC Reality profiles generated for sing-box validation")
    }
}
