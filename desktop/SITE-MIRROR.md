# Exact site snapshot inside desktop distribution

Run from `desktop/`: `npm run sync:site`.

The sync script copies **every regular file** from the canonical repository `site/` tree into `desktop/site-mirror/` without rewriting markup, CSS, JS or assets. A SHA-256 manifest verifies parity. The copied files are included in Windows/macOS packaging; canonical `site/` and production Netlify are **never modified**.

**Caution:** this is an *asset snapshot*, not yet the default window of the desktop app. The current UI continues to launch the safe preview; the snapshot is packaged as a source-of-truth asset basis for the next integration stage. Netlify Functions, Telegram Login, Clerk, RollyPay and authenticated account pages are server-dependent and cannot function as a standalone `file://` copy. Production-sensitive or server-backed pages must instead be accessed via the real HTTPS domain and an audited, isolated browser/auth flow.

Do not ship a local website shell with remote login/payment forms without verifying origins, CSRF/session boundaries, deep-link protections and platform policy. VPN remains nonfunctional until the native network engine is integrated and independently tested.
