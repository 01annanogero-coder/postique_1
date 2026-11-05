-- Explicit opt-in for application auth on public keys, version 12.
ALTER TABLE api_keys ADD COLUMN allow_auth INTEGER NOT NULL DEFAULT 1;
