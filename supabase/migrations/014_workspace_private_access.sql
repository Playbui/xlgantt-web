-- ============================================================
-- 014. Workspace Document Private Access Mode
-- ============================================================

ALTER TABLE workspace_items
  ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS shared_user_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS editor_font_size INTEGER NOT NULL DEFAULT 15;

ALTER TABLE workspace_items
  DROP CONSTRAINT IF EXISTS workspace_items_access_mode_check;

ALTER TABLE workspace_items
  ADD CONSTRAINT workspace_items_access_mode_check
  CHECK (access_mode IN ('project', 'restricted', 'password', 'private'));

CREATE INDEX IF NOT EXISTS idx_workspace_items_access_mode ON workspace_items(project_id, access_mode);
