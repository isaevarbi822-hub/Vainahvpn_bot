# Vainah VPN — RollyPay real-provider sandbox (Clerk)

This is a strictly isolated **TEST** flow. It creates a real RollyPay *sandbox record* with `test:true` for a **demonstration price of 10.00 RUB**. No bank transaction, merchant balance entry, RollyPay production ledger entry, VPN provisioning, entitlement extension, or email dispatch occurs.

## 1. Secrets stay on the Netlify server

In **Netlify → Project configuration → Environment variables**, the already-owned backend must have:

- `PUBLIC_SITE_ORIGIN=https://vainahvpnbot0.netlify.app` (or the single actual canonical origin)
- `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` **from the same Clerk instance** (never add `sk_...` to Android/GitHub Variables)
- `SESSION_SIGNING_KEY` (minimum 32 characters)
- `ROLLYPAY_API_KEY` and `ROLLYPAY_SIGNING_SECRET` from the approved RollyPay terminal
- `VAINAH_ROLLYPAY_SANDBOX=enabled-for-test` (new explicit sandbox-only flag)
- `VAINAH_SANDBOX_TESTER_CLERK_USER_ID=user_...` (one authorized test account; find its user ID in Clerk Dashboard → Users)

Clerk JWT validation may also require `CLERK_AUTHORIZED_PARTIES` to match permitted first-party origins of the **same** configured Clerk instance.

**These two new sandbox flags are separate from all live payment switches.** Leave `VAINAH_LIVE_CHECKOUT`, `VAINAH_PAYMENT_INTEGRATION_VERIFIED` and `VAINAH_NATIVE_CHECKOUT` **disabled**. The sandbox API never calls native-commerce or H1Cloud even when a sandbox status is `paid`.

Ensure the terminal belongs to an eligible account operator and has a valid RollyPay API key. The public Clerk key is not a substitute for server credentials.

## 2. Deploy and test

Deploy PR #25 to the intended Netlify site after CI review. Deploying a branch preview URL alone does not update the canonical origin hardcoded in Android.

In the separate Android **0.5.7 Preview** from PR #26:

1. Sign in with the approved Clerk test account.
2. Open **Кабинет → Тест RollyPay · 10 ₽ → Запустить тестовый платёж**.
3. You must see RollyPay's **Тестовый режим** banner. If there is any real bank QR/payment prompt, *do not pay*, close it and report it.
4. Click **Симулировать успешную оплату** (or failure). No real funds are used.
5. Return to the app and click **Проверить тестовый платёж**. The server fetches the exact order via RollyPay GET; **browser redirect alone is not confirmation**.
6. Repeat with a failed simulation; verify no VPN extension and no email key issuance.

## 3. Security controls and limits

- Every client request uses Clerk JWT and an allowlisted Clerk user ID, not Telegram ID or unauthenticated query parameters.
- POST creates with **literal `test:true` only**. A missing/non-sandbox provider response is rejected before any `pay_url` is exposed.
- PayForm address must use precisely the HTTPS `pay.rollypay.io/pay/...` origin/path.
- A one-hour HMAC-signed owner-bound receipt authorizes status polling. It cannot be transferred to another account.
- Sandbox webhooks must be signed, contain `X-Test-Mode:true`, and match an independent RollyPay API read. The webhook handler never changes PostgreSQL orders or calls H1Cloud/Resend.
- Test mode is only a payment integration check, **not** proof that actual charges, bank APIs, refunds or real VPN purchase delivery work.
- To close testing, set `VAINAH_ROLLYPAY_SANDBOX` to an empty/disabled value and redeploy.

Official RollyPay documentation: https://docs.rollypay.io/api/testing/
