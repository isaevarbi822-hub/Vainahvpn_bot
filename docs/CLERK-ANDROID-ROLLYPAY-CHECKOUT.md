# Vainah VPN — Clerk Android / RollyPay / H1Cloud payment integration

**Status: prepared, not deployed or enabled for real charges.**

## Purchase path

1. Clerk authenticates via email or phone; official SDK issues a fresh mobile JWT.
2. Server verifies the JWT and Clerk-verified primary email; phone-only users can log in without email but must verify one **before buying**, so subscription links reach the correct owner.
3. Authenticated mobile-checkout accepts only a fixed plan ID. The server owns prices, customer identities and invoices and calls RollyPay. The Android app displays its HTTPS checkout URL in Custom Tabs.
4. The signed webhook and owner-authorized order refresh independently verify RollyPay payment status, invoice, amount and currency. Browser redirect is not a paid receipt.
5. Paid days are durably reserved in PostgreSQL, H1Cloud provisions the VPN and Resend emails the key to the verified address attached to the order.
6. Android fetches paid and delivered subscription from mobile-order and imports it to encrypted VPN vault. Native order history is tied to Clerk identity, not to a local order ID.

## Required checks before production

- An eligible merchant account holder must review RollyPay eligibility, local regulations, store-distribution rules, support, terms, refunds and test results. Do not bypass age or account requirements.
- Netlify secure configuration: DATABASE_URL, PUBLIC_SITE_ORIGIN, SESSION_SIGNING_KEY, ROLLYPAY_API_KEY, ROLLYPAY_SIGNING_SECRET, PANEL_BASE_URL, PANEL_API_TOKEN, CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL. No secret keys go into the mobile APK.
- Apply backed-up native DB migrations 002, 003 where needed, 004 and 005.
- Test a sandbox/native invoice, signed webhook, duplicate callback, incorrect amount, canceled/refunded payment, H1Cloud outage after confirmed payment, renewal idempotency, email delivery retries, and owner-only access. Do not test by charging customers.
- Live backend stays disabled unless VAINAH_LIVE_CHECKOUT, VAINAH_PAYMENT_INTEGRATION_VERIFIED and VAINAH_NATIVE_CHECKOUT are explicitly set to their reviewed production values. Website Telegram Login is not required for Clerk native checkout.
- Standalone Android production build requires separately reviewed direct-distribution rules before enabling -PvainahStandaloneCheckout=true. This preview deliberately does not enable real checkout. iOS requires its own store-policy-compliant billing implementation.

## Android UI

The app distinguishes authenticated, unverified email, pending payment, paid awaiting provisioning and delivered states. A returning hosted-payment browser triggers an authenticated status recheck; only the server can establish payment success.
The user can choose phone OR email for Clerk sign-up, but verifying a destination email is still needed to receive the paid VPN key.

**A successful CI build does not establish payment provider eligibility, working purchases, or absence of VPN traffic leaks.**