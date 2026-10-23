# Vainah VPN 0.5 — cross-platform parity and release gates

The desktop and iOS builds share **product behavior** with working Android:
the six canonical tariffs, branded dashboard, H1Cloud subscription import,
server search, credential-safe diagnostics and read-only checkout readiness.
Platform-specific tunnel implementations are intentionally different.

| Platform | Source | Actual packet tunnel | Installation |
|---|---|---|---|
| Android | Kotlin VpnService + libbox 1.14 | Device-tested by user | Experimental APK |
| iPhone | SwiftUI + NEPacketTunnelProvider | **Not implemented** (extension refuses to start) | Simulator compiles; no signed IPA |
| iPad | Same iOS target, responsive max width | **Not implemented** | No signed IPA |
| Windows | Electron + sing-box/TUN engineering session | Runs only experimental native binary; **egress unverified** | Unsigned NSIS test installer |
| macOS | Electron universal interface | **No macOS Packet Tunnel** | Unsigned/unnotarized DMG preview |
| Apple Watch | SwiftUI/WCSession companion source | Watch never runs VPN itself | Source only, no watch app target |
| Galaxy Watch | Kotlin Wear companion contract | Watch never runs VPN itself | Source only, no Wear APK |

Important: A successful compiler test or service icon is **not proof of
traffic protection**. Tests must verify browser exit IP, DNS/IPv6 routes,
Wi-Fi↔cellular handoff, reconnect, native lifecycle, and failure/lockdown
behavior on each device. Watch "online" requires a paired phone's explicit
independent browser-egress confirmation. Never put VLESS URLs, private node
IPs, keys, purchase history or merchant credentials into companion messages.

## Platform-specific engine integration still required

- **iOS/iPadOS:** integrate an audited VLESS REALITY engine with the
  NEPacketTunnelProvider packetFlow, DNS, MTU, routes, outbound socket
  protection and shutdown; obtain Apple NetworkExtension entitlements and
  code signing; validate on actual iPhone/iPad. Do not use Android JNI/libbox.
- **Windows:** integrate and verify installed Wintun, route precedence,
  DNS, IPv6, administrator privileges and crash cleanup. Until browser
  egress is verified, the current native session stays "running-unverified".
- **macOS:** implement a properly signed/notarized NetworkExtension Packet
  Tunnel + VLESS engine, and distribute with required OS entitlements.
- **Watches:** wire authenticated WatchConnectivity/Wear Data Layer to an
  existing signed phone app; support only safe status and disconnect.

## Billing release gates

RollyPay payment creation, signed callbacks, idempotency and H1Cloud profile
issuance belong **only** to the production backend. The existing backend
still has \`checkoutReady() === false\`. No platform bypasses the lock.
Apple App Store and Google Play digital-service payment rules must be
reviewed independently before enabling commerce.

The live website, current payments and \`main\` branch must not be modified
as part of the native preview work.
