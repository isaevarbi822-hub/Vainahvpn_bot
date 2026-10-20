# Control-plane policy foundation (not deployed)

`device-policy.mjs` is a framework-free, deterministic implementation of *authorization decisions* for device registration, revocation and profile issuance. It has no DB calls, credentials or network effects.

## Integration requirements

- Derive `identity` only from a backend-verified native OAuth session (PKCE, issuer, audience, expiry, subject). The `verified` flag must **never** originate in an HTTP JSON body.
- Fetch entitlement from the authoritative paid-order store; do not trust claims about limits or payment status from clients.
- Fetch device rows filtered by authenticated account identity; apply policy inside a serializable DB transaction or a per-account lock with a unique constraint. Otherwise two concurrent registrations may exceed a limit.
- Derive immutable account UUIDs through a server-side mapping of provider identities. Never accept accountId as the authorization source in the request.
- Use opaque identifiers, server-side audit metadata without VPN credentials or traffic logs, and invalidate issued profiles on device revocation.
- Send a generic 404 on unauthorized device access; do not reveal whether foreign devices exist.
- Before serving profiles, confirm active H1Cloud allocation, tunnel-engine capabilities and staging leak tests.
- Device registration **does not** establish a VPN tunnel.

Run `npm test` at repository root. All source code here is isolated from production Netlify functions.
