import { useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { OrganizationDraftValue } from '@/lib/organization-types'
import { useOrganizationStore } from '@/stores/organization-store'

interface OrganizationAssignmentFormProps {
  value: OrganizationDraftValue
  onChange: (value: OrganizationDraftValue) => void
  disabled?: boolean
  compact?: boolean
}

export function OrganizationAssignmentForm({
  value,
  onChange,
  disabled,
  compact,
}: OrganizationAssignmentFormProps) {
  const companies = useOrganizationStore((state) => state.companies)
  const departments = useOrganizationStore((state) => state.departments)
  const teams = useOrganizationStore((state) => state.teams)

  const filteredDepartments = useMemo(
    () => departments.filter((department) => department.company_id === value.companyId),
    [departments, value.companyId]
  )
  const filteredTeams = useMemo(
    () => teams.filter((team) => team.department_id === value.departmentId),
    [teams, value.departmentId]
  )

  const triggerClass = cn(compact ? 'h-8 text-xs' : 'h-9 text-sm')

  return (
    <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3')}>
      <div>
        <label className="text-xs text-muted-foreground">회사</label>
        <Select
          value={value.companyId ?? undefined}
          onValueChange={(companyId) => onChange({ companyId: companyId || undefined, departmentId: undefined, teamId: undefined })}
          disabled={disabled}
        >
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder="회사 선택">
              {value.companyId ? companies.find((company) => company.id === value.companyId)?.name : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">부서</label>
        <Select
          value={value.departmentId ?? undefined}
          onValueChange={(departmentId) => onChange({ ...value, departmentId: departmentId || undefined, teamId: undefined })}
          disabled={disabled || !value.companyId}
        >
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder="부서 선택">
              {value.departmentId ? filteredDepartments.find((department) => department.id === value.departmentId)?.name : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {filteredDepartments.map((department) => (
              <SelectItem key={department.id} value={department.id}>
                {department.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">팀</label>
        <Select
          value={value.teamId ?? '__none__'}
          onValueChange={(teamId) => onChange({ ...value, teamId: !teamId || teamId === '__none__' ? undefined : teamId })}
          disabled={disabled || !value.departmentId}
        >
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder="팀 선택">
              {value.teamId
                ? filteredTeams.find((team) => team.id === value.teamId)?.name
                : '팀 미지정'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">팀 미지정</SelectItem>
            {filteredTeams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
