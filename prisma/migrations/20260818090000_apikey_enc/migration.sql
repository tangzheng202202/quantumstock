-- Add encrypted ciphertext column for BYOK keys (AES-256-GCM).
-- Existing rows keep keyHash/maskedKey; keyEnc is backfilled by users re-saving keys.

ALTER TABLE "ApiKey" ADD COLUMN "keyEnc" TEXT;
