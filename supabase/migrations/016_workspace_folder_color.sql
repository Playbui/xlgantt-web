-- ============================================================
-- 016. Workspace Folder Color
-- ============================================================

ALTER TABLE workspace_items
  ADD COLUMN IF NOT EXISTS folder_color TEXT;
