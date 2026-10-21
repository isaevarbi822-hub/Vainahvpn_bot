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
            + "&serviceName=vainah-test"
        let text = [grpc, tcp].joined(separator: "\n")
        let encoded = Data(text.utf8).base64EncodedString()
        let result = try MobileRealityConfig.fromSubscription(encoded)
        XCTAssertTrue(result.contains("vainah-primary"))
        XCTAssertFalse(result.contains("\"service_name\":\"vainah-test\""))
    }

    func testGrpcRealityCreatesTrueTransportWithFullTunnel() throws {
        let grpc = tcp.replacingOccurrences(of: "type=tcp", with: "type=grpc")
            + "&serviceName=vainah-test"
        let xhttp = tcp.replacingOccurrences(of: "type=tcp", with: "type=xhttp")
        let json = try MobileRealityConfig.fromSubscription(xhttp + "\n" + grpc)
        let data = try XCTUnwrap(json.data(using: .utf8))
        let parsed = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let outbound = try XCTUnwrap((parsed["outbounds"] as? [[String: Any]])?.first)
        let transport = try XCTUnwrap(outbound["transport"] as? [String: Any])
        XCTAssertEqual(transport["type"] as? String, "grpc")
        XCTAssertEqual(transport["service_name"] as? String, "vainah-test")
        let inbound = try XCTUnwrap((parsed["inbounds"] as? [[String: Any]])?.first)
        XCTAssertEqual(inbound["auto_route"] as? Bool, true)
        XCTAssertEqual(inbound["dns_mode"] as? String, "hijack")
        let dns = try XCTUnwrap(parsed["dns"] as? [String: Any])
        XCTAssertEqual(dns["final"] as? String, "private-dns")
    }

    func testUnsafeGrpcConfigurationRemainsRejected() {
        let grpc = tcp.replacingOccurrences(of: "type=tcp", with: "type=grpc")
            + "&serviceName=vainah-test"
        for link in [
            grpc + "&serviceName=other",
            grpc + "&flow=xtls-rprx-vision",
            grpc.replacingOccurrences(of: "serviceName=vainah-test", with: "serviceName="),
            grpc + "&allowInsecure=true",
            tcp.replacingOccurrences(of: "type=tcp", with: "type=xhttp")
        ] {
            XCTAssertThrowsError(try MobileRealityConfig.fromVlessLink(link))
        }
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

    func testDefaultRealitySpiderXPathIsAllowedButCustomPathsFailClosed() throws {
        let checked = try MobileRealityConfig.fromVlessLink(tcp + "&spx=%2F")
        XCTAssertTrue(checked.contains("vainah-primary"))
        XCTAssertThrowsError(try MobileRealityConfig.fromVlessLink(tcp + "&spx=%2Fcustom"))
    }

    func testSingBoxJSONSubscriptionPrefersTcpOverGrpcAndPreservesTunnelPrivacy() throws {
        let grpc = tcp.replacingOccurrences(of: "type=tcp", with: "type=grpc")
            + "&serviceName=vainah-test"
        let tcpOutput = try MobileRealityConfig.fromVlessLink(tcp)
        let grpcOutput = try MobileRealityConfig.fromVlessLink(grpc)
        func outbound(_ text: String) throws -> [String: Any] {
            let parsed = try XCTUnwrap(JSONSerialization.jsonObject(
                with: Data(text.utf8)) as? [String: Any])
            return try XCTUnwrap((parsed["outbounds"] as? [[String: Any]])?.first)
        }
        let json = try String(data: JSONSerialization.data(withJSONObject: [
            "outbounds": [try outbound(grpcOutput), try outbound(tcpOutput)]
        ]), encoding: .utf8)!
        let selected = try MobileRealityConfig.fromSubscription(json)
        XCTAssertTrue(selected.contains("vainah-primary"))
        XCTAssertFalse(selected.contains("vainah-test"))
        XCTAssertTrue(selected.contains("private-dns"))
        let onlyGrpc = try String(data: JSONSerialization.data(withJSONObject: [
            "outbounds": [try outbound(grpcOutput)]
        ]), encoding: .utf8)!
        XCTAssertTrue(try MobileRealityConfig.fromSubscription(onlyGrpc)
            .contains("vainah-test"))
    }

    func testSingBoxJSONFailsClosedOnUnreviewedTLSAndXHTTP() throws {
        let raw = try MobileRealityConfig.fromVlessLink(tcp)
        let parsed = try XCTUnwrap(JSONSerialization.jsonObject(
            with: Data(raw.utf8)) as? [String: Any])
        var outbound = try XCTUnwrap((parsed["outbounds"] as? [[String: Any]])?.first)
        var tls = try XCTUnwrap(outbound["tls"] as? [String: Any])
        tls["insecure"] = true
        outbound["tls"] = tls
        var xhttp = try XCTUnwrap((parsed["outbounds"] as? [[String: Any]])?.first)
        xhttp["transport"] = ["type": "xhttp"]
        var unknown = try XCTUnwrap((parsed["outbounds"] as? [[String: Any]])?.first)
        unknown["unreviewed_setting"] = true
        for record in [outbound, xhttp, unknown] {
            let json = try String(data: JSONSerialization.data(
                withJSONObject: ["outbounds": [record]]), encoding: .utf8)!
            XCTAssertThrowsError(try MobileRealityConfig.fromSubscription(json))
        }
        XCTAssertThrowsError(try MobileRealityConfig.fromSubscription(
            "{\"proxies\":[]}"))
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
