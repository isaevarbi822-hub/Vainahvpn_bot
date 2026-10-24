# Vainah VPN — removing Netlify (phase 1)

This is a **safe transition**, not a 100% Python rewrite yet.

- FastAPI serves every existing page and asset from `site/`.
- Requests to `/.netlify/functions/*` are now processed by our own **localhost Node.js compatibility worker**, not Netlify. The old URL stays temporarily so the site and native clients do not all need to change at once.
- Telegram/Clerk auth, H1Cloud, existing account APIs, database, and RollyPay **sandbox** remain implemented by the original code.
- Production checkout remains **disabled**, unless the existing independent payment-readiness gates are deliberately set. Do not enable real payments during hosting migration.
- Port existing backend handlers to FastAPI one-by-one after feature parity and security tests. Remove Node only when finished.

## Local development on Windows

Install Python 3.12+ and Node 22. From the root of the repository:

```powershell
npm install
py -m pip install -r python_server/requirements.txt
$env:PUBLIC_SITE_ORIGIN='http://127.0.0.1:8000'
$env:VAINAH_LIVE_CHECKOUT='disabled'
py -m uvicorn python_server.main:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000` and `http://127.0.0.1:8000/api/health`. Local HTTP cannot set production Secure session cookies; test the public Telegram login only on a proper HTTPS domain.

## Hosting (VPS or container hosting; no Netlify)

Deploy using `Dockerfile.python`. Set the same **server-side** secrets you used before, in your new hosting provider's protected environment settings. See `.env.example` for their names; never commit values or paste API tokens into chat.

Required for the corresponding functionality: `PUBLIC_SITE_ORIGIN=https://your-new-domain.example` (exact HTTPS origin without trailing slash), `DATABASE_URL`, `SESSION_SIGNING_KEY`, `TELEGRAM_BOT_TOKEN`, `PANEL_BASE_URL`, `PANEL_API_TOKEN`, plus the existing RollyPay/Clerk variables.

During migration set:
```env
VAINAH_LIVE_CHECKOUT=disabled
VAINAH_PAYMENT_INTEGRATION_VERIFIED=not-verified
```

Expose Python port 8000 through hosting HTTPS / a trusted reverse proxy. The Node adapter only binds to 127.0.0.1:18787. Keep a continuously running service with restart-on-failure.

## Free preview hosting on Render (0 ₽; no production traffic)

The repository branch `migration/python-host` contains `render.yaml`, which provisions **one free Docker web service** in Frankfurt. No database is created automatically, and real checkout stays disabled.

1. Use a Render account **only if its eligibility and age requirements permit** (otherwise have an eligible parent/guardian manage the hosting).
2. In [Render Dashboard](https://dashboard.render.com/), choose **New → Blueprint**, connect the GitHub repository `isaevarbi822-hub/Vainahvpn_bot`, and choose the branch `migration/python-host`.
3. Select `render.yaml` and create the Blueprint. Confirm the new web service uses **Free** (not Starter). Do not activate billable resources.
4. Render builds `Dockerfile.python` and issues an `https://...onrender.com` URL. The Python host automatically uses Render's `RENDER_EXTERNAL_URL` as `PUBLIC_SITE_ORIGIN` unless a custom origin is set.
5. Test `/`, `/api/health`, and `/.netlify/functions/subscription-plans`. The last path is **locally routed on Python + Node**, not hosted by Netlify.
6. For authenticated features, configure necessary tokens in Render's protected Environment settings, adjust allowed login domains, and verify against test accounts only. Do not migrate or enable live payment webhooks until validated with RollyPay and H1Cloud.
7. Keep Netlify up until successful functional tests and the final migration. Preview hosting goes idle after 15 minutes, so it is unsuitable for guaranteed always-on payment callbacks or live customers.

Never paste secret values into public GitHub or chats. The free Render database expires after 30 days; **do not migrate production subscription records into a temporary free database**. Reuse a durable existing DB only after checking access security and making a backup.

## Updated Telegram Login (OIDC, no deprecated iframe)

The deprecated `telegram.org/js/telegram-widget.js` is not used on the Python preview.
Login now follows Authorization Code + PKCE with a short-lived, signed HttpOnly
state cookie. The Python server verifies the Telegram signed ID token against
Telegram's JWKS, checks issuer, audience, expiry and nonce, then creates the
same signed session cookie that the existing H1Cloud/account API expects.

In the Render service's **Environment** section, set these values:
- `TELEGRAM_OIDC_CLIENT_ID`: Telegram Login Client ID shown in @BotFather
  (it is a numeric bot/client ID, **not** the API token).
- `TELEGRAM_OIDC_CLIENT_SECRET`: client secret from the same BotFather Login Widget setup.
- `SESSION_SIGNING_KEY`: existing 32+ character server-side signing key.
- `PUBLIC_SITE_ORIGIN=https://vainahvpn-python-preview.onrender.com`.

In @BotFather, keep the old website URL and additionally allow
`https://vainahvpn-python-preview.onrender.com` and the **full callback URL**
`https://vainahvpn-python-preview.onrender.com/auth/telegram/callback`.
Use the same bot as the one that handles account login on the old site.
Never add client secrets or bot tokens to the frontend or a commit.

The read-only readiness route is `/api/auth/telegram-status`:
`{"oidcConfigured":true}` means the required server settings are present,
**not** that the user has logged in. The login is tested from
`/account.html`; after Telegram consent the server redirects back to that
page with an authenticated cookie.

Keep live checkout disabled until all authentication, DB, and RollyPay
end-to-end checks pass on the new site.

## Check before canceling Netlify

1. Open the new site's home page and navigate its assets, pages and navigation.
2. Check `/api/health` and `/.netlify/functions/subscription-plans`.
3. After setting a real HTTPS domain, verify Telegram login, cookies, account reads, and H1Cloud status. Update Telegram BotFather's allowed domain and your Clerk allowed origins as appropriate.
4. Re-run **RollyPay sandbox only**, including callback delivery, with no charges. The existing provider sandbox error may still occur; moving hosting is not a fix for that upstream issue.
5. Check all native app API base URLs, callback URLs, DNS and public auth redirects. Cut over only after the new environment passes checks. Then disable Netlify.

The original `main` branch and live Netlify deployment are unchanged by this migration branch.
