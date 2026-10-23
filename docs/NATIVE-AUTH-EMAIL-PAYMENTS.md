# Vainah VPN — Clerk authentication for native payments

**Provider correction (23 October 2026): Clerk is the existing Vainah VPN
authentication service. Twilio Verify is NOT part of native payments.**
This branch remains a DRAFT and is NOT enabled for production charges.

## Existing Clerk work

The owner's prior website integration is in branch
`feature/clerk-js-netlify-auth`, including ClerkJS, a public configuration
endpoint and a server-side Clerk session bridge. Integrate that separately
after reviewing the diff. The existing Telegram Login Widget and Yandex OAuth
are independent from Clerk and must not be silently treated as the same user.

Clerk backend verification for **mobile purchases** now:
- Verifies a bearer **Clerk session JWT** using `@clerk/backend` and
  `authenticateRequest()`, including authorized parties.
- Retrieves the same user from the Clerk Backend API and uses a stable,
  derived identity keyed by the verified Clerk User ID.
- Accepts delivery email **only from Clerk's verified primary email address**.
  If the user signed in by phone or a social method without a verified email,
  checkout is blocked until the address is added and verified in Clerk.
- Keeps provider-specific secrets on the server only, never in the application.
- Verifies RollyPay order ID, payment ID, RUB amount and live mode independently
  before issuing a VPN subscription in H1Cloud or dispatching email through
  the server-side mail provider.

The old `mobile-auth` Twilio send/check API is explicitly disabled, so no
fake codes are sent and no two incompatible identity systems can issue VPNs.

## Mobile SDK still to finish before public rollout

Use **Clerk Android SDK** (`clerk-android-ui`, AuthView, Jetpack Compose)
for an in-app email/SMS OTP and social-sign-in UI. Use the **Clerk iOS SDK**
(`ClerkKit`, `ClerkKitUI`, AuthView) on supported iOS versions.
These SDKs manage their own sessions. Obtain a fresh signed session JWT
using their documented token API for every authenticated order request;
do not reuse or mint the removed 7-day app session or store a Clerk secret key.
The current Android/iOS draft screens still contain outdated OTP presentation
logic; they must be migrated to these SDKs before accepting real payments.

For Telegram and Yandex: the existing independent browser sign-ins **do not
automatically create Clerk users** or Clerk mobile sessions. A server-reviewed
Clerk-compatible social connection or secure account-linking/migration flow
is required; simply opening a Telegram/Yandex URL is not authentication.

**Compatibility note:** current Clerk iOS SDK requires iOS 17+ and Swift 6.2+
according to its official repository. The VPN project currently targets
iOS 16 and Swift 5.9. Review supported-device impact and update the
Xcode project/toolchain together rather than silently dropping older devices.

## Required configuration (never place secret keys in GitHub)

In Netlify only:
`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`,
`PUBLIC_SITE_ORIGIN`, `CLERK_AUTHORIZED_PARTIES`, `SESSION_SIGNING_KEY`.

The publishable key can also be included in a native app's build
configuration; secret keys cannot. Enable Clerk Native API for registered
Android/iOS apps in the dashboard. Verify the phone and email-code sign-in
methods and outbound deliverability on the Clerk account.

Apply reviewed database migrations with a backup:
`002-native-identities.sql`, `003-native-external-login.sql`,
`004-clerk-native-customers.sql`.
These are draft migrations and require a full transaction/security review.

For **actual payments**, the code still additionally requires reviewed live
RollyPay/H1Cloud/Resend configuration plus operator approval flags. All must
stay off during initial testing. An eligible merchant account holder must
comply with the provider's identity, age and contractual requirements.

## Work needed before merging this PR

1. Replace Android and iOS OTP components with official Clerk native SDKs,
   including signup, session refresh and account recovery.
2. Verify Clerk JWT authorized-party policy with real signed test tokens on
   both native platforms, and confirm the same Clerk ID owns all order APIs.
3. Test verified email addition in Clerk for a phone-only account. Test that
   a different address or an unverified email cannot receive a key.
4. Validate full payment webhook, refund/error retries, H1Cloud idempotency
   and mail delivery using sandbox/test environments.
5. Resolve existing legacy Telegram/Yandex subscriptions only through an
   explicit verified ownership migration (not matching by username/email).

References:
- https://clerk.com/docs/android/getting-started/quickstart
- https://clerk.com/docs/ios/getting-started/quickstart
- https://clerk.com/docs/reference/backend/authenticate-request
