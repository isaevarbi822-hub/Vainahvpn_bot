import XCTest
@testable import VainahVPN

final class H1SubscriptionDiscoveryTests: XCTestCase {
    private let prefix = "vless://123e4567-e89b-42d3-a456-426614174000@host.invalid:443?security=reality&type="

    func testAllThreeRealityTransports() throws {
        let text = ["tcp", "grpc", "xhttp"].map { prefix + $0 }.joined(separator: "\n")
        let summary = try H1SubscriptionDiscovery.parse(text)
        XCTAssertEqual(summary.realityProfiles, 3)
        XCTAssertEqual(summary.profiles, 3)
        XCTAssertEqual(summary.transports, Set(H1SubscriptionDiscovery.Transport.allCases))
    }

    func testBase64Subscription() throws {
        let encoded = Data((prefix + "tcp").utf8).base64EncodedString()
        let summary = try H1SubscriptionDiscovery.parse(encoded)
        XCTAssertEqual(summary.transports, [.tcp])
    }

    func testUnknownTransportIsNotGuessed() throws {
        let summary = try H1SubscriptionDiscovery.parse(prefix + "other")
        XCTAssertTrue(summary.transports.isEmpty)
    }

    func testSummaryDoesNotExposeCredentials() throws {
        let summary = try H1SubscriptionDiscovery.parse(prefix + "tcp")
        XCTAssertFalse(String(describing: summary).contains("123e4567"))
        XCTAssertFalse(String(describing: summary).contains("host.invalid"))
    }

    func testJSONDiscoveryShowsOnlyValidatedRealityTransport() throws {
        let uri = prefix + "tcp&sni=www.example.org&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=abcd&fp=chrome"
        let config = try MobileRealityConfig.fromVlessLink(uri)
        let parsed = try XCTUnwrap(JSONSerialization.jsonObject(
            with: Data(config.utf8)) as? [String: Any])
        let outbound = try XCTUnwrap((parsed["outbounds"] as? [[String: Any]])?.first)
        let json = try String(data: JSONSerialization.data(
            withJSONObject: ["outbounds": [outbound]]), encoding: .utf8)!
        let summary = try H1SubscriptionDiscovery.parse(json)
        XCTAssertEqual(summary.realityProfiles, 1)
        XCTAssertEqual(summary.profiles, 1)
        XCTAssertEqual(summary.transports, [.tcp])
        XCTAssertFalse(String(describing: summary).contains("123e4567"))
        XCTAssertFalse(String(describing: summary).contains("host.invalid"))
    }

    func testRejectsOversizedPayload() {
        XCTAssertThrowsError(try H1SubscriptionDiscovery.parse(String(repeating: "a", count: 262145)))
    }
}
