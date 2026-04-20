import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import type {
  OrganizationCompany,
  OrganizationDepartment,
  OrganizationDraftValue,
  OrganizationTeam,
  UserOrganizationAssignment,
} from '@/lib/organization-types'

function dbToCompany(row: Record<string, unknown>): OrganizationCompany {
  return {
    id: row.id as string,
    name: row.name as string,
    short_name: (row.short_name as string) || undefined,
    color: (row.color as string) || undefined,
    sort_order: (row.sort_order as number) ?? 0,
    created_at: (row.created_at as string) || new Date().toISOString(),
  }
}

function dbToDepartment(row: Record<string, unknown>): OrganizationDepartment {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    name: row.name as string,
    sort_order: (row.sort_order as number) ?? 0,
    created_at: (row.created_at as string) || new Date().toISOString(),
  }
}

function dbToTeam(row: Record<string, unknown>): OrganizationTeam {
  return {
    id: row.id as string,
    department_id: row.department_id as string,
    name: row.name as string,
    sort_order: (row.sort_order as number) ?? 0,
    created_at: (row.created_at as string) || new Date().toISOString(),
  }
}

function dbToAssignment(row: Record<string, unknown>): UserOrganizationAssignment {
  return {
    user_id: row.user_id as string,
    company_id: row.company_id as string,
    department_id: row.department_id as string,
    team_id: (row.team_id as string) || undefined,
    updated_at: (row.updated_at as string) || new Date().toISOString(),
  }
}

interface OrganizationState {
  companies: OrganizationCompany[]
  departments: OrganizationDepartment[]
  teams: OrganizationTeam[]
  assignments: UserOrganizationAssignment[]
  isLoaded: boolean

  loadOrganization: () => Promise<void>
  addCompany: (input: Pick<OrganizationCompany, 'name' | 'short_name' | 'color'>) => Promise<void>
  addDepartment: (input: Pick<OrganizationDepartment, 'company_id' | 'name'>) => Promise<void>
  addTeam: (input: Pick<OrganizationTeam, 'department_id' | 'name'>) => Promise<void>
  deleteCompany: (id: string) => Promise<void>
  deleteDepartment: (id: string) => Promise<void>
  deleteTeam: (id: string) => Promise<void>
  assignUser: (userId: string, value: OrganizationDraftValue) => Promise<void>
  getUserAssignment: (userId: string) => UserOrganizationAssignment | undefined
  getPathLabel: (userId: string) => string
}

