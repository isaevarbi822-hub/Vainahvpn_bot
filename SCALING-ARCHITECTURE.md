# Vainah VPN — architecture for a large 4-platform service

> Implementation milestone, **not** an assertion of a functioning VPN.
> Production website, billing, Telegram orders and existing VPN subscribers are untouched.

## Deployment architecture

```text
iOS / Android / Windows / macOS
    | HTTPS (authenticated native OAuth with PKCE)
    v
API gateway + per-device sessions + request limits
    |-- Account/identity adapter (verified Clerk/Telegram/Yandex identities)
    |-- Entitlement service (server-confirmed paid subscriptions)
    |-- Device registry (revocation + device limits)
    |-- Profile broker (private H1Cloud credentials, short-lived access)
    |-- Server discovery / health (non-sensitive metadata only)
    |-- Billing adapter (verified, idempotent RollyPay webhooks)
    |-- Admin support and audited operations
    v
PostgreSQL (indexed, encrypted backups) + durable queues
    |
H1Cloud control plane -> region-specific VLESS gateways
```

### Ship in independent increments

1. **Contract and capability gate** — explicit tunnel states; no UI may claim protection without a validated native engine and positive traffic proof. The first implementation lives at `desktop/shared/tunnel-state.cjs` with unit tests; desktop production entry point is not yet wired to a real engine.
2. **Server API v1** — `GET /v1/me`, `GET /v1/entitlements`, `GET /v1/devices`, `POST /v1/devices`, `DELETE /v1/devices/{id}`, `POST /v1/profiles/issue`, `GET /v1/regions`. All identity and ownership decisions happen server-side. Do not reuse website cookies as app credentials.
3. **Transport adapter** — choose maintained, license-compatible and security-reviewed VLESS stack after checking *actual redacted H1Cloud profile formats*. Integrate system packet interface individually on each OS. Reject insecure TLS options, never log profile URIs. Windows service needs OS-appropriate signed components; Apple requires NetworkExtension entitlements.
4. **Security test matrix** — encrypted upstream, IP/DNS/IPv6 leak cases, Wi-Fi to mobile handover, captive portal, sleep/restart, 0-byte link, revocation, DNS failure, network down, partial region outage, and sign-out during active tunnel.
5. **Scaling** — stateless API workers, pooled PostgreSQL connections, bounded provider concurrency, durable idempotent deliveries, health-based region selection and graceful degradation. Add queue/replay metrics with only aggregated counters.
6. **Launch** — internal distribution, beta, signed and notarized installers and store-compliant publishing. Gradual rollout and safe rollback per client/API version.

## Non-negotiable safety invariants

- Website production and payment checkout must never change as a side effect of this branch.
- Client is never trusted to assert its own paid state, identity, device count, or purchase price.
- No shared production secrets in Git, installers, crash reports or desktop renderer.
- Device-revoked or expired access must not produce a new VPN profile.
- Only a confirmed native VPN data plane is allowed to set `protected=true`.
- OS permission, profile import, successful API response and heartbeat are **not** proof of an encrypted tunnel.
- Audit metadata should not contain browsing history, DNS queries, IP destinations, tunnel credentials, or raw packet contents.
- Separate preview/beta/stable release tracks; fail closed when engine, profile, policy or permission is unavailable.

## Capacity and reliability targets (proposed, not measured)

Start with load-test targets for 1,000 simultaneous API sessions and 10,000 registered devices, then measure and size upstream H1Cloud gateways separately. Define p95/p99 response latency and successful handshake rates from laboratory measurements rather than asserting invented performance. Use metrics without user traffic data.

## Before switching on VPN connection

Need: redacted real H1Cloud configuration examples, chosen reviewed VLESS transport and licensing, platform signing identities, verified native OAuth flow, staging credentials, physical-device packet captures and DNS/IPv6 test results. None are provided by this document.
