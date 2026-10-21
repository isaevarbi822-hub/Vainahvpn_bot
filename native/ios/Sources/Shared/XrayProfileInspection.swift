import Foundation

/// Examines Xray JSON structure without returning hosts, UUIDs or REALITY credentials.
/// Not a network client and not a working tunnel.
public enum XrayProfileInspection {
    public struct Summary: Equatable {
        public let tcp: Int
        public let grpc: Int
        public let xhttp: Int
        public var total: Int { tcp + grpc + xhttp }
    }
    public enum InspectionError: Error {
        case invalidFormat
        case tooLarge
    }
    public static func inspect(_ data: Data) throws -> Summary {
        guard data.count <= 1_048_576 else { throw InspectionError.tooLarge }
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let outbounds = root["outbounds"] as? [[String: Any]],
              outbounds.count <= 128 else { throw InspectionError.invalidFormat }
        var counts = [0, 0, 0]
        for outbound in outbounds {
            guard outbound["protocol"] as? String == "vless",
                  let stream = outbound["streamSettings"] as? [String: Any],
                  stream["security"] as? String == "reality",
                  let reality = stream["realitySettings"] as? [String: Any],
                  let key = reality["publicKey"] as? String, !key.isEmpty,
                  let settings = outbound["settings"] as? [String: Any],
                  let servers = settings["vnext"] as? [[String: Any]] else { continue }
            let network = stream["network"] as? String ?? "tcp"
            guard let index = ["tcp", "grpc", "xhttp"].firstIndex(of: network) else { continue }
            for server in servers {
                guard let host = server["address"] as? String, !host.isEmpty,
                      let port = server["port"] as? Int, (1...65535).contains(port),
                      let users = server["users"] as? [[String: Any]], !users.isEmpty else { continue }
                counts[index] += 1
                if counts.reduce(0, +) > 128 { throw InspectionError.tooLarge }
            }
        }
        return Summary(tcp: counts[0], grpc: counts[1], xhttp: counts[2])
    }
}
