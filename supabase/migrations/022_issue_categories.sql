-- ============================================================
-- 022. Managed Issue Categories
-- ============================================================

CREATE TABLE IF NOT EXISTS issue_categories (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_issue_categories_project_name UNIQUE (project_id, name)
);

ALTER TABLE issue_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issue_categories_select_issue_member" ON issue_categories
  FOR SELECT USING (is_issue_member(project_id));

CREATE POLICY "issue_categories_insert_issue_editor" ON issue_categories
  FOR INSERT WITH CHECK (is_issue_editor(project_id));

CREATE POLICY "issue_categories_update_issue_editor" ON issue_categories
  FOR UPDATE USING (is_issue_editor(project_id))
  WITH CHECK (is_issue_editor(project_id));

CREATE POLICY "issue_categories_delete_issue_editor" ON issue_categories
  FOR DELETE USING (is_issue_editor(project_id));

CREATE INDEX IF NOT EXISTS idx_issue_categories_project_order
  ON issue_categories(project_id, sort_order, name);

INSERT INTO issue_categories (project_id, name, sort_order)
SELECT p.id, seed.name, seed.sort_order
FROM projects p
CROSS JOIN (
  VALUES
    ('이슈', 10),
    ('버그', 20),
    ('확인', 30),
    ('요청', 40),
    ('장애', 50),
    ('개선', 60)
) AS seed(name, sort_order)
ON CONFLICT (project_id, name) DO NOTHING;

INSERT INTO issue_categories (project_id, name, sort_order)
SELECT DISTINCT ii.project_id, COALESCE(ii.issue_type, ii.legacy_status), 100
FROM issue_items ii
WHERE COALESCE(ii.issue_type, ii.legacy_status) IS NOT NULL
  AND btrim(COALESCE(ii.issue_type, ii.legacy_status)) <> ''
ON CONFLICT (project_id, name) DO NOTHING;
