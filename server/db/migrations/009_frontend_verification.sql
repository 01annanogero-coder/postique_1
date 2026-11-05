-- Frontend-only verification: public-key requests, email codes, browser-bound
-- proof polling and a fixed verification template, version 9.
ALTER TABLE api_keys ADD COLUMN verification_template TEXT NOT NULL DEFAULT '';

ALTER TABLE verification_requests ADD COLUMN browser_token_hash TEXT;
ALTER TABLE verification_requests ADD COLUMN code_hash TEXT;
ALTER TABLE verification_requests ADD COLUMN code_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE verification_requests ADD COLUMN origin TEXT;
CREATE INDEX IF NOT EXISTS idx_verification_code ON verification_requests(code_hash);
