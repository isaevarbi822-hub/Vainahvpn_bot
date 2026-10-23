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
- After the user confirms the amount, an Android Custom Tab opens
  `/checkout.html?plan=...` within the app task. The browser handles Telegram
  session authentication and then displays RollyPay's hosted `pay_url`;
  **the app cannot inspect card credentials or API secrets**.
- The customer may briefly switch to a banking app to approve an SBP transfer.
  The hosted payment page is **not** a native card widget.
- After RollyPay confirms the paid order by signed webhook, backend H1Cloud
  fulfillment runs. Browser return alone never unlocks VPN.
- This is an intermediate integration, **not** a fully native order-creation
  and account/entitlement UI. That requires a verified mobile login session,
  a narrow app-to-server API and post-payment access syncing.

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
