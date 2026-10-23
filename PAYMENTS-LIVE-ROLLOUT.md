# Vainah VPN — RollyPay production rollout (web checkout)

This guide is for the **independent website only**, not Telegram-bot sales and not
in-app purchases. No secrets or card data belong in the GitHub repository,
static `site/` files, app binaries, or the browser.

## Architecture

1. Visitor authenticates with verified Telegram Login on the website.
2. Website POSTs a **plan ID only** to `/.netlify/functions/subscription-checkout`.
3. Server reads the fixed plan catalog, inserts a PostgreSQL order, and creates
   an invoice with RollyPay using its secret server-side API key.
4. Browser goes only to `https://pay.rollypay.io/pay/…`.
5. RollyPay notifies **`/.netlify/functions/rollypay-live-webhook`**. The
   handler checks the signed raw body and timestamp, independently GETs the
   payment from RollyPay, verifies order/payment IDs, amount, currency and
   paid status, updates PostgreSQL atomically, and calls H1Cloud.
6. A paid, delivered account can retrieve its HTTPS subscription URL only
   from an authenticated website endpoint. The site does **not** need to
   message users through Telegram.
7. If the callback is missing, the signed-in customer can use the
   **Обновить статус** button on `payment-result.html`. Scheduled
   reconciliation also checks stale invoices and retries failed delivery.
   Repeated callbacks and retries do not extend the same order twice.

## Required production verification before any live charges

- [ ] Confirm the Netlify **production** site URL and set
      `PUBLIC_SITE_ORIGIN` to its exact HTTPS origin, without trailing slash.
- [ ] Create or verify a **private** PostgreSQL database and apply
      `database/subscriptions.sql` (and `database/migrations/001-six-plans.sql`
      only if upgrading an older schema). Back up an existing DB first.
- [ ] Test Telegram Login and confirm that the website session belongs to the
      intended customer. A manually typed username is not an authorization.
- [ ] Set `DATABASE_URL`, `SESSION_SIGNING_KEY`, `TELEGRAM_BOT_TOKEN`,
      `PANEL_BASE_URL`, `PANEL_API_TOKEN`, `ROLLYPAY_API_KEY` and
      `ROLLYPAY_SIGNING_SECRET` as **Netlify private environment variables**.
      Inspect `.env.example` for optional settings. GitHub Actions
      secrets do not automatically configure Netlify.
- [ ] In the RollyPay terminal settings, set `callback_url` to
      `https://YOUR-LIVE-SITE/.netlify/functions/rollypay-live-webhook`.
      Do **not** use `rollypay-webhook` (legacy sandbox handler).
      RollyPay signs `X-Timestamp` plus the **raw** body via
      `X-Signature`; the production endpoint must be externally reachable.
- [ ] Verify RollyPay merchant credentials with
      `/.netlify/functions/rollypay-health`, DB with
      `/.netlify/functions/database-health`, and panel access with
      `/.netlify/functions/h1-panel-health`. A health check alone does
      not prove paid fulfillment will work.
- [ ] Run `npm test` and check GitHub Actions CI is green.
- [ ] Using RollyPay `test:true` sandbox, verify signed callback and status
      checks without charging real money. **Sandbox must never deliver a live
      entitlement.** Check the sandbox dashboard / existing test endpoints.
- [ ] Confirm that H1Cloud supports expected creation and PATCH requests
      and that the correct Telegram ID maps to the existing H1Cloud client.
      Test a safe isolated account and verify its expiry and device limits.
- [ ] Check customer return flow, unpaid or expired invoice, rejected/tampered
      signature, repeated webhook, a failed panel call, manual retry,
      duplicate payment, late paid callback and refund/chargeback review.
- [ ] Check pricing and customer-support/refund process with the merchant
      account owner. Refunds are marked `needs_review`, not silently undone
      in the H1Cloud panel.

**After every check passes**, enable BOTH of these production Netlify variables:

```dotenv
VAINAH_LIVE_CHECKOUT=enabled-after-review
VAINAH_PAYMENT_INTEGRATION_VERIFIED=verified-on-production
```

Redeploy production to make environment changes effective. Until then,
`checkoutReady()` returns `false`, the button remains disabled, and
the live webhook returns 503. To stop new charges immediately, set
`VAINAH_LIVE_CHECKOUT=disabled` and redeploy. Keep monitoring and
fulfilling any legitimate **existing** paid orders when disabling checkout;
switching off this feature also pauses automated reconciliation.

## Mobile storefront restrictions

RollyPay purchases here are on the separate website. Do not silently embed
or deep-link this checkout in an App Store / Play-distributed app without
reviewing country-specific platform policies and approved entitlements.
Apple and Google generally regulate purchases for in-app VPN subscriptions.
The mobile app may securely read the customer's existing subscription
without directly processing card or API credentials.
