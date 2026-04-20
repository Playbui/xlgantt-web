import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, Building2, Check, Search, FolderTree, Layers3 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useResourceStore } from '@/stores/resource-store'
import { useAuthStore } from '@/stores/auth-store'
import { useOrganizationStore } from '@/stores/organization-store'
import { cn } from '@/lib/utils'

interface MemberPickerProps {
  value: string | string[]
  onChange: (memberIds: string[]) => void
  single?: boolean
  placeholder?: string
  size?: 'sm' | 'default'
  disabled?: boolean
}

interface MemberNode {
  id: string
  name: string
  role?: string
  email?: string
  color: string
  companyLabel: string
}

interface TeamGroup {
  id: string
  name: string
  members: MemberNode[]
}

interface DepartmentGroup {
  id: string
  name: string
  members: MemberNode[]
  teams: TeamGroup[]
}

interface CompanyGroup {
  id: string
  name: string
  color: string
  members: MemberNode[]
  departments: DepartmentGroup[]
}

export function MemberPicker({
  value,
  onChange,
  single = false,
  placeholder = '담당자 선택...',
  size = 'default',
  disabled = false,
}: MemberPickerProps) {
  const { companies, members } = useResourceStore()
  const allUsers = useAuthStore((s) => s.users)
  const orgCompanies = useOrganizationStore((s) => s.companies)
  const orgDepartments = useOrganizationStore((s) => s.departments)
  const orgTeams = useOrganizationStore((s) => s.teams)
  const orgAssignments = useOrganizationStore((s) => s.assignments)

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set())
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set())

  const selectedIds = useMemo(() => {
    if (Array.isArray(value)) return new Set(value)
    return value ? new Set([value]) : new Set<string>()
  }, [value])

  const groupedTree = useMemo(() => {
    const query = search.toLowerCase().trim()
    const assignmentMap = new Map(orgAssignments.map((assignment) => [assignment.user_id, assignment]))

    const visibleMembers = members.filter((member) => {
      const linkedUser = allUsers.find((user) => member.email && user.email?.toLowerCase() === member.email.toLowerCase())
      const assignment = linkedUser ? assignmentMap.get(linkedUser.id) : undefined
      const orgCompany = assignment ? orgCompanies.find((item) => item.id === assignment.company_id) : undefined
      const orgDepartment = assignment ? orgDepartments.find((item) => item.id === assignment.department_id) : undefined
      const orgTeam = assignment?.team_id ? orgTeams.find((item) => item.id === assignment.team_id) : undefined
      const projectCompany = companies.find((company) => company.id === member.company_id)

      if (!query) return true

      return [
        member.name,
        member.role,
        member.email,
        projectCompany?.name,
        orgCompany?.name,
        orgDepartment?.name,
        orgTeam?.name,
      ].some((field) => field?.toLowerCase().includes(query))
    })

    const grouped = new Map<string, CompanyGroup>()

    for (const member of visibleMembers) {
      const linkedUser = allUsers.find((user) => member.email && user.email?.toLowerCase() === member.email.toLowerCase())
      const assignment = linkedUser ? assignmentMap.get(linkedUser.id) : undefined
      const projectCompany = companies.find((company) => company.id === member.company_id)
      const orgCompany = assignment ? orgCompanies.find((item) => item.id === assignment.company_id) : undefined
      const orgDepartment = assignment ? orgDepartments.find((item) => item.id === assignment.department_id) : undefined
      const orgTeam = assignment?.team_id ? orgTeams.find((item) => item.id === assignment.team_id) : undefined

      const companyId = orgCompany?.id || `project-${projectCompany?.id || 'ungrouped'}`
      const companyName = orgCompany?.name || projectCompany?.name || '기타 담당자'
      const companyColor = orgCompany?.color || projectCompany?.color || '#64748b'

      const companyGroup = grouped.get(companyId) || {
        id: companyId,
        name: companyName,
        color: companyColor,
        members: [],
        departments: [],
      }

      const memberNode: MemberNode = {
        id: member.id,
        name: member.name,
        role: member.role,
        email: member.email,
        color: companyColor,
        companyLabel: companyName,
      }

      if (!orgDepartment) {
        companyGroup.members.push(memberNode)
        grouped.set(companyId, companyGroup)
        continue
      }

      let departmentGroup = companyGroup.departments.find((department) => department.id === orgDepartment.id)
      if (!departmentGroup) {
        departmentGroup = {
          id: orgDepartment.id,
          name: orgDepartment.name,
          members: [],
          teams: [],
        }
        companyGroup.departments.push(departmentGroup)
      }

      if (!orgTeam) {
        departmentGroup.members.push(memberNode)
      } else {
        let teamGroup = departmentGroup.teams.find((team) => team.id === orgTeam.id)
        if (!teamGroup) {
          teamGroup = {
            id: orgTeam.id,
            name: orgTeam.name,
            members: [],
          }
          departmentGroup.teams.push(teamGroup)
        }
        teamGroup.members.push(memberNode)
      }

      grouped.set(companyId, companyGroup)
    }

    return [...grouped.values()]
  }, [search, members, allUsers, orgAssignments, orgCompanies, orgDepartments, orgTeams, companies])

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

  const toggleMember = (memberId: string) => {
    if (single) {
      onChange([memberId])
      setOpen(false)
    } else {
      const next = new Set(selectedIds)
      next.has(memberId) ? next.delete(memberId) : next.add(memberId)
      onChange([...next])
    }
  }

  const displayText = useMemo(() => {
    if (selectedIds.size === 0) return placeholder
    const names = [...selectedIds].map((id) => members.find((m) => m.id === id)?.name).filter(Boolean)
    if (names.length <= 2) return names.join(', ')
    return `${names[0]} 외 ${names.length - 1}명`
  }, [selectedIds, members, placeholder])

  const renderMemberRow = (member: MemberNode, depth: number) => {
    const isSelected = selectedIds.has(member.id)
    return (
      <div
        key={member.id}
        className={cn(
          'flex items-center gap-2 py-1.5 rounded cursor-pointer transition-colors',
          isSelected ? 'bg-primary/10' : 'hover:bg-accent/30'
        )}
        style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: '8px' }}
        onClick={() => toggleMember(member.id)}
      >
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
          style={{ backgroundColor: member.color }}
        >
          {member.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm">{member.name}</span>
          {member.role && <span className="text-xs text-muted-foreground ml-1.5">{member.role}</span>}
        </div>
        {isSelected && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'justify-between font-normal',
            size === 'sm' ? 'h-8 text-xs px-2' : 'h-9 text-sm px-3',
            selectedIds.size === 0 && 'text-muted-foreground'
          )}
        >
          <span className="truncate">{displayText}</span>
          {selectedIds.size > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{selectedIds.size}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="회사, 부서, 팀, 이름 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-1">
          {groupedTree.length === 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">검색 결과 없음</div>
          )}
          {groupedTree.map((company) => {
            const isExpanded = expandedCompanies.has(company.id) || search.length > 0
            return (
              <div key={company.id}>
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer select-none"
                  onClick={() => toggleCompany(company.id)}
                >
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <div className="w-4 h-4 rounded flex items-center justify-center" style={{ backgroundColor: company.color }}>
                    <Building2 className="h-2.5 w-2.5 text-white" />
                  </div>
                  <span className="text-sm font-medium flex-1">{company.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {company.members.length + company.departments.reduce((sum, department) => sum + department.members.length + department.teams.reduce((teamSum, team) => teamSum + team.members.length, 0), 0)}
                  </Badge>
                </div>

                {isExpanded && (
                  <>
                    {company.members.map((member) => renderMemberRow(member, 1))}
                    {company.departments.map((department) => {
                      const isDeptExpanded = expandedDepartments.has(department.id) || search.length > 0
                      return (
                        <div key={department.id}>
                          <div
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-accent/30 cursor-pointer select-none"
                            onClick={() => toggleDepartment(department.id)}
                          >
                            {isDeptExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            <FolderTree className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-medium flex-1">{department.name}</span>
                          </div>
                          {isDeptExpanded && (
                            <>
                              {department.members.map((member) => renderMemberRow(member, 2))}
                              {department.teams.map((team) => (
                                <div key={team.id}>
                                  <div className="flex items-center gap-1.5 px-4 py-1 text-[11px] text-muted-foreground">
                                    <Layers3 className="h-3.5 w-3.5" />
                                    <span>{team.name}</span>
                                  </div>
                                  {team.members.map((member) => renderMemberRow(member, 3))}
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {!single && selectedIds.size > 0 && (
          <div className="border-t p-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{selectedIds.size}명 선택됨</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onChange([])}>전체 해제</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
