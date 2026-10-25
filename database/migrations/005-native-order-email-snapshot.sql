-- Preserve the exact Clerk-verified email at the moment an order is created.
-- Later profile changes or second purchases must not silently reroute a paid key.
-- Requires 002-native-identities.sql and 004-clerk-native-customers.sql.
BEGIN;
ALTER TABLE vpn_native_orders ADD COLUMN IF NOT EXISTS delivery_email text;
UPDATE vpn_native_orders AS o SET delivery_email=c.delivery_email
  FROM vpn_native_customers AS c
 WHERE o.customer_id=c.id AND o.delivery_email IS NULL;
COMMIT;
