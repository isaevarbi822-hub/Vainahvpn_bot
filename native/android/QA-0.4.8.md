# Vainah VPN Android 0.4.8 — experimental QA checklist

**NOT a verified VPN release.** GitHub Actions compiling an APK does not prove
privacy, DNS safety, internet routing or REALITY transport on any phone.

## What's changed
- Explicit virtual DNS addresses for the sing-box 1.14 TUN interface
  (172.19.0.2 and fd00:19::2) with the route's hijack-dns rule.
- Native TUN startup tolerance, stale-session protection and serialized
  libbox connection teardown.
- New clipboard diagnostic report whose payload excludes secrets and nodes.
- Fresh errors on each attempted connection (no stale DNS/HTTPS probe).
- Android application version 0.4.8, build number 5.

## Responsible QA on a personally controlled Android phone

1. Use the **experimental-libbox** APK artifact from the matching latest
   successful workflow run. The public **UI preview** APK has no VPN engine.
   Do not disable Android device security checks to install an APK.
2. With VPN OFF, confirm an ordinary HTTPS page works; note your external
   IP privately for comparison. Never share this IP in a public bug report.
3. Import your own HTTPS subscription through the app. Do not screenshot
   or forward the URL, VLESS UUID or server credentials.
4. Pick a server; connect after Android's VPN consent prompt. Record only
   displayed phase, selected readable label and sanitized diagnostic code.
5. While the VPN interface is active, open a page in a **separate browser app**.
   If it fails, disconnect VPN promptly. A TUN icon is not proof of internet.
6. If HTTPS works, compare your exit IP before/after **privately**, then check
   DNS resolution, IPv4 and IPv6 behavior using your own permitted network.
   Avoid claiming leak protection without controlled independent checks.
7. From the app, use **Copy safe diagnostics** and paste the report into
   an issue. It includes only phase, Android API, internal stage, HTTPS probe
   code, and service state. Do not paste logs containing VPN URIs or tokens.
8. Verify the notification shows the server and the **Disconnect** action.
   Reconnect once, change from Wi-Fi to cellular if available, stop again,
   and verify the original internet connection remains usable.

## Interpretation

- `phase=starting` — VPN initialization in progress, no protection claim.
- `phase=tun_ready` — Android virtual interface exists, user traffic still
  unverified; a browser test is necessary.
- `phase=online` — the app's HTTPS probe succeeded, but exit IP and DNS still
  need independent verification.
- `phase=failed` — no established VPN claim. Check the `last_stage` and
  `https_probe` codes without sharing node/credentials.
- `vpn_network_not_visible_to_app` — in-app probe could not observe VPN.
  It does **not** prove the browser traffic failed.
- `dns_resolution_failed` — DNS lookup in the app probe failed.
- `tls_handshake_failed`, `https_timeout` — browser and network tests needed.

Signing, store distribution, Apple platform tunnel implementations and
Galaxy/Apple Watch pairing remain separate milestones. Do not deploy
production payments or merge the draft branch as part of this QA cycle.
