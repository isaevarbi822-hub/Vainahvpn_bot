# VLESS + Reality integration checkpoint

The user confirmed that their H1Cloud deployment uses **VLESS + Reality**.
This is not sufficient to assume compatibility of a particular VPN core or tunnel stack.

## Completed in this branch

- Added `reality-compat.mjs`: strict in-memory VLESS + Reality URI preflight.
- Accepts Reality connection metadata for TCP and gRPC; validates UUID, server address, port, SNI, public key syntax, fingerprint and short ID syntax.
- Returns only non-sensitive capability summaries. Never returns subscription credentials, H1Cloud hostnames or server connection URI.
- Rejects unsupported transports and invalid configurations.
- Added tests. This is **not** a cryptographic proof that a public key matches a Reality server, and is **not** a working packet tunnel.

## Remaining to make the VPN button truly work

1. Choose a reviewed, license-compatible VLESS + Reality implementation and pin its source/dependencies.
2. Determine the actual H1Cloud transport type, SNI and public-key representation with a **fully redacted** config. Do not submit real subscription URLs or tokens.
3. Native packet forwarding through Android VpnService and Apple NetworkExtension; Windows/macOS verified OS network integrations.
4. Verify upstream encryption, DNS/IPv6 routing, packet exchange, reconnect/stop behavior and leak protection on authorized physical devices.
5. Link owner-scoped entitlements to native session after proper identity verification; never reuse a website login cookie as a native bearer credential.

No public site, live orders, payment settings or production Netlify deployment changed.
