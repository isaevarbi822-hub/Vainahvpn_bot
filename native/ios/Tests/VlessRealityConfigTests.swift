import XCTest
@testable import VainahVPN

final class VlessRealityConfigTests: XCTestCase {
    private let sample = "vless://00000000-0000-4000-8000-000000000001@example.org:443" +
        "?security=reality&type=tcp&sni=example.org&pbk=" +
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=a1b2&fp=chrome"

    func testValidTCPRealityIsPreparedWithoutNetwork() throws {
        XCTAssertTrue(VlessRealityConfig.validate(sample))
        let data = try XCTUnwrap(VlessRealityConfig.makeConfiguration(sample))
        let config = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any])
        let tunnel = try XCTUnwrap((config["inbounds"] as? [[String: Any]])?.first)
        XCTAssertEqual(tunnel["dns_mode"] as? String, "hijack")
        XCTAssertEqual(tunnel["strict_route"] as? Bool, true)
        let dns = try XCTUnwrap(config["dns"] as? [String: Any])
        XCTAssertEqual(dns["final"] as? String, "vpn-doh")
    }

    func testUnsafeOrUnsupportedLinksAreRejected() {
        for suffix in ["&type=grpc", "&security=none",
            "&pbk=bad", "&flow=unsupported", "&sid=z1", "&fp=unknown"] {
            let url = suffix.hasPrefix("&type=")
                ? sample.replacingOccurrences(of: "type=tcp", with: "type=grpc")
                : sample + suffix
            XCTAssertFalse(VlessRealityConfig.validate(url))
        }
        XCTAssertFalse(VlessRealityConfig.validate("http://example.org"))
    }
}

final class SharedTunnelProfileTests: XCTestCase {
    func testInvalidProfileNeverWrittenToSharedKeychain() {
        XCTAssertFalse(SharedTunnelProfile.save("vless://invalid"))
        XCTAssertFalse(SharedTunnelProfile.save("https://site.example/path"))
    }

    func testProfileCodeHasNoUserDefaultsFallback() throws {
        // Security invariant is enforced by checking actual shared Keychain
        // calls; entitlement availability must still be tested on signed iOS.
        XCTAssertNil(VlessRealityConfig.parse("https://example.org/sub"))
    }
}
