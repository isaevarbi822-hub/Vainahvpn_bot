import XCTest
@testable import VainahVPN

final class SubscriptionLinkTests: XCTestCase {
    func testAcceptsPrivateHttpsSubscription() {
        XCTAssertEqual(
            SubscriptionLink.validate("https://vpn.example/sub/abc123?token=secret"),
            "https://vpn.example/sub/abc123?token=secret"
        )
    }

    func testRejectsUnsafeAndUnsupportedUrls() {
        for input in [
            "http://vpn.example/sub", "vless://uuid@example.org:443",
            "https://user:password@vpn.example/sub",
            "https://vpn.example/sub#fragment",
            "javascript:alert(1)",
            "https://vpn.example/path\nInjected"
        ] {
            XCTAssertNil(SubscriptionLink.validate(input))
        }
    }
}

final class SubscriptionServersImportTests: XCTestCase {
    private let key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    private var uri: String {
        "vless://00000000-0000-4000-8000-000000000001@example.org:443" +
        "?security=reality&type=tcp&sni=example.org&pbk=" + key + "#Germany"
    }

    func testPlainAndBase64SubsDeduplicateAndPreserveLabels() throws {
        let content = uri + "\n" + uri + "\n"
        let plaintext = try SubscriptionServers.parse(Data(content.utf8))
        XCTAssertEqual(plaintext.count, 1)
        XCTAssertEqual(plaintext.first?.label, "Germany")
        let encoded = Data(content.utf8).base64EncodedString()
        let decoded = try SubscriptionServers.parse(Data(encoded.utf8))
        XCTAssertEqual(decoded, plaintext)
    }

    func testXrayRealityJsonImportsWithoutExposingCredentialsInLabels() throws {
        let config = """
        {"outbounds":[{"protocol":"vless","tag":"Poland",
        "settings":{"vnext":[{"address":"example.org","port":443,
        "users":[{"id":"00000000-0000-4000-8000-000000000001"}]}]},
        "streamSettings":{"network":"tcp","security":"reality",
        "realitySettings":{"serverName":"example.org","publicKey":"\(key)"}}}]}
        """
        let result = try SubscriptionServers.parse(Data(config.utf8))
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].label, "Poland")
        XCTAssertTrue(result[0].uri.contains("security=reality"))
        XCTAssertFalse(result[0].label.contains("00000000"))
    }

    func testSingBoxRealityJsonRejectsUnsupportedGrpc() throws {
        let bad = """
        {"outbounds":[{"type":"vless","tag":"Invalid","server":"example.org",
        "server_port":443,"uuid":"00000000-0000-4000-8000-000000000001",
        "transport":{"type":"grpc"},"tls":{"enabled":true,"server_name":"example.org",
        "reality":{"enabled":true,"public_key":"\(key)"}}}]}
        """
        XCTAssertThrowsError(try SubscriptionServers.parse(Data(bad.utf8)))
    }

    func testMalformedAndOversizedSubscriptionsFailClosed() {
        XCTAssertThrowsError(try SubscriptionServers.parse(Data("not a subscription".utf8)))
        XCTAssertThrowsError(try SubscriptionServers.parse(Data(repeating: 65, count: 262_145)))
    }
}
