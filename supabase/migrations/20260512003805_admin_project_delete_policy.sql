-- ============================================================
-- admin can delete any project
-- ============================================================

CREATE POLICY "projects_delete_admin" ON public.projects
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );
