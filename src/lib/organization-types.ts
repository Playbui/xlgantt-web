export interface OrganizationCompany {
  id: string
  name: string
  short_name?: string
  color?: string
  sort_order: number
  created_at: string
}

export interface OrganizationDepartment {
  id: string
  company_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface OrganizationTeam {
  id: string
  department_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface UserOrganizationAssignment {
  user_id: string
  company_id: string
  department_id: string
  team_id?: string
  updated_at: string
}

export interface OrganizationDraftValue {
  companyId?: string
  departmentId?: string
  teamId?: string
}
