-- Add Clerk as a verified provider for owner-scoped purchases.
-- Additive only: existing Telegram/email identities and all orders are preserved.
BEGIN;
ALTER TABLE vpn_account_identities DROP CONSTRAINT IF EXISTS vpn_account_identities_provider_check;
ALTER TABLE vpn_account_identities ADD CONSTRAINT vpn_account_identities_provider_check
 CHECK (provider IN ('email','telegram','clerk'));
ALTER TABLE vpn_account_identities DROP CONSTRAINT IF EXISTS vpn_identity_subject_format;
ALTER TABLE vpn_account_identities ADD CONSTRAINT vpn_identity_subject_format CHECK (
 (provider='telegram' AND subject ~ '^[1-9][0-9]{0,17}$') OR
 (provider='email' AND subject ~ '^[a-f0-9]{64}$') OR
 (provider='clerk' AND subject ~ '^user_[A-Za-z0-9]{8,128}$')
);
COMMIT;
