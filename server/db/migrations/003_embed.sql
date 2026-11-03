-- Scoped embedded-inbox ownership, version 3.
-- `embed_user_id` is the application's own user id, not a Postique dashboard user.

ALTER TABLE threads ADD COLUMN embed_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_threads_embed_user ON threads(workspace_id, embed_user_id, last_activity_at DESC);
