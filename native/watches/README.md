# Vainah VPN — Apple Watch and Galaxy Watch foundation

**Stage: companion protocol only; no watch APK or watchOS app has been built.**
This directory introduces a credential-free, testable status contract. It does
not install a VPN, create a TUN, or implement watch pairing yet.

## Platform truth

| Product | Phone integration | Watch-side VPN |
| --- | --- | --- |
| Apple Watch (watchOS) | Planned WatchConnectivity companion for iPhone/iPadOS app | **Not promised.** Apple's NetworkExtension packet-tunnel provider is not documented as available on watchOS. |
| Galaxy Watch (Wear OS) | Planned Wearable Data Layer companion for Android phone app | **Not promised.** Wear OS support for VPN permission and routing varies by device and OS version; must be validated on physical hardware. |

The first supported watch use case is **view and control the phone's VPN**:
show the selected server, connection stage, approximate TCP reachability
latency (not tunnel ping), and request disconnection via the paired phone.
No watch-side VPN claim is permitted. The companion must display "connection
unverified" unless the phone has separately established browser egress and
checked for DNS/IP leaks on a real device.

## Protocol

`status-v1.mjs` defines an allowlisted payload:

```json
{
  "version": 1,
  "phase": "tun_ready",
  "server": "Выбранный сервер",
  "tcp_latency_ms": 73,
  "verified_browser_egress": false
}
```

Allowed phases: `off`, `starting`, `tun_ready`, `online`, `failed`.
Do not send subscription URLs, VLESS user info, personal access keys,
purchase records, raw server configurations or diagnostics containing secrets.
No watch should claim `online` solely because Android established TUN or
because an in-app HTTPS self-probe succeeded.

## Implementation milestones

1. Android: pair Galaxy Watch and phone using Wear OS Data Layer; show
   sanitized status and make the stop request wait for phone acknowledgement.
2. iOS: pair Apple Watch with iPhone using WatchConnectivity; mirror the
   status safely and make stop wait for acknowledgement.
3. Handle lost phone link, stale status, permission revocation, background
   lifecycle, watches without LTE and app reinstalls; show offline rather
   than retaining a stale "connected" indicator.
4. Build/watch simulator checks and real-device pairing/notification tests.
5. Only after actual VPN egress, DNS, IPv4/IPv6 and reconnection tests on
   the *phones* may user-facing connection claims be strengthened.

Current native apps remain unchanged. This directory is isolated from
Netlify, payments, H1Cloud secrets, and the production website.
