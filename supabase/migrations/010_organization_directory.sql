-- ============================================================
-- XLGantt Web - Organization directory (company > department > team)
-- Supabase Migration 010
-- ============================================================

CREATE TABLE IF NOT EXISTS public.org_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT,
  color TEXT DEFAULT '#2563eb',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.org_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.org_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.org_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.org_departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_org_assignments (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.org_companies(id) ON DELETE RESTRICT,
  department_id UUID NOT NULL REFERENCES public.org_departments(id) ON DELETE RESTRICT,
  team_id UUID REFERENCES public.org_teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.org_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_org_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_companies_select_authenticated" ON public.org_companies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "org_departments_select_authenticated" ON public.org_departments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "org_teams_select_authenticated" ON public.org_teams
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_org_assignments_select_authenticated" ON public.user_org_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "org_companies_admin_all" ON public.org_companies
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.role = 'admin'));

CREATE POLICY "org_departments_admin_all" ON public.org_departments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.role = 'admin'));

CREATE POLICY "org_teams_admin_all" ON public.org_teams
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.role = 'admin'));

CREATE POLICY "user_org_assignments_admin_all" ON public.user_org_assignments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_org_departments_company_id ON public.org_departments(company_id);
CREATE INDEX IF NOT EXISTS idx_org_teams_department_id ON public.org_teams(department_id);
CREATE INDEX IF NOT EXISTS idx_user_org_assignments_company_id ON public.user_org_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_user_org_assignments_department_id ON public.user_org_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_user_org_assignments_team_id ON public.user_org_assignments(team_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.org_companies
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.org_departments
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.org_teams
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_org_assignments
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
