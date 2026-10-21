# Vainah VPN — tunnel integration gate (2026-10-21)

## Current verified source state

This branch has Android VpnService scaffolding, iOS NetworkExtension scaffolding, and an Electron desktop preview. **No platform currently ships a VLESS packet-forwarding core.** Existing connection buttons MUST NOT present a protected/connected status. A valid H1Cloud subscription URL is only configuration input, not a transport or proof of connectivity.

## Shared engine contract

A production tunnel adapter must provide:
- `importSubscription(httpsUrl)`: validate link, fetch securely with explicit redirect policy, size and timeout limits, and parse the provider's actual response format; never log bearer URLs.
- `prepareTunnel(config)`: validate inbound profiles (protocol, transport, TLS/REALITY settings, DNS, IPv4/IPv6) without placing API keys in the client.
- `connect()`: establish encrypted upstream, OS tunnel routes, DNS, and bidirectional packet forwarding.
- `disconnect()`: stop packet forwarding, release OS resources, and revoke the session.
- `observeState()`: actual native/OS state; mark *connected* only after packet forwarding plus DNS/routes verified. No simulated success.
- Handle cancellation, repeated taps, handover, network loss, app resume, and stale async callbacks.

## Platform tasks

### Android
- Integrate a reviewed VLESS-compatible native core behind `TunnelEngine`; keep `UnavailableTunnelEngine` until verified.
- Connect to the `VpnService` lifecycle and OS consent; establish TUN, configure routes, DNS, IPv6 policy, and keep service foreground as required.
- Exercise subscription import against a **redacted non-production fixture**, then device test traffic and lifecycle.

### iOS
- Integrate the native transport **inside** the packet tunnel extension; do not mark success after merely calling `startVPNTunnel()`.
- Configure signed app/extension identifiers, entitlements, app groups, and secure shared configuration using official Apple provisioning.
- Confirm packet flow and errors from `NEPacketTunnelProvider` and `NEVPNStatus` on a physical device.

### Windows
- Replace UI-only Electron bridge with a signed/native VPN service; manage TUN/Wintun, DNS, routes, lifecycle, privilege boundaries.
- Restrict IPC to explicit commands; never pass raw credentials to UI/log output.

### macOS
- Use an entitled and properly signed Network Extension with native transport; Electron may remain UI only.
- Test restart, sleep/resume, route and DNS changes, and notarized distribution.

## Release blocking tests (all four platforms)

1. Correct H1Cloud subscription response format and authentication verified with secrets redacted.
2. Invalid/expired subscriptions rejected; no credential leaked in UI, logs, crash telemetry.
3. Real bidirectional TCP/UDP packet forwarding through tunnel (not only interface creation).
4. DNS and IPv4/IPv6 policy checked against leaks with tunnel up, down, and reconnecting.
5. No fake "Connected" UI on denied permission, engine unavailable, offline, server failure, or stale response.
6. System resumes sane state after backgrounding, sleep, lost signal, and reconnect.
7. Production release signed and independently tested on target OS devices.

## Guardrails

- Never commit panel API keys, subscription URLs, user secrets, or signing keys.
- Site/Netlify/main branch is out of scope; work here stays on the existing feature branch.
- Do not launch public releases or advertise privacy protection until all release gates pass.
