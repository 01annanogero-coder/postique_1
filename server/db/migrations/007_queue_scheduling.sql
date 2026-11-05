-- Campaign scheduling, workspace-scoped jobs and queue operations, version 7.
ALTER TABLE campaigns ADD COLUMN scheduled_at TEXT;
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON campaigns(status, scheduled_at);

ALTER TABLE jobs ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_jobs_workspace ON jobs(workspace_id, status, run_at);
