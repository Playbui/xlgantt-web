-- ============================================================
-- 014. Workspace Document Private Access Mode
-- ============================================================

ALTER TABLE workspace_items
  DROP CONSTRAINT IF EXISTS workspace_items_access_mode_check;

ALTER TABLE workspace_items
  ADD CONSTRAINT workspace_items_access_mode_check
  CHECK (access_mode IN ('project', 'restricted', 'password', 'private'));
