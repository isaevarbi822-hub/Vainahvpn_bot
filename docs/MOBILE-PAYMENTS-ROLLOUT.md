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
