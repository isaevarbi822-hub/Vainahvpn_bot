-- Review and back up database before applying to an existing installation.
-- No payments or subscription durations are modified by this migration.
BEGIN;
ALTER TABLE vpn_orders ADD COLUMN IF NOT EXISTS device_limit integer NOT NULL DEFAULT 3;
ALTER TABLE vpn_orders DROP CONSTRAINT IF EXISTS vpn_orders_plan_days_check;
ALTER TABLE vpn_orders ADD CONSTRAINT vpn_orders_plan_days_check CHECK (plan_days IN (30,60,90,180,365));
ALTER TABLE vpn_orders DROP CONSTRAINT IF EXISTS vpn_orders_device_limit_check;
ALTER TABLE vpn_orders ADD CONSTRAINT vpn_orders_device_limit_check CHECK (device_limit IN (3,6));
COMMIT;
