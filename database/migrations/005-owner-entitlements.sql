-- Owner-scoped subscription ledger for Clerk customers (email / Telegram).
-- Apply after migrations 002-004 following database backup and review.
-- Does not migrate, revoke, or modify existing Telegram subscriptions.
BEGIN;
CREATE TABLE IF NOT EXISTS vpn_owner_entitlements (
  owner_id uuid PRIMARY KEY REFERENCES vpn_account_owners(id) ON DELETE RESTRICT,
  expires_at timestamptz,
  device_limit integer NOT NULL DEFAULT 3 CHECK (device_limit IN (3,6)),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vpn_owner_h1_clients (
  owner_id uuid PRIMARY KEY REFERENCES vpn_account_owners(id) ON DELETE RESTRICT,
  client_name text NOT NULL UNIQUE
    CHECK (client_name ~ '^owner_[0-9a-f]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- The H1 client identity must be created server-side from owner UUID and
-- verified by the H1 panel; no email, phone, or Telegram ID is embedded.
-- Do NOT automatically migrate old H1 clients or deliver new VPN profiles
-- until a reviewed dual-ledger fulfillment service is installed.
COMMIT;
