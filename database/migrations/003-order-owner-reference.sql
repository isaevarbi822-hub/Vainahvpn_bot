-- Additive preparation for account-owned purchases. Run only after migration 002.
-- Existing rows retain their original Telegram ownership. No automatic merging.
BEGIN;
ALTER TABLE vpn_orders
  ADD COLUMN IF NOT EXISTS owner_id uuid NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vpn_orders_owner_id_fkey'
      AND conrelid = 'vpn_orders'::regclass
  ) THEN
    ALTER TABLE vpn_orders
      ADD CONSTRAINT vpn_orders_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES vpn_account_owners(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS vpn_orders_owner_history_idx
  ON vpn_orders (owner_id,created_at DESC)
  WHERE owner_id IS NOT NULL;
-- A separately audited backfill is necessary before using this column for
-- customer access or payment fulfillment. Checkout remains disabled.
COMMIT;
