-- ============================================================
-- 009. Workspace Vault Structure, History, Attachments
-- ============================================================

ALTER TABLE workspace_items
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES workspace_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_workspace_items_parent_id ON workspace_items(project_id, parent_id, sort_order);

CREATE TABLE IF NOT EXISTS workspace_item_revisions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_item_id  UUID NOT NULL REFERENCES workspace_items(id) ON DELETE CASCADE,
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  changed_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  change_type        TEXT NOT NULL DEFAULT 'body' CHECK (change_type IN ('created', 'title', 'summary', 'body', 'status', 'wbs', 'attachment', 'structure')),
  snapshot_title     TEXT,
  snapshot_summary   TEXT,
  snapshot_body      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workspace_item_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_item_revisions_select_member" ON workspace_item_revisions
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "workspace_item_revisions_insert_editor" ON workspace_item_revisions
  FOR INSERT WITH CHECK (is_project_editor(project_id));

CREATE INDEX IF NOT EXISTS idx_workspace_item_revisions_item_id ON workspace_item_revisions(workspace_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_item_revisions_project_id ON workspace_item_revisions(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_item_attachments (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_item_id  UUID NOT NULL REFERENCES workspace_items(id) ON DELETE CASCADE,
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename           TEXT NOT NULL,
  size               BIGINT NOT NULL DEFAULT 0,
  mime_type          TEXT,
  storage_path       TEXT NOT NULL,
  public_url         TEXT,
  uploaded_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workspace_item_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_item_attachments_select_member" ON workspace_item_attachments
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "workspace_item_attachments_insert_editor" ON workspace_item_attachments
  FOR INSERT WITH CHECK (is_project_editor(project_id));

CREATE POLICY "workspace_item_attachments_delete_editor" ON workspace_item_attachments
  FOR DELETE USING (is_project_editor(project_id));

CREATE INDEX IF NOT EXISTS idx_workspace_item_attachments_item_id ON workspace_item_attachments(workspace_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_item_attachments_project_id ON workspace_item_attachments(project_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public)
VALUES ('workspace-attachments', 'workspace-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "workspace_attachments_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'workspace-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "workspace_attachments_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'workspace-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "workspace_attachments_storage_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'workspace-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "workspace_attachments_storage_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'workspace-attachments' AND auth.uid() IS NOT NULL);
