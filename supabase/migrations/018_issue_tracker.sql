-- ============================================================
-- 018. Project Issue Tracker
-- ============================================================

CREATE TABLE issue_items (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  related_task_id    UUID REFERENCES tasks(id) ON DELETE SET NULL,
  import_sequence    INTEGER,
  issue_no           TEXT NOT NULL,
  title              TEXT NOT NULL,
  description        TEXT,
  system_name        TEXT,
  status             TEXT NOT NULL DEFAULT '접수' CHECK (status IN ('접수', '검토', '작업중', '검수요청', '완료', '보류')),
  legacy_status      TEXT,
  priority           TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  requester_name     TEXT,
  assignee_user_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assignee_name      TEXT,
  company_id         UUID REFERENCES companies(id) ON DELETE SET NULL,
  received_at        DATE,
  due_date           DATE,
  started_at         DATE,
  completed_at       DATE,
  estimated_effort   NUMERIC(6,2) NOT NULL DEFAULT 0,
  actual_effort      NUMERIC(6,2) NOT NULL DEFAULT 0,
  total_effort       NUMERIC(6,2) NOT NULL DEFAULT 0,
  settlement_status  TEXT NOT NULL DEFAULT '미정산' CHECK (settlement_status IN ('미정산', '정산대상', '정산완료', '제외')),
  progress           NUMERIC(5,2) NOT NULL DEFAULT 0,
  source_url         TEXT,
  legacy_note        TEXT,
  predecessor_issue_no TEXT,
  created_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_issue_items_project_issue_no UNIQUE (project_id, issue_no)
);

ALTER TABLE issue_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issue_items_select_member" ON issue_items
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "issue_items_insert_editor" ON issue_items
  FOR INSERT WITH CHECK (is_project_editor(project_id));

CREATE POLICY "issue_items_update_editor" ON issue_items
  FOR UPDATE USING (is_project_editor(project_id));

CREATE POLICY "issue_items_delete_editor" ON issue_items
  FOR DELETE USING (is_project_editor(project_id));

CREATE TABLE issue_comments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_id       UUID NOT NULL REFERENCES issue_items(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  author_name    TEXT,
  body           TEXT NOT NULL,
  commented_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE issue_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issue_comments_select_member" ON issue_comments
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "issue_comments_insert_editor" ON issue_comments
  FOR INSERT WITH CHECK (
    is_project_editor(project_id)
    AND EXISTS (
      SELECT 1
      FROM issue_items ii
      WHERE ii.id = issue_comments.issue_id
        AND ii.project_id = issue_comments.project_id
    )
  );

CREATE POLICY "issue_comments_update_editor" ON issue_comments
  FOR UPDATE USING (is_project_editor(project_id));

CREATE POLICY "issue_comments_delete_editor" ON issue_comments
  FOR DELETE USING (is_project_editor(project_id));

CREATE TABLE issue_work_logs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_id       UUID NOT NULL REFERENCES issue_items(id) ON DELETE CASCADE,
  worker_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  worker_name    TEXT NOT NULL,
  company_id     UUID REFERENCES companies(id) ON DELETE SET NULL,
  work_date      DATE NOT NULL,
  hours          NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (hours >= 0),
  body           TEXT NOT NULL,
  note           TEXT,
  settlement_month TEXT,
  settled        BOOLEAN NOT NULL DEFAULT false,
  created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE issue_work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issue_work_logs_select_member" ON issue_work_logs
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "issue_work_logs_insert_editor" ON issue_work_logs
  FOR INSERT WITH CHECK (
    is_project_editor(project_id)
    AND EXISTS (
      SELECT 1
      FROM issue_items ii
      WHERE ii.id = issue_work_logs.issue_id
        AND ii.project_id = issue_work_logs.project_id
    )
  );

CREATE POLICY "issue_work_logs_update_editor" ON issue_work_logs
  FOR UPDATE USING (is_project_editor(project_id));

CREATE POLICY "issue_work_logs_delete_editor" ON issue_work_logs
  FOR DELETE USING (is_project_editor(project_id));

CREATE INDEX idx_issue_items_project_id ON issue_items(project_id);
CREATE INDEX idx_issue_items_project_status ON issue_items(project_id, status);
CREATE INDEX idx_issue_items_project_assignee ON issue_items(project_id, assignee_user_id);
CREATE INDEX idx_issue_items_project_company ON issue_items(project_id, company_id);
CREATE INDEX idx_issue_items_received_at ON issue_items(project_id, received_at DESC);
CREATE INDEX idx_issue_items_related_task_id ON issue_items(related_task_id);

CREATE INDEX idx_issue_comments_issue_id ON issue_comments(issue_id, commented_at DESC);
CREATE INDEX idx_issue_comments_project_id ON issue_comments(project_id, commented_at DESC);

CREATE INDEX idx_issue_work_logs_issue_id ON issue_work_logs(issue_id, work_date DESC);
CREATE INDEX idx_issue_work_logs_project_date ON issue_work_logs(project_id, work_date DESC);
CREATE INDEX idx_issue_work_logs_project_worker ON issue_work_logs(project_id, worker_name);
CREATE INDEX idx_issue_work_logs_project_company ON issue_work_logs(project_id, company_id);
CREATE INDEX idx_issue_work_logs_settlement ON issue_work_logs(project_id, settlement_month, settled);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON issue_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON issue_work_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
