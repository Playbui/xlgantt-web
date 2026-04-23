-- ============================================================
-- 008. Workspace Items (업무노트) + WBS Links
-- ============================================================

CREATE TABLE workspace_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',
  summary      TEXT,
  body         TEXT,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'done', 'archived')),
  links        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workspace_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_items_select_member" ON workspace_items
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "workspace_items_insert_editor" ON workspace_items
  FOR INSERT WITH CHECK (is_project_editor(project_id));

CREATE POLICY "workspace_items_update_editor" ON workspace_items
  FOR UPDATE USING (is_project_editor(project_id));

CREATE POLICY "workspace_items_delete_editor" ON workspace_items
  FOR DELETE USING (is_project_editor(project_id));

CREATE TABLE workspace_item_task_links (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_item_id  UUID NOT NULL REFERENCES workspace_items(id) ON DELETE CASCADE,
  task_id            UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_item_task UNIQUE (workspace_item_id, task_id)
);

ALTER TABLE workspace_item_task_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_item_links_select_member" ON workspace_item_task_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM workspace_items wi
      WHERE wi.id = workspace_item_task_links.workspace_item_id
        AND is_project_member(wi.project_id)
    )
  );

CREATE POLICY "workspace_item_links_insert_editor" ON workspace_item_task_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_items wi
      WHERE wi.id = workspace_item_task_links.workspace_item_id
        AND is_project_editor(wi.project_id)
    )
  );

CREATE POLICY "workspace_item_links_delete_editor" ON workspace_item_task_links
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM workspace_items wi
      WHERE wi.id = workspace_item_task_links.workspace_item_id
        AND is_project_editor(wi.project_id)
    )
  );

CREATE INDEX idx_workspace_items_project_id ON workspace_items(project_id);
CREATE INDEX idx_workspace_items_status ON workspace_items(project_id, status);
CREATE INDEX idx_workspace_item_task_links_item_id ON workspace_item_task_links(workspace_item_id);
CREATE INDEX idx_workspace_item_task_links_task_id ON workspace_item_task_links(task_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON workspace_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

