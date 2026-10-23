# H1Cloud inbound compatibility matrix (user screenshots, 2026-10-21)

The H1Cloud client editor shows six **enabled** inbounds; these are configuration choices, **not** evidence of external reachability or working VPN forwarding.

| Transport | Endpoint port | Node note | Implementation state |
|---|---:|---|---|
| VLESS / REALITY / TCP | 25201 | Standard inbound | Not integrated |
| VLESS / REALITY / gRPC | 25231 | Standard inbound | Not integrated |
| VLESS / REALITY / XHTTP | 25232 | Standard inbound | Not integrated |
| VLESS / REALITY / TCP | 25575 | Spain, labelled 100 Mbit | Not integrated |
| VLESS / REALITY / gRPC | 25576 | Spain, labelled 100 Mbit | Not integrated |
| VLESS / REALITY / XHTTP | 25577 | Spain, labelled 100 Mbit | Not integrated |

## Confirmed from subscription management page

- An active test subscription is present, with separate German and Spanish profiles visibly labeled **VLESS · TCP · REALITY**.
- Three distinct **links** are offered: **SUB** (general subscription), **Xray JSON**, and **Clash/Mihomo**.
- Each link has a copy/QR control. **A link label does not establish its response schema.** Visiting a generic subscription URL can display a human-friendly management page.
- No subscription secret, URL, user ID, UUID, or authenticated response payload has been captured in this repository.

## Implementation priority

1. Implement a credential-safe import UX: accept the user's HTTPS subscription URL in the client, store securely, never log or bundle it, and fetch with redirect/timeout/size protections.
2. Validate **actual** Xray JSON schema on device with local fixture containing invented credentials. A full Xray config might have `outbounds`, while other providers can return a list of profiles; do not assume shape from the link label.
3. Parse supported VLESS+REALITY+TCP profiles into a typed model; reject unsupported transport settings clearly without losing the original subscription.
4. Wire a reviewed compatible core to actual Android VpnService / iOS PacketTunnel / desktop native tunnel; only report connected after real packet forwarding and route/DNS checks.
5. Add gRPC, XHTTP and automatic endpoint selection once proven compatible and tested.

## Missing nonsecret verification inputs

- Redacted **structure only** of actual Xray JSON (key names and container types without server addresses, subscription links, client IDs, or REALITY parameters), if needed; prefer developing with synthetic fixtures.
- Compatible and maintained VLESS engine with REALITY / gRPC / XHTTP support across intended OS versions.
- Device tests on Android, iOS, Windows and macOS.

**Never share or commit private subscription URLs, keys, UUIDs, or authenticated API responses.** Enabled checkboxes and a live subscription dashboard do not demonstrate functioning tunnelling.
