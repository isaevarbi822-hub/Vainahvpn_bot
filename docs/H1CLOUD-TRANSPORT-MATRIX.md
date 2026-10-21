# H1Cloud inbound compatibility matrix (user screenshot, 2026-10-21)

The H1Cloud client editor displays six **enabled** inbounds; these are configuration choices, **not** evidence of external reachability or working VPN forwarding.

| Transport | Endpoint port | Node note | Implementation state |
|---|---:|---|---|
| VLESS / REALITY / TCP | 25201 | Standard inbound | Not integrated |
| VLESS / REALITY / gRPC | 25231 | Standard inbound | Not integrated |
| VLESS / REALITY / XHTTP | 25232 | Standard inbound | Not integrated |
| VLESS / REALITY / TCP | 25575 | Spain, labelled 100 Mbit | Not integrated |
| VLESS / REALITY / gRPC | 25576 | Spain, labelled 100 Mbit | Not integrated |
| VLESS / REALITY / XHTTP | 25577 | Spain, labelled 100 Mbit | Not integrated |

## Integration priority

1. Test one VLESS+REALITY+TCP profile with an actual runtime on a local device.
2. Verify DNS/IPv4/IPv6 routing and bidirectional packet flow before reporting connected.
3. Add gRPC and XHTTP with protocol-aware configuration validation and tests.
4. Add node selection/fallback after each transport passes native-device tests.

## Missing nonsecret verification inputs

- H1Cloud subscription response **format** (e.g. JSON shape, without URLs/UUIDs/secrets) and how the service chooses among multiple profiles.
- Actual VLESS engine selection and supported REALITY transport compatibility across each target OS.
- Tests from a physical Android and iPhone device plus Windows and macOS systems.

**Never share or commit private subscription URLs, keys, UUIDs, or authenticated API responses.** Do not mistake an enabled inbound checkbox for proof that a host/port is reachable.