export const useOrganizationStore = create<OrganizationState>()(
  persist(
    (set, get) => ({
      companies: [],
      departments: [],
      teams: [],
      assignments: [],
      isLoaded: false,

      loadOrganization: async () => {
        try {
          const [companiesRes, departmentsRes, teamsRes, assignmentsRes] = await Promise.all([
            supabase.from('org_companies').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
            supabase.from('org_departments').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
            supabase.from('org_teams').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
            supabase.from('user_org_assignments').select('*'),
          ])

          if (companiesRes.error || departmentsRes.error || teamsRes.error || assignmentsRes.error) {
            console.warn(
              '조직 마스터 로드 실패:',
              companiesRes.error?.message || departmentsRes.error?.message || teamsRes.error?.message || assignmentsRes.error?.message
            )
            set({ isLoaded: true })
            return
          }

          set({
            companies: (companiesRes.data || []).map(dbToCompany),
            departments: (departmentsRes.data || []).map(dbToDepartment),
            teams: (teamsRes.data || []).map(dbToTeam),
            assignments: (assignmentsRes.data || []).map(dbToAssignment),
            isLoaded: true,
          })
        } catch (error) {
          console.warn('조직 마스터 로드 예외:', error)
          set({ isLoaded: true })
        }
      },

      addCompany: async (input) => {
        const company: OrganizationCompany = {
          id: crypto.randomUUID(),
          name: input.name.trim(),
          short_name: input.short_name?.trim() || undefined,
          color: input.color || '#2563eb',
          sort_order: get().companies.length + 1,
          created_at: new Date().toISOString(),
        }
        const { error } = await supabase.from('org_companies').insert({
          id: company.id,
          name: company.name,
          short_name: company.short_name || null,
          color: company.color || null,
          sort_order: company.sort_order,
        })
        if (error) {
          console.warn('회사 저장 실패:', error.message)
          throw new Error(error.message)
        }
        await get().loadOrganization()
      },

      addDepartment: async (input) => {
        const sort_order = get().departments.filter((department) => department.company_id === input.company_id).length + 1
        const department: OrganizationDepartment = {
          id: crypto.randomUUID(),
          company_id: input.company_id,
          name: input.name.trim(),
          sort_order,
          created_at: new Date().toISOString(),
        }
        const { error } = await supabase.from('org_departments').insert({
          id: department.id,
          company_id: department.company_id,
          name: department.name,
          sort_order: department.sort_order,
        })
        if (error) {
          console.warn('부서 저장 실패:', error.message)
          throw new Error(error.message)
        }
        await get().loadOrganization()
      },

      addTeam: async (input) => {
        const sort_order = get().teams.filter((team) => team.department_id === input.department_id).length + 1
        const team: OrganizationTeam = {
          id: crypto.randomUUID(),
          department_id: input.department_id,
          name: input.name.trim(),
          sort_order,
          created_at: new Date().toISOString(),
        }
        const { error } = await supabase.from('org_teams').insert({
          id: team.id,
          department_id: team.department_id,
          name: team.name,
          sort_order: team.sort_order,
        })
        if (error) {
          console.warn('팀 저장 실패:', error.message)
          throw new Error(error.message)
        }
        await get().loadOrganization()
      },

      deleteCompany: async (id) => {
        const { error } = await supabase.from('org_companies').delete().eq('id', id)
        if (error) {
          console.warn('회사 삭제 실패:', error.message)
          throw new Error(error.message)
        }
        await get().loadOrganization()
      },

      deleteDepartment: async (id) => {
        const { error } = await supabase.from('org_departments').delete().eq('id', id)
        if (error) {
          console.warn('부서 삭제 실패:', error.message)
          throw new Error(error.message)
        }
        await get().loadOrganization()
      },

      deleteTeam: async (id) => {
        const { error } = await supabase.from('org_teams').delete().eq('id', id)
        if (error) {
          console.warn('팀 삭제 실패:', error.message)
          throw new Error(error.message)
        }
        await get().loadOrganization()
      },

      assignUser: async (userId, value) => {
        if (!value.companyId || !value.departmentId) return
        const assignment: UserOrganizationAssignment = {
          user_id: userId,
          company_id: value.companyId,
          department_id: value.departmentId,
          team_id: value.teamId || undefined,
          updated_at: new Date().toISOString(),
        }
        const { error } = await supabase.from('user_org_assignments').upsert({
          user_id: assignment.user_id,
          company_id: assignment.company_id,
          department_id: assignment.department_id,
          team_id: assignment.team_id || null,
        })
        if (error) {
          console.warn('사용자 조직 지정 실패:', error.message)
          throw new Error(error.message)
        }
        await get().loadOrganization()
      },

      getUserAssignment: (userId) => get().assignments.find((assignment) => assignment.user_id === userId),

      getPathLabel: (userId) => {
        const assignment = get().assignments.find((item) => item.user_id === userId)
        if (!assignment) return ''
        const company = get().companies.find((item) => item.id === assignment.company_id)
        const department = get().departments.find((item) => item.id === assignment.department_id)
        const team = assignment.team_id ? get().teams.find((item) => item.id === assignment.team_id) : null
        return [company?.name, department?.name, team?.name].filter(Boolean).join(' / ')
      },
    }),
    {
      name: 'xlgantt-organization',
      partialize: (state) => ({
        companies: state.companies,
        departments: state.departments,
        teams: state.teams,
        assignments: state.assignments,
      }),
    }
  )
)
