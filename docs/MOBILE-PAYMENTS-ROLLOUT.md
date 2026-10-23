# Vainah VPN — mobile payments rollout (draft, no live charges)

## Existing server integration

The site already defines six server-owned RUB plans, a session-bound invoice endpoint, RollyPay verification, a PostgreSQL order ledger, and idempotent H1Cloud fulfillment. The backend deliberately returns `checkoutReady() === false` until production readiness is independently proven. Do not remove this block just to make a purchase button active.

## Distribution channels

- **Website and permitted direct distribution:** RollyPay checkout on the existing HTTPS web origin, with authenticated account ownership and server-created invoices only. This requires a production merchant agreement and completed full-flow testing.
- **Google Play Android:** Use Google Play Billing for digital VPN access unless an applicable program or exception explicitly permits an alternative. Do not route a Play app's purchase buttons to RollyPay merely to bypass store billing.
- **App Store iPhone/iPad:** Use StoreKit In-App Purchase or a specifically allowed region/entitlement mechanism. VPN apps have additional Apple review and organization requirements. An existing web-bought subscription may be recognized under applicable multiplatform rules.
- **All mobile builds:** Read entitlements from the same verified backend. Neither client nor browser may grant access based on an unverified success URL.

## Mandatory acceptance checks before live charging

1. Confirm merchant identity, permitted payment channel and local compliance with a responsible account holder. Never put merchant secrets into mobile binaries or GitHub files.
2. Verify Netlify database migrations and session auth; prevent account/order substitution and double invoices.
3. Test every plan's price in minor units and device limit against the immutable server catalog.
4. Test RollyPay callback signature, timestamp, payment ID, environment, exact amount and currency; independently query the provider for the canonical payment state.
5. Verify idempotent fulfillment: duplicate callbacks and retries must never add purchased days twice; H1Cloud expiry and device limit must be read back.
6. Simulate panel outages after payment. Record a durable pending-delivery state, expose it in the customer's authenticated account, retry delivery, and provide support/refund handling.
7. Test cancellation, refund, chargeback, network timeouts, expired invoices and user account recovery.
8. Validate entitlement synchronization on Android/iOS without revealing subscription URLs to other users.
9. Publish terms, pricing, support, cancellation/refund instructions and privacy disclosures before charging.
10. Turn on payments only after independent reviewed production tests. Roll out to a small permitted test cohort with monitoring, then expand.

## Immediate development priorities

- Add payment-provider-independent entitlement verification API, strictly authenticated by the account owner.
- Implement Google Play purchase token verification and App Store signed transaction verification on the backend, without trusting client callbacks.
- Run end-to-end sandbox fixtures for all statuses with no real charges.
- Expose accurate UI states: **unavailable**, **ready**, **pending**, **paid awaiting VPN**, **active**, **refunded**.
- Keep Windows integration out of scope and protect existing Android VPN operation.

Reference official current store policies before publishing:
- https://support.google.com/googleplay/android-developer/answer/9858738
- https://developer.apple.com/app-store/review/guidelines/


## Clerk + RollyPay native payment integration (October 23, 2026)

The **prepared** Android standalone flow is now:

1. Clerk SDK signs in the customer. The native client requests a fresh session JWT.
2. Server `mobile-checkout` authenticates the JWT with Clerk Backend SDK, resolves
   the same Clerk user, and requires a **Clerk-verified primary email**.
3. Only server-owned fixed plan IDs/prices can create RollyPay invoices. The
   provider's HTTPS hosted payment page opens in an Android Custom Tab, not
   on the Vainah website. A bank app may be launched to approve an SBP transfer.
4. A signed webhook is cross-checked with the RollyPay API and database order
   identity, amount, currency and environment. Browser return is **not**
   confirmation of payment.
5. The paid expiry is first **committed durably in PostgreSQL** before H1Cloud
   create/PATCH. Retries use the same target expiry; a timeout or a database
   failure cannot independently grant extra days.
6. On delivery, the verified primary Clerk email captured **when the order
   was created** is used for the Resend notification. A new email on a future
   purchase does not silently change previous recipients.
7. `mobile-orders` lets a logged-in Clerk account recover its history and
   most recent purchase after app reinstall; `mobile-order` returns the
   subscription HTTPS URL only to the verified owner of a paid and
   successfully delivered order. Android stores it in the existing vault.

To prepare the schema, apply the new
`database/migrations/005-native-order-email-snapshot.sql` **after**
002, 003 and 004. Verify backup, schema permissions, and production
test cases before enabling any live payments. Secrets stay in the
Netlify environment; do **not** put them into GitHub or mobile builds.

Do not activate
`VAINAH_LIVE_CHECKOUT`,
`VAINAH_PAYMENT_INTEGRATION_VERIFIED`, or
`VAINAH_NATIVE_CHECKOUT` just to remove a disabled message. The
Clerk live instance, provider credentials, actual H1 provisioning,
webhook retries, Resend delivery, merchant contractual eligibility
and app-distribution rules must all be verified by an eligible
account holder first.

iOS third-party checkout remains unavailable unless the specific
App Store storefront and distribution mode allow it. Existing
VPN tunnel code remains unchanged.
