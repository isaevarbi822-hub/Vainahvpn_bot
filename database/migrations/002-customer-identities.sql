-- Vainah VPN: additive identity foundation for future email + Telegram checkout.
-- Review backup/migration process before applying in production.
-- Existing Telegram orders and entitlements remain untouched. No live billing enabled.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS vpn_account_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vpn_account_identities (
  provider text NOT NULL CHECK (provider IN ('email','telegram')),
  subject text NOT NULL,
  owner_id uuid NOT NULL REFERENCES vpn_account_owners(id) ON DELETE RESTRICT,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider,subject),
  CONSTRAINT vpn_identity_subject_format CHECK (
    (provider='telegram' AND subject ~ '^[1-9][0-9]{0,17}$') OR
    (provider='email' AND subject ~ '^[a-f0-9]{64}$')
  )
);
CREATE INDEX IF NOT EXISTS vpn_account_identities_owner_idx
  ON vpn_account_identities(owner_id);
-- No FK or owner_id is added to vpn_orders yet; dual identity order migration
-- requires reconciliation of legacy Telegram purchases and an audited backfill.
COMMIT;
