-- Ephemeral email verification, version 5.
-- These rows are temporary proofs of email ownership, not user accounts.

CREATE TABLE IF NOT EXISTS verification_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  template_version_id TEXT REFERENCES template_versions(id) ON DELETE SET NULL,
  redirect_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  purge_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verifications_workspace ON verification_requests(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verifications_email ON verification_requests(workspace_id, email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verifications_purge ON verification_requests(purge_at);
