-- BYOA campaigns, version 6.
-- Recipients are supplied by the developer and expire; Postique is not the
-- permanent user database.

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,
  template_version_id TEXT REFERENCES template_versions(id) ON DELETE SET NULL,
  from_email TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  subject_override TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL DEFAULT 0,
  batch_size INTEGER NOT NULL DEFAULT 50,
  options_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  retention_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace ON campaigns(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  external_user_id TEXT,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  variables_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  message_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (campaign_id, email)
);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_pending ON campaign_recipients(campaign_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_expiry ON campaign_recipients(expires_at);

ALTER TABLE messages ADD COLUMN campaign_id TEXT;
ALTER TABLE messages ADD COLUMN campaign_recipient_id TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_campaign ON messages(campaign_id);
