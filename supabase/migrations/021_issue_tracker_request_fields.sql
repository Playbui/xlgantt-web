-- ============================================================
-- 021. Issue tracker request/category fields
-- ============================================================

ALTER TABLE public.issue_items
  ADD COLUMN IF NOT EXISTS issue_type TEXT,
  ADD COLUMN IF NOT EXISTS request_source TEXT,
  ADD COLUMN IF NOT EXISTS external_requester TEXT,
  ADD COLUMN IF NOT EXISTS internal_owner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS internal_owner_name TEXT;

UPDATE public.issue_items
SET
  issue_type = COALESCE(NULLIF(issue_type, ''), NULLIF(legacy_status, ''), '이슈'),
  external_requester = COALESCE(NULLIF(external_requester, ''), NULLIF(source_url, '')),
  internal_owner_user_id = COALESCE(internal_owner_user_id, assignee_user_id, created_by),
  internal_owner_name = COALESCE(NULLIF(internal_owner_name, ''), NULLIF(requester_name, ''), NULLIF(assignee_name, ''))
WHERE
  issue_type IS NULL
  OR issue_type = ''
  OR external_requester IS NULL
  OR external_requester = ''
  OR internal_owner_user_id IS NULL
  OR internal_owner_name IS NULL
  OR internal_owner_name = '';

CREATE INDEX IF NOT EXISTS idx_issue_items_project_type
  ON public.issue_items(project_id, issue_type);

CREATE INDEX IF NOT EXISTS idx_issue_items_project_internal_owner
  ON public.issue_items(project_id, internal_owner_user_id);
