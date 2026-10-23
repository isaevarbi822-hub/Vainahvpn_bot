# Vainah VPN Android 0.5.0 — redesign and billing integration

## What is implemented

- Native Android dashboard redesigned with connection state, animated-state
  power indicator, per-session native libbox upload/download counters, and
  a separate privacy test panel
- H1Cloud VLESS/REALITY subscription list with live search, selection,
  refresh, and safe protection against old responses
- Six canonical tariff cards, duration, device limits and price-per-month
- A **read-only** HTTPS check against
  `/.netlify/functions/subscription-plans` before checkout buttons unlock
- Exact match of plan ID, price (RUB), duration and device count against
  the compiled app catalogue; malformed or inaccessible responses fail closed
- External HTTPS checkout only for an explicitly opted-in **off-Play**
  distribution variant, and only if the backend reports `checkoutReady=true`

## Important: checkout is NOT live yet

The existing production backend file
`netlify/functions/lib/plan-catalog.mjs` deliberately returns
`checkoutReady() === false`. This safety gate has **not** been bypassed.

The native APK cannot directly create RollyPay invoices, mark an order paid,
or grant H1Cloud access. It never stores merchant keys, bank information, or
payment provider secrets. The existing website flow authenticates the customer
through Telegram Login; only the backend may create an invoice, verify an
authentic signed webhook and grant VPN subscriptions.

To make genuine purchases available requires a separate, authorized server
launch: merchant eligibility and compliance review, verified live payment
credentials, secure webhook signature/replay validation, idempotent orders,
server-side H1Cloud delivery, appropriate refunds, and end-to-end transaction
tests. Do not activate payment availability based on an app-only flag.

## Android build variants

The default app, including test APKs, has
`BuildConfig.VAINAH_DIRECT_CHECKOUT_ENABLED=false`.

The Gradle property `vainahStandaloneCheckout` may be used **only** to
create an appropriate privately distributed Android variant after compliance
and server verification. It **does not** override the backend's payment lock.

For a Google Play release, VPN subscriptions are digital services. Google Play
Billing or a region-specific, approved alternative billing/external offers
program may be required; do not ship the off-Play checkout flow in an
unregistered Google Play build.

## Manual acceptance checks

1. Launch app: verify Home prioritizes VPN switch and real connection state
2. Compare app server labels after H1Cloud adds, removes or renames a location
3. Search locations using a country fragment; clear the query and confirm
   all servers reappear, including the still-selected one
4. Switch tabs rapidly while server refresh is loading; outdated requests
   must not overwrite the new screen
5. Choose each pricing filter and validate all six prices against the backend
6. Confirm that checkout stays disabled and no RollyPay invoice is created
   when the server says `checkoutReady=false`
7. Connect VPN, verify Chrome public country and DNS/IPv6 separately, and
   observe libbox counters without exposing full IPs or subscription links
8. Disconnect and confirm the original OFF status and no stale traffic data

## Privacy

Never include H1Cloud subscription links, user UUIDs, bearer tokens, private
payment details, or public IPs in GitHub issues or screenshots. The on-device
diagnostic copy command is intentionally credential-free.
