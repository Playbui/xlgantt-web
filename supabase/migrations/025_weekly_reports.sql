-- ============================================================
-- 025. Team Weekly Reports
-- ============================================================

CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_key          TEXT NOT NULL,
  team_name         TEXT NOT NULL,
  report_year       INTEGER NOT NULL,
  report_month      INTEGER NOT NULL,
  report_week       INTEGER NOT NULL,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT '입력중' CHECK (status IN ('입력중', '취합중', '완료')),
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  member_completion JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalized_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalized_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_weekly_reports_team_period UNIQUE (team_key, report_year, report_month, report_week)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_team_period
  ON public.weekly_reports(team_key, report_year DESC, report_month DESC, report_week DESC);

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_weekly_report_member(target_team_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT
    target_team_key = 'nav-comm-1'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR lower(coalesce(p.email, '')) IN (
            'admin@gmtc.kr',
            'waterer@gmtc.kr',
            'sjw@gmtc.kr',
            'jack@gmtc.kr',
            'erichan@gmtc.kr',
            'juchen131@gmtc.kr',
            'leejh@gmtc.kr'
          )
        )
    );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_weekly_report_manager(target_team_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT
    target_team_key = 'nav-comm-1'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR lower(coalesce(p.email, '')) IN (
            'admin@gmtc.kr',
            'waterer@gmtc.kr'
          )
        )
    );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE POLICY "weekly_reports_select_team_member" ON public.weekly_reports
  FOR SELECT USING (public.is_weekly_report_member(team_key));

CREATE POLICY "weekly_reports_insert_team_member" ON public.weekly_reports
  FOR INSERT WITH CHECK (public.is_weekly_report_member(team_key));

CREATE POLICY "weekly_reports_update_team_member" ON public.weekly_reports
  FOR UPDATE USING (public.is_weekly_report_member(team_key))
  WITH CHECK (public.is_weekly_report_member(team_key));

CREATE POLICY "weekly_reports_delete_team_manager" ON public.weekly_reports
  FOR DELETE USING (public.is_weekly_report_manager(team_key));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
