-- ============================================================
-- 007: task-level workspace fields
-- WBS 항목에 본문/첨부/댓글/링크를 저장하기 위한 최소 확장
-- ============================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_summary TEXT,
  ADD COLUMN IF NOT EXISTS task_body TEXT,
  ADD COLUMN IF NOT EXISTS task_attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS task_comments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS task_links JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id);

-- 기존 remarks가 있으면 최초 본문으로 이관
UPDATE public.tasks
SET task_body = remarks
WHERE task_body IS NULL
  AND remarks IS NOT NULL
  AND btrim(remarks) <> '';
