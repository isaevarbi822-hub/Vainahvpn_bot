-- Run in your own PostgreSQL database BEFORE enabling live checkout.
-- One verified Telegram ID = one Vainah customer across website and bot.
CREATE TABLE IF NOT EXISTS vpn_customers (
  telegram_id text PRIMARY KEY CHECK (telegram_id ~ '^[1-9][0-9]{0,17}$'),
  username text NOT NULL DEFAULT '',
  client_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vpn_entitlements (
  telegram_id text PRIMARY KEY REFERENCES vpn_customers(telegram_id),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vpn_orders (
  id uuid PRIMARY KEY,
  telegram_id text NOT NULL REFERENCES vpn_customers(telegram_id),
  source text NOT NULL DEFAULT 'website' CHECK (source IN ('website','telegram')),
  provider text NOT NULL DEFAULT 'rollypay' CHECK (provider IN ('rollypay','telegram_stars')),
  payment_id text UNIQUE,
  plan_days integer NOT NULL CHECK (plan_days IN (30,90,365)),
  amount_kopeks integer NOT NULL CHECK (amount_kopeks >= 0),
  currency text NOT NULL DEFAULT 'RUB',
  is_test boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','awaiting_payment','paid','canceled','expired','refunded','chargeback','error')),
  payment_url text,
  paid_at timestamptz,
  target_expires_at timestamptz,
  delivery_state text NOT NULL DEFAULT 'pending'
    CHECK (delivery_state IN ('pending','processing','delivered','retry','needs_review')),
  delivery_lease_until timestamptz,
  notification_sent_at timestamptz,
  last_delivery_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vpn_orders_by_customer ON vpn_orders (telegram_id,created_at DESC);
CREATE INDEX IF NOT EXISTS vpn_orders_pending_delivery ON vpn_orders (status,delivery_state) WHERE status='paid';
CREATE INDEX IF NOT EXISTS vpn_orders_provider_payment ON vpn_orders(provider,payment_id);
-- NB: Telegram Stars must only be credited from a verified, trusted Telegram
-- payment update, NOT from an unauthenticated website request.
