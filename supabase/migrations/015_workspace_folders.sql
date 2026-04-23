-- ============================================================
-- 015. Workspace Folders
-- ============================================================

ALTER TABLE workspace_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'document';

ALTER TABLE workspace_items
  DROP CONSTRAINT IF EXISTS workspace_items_item_type_check;

ALTER TABLE workspace_items
  ADD CONSTRAINT workspace_items_item_type_check
  CHECK (item_type IN ('folder', 'document'));

CREATE INDEX IF NOT EXISTS idx_workspace_items_parent_type ON workspace_items(project_id, parent_id, item_type);
