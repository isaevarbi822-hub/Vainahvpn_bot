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
