import Foundation
import NetworkExtension

/// NetworkExtension routing proposal matching MobileRealityConfig.
/// Constructing these settings does not activate the iOS VPN.
/// Do NOT call setTunnelNetworkSettings until a real libbox packet loop exists.
enum MobileTunnelRoutePlan {
    static let ipv4Address = "172.29.86.1"
    static let ipv4Mask = "255.255.255.252"
    static let ipv6Address = "fd00:86:29::1"
    static let ipv6Prefix = 126
    static let dnsServer = "1.1.1.1"
    static let mtu = 1400

    static func proposedSettings() -> NEPacketTunnelNetworkSettings {
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")

        let ipv4 = NEIPv4Settings(
            addresses: [ipv4Address],
            subnetMasks: [ipv4Mask]
        )
        ipv4.includedRoutes = [NEIPv4Route.default()]
        settings.ipv4Settings = ipv4

        let ipv6 = NEIPv6Settings(
            addresses: [ipv6Address],
            networkPrefixLengths: [NSNumber(value: ipv6Prefix)]
        )
        ipv6.includedRoutes = [NEIPv6Route.default()]
        settings.ipv6Settings = ipv6

        let dns = NEDNSSettings(servers: [dnsServer])
        dns.matchDomains = [""]
        settings.dnsSettings = dns
        settings.mtu = NSNumber(value: mtu)
        return settings
    }
}
