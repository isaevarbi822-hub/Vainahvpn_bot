-- Separate authenticated mobile identities from Telegram IDs; never synthesize Telegram IDs.
-- Deploy to PostgreSQL only after backup and review. Safe to re-run.
CREATE TABLE IF NOT EXISTS vpn_native_customers (
 id uuid PRIMARY KEY,
 auth_provider text NOT NULL CHECK(auth_provider IN ('email','phone')),
 identity_subject text NOT NULL CHECK(identity_subject ~ '^[a-f0-9]{64}$'),
 delivery_email text,
 client_name text NOT NULL UNIQUE CHECK(client_name ~ '^va_[a-f0-9]{32}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(auth_provider, identity_subject)
);
CREATE TABLE IF NOT EXISTS vpn_native_entitlements (
 customer_id uuid PRIMARY KEY REFERENCES vpn_native_customers(id),
 expires_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vpn_native_orders (
 id uuid PRIMARY KEY,
 customer_id uuid NOT NULL REFERENCES vpn_native_customers(id),
 provider text NOT NULL DEFAULT 'rollypay' CHECK(provider='rollypay'),
 amount_kopeks integer NOT NULL CHECK(amount_kopeks > 0),
 currency text NOT NULL DEFAULT 'RUB' CHECK(currency='RUB'),
 plan_days integer NOT NULL CHECK(plan_days IN (30,60,90,180,365)),
 device_limit integer NOT NULL CHECK(device_limit IN (3,6)),
 payment_id text UNIQUE,
 payment_url text,
 status text NOT NULL DEFAULT 'created' CHECK(status IN
    ('created','awaiting_payment','paid','canceled','expired','refunded','chargeback','error')),
 delivery_state text NOT NULL DEFAULT 'pending' CHECK(delivery_state IN
    ('pending','processing','delivered','retry','needs_review')),
 delivery_lease_until timestamptz,
 target_expires_at timestamptz,
 last_delivery_error text,
 paid_at timestamptz,
 email_state text NOT NULL DEFAULT 'pending' CHECK(email_state IN ('pending','sending','retry','sent')),
 email_lease_until timestamptz,
 email_sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vpn_native_orders_customer ON vpn_native_orders(customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS vpn_native_orders_retry ON vpn_native_orders(status,delivery_state)
 WHERE status='paid';
