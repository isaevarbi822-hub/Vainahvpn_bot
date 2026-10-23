# Vainah VPN 0.4.17 — Android verification matrix

The native client uses sing-box/libbox 1.14 in the experimental APK.
GitHub compilation and a valid config do **not** prove leak protection.

## Validate on a physical Android phone

1. Use the **experimental libbox APK**. The UI preview intentionally cannot tunnel.
2. Record a baseline external-IP country before connecting. Do not publish a full IP.
3. Connect to Germany, Spain, or Poland, open the in-app **IP and Internet** link
   in an ordinary browser, and verify that `loc` matches the chosen location.
4. Open **DNS leak test** in the browser. Its operators will observe the request
   and external IP. Compare the resolver organization with your expected VPN
   setup, not merely its country. The test is not a complete proof of all DNS.
5. Open **IPv6 test**. If IPv6 connectivity is available, verify its exit
   provider is consistent with the VPN and not the local ISP. IPv6 being
   unavailable is **not** automatically a leak.
6. Check Android's generated diagnostic fields:
   `android_vpn_visible`, `android_ipv4_default_route`,
   `android_ipv6_default_route`, and `android_vpn_dns_configured`.
   These reflect OS-reported routes, not complete traffic protection.
7. While connected, switch safely between Wi-Fi and mobile data. The native
   interface listener must update without a new VPN permission prompt;
   retry the external-IP test afterward. Existing connections may reconnect.
8. Watch the libbox traffic counters while generating browser traffic. Values
   must come from native StatusMessage with `trafficAvailable=true`; otherwise
   the screen says the counters are unavailable.
9. Disconnect. The notification should disappear, libbox counters should clear,
   and reconnect should work without stale callbacks.

## Failure behavior and limits

Unexpected native serviceStop marks the UI failed and closes the owned engine.
It cannot guarantee that **all internet is blocked** when the app stops.
Android's **Always-on VPN** and **Block connections without VPN** settings,
where supported and explicitly enabled by the user, are needed for OS-enforced
lockdown. They can prevent internet access during VPN outages.

The external test websites see the tester's public IP. Never paste subscription
URLs, node UUIDs, full IPs, or secrets into public bug reports. The built-in
diagnostic clipboard restricts itself to metadata and safe codes.
