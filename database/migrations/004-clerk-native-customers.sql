-- Only verified Clerk sessions may create new native orders.
-- Preserve previous draft users until a separately reviewed ownership migration.
BEGIN;
ALTER TABLE vpn_native_customers DROP CONSTRAINT IF EXISTS vpn_native_customers_auth_provider_check;
ALTER TABLE vpn_native_customers ADD CONSTRAINT vpn_native_customers_auth_provider_check
 CHECK (auth_provider IN ('clerk','email','phone','telegram','yandex'));
COMMIT;
