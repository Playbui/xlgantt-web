-- ============================================================
-- 020. Issue member access policies repair
-- ============================================================

CREATE TABLE IF NOT EXISTS public.issue_members (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('manager', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

ALTER TABLE public.issue_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_issue_members_user_id
ON public.issue_members(user_id);

CREATE OR REPLACE FUNCTION public.is_issue_member(pid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.issue_members im
    WHERE im.project_id = pid
      AND im.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_issue_editor(pid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.issue_members im
    WHERE im.project_id = pid
      AND im.user_id = auth.uid()
      AND im.role IN ('manager', 'editor')
  );
$$;

DROP POLICY IF EXISTS "issue_members_select_project_editor" ON public.issue_members;
DROP POLICY IF EXISTS "issue_members_insert_project_editor" ON public.issue_members;
DROP POLICY IF EXISTS "issue_members_update_project_editor" ON public.issue_members;
DROP POLICY IF EXISTS "issue_members_delete_project_editor" ON public.issue_members;

CREATE POLICY "issue_members_select_admin_project_editor_or_self" ON public.issue_members
  FOR SELECT USING (
    public.is_project_editor(project_id)
    OR user_id = auth.uid()
  );

CREATE POLICY "issue_members_insert_admin_or_project_editor" ON public.issue_members
  FOR INSERT WITH CHECK (
    public.is_project_editor(project_id)
  );

CREATE POLICY "issue_members_update_admin_or_project_editor" ON public.issue_members
  FOR UPDATE USING (
    public.is_project_editor(project_id)
  )
  WITH CHECK (
    public.is_project_editor(project_id)
  );

CREATE POLICY "issue_members_delete_admin_or_project_editor" ON public.issue_members
  FOR DELETE USING (
    public.is_project_editor(project_id)
  );

DROP POLICY IF EXISTS "issue_items_select_member" ON public.issue_items;
DROP POLICY IF EXISTS "issue_items_insert_editor" ON public.issue_items;
DROP POLICY IF EXISTS "issue_items_update_editor" ON public.issue_items;
DROP POLICY IF EXISTS "issue_items_delete_editor" ON public.issue_items;
DROP POLICY IF EXISTS "issue_items_select_issue_member" ON public.issue_items;
DROP POLICY IF EXISTS "issue_items_insert_issue_editor" ON public.issue_items;
DROP POLICY IF EXISTS "issue_items_update_issue_editor" ON public.issue_items;
DROP POLICY IF EXISTS "issue_items_delete_issue_editor" ON public.issue_items;

CREATE POLICY "issue_items_select_issue_member" ON public.issue_items
  FOR SELECT USING (public.is_issue_member(project_id));

CREATE POLICY "issue_items_insert_issue_editor" ON public.issue_items
  FOR INSERT WITH CHECK (public.is_issue_editor(project_id));

CREATE POLICY "issue_items_update_issue_editor" ON public.issue_items
  FOR UPDATE USING (public.is_issue_editor(project_id))
  WITH CHECK (public.is_issue_editor(project_id));

CREATE POLICY "issue_items_delete_issue_editor" ON public.issue_items
  FOR DELETE USING (public.is_issue_editor(project_id));

DROP POLICY IF EXISTS "issue_comments_select_member" ON public.issue_comments;
DROP POLICY IF EXISTS "issue_comments_insert_editor" ON public.issue_comments;
DROP POLICY IF EXISTS "issue_comments_update_editor" ON public.issue_comments;
DROP POLICY IF EXISTS "issue_comments_delete_editor" ON public.issue_comments;
DROP POLICY IF EXISTS "issue_comments_select_issue_member" ON public.issue_comments;
DROP POLICY IF EXISTS "issue_comments_insert_issue_editor" ON public.issue_comments;
DROP POLICY IF EXISTS "issue_comments_update_issue_editor" ON public.issue_comments;
DROP POLICY IF EXISTS "issue_comments_delete_issue_editor" ON public.issue_comments;

CREATE POLICY "issue_comments_select_issue_member" ON public.issue_comments
  FOR SELECT USING (public.is_issue_member(project_id));

CREATE POLICY "issue_comments_insert_issue_editor" ON public.issue_comments
  FOR INSERT WITH CHECK (
    public.is_issue_editor(project_id)
    AND EXISTS (
      SELECT 1
      FROM public.issue_items ii
      WHERE ii.id = issue_comments.issue_id
        AND ii.project_id = issue_comments.project_id
    )
  );

CREATE POLICY "issue_comments_update_issue_editor" ON public.issue_comments
  FOR UPDATE USING (public.is_issue_editor(project_id))
  WITH CHECK (public.is_issue_editor(project_id));

CREATE POLICY "issue_comments_delete_issue_editor" ON public.issue_comments
  FOR DELETE USING (public.is_issue_editor(project_id));

DROP POLICY IF EXISTS "issue_work_logs_select_member" ON public.issue_work_logs;
DROP POLICY IF EXISTS "issue_work_logs_insert_editor" ON public.issue_work_logs;
DROP POLICY IF EXISTS "issue_work_logs_update_editor" ON public.issue_work_logs;
DROP POLICY IF EXISTS "issue_work_logs_delete_editor" ON public.issue_work_logs;
DROP POLICY IF EXISTS "issue_work_logs_select_issue_member" ON public.issue_work_logs;
DROP POLICY IF EXISTS "issue_work_logs_insert_issue_editor" ON public.issue_work_logs;
DROP POLICY IF EXISTS "issue_work_logs_update_issue_editor" ON public.issue_work_logs;
DROP POLICY IF EXISTS "issue_work_logs_delete_issue_editor" ON public.issue_work_logs;

CREATE POLICY "issue_work_logs_select_issue_member" ON public.issue_work_logs
  FOR SELECT USING (public.is_issue_member(project_id));

CREATE POLICY "issue_work_logs_insert_issue_editor" ON public.issue_work_logs
  FOR INSERT WITH CHECK (
    public.is_issue_editor(project_id)
    AND EXISTS (
      SELECT 1
      FROM public.issue_items ii
      WHERE ii.id = issue_work_logs.issue_id
        AND ii.project_id = issue_work_logs.project_id
    )
  );

CREATE POLICY "issue_work_logs_update_issue_editor" ON public.issue_work_logs
  FOR UPDATE USING (public.is_issue_editor(project_id))
  WITH CHECK (public.is_issue_editor(project_id));

CREATE POLICY "issue_work_logs_delete_issue_editor" ON public.issue_work_logs
  FOR DELETE USING (public.is_issue_editor(project_id));
