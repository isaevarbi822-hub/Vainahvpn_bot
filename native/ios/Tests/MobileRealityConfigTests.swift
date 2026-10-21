import XCTest
@testable import VainahVPN

final class MobileRealityConfigTests: XCTestCase {
    private let tcp = "vless://123e4567-e89b-42d3-a456-426614174000@vpn.example.org:443?security=reality&type=tcp&sni=www.example.org&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=abcd&fp=chrome&encryption=none"

    func testValidatedConfigHasPrivateRouteAndDNS() throws {
        let raw = try MobileRealityConfig.fromVlessLink(tcp)
        let parsed = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        let outbound = try XCTUnwrap((parsed["outbounds"] as? [[String: Any]])?.first)
        XCTAssertEqual(outbound["type"] as? String, "vless")
        XCTAssertEqual(outbound["server_port"] as? Int, 443)
        let inbound = try XCTUnwrap((parsed["inbounds"] as? [[String: Any]])?.first)
        XCTAssertEqual(inbound["type"] as? String, "tun")
        XCTAssertEqual(inbound["auto_route"] as? Bool, true)
        XCTAssertEqual(inbound["dns_mode"] as? String, "hijack")
        let route = try XCTUnwrap(parsed["route"] as? [String: Any])
        XCTAssertEqual(route["final"] as? String, "vainah-primary")
        let dns = try XCTUnwrap(parsed["dns"] as? [String: Any])
        XCTAssertEqual(dns["final"] as? String, "private-dns")
    }

    func testBase64SubscriptionPicksTCPNotGRPC() throws {
        let grpc = tcp.replacingOccurrences(of: "type=tcp", with: "type=grpc")
        let text = [grpc, tcp].joined(separator: "\n")
        let encoded = Data(text.utf8).base64EncodedString()
        let result = try MobileRealityConfig.fromSubscription(encoded)
        XCTAssertTrue(result.contains("vainah-primary"))
    }

    func testUnsupportedTransportOrSecurityRefused() {
        for candidate in [
            tcp.replacingOccurrences(of: "type=tcp", with: "type=xhttp"),
            tcp.replacingOccurrences(of: "type=tcp", with: "type=grpc"),
            tcp.replacingOccurrences(of: "security=reality", with: "security=tls"),
            tcp + "&allowInsecure=1",
            tcp.replacingOccurrences(of: "encryption=none", with: "encryption=aes"),
            tcp + "&security=reality"
        ] {
            XCTAssertThrowsError(try MobileRealityConfig.fromVlessLink(candidate))
        }
    }

    func testErrorsNeverIncludeSubscriptionSecrets() {
        do {
            _ = try MobileRealityConfig.fromSubscription("invalid-secret")
            XCTFail("Expected failure")
        } catch {
            XCTAssertFalse(String(describing: error).contains("invalid-secret"))
            XCTAssertFalse(String(describing: error).contains("vpn.example.org"))
        }
    }
}
