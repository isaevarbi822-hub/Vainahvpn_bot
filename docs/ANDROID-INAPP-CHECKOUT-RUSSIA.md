# Vainah VPN mobile checkout — Russia-targeted rollout

## Why not Google Play Billing / StoreKit for Russian users?

Google's Russian-billing pause started March 10, 2022 and Google says its usual
Play-billing obligation does not currently apply to Russia-specific paid users.
This exception is **territorial**, not a permission to launch an alternative
purchase method worldwide through Google Play. Apple account billing in Russia
changed on April 1, 2026; users with an existing Apple Account balance may
still have limited access. Apple's App Store payment and VPN app review rules
remain separate from Google's exception.

Sources reviewed (October 23, 2026):
- https://support.google.com/googleplay/android-developer/answer/11950272
- https://support.apple.com/en-gb/126891
- https://developer.apple.com/app-store/review/guidelines/
- https://docs.rollypay.io/api/payments/
- https://rollypay.io/blog/priem-platezhey-v-mobilnom-prilozhenii/

## Android standalone APK (off-Play): what changed

- The six tariffs and purchase controls stay in the native Android screen.
- In a **separately configured standalone build** (`-PvainahStandaloneCheckout=true`)
  the checkout button is shown only if the server validates readiness and the
  price list matches the app's canonical plans.
- In the experimental Clerk-enabled build, a signed-in customer selects a
  canonical plan. The app requests a **fresh Clerk session JWT** and the
  Netlify backend checks the Clerk user ID and verified primary email before
  issuing a RollyPay invoice.
- Android opens RollyPay's hosted payment URL in an isolated Custom Tab.
  This is visually within the app task but still a secure browser payment
  page. The customer may briefly switch to a bank app for SBP approval.
  The app cannot intercept bank credentials or store merchant secrets.
- RollyPay must independently confirm the correct order, paid status and
  RUB amount before H1Cloud issues the subscription. Only the verified
  Clerk user's order-status API can return that user's VPN link.
- Server-side email delivery is addressed only to the Clerk-verified
  primary email, never free-text email typed into the purchase form.
- Legacy Telegram Login and Yandex OAuth are **not** interchangeable with
  Clerk authentication. Link identities only after verified ownership.
- No live charges are enabled in this draft. The merchant, database schema,
  OTP deliverability and H1Cloud provisioning need end-to-end testing.

## iOS App Store

Apple review rules require StoreKit for many digital in-app purchases unless
an applicable regional entitlement or exception permits other payment methods.
A Russian target audience does not automatically provide permission for a
hosted alternative payment form. The iOS purchase action stays **disabled**
until the intended distribution channel is legally confirmed. Do not bundle
RollyPay secrets, or add a silent payment redirect, in App Store builds.

## Deployment conditions

Production checkout is **off by default**. The website payment backend must
be deployed and reviewed separately. An enabled native build does **not**
override `checkoutReady()` on the server. First test only with synthetic
orders in RollyPay sandbox; confirm VPN fulfillment safely with a test panel
profile before charging any user.

A responsible merchant account owner must verify account eligibility,
age-related account requirements, local tax/legal compliance, store-specific
distribution rules, and RollyPay merchant terms before real payments.
