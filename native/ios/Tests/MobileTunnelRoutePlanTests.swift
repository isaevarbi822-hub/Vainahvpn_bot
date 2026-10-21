import XCTest
import NetworkExtension
@testable import VainahVPN

final class MobileTunnelRoutePlanTests: XCTestCase {
    func testCandidateSettingsCoverIPv4IPv6AndDNSWithoutActivatingVPN() {
        let settings = MobileTunnelRoutePlan.proposedSettings()
        XCTAssertEqual(settings.mtu?.intValue, 1400)
        XCTAssertEqual(settings.ipv4Settings?.addresses, ["172.29.86.1"])
        XCTAssertEqual(settings.ipv4Settings?.subnetMasks, ["255.255.255.252"])
        XCTAssertNotNil(settings.ipv4Settings?.includedRoutes.first)
        XCTAssertEqual(settings.ipv6Settings?.addresses, ["fd00:86:29::1"])
        XCTAssertNotNil(settings.ipv6Settings?.includedRoutes.first)
        XCTAssertEqual(settings.dnsSettings?.servers, ["1.1.1.1"])
        XCTAssertEqual(settings.dnsSettings?.matchDomains, [""])
    }
}
