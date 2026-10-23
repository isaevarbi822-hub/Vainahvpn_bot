# Native VPN integration boundaries

## Current site and server

`netlify/functions/website-vpn-access.mjs` checks a website order
against the current **signed Telegram login cookie** and only returns
`{subscriptionUrl,expiresAt}` if the order is paid and delivered.
`readWebsiteAccess()` fetches an HTTPS URL from H1Cloud but does not
guarantee a particular VLESS profile syntax.

The native code **does not call this endpoint**: it cannot assume that
a Safari/Chrome website cookie is transferable into a native app,
and it must not accept unverified Telegram IDs.

## Platform tunnel

Android:
`VpnService.prepare()` → OS permission → VPN foreground service →
verified H1Cloud engine → interface configuration →
TUN packet read/write + remote encryption → Connected.
Without a verified engine, return an explicit error **before**
requesting permission or opening TUN.

iOS:
`NETunnelProviderManager` → OS VPN configuration permission →
`NEPacketTunnelProvider.startTunnel()` →
verified H1Cloud engine, packetFlow, DNS and routes →
notify manager of established tunnel → Connected.
The extension currently calls completion with a non-nil error;
it NEVER reports a fake active tunnel.

**Important:** neither platform is sending real tunnel traffic yet.

## Profile storage and owner consent

- Android: private app preference holds only AES-GCM ciphertext;
  AES-256 key is generated in Android Keystore and never exportable.
- iOS: HTTPS bearer URL lives as a Keychain generic password,
  device-only and available only after the first unlock.
- Validated input rejects non-HTTPS, fragments, whitespace,
  embedded username/password and nonstandard control characters.
- Neither app prints subscription tokens, sends telemetry or
  automatically opens third-party pages with the URL.
- Deleting profile affects only the local device, never the server.

## Next engine contract

The replacement for `UnavailableTunnelEngine` must:
1. Parse owned H1Cloud subscription content in memory, never to logs.
2. Establish encrypted upstream **before** routing traffic into the tunnel.
3. Call Android `protect()` for the engine upstream socket to avoid
   traffic loops, and handle `onRevoke()`.
4. Read / write actual TUN packets and implement DNS and IPv6 policy.
5. Stop and release resources promptly on disconnect / failed link.
6. Feed real link state into the UI and foreground notification.
7. Pass lab tests for error paths, network changes and traffic leaks.

For Apple, the engine goes INSIDE PacketTunnelProvider and accesses
`packetFlow`, with a reviewed shared Keychain/App Group design.

Do not hardcode server identifiers, TLS bypasses, or profile URLs in source.
