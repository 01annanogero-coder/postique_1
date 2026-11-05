-- Verification-gated browser sends and verification proof consumption, version 8.
ALTER TABLE api_keys ADD COLUMN recipient_policy TEXT NOT NULL DEFAULT 'fixed';

ALTER TABLE verification_requests ADD COLUMN api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL;
ALTER TABLE verification_requests ADD COLUMN consumed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_verification_api_key ON verification_requests(api_key_id, created_at DESC);

ALTER TABLE messages ADD COLUMN verification_id TEXT REFERENCES verification_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_verification ON messages(verification_id);
