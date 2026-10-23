-- Browser-based Telegram / Yandex authentication pairs to one waiting native app.
-- The poll secret is never placed in a browser link.
BEGIN;
ALTER TABLE vpn_native_customers DROP CONSTRAINT IF EXISTS vpn_native_customers_auth_provider_check;
ALTER TABLE vpn_native_customers ADD CONSTRAINT vpn_native_customers_auth_provider_check
  CHECK(auth_provider IN ('email','phone','telegram','yandex'));
CREATE TABLE IF NOT EXISTS vpn_native_login_links (
  id uuid PRIMARY KEY,
  auth_provider text NOT NULL CHECK(auth_provider IN ('telegram','yandex')),
  poll_secret_hash char(64) NOT NULL,
  identity_subject char(64),
  telegram_id text,
  approved_at timestamptz,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vpn_native_login_links_expiry ON vpn_native_login_links(expires_at);
COMMIT;
