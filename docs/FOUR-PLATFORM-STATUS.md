# Four-platform compatibility milestone — 2026-10-21

| Platform | Configuration inspection | Native VPN tunnel |
|---|---|---|
| Windows | Local Xray JSON inspector in Electron main process; offline TCP REALITY sing-box adapter prototype | NOT INTEGRATED |
| macOS | Same desktop inspector and offline adapter prototype | NOT INTEGRATED; needs signed Network Extension |
| Android | Metadata-only bounded Xray JSON inspection | NOT INTEGRATED; Android VpnService transport is unavailable |
| iOS | Metadata-only bounded Xray JSON inspection | NOT INTEGRATED; Packet Tunnel extension explicitly fails startup |

The metadata inspectors summarize VLESS + REALITY TCP/gRPC/XHTTP profiles **without returning server hosts, account IDs, UUIDs or REALITY keys**. These inspectors are not connected to a VPN engine and should not be represented as an active tunnel. Implementations intentionally differ by platform. Their behavior must be checked against the actual H1Cloud export format (which has not been shared) before use.

## Release blockers

1. Select and verify a maintained and licensed engine compatible with all required REALITY transports. Confirm actual config schema with vendor documentation, not only hand-built JSON.
2. Protect credentials (on-device secure storage; OS-specific privilege boundary, never web renderer or logs).
3. Windows: signed native service/TUN adapter. macOS: signed entitlement/provisioned packet-tunnel extension. Android/iOS: verified packet processing engine and OS lifecycle.
4. Validate JSON safely: bounded network fetch, timeouts, redirect restrictions and content-type/shape handling.
5. Test real TCP/UDP transport, IPv4/IPv6 routing, DNS leaks, kill-switch behavior, suspend/reconnect and permission-denied scenarios on physical devices.
6. Mark *connected* only when packet forwarding and routes/DNS are actually verified.

Do not distribute the current preview as a functioning VPN. Do not put private subscription links or signing keys into GitHub.
