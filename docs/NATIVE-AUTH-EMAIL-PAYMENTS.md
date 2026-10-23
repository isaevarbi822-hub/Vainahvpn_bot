# Vainah VPN — native accounts, mobile purchases and verified email

This is an **unreleased implementation**. The existing VPN transport is intentionally unchanged.
No real money can be taken until all server gates and external providers are reviewed.

## User journeys

| Choice | Identity verification | Where user sees it | Purchase access |
| --- | --- | --- | --- |
| Email | Twilio Verify email OTP | Native Android / iOS | Requires a verified email and enabled RollyPay |
| Phone | Twilio Verify SMS OTP | Native Android / iOS | User separately confirms email using OTP before checkout |
| Telegram | Telegram official login outside app | External Telegram/browser | Browser session only; native linking needs a secure one-time exchange |
| Yandex ID | Yandex OAuth PKCE | External Yandex/browser | Browser session only; native linking needs a secure one-time exchange |

**Do not treat a clicked social-login link as a completed native login.** Android and iOS are
prepared for the external launch; secure callback and exchange are not included in this change.

## Native payment flow (when enabled for an eligible standalone Android build)

1. Customer signs in natively via verified OTP. Android encrypts the signed
   session using Android Keystore AES-GCM; iOS uses Keychain. Phone users
   also confirm a delivery email before starting a purchase.
2. Android submits the selected canonical plan to `mobile-checkout` with
   the signed bearer token. The server alone decides prices and keeps
   merchant secrets; it creates a distinct native account and invoice.
3. The hosted payment page opens in an Android Custom Tab. The bank may
   briefly open an external app for SBP authorization.
4. The server checks RollyPay's signed callback **and independently queries
   RollyPay** for status, exact amount and invoice identity. There are
   separate native-account tables, never fabricated Telegram IDs.
5. Only verified paid orders are provisioned in H1Cloud. Retries reuse the
   reserved absolute expiry, rather than granting extra paid days.
6. Android `Проверить оплату` securely queries the owner-bound order status.
   Delivered access is saved into the existing Android encrypted VPN vault.
7. A server-side Resend integration emails the HTTPS VPN subscription
   to the **Twilio-verified email address**, not an unverified free-text field.
   Email delivery has a retry state and a stable idempotency key.

For App Store iOS, native OTP sign-in is implemented but **third-party digital
purchase checkout stays unavailable until the distribution-specific Apple
review/entitlement rules are met.**

## Server-side requirements

- Database backup, then apply `database/subscriptions.sql` and
  `database/migrations/002-native-identities.sql`.
- Twilio Verify configured for SMS **and email** in one service; Verify email
  must be connected to a supported email provider in the Twilio console.
- Configure Resend, including a verified sending domain:
  `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (e.g. `vpn@example.com`).
- Configure H1Cloud, PostgreSQL, Telegram site credentials where applicable,
  RollyPay webhook and merchant secrets in Netlify **private environment only**.
- Double-check webhook uses `rollypay-live-webhook` and no real customer
  receives an unpaid key.
- The payment kill-switch needs ALL THREE reviewed operator settings:
  `VAINAH_LIVE_CHECKOUT=enabled-after-review`,
  `VAINAH_PAYMENT_INTEGRATION_VERIFIED=verified-on-production`,
  `VAINAH_NATIVE_CHECKOUT=approved-after-test`. Leave all **disabled** until
  the full paid/failed/refund/idempotency/email-delivery cases pass.

Never commit keys in GitHub or mobile code. Merchant activation may
require an eligible adult account holder and compliance with local law,
provider terms and distribution rules; do not bypass account restrictions.

## Known limitations to resolve before release

- Mobile-app session exchange for external Yandex / Telegram login is
  deliberately not implemented; those flows authenticate the existing website.
- Production Twilio/Resend merchants, SMS/email deliverability, payment webhook,
  real H1Cloud provisioning and mobile handoff must be tested with actual
  configured accounts (no live charges during initial QA).
- User-facing payment-history UI and ability to recover old orders on a
  new device require additional server endpoints.
- Persisting and using a mobile bearer token securely is not a replacement
  for server-side session revocation, fraud controls and OTP rate limiting.
  Add session revocation, abuse prevention and audit logging before public rollout.
- Retrying provider verification of stale native orders needs bounded scheduled
  backoff to avoid repeated provider calls. Review concurrency and timeouts.
