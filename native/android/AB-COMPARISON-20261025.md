# Vainah VPN: A/B Android subscription investigation (2026-10-25)

The original Android VPN app worked on the user's phone before subscription
fetch started returning HTTP 403. The same private HTTPS subscription updates
successfully in Happ. Do not infer subscription expiry or recreate H1 servers.

This test deliberately rebuilds **two pinned source trees**, not yet another
uncontrolled patch. Neither executable updates the production app:

| Isolated APK | Source branch | Source SHA | Debug package |
|---|---|---|---|
| BASE (Oct 24) | `feature/android-clerk-rollypay-checkout-flow-20261024` | `316ba6c87ee8e334bcedbfc6dc6aea66cf58d09f` | `app.vainah.vpn.abbaseline` |
| NEW (Oct 25) | `fix/android-ua-compat-20261025` | `3509142b7ca6b482aca2816c9fc314d34e1165f0` | `app.vainah.vpn.abcurrent` |

Only the debug APK suffix and human-readable app label are changed in CI.
Both include the libbox Android source set, unit tests and genuine Clerk public
key when configured. App login availability is not evidence of network access.

## On-device test (without revealing the secret URL)

1. Keep the original working VPN app installed.
2. On the same phone, on the same Wi-Fi or mobile data, open **BASE** and add
   the exact **same full HTTPS URL** from Happ. Refresh servers once.
3. Open **NEW**, add that same URL and refresh once. Do not enable optional
   HWID or user-agent overrides until after the initial comparison.
4. Record only: whether Germany, Spain and Poland appear, HTTP status or error,
   and which APK was used. Never share the HTTPS URL, its query, VLESS keys,
   real device identifiers, or bearer tokens.

## Interpretation

- BASE succeeds / NEW fails: client regression; focus on changed HTTP request
  headers (User-Agent, Accept, no-cache) and redirect/status processing. Revert
  individual changes against the baseline, test them in isolation.
- BASE fails / NEW fails / Happ succeeds: likely the subscription service
  recognizes a different approved client or has a policy requiring identity/
  authorized device headers. Verify access **with the provider's authorized
  account and server logs**. Clean code builds do not override server 403.
- Both succeed: the earlier installed build/config/network was involved; make
  sure the same saved URL and device conditions are used.
- BASE fails / NEW succeeds: importer changes are effective; review diffs and
  merge only the minimal confirmed fix.

No 403 handling should substitute another customer's identity, disable
certificate validation, or silently route private VPN keys through a third
party. The Windows client, Netlify, Python/Render and payment deployment are
outside this test. No live endpoint or DB is changed.
