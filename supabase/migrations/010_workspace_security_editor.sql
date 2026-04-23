-- ============================================================
-- 010. Workspace Document Security + Editor Preferences
-- ============================================================

ALTER TABLE workspace_items
  ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'project'
    CHECK (access_mode IN ('project', 'restricted', 'password')),
  ADD COLUMN IF NOT EXISTS shared_user_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS editor_font_size INTEGER NOT NULL DEFAULT 15;

CREATE INDEX IF NOT EXISTS idx_workspace_items_access_mode ON workspace_items(project_id, access_mode);
