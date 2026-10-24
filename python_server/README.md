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

## Check before canceling Netlify

1. Open the new site's home page and navigate its assets, pages and navigation.
2. Check `/api/health` and `/.netlify/functions/subscription-plans`.
3. After setting a real HTTPS domain, verify Telegram login, cookies, account reads, and H1Cloud status. Update Telegram BotFather's allowed domain and your Clerk allowed origins as appropriate.
4. Re-run **RollyPay sandbox only**, including callback delivery, with no charges. The existing provider sandbox error may still occur; moving hosting is not a fix for that upstream issue.
5. Check all native app API base URLs, callback URLs, DNS and public auth redirects. Cut over only after the new environment passes checks. Then disable Netlify.

The original `main` branch and live Netlify deployment are unchanged by this migration branch.
