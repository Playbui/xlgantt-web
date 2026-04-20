-- ============================================================
-- XLGantt Web - PM/Owner visible user list for project resource management
-- Supabase Migration 013
-- ============================================================

CREATE OR REPLACE FUNCTION public.project_visible_users(p_project_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  role TEXT,
  approved BOOLEAN,
  avatar_url TEXT,
  force_password_change BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    p.id,
    COALESCE(au.email, p.email) AS email,
    p.name,
    p.role,
    p.approved,
    p.avatar_url,
    COALESCE(p.force_password_change, false) AS force_password_change,
    COALESCE(au.created_at, p.created_at) AS created_at
  FROM public.profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE p.approved = true
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles me
        WHERE me.id = auth.uid()
          AND me.role = 'admin'
      )
      OR EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = p_project_id
          AND pm.user_id = auth.uid()
      )
    )
  ORDER BY lower(COALESCE(p.name, '')), lower(COALESCE(au.email, p.email, ''));
$$;

GRANT EXECUTE ON FUNCTION public.project_visible_users(UUID) TO authenticated;
