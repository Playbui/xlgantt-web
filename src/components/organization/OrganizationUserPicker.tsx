import { useMemo, useState } from 'react'
import { Building2, Check, ChevronDown, ChevronRight, FolderTree, Layers3, Search, Users } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useOrganizationStore } from '@/stores/organization-store'
import type { User } from '@/stores/auth-store'

interface OrganizationUserPickerProps {
  users: User[]
  value?: string
  onChange: (userId?: string) => void
  placeholder?: string
  disabled?: boolean
}

interface GroupedUsers {
  companyId: string
  companyName: string
  companyColor?: string
  departments: Array<{
    departmentId: string
    departmentName: string
    teams: Array<{
      teamId: string
      teamName: string
      users: User[]
    }>
    ungroupedUsers: User[]
  }>
  unassignedDepartmentUsers: User[]
}

export function OrganizationUserPicker({
  users,
  value,
  onChange,
  placeholder = '회원을 선택하세요...',
  disabled,
}: OrganizationUserPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const companies = useOrganizationStore((state) => state.companies)
  const departments = useOrganizationStore((state) => state.departments)
  const teams = useOrganizationStore((state) => state.teams)
  const assignments = useOrganizationStore((state) => state.assignments)

  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set())
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set())

  const selectedUser = useMemo(() => users.find((user) => user.id === value), [users, value])

  const groupedUsers = useMemo<GroupedUsers[]>(() => {
    const query = search.trim().toLowerCase()
    const assignmentMap = new Map(assignments.map((assignment) => [assignment.user_id, assignment]))

    const filteredUsers = users.filter((user) => {
      const assignment = assignmentMap.get(user.id)
      const company = assignment ? companies.find((item) => item.id === assignment.company_id) : null
      const department = assignment ? departments.find((item) => item.id === assignment.department_id) : null
      const team = assignment?.team_id ? teams.find((item) => item.id === assignment.team_id) : null

      if (!query) return true

      return [
        user.name,
        user.email,
        company?.name,
        department?.name,
        team?.name,
      ].some((field) => field?.toLowerCase().includes(query))
    })

    const grouped = new Map<string, GroupedUsers>()

    for (const user of filteredUsers) {
      const assignment = assignmentMap.get(user.id)
      if (!assignment) {
        const key = '__unassigned__'
        const current = grouped.get(key) || {
          companyId: key,
          companyName: '조직 미지정',
          companyColor: '#94a3b8',
          departments: [],
          unassignedDepartmentUsers: [],
        }
        current.unassignedDepartmentUsers.push(user)
        grouped.set(key, current)
        continue
      }

      const company = companies.find((item) => item.id === assignment.company_id)
      const companyKey = assignment.company_id
      const companyGroup = grouped.get(companyKey) || {
        companyId: companyKey,
        companyName: company?.name || '회사 미지정',
        companyColor: company?.color,
        departments: [],
        unassignedDepartmentUsers: [],
      }

      const department = departments.find((item) => item.id === assignment.department_id)
      if (!department) {
        companyGroup.unassignedDepartmentUsers.push(user)
        grouped.set(companyKey, companyGroup)
        continue
      }

      let departmentGroup = companyGroup.departments.find((item) => item.departmentId === department.id)
      if (!departmentGroup) {
        departmentGroup = {
          departmentId: department.id,
          departmentName: department.name,
          teams: [],
          ungroupedUsers: [],
        }
        companyGroup.departments.push(departmentGroup)
      }

      if (!assignment.team_id) {
        departmentGroup.ungroupedUsers.push(user)
      } else {
        const team = teams.find((item) => item.id === assignment.team_id)
        let teamGroup = departmentGroup.teams.find((item) => item.teamId === assignment.team_id)
        if (!teamGroup) {
          teamGroup = {
            teamId: assignment.team_id,
            teamName: team?.name || '팀 미지정',
            users: [],
          }
          departmentGroup.teams.push(teamGroup)
        }
        teamGroup.users.push(user)
      }

      grouped.set(companyKey, companyGroup)
    }

    return [...grouped.values()]
  }, [assignments, companies, departments, search, teams, users])

  const toggleCompany = (companyId: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev)
      next.has(companyId) ? next.delete(companyId) : next.add(companyId)
      return next
    })
  }

  const toggleDepartment = (departmentId: string) => {
    setExpandedDepartments((prev) => {
      const next = new Set(prev)
      next.has(departmentId) ? next.delete(departmentId) : next.add(departmentId)
      return next
    })
  }

  const renderUserRow = (user: User, depth = 0) => (
    <button
      key={user.id}
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/40',
        value === user.id && 'bg-primary/10'
      )}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      onClick={() => {
        onChange(user.id)
        setOpen(false)
      }}
    >
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
        {user.name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{user.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{user.email}</div>
      </div>
      {value === user.id && <Check className="h-3.5 w-3.5 text-primary" />}
    </button>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('h-9 w-full justify-between text-sm font-normal', !selectedUser && 'text-muted-foreground')}
        >
          <span className="truncate">
            {selectedUser ? `${selectedUser.name} (${selectedUser.email})` : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="회사, 부서, 팀, 이름 검색..."
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          {groupedUsers.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">선택 가능한 회원이 없습니다.</div>
          )}
          {groupedUsers.map((company) => {
            const isCompanyExpanded = expandedCompanies.has(company.companyId) || search.length > 0
            return (
              <div key={company.companyId} className="mb-2 rounded-lg border border-border/40 bg-background">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                  onClick={() => toggleCompany(company.companyId)}
                >
                  {isCompanyExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-md text-white"
                    style={{ backgroundColor: company.companyColor || '#64748b' }}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{company.companyName}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {company.departments.reduce((sum, department) => sum + department.ungroupedUsers.length + department.teams.reduce((teamSum, team) => teamSum + team.users.length, 0), 0) + company.unassignedDepartmentUsers.length}
                  </Badge>
                </button>

                {isCompanyExpanded && (
                  <div className="border-t border-border/30 px-2 py-2">
                    {company.unassignedDepartmentUsers.length > 0 && (
                      <div className="mb-2 rounded-md bg-muted/20 py-1">
                        <div className="flex items-center gap-2 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          부서 미지정
                        </div>
                        {company.unassignedDepartmentUsers.map((user) => renderUserRow(user, 1))}
                      </div>
                    )}

                    {company.departments.map((department) => {
                      const isDepartmentExpanded = expandedDepartments.has(department.departmentId) || search.length > 0
                      return (
                        <div key={department.departmentId} className="mb-2 rounded-md bg-muted/20">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                            onClick={() => toggleDepartment(department.departmentId)}
                          >
                            {isDepartmentExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <FolderTree className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-medium">{department.departmentName}</span>
                          </button>

                          {isDepartmentExpanded && (
                            <div className="pb-2">
                              {department.ungroupedUsers.length > 0 && (
                                <div className="mb-1">
                                  <div className="px-4 py-1 text-[11px] text-muted-foreground">팀 미지정</div>
                                  {department.ungroupedUsers.map((user) => renderUserRow(user, 2))}
                                </div>
                              )}

                              {department.teams.map((team) => (
                                <div key={team.teamId} className="mb-1">
                                  <div className="flex items-center gap-2 px-4 py-1 text-[11px] text-muted-foreground">
                                    <Layers3 className="h-3.5 w-3.5" />
                                    {team.teamName}
                                  </div>
                                  {team.users.map((user) => renderUserRow(user, 3))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
