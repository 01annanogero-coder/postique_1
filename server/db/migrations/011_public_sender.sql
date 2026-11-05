-- Public-key sender identity pinning, version 11.
ALTER TABLE api_keys ADD COLUMN sender_identity_email TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(hash);
