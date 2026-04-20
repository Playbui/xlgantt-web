import { Building2, FolderTree, Layers3, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOrganizationStore } from '@/stores/organization-store'

interface OrganizationTreeProps {
  onDeleteCompany?: (id: string) => void
  onDeleteDepartment?: (id: string) => void
  onDeleteTeam?: (id: string) => void
}

export function OrganizationTree({
  onDeleteCompany,
  onDeleteDepartment,
  onDeleteTeam,
}: OrganizationTreeProps) {
  const companies = useOrganizationStore((state) => state.companies)
  const departments = useOrganizationStore((state) => state.departments)
  const teams = useOrganizationStore((state) => state.teams)
  const assignments = useOrganizationStore((state) => state.assignments)

  if (companies.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
        아직 등록된 조직이 없습니다. 회사부터 추가해 주세요.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {companies.map((company) => {
        const companyDepartments = departments.filter((department) => department.company_id === company.id)
        const companyCount = assignments.filter((assignment) => assignment.company_id === company.id).length

        return (
          <div key={company.id} className="rounded-xl border border-border/60 bg-card">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: company.color || '#2563eb' }}
              >
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{company.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {company.short_name || '약칭 없음'} · 소속 {companyCount}명
                </div>
              </div>
              {onDeleteCompany && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDeleteCompany(company.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              )}
            </div>

            <div className="px-4 py-3 space-y-3">
              {companyDepartments.length === 0 ? (
                <div className="text-xs text-muted-foreground">등록된 부서가 없습니다.</div>
              ) : (
                companyDepartments.map((department) => {
                  const departmentTeams = teams.filter((team) => team.department_id === department.id)
                  const departmentCount = assignments.filter((assignment) => assignment.department_id === department.id).length

                  return (
                    <div key={department.id} className="rounded-lg border border-border/40 bg-muted/20">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
                        <FolderTree className="h-4 w-4 text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{department.name}</div>
                          <div className="text-[11px] text-muted-foreground">소속 {departmentCount}명</div>
                        </div>
                        {onDeleteDepartment && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDeleteDepartment(department.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        )}
                      </div>
                      <div className="px-3 py-2 space-y-2">
                        {departmentTeams.length === 0 ? (
                          <div className="text-xs text-muted-foreground">등록된 팀이 없습니다.</div>
                        ) : (
                          departmentTeams.map((team) => {
                            const teamCount = assignments.filter((assignment) => assignment.team_id === team.id).length

                            return (
                              <div key={team.id} className="flex items-center gap-2 rounded-md border border-border/30 bg-background px-3 py-2">
                                <Layers3 className="h-3.5 w-3.5 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm">{team.name}</div>
                                  <div className="text-[11px] text-muted-foreground">소속 {teamCount}명</div>
                                </div>
                                {onDeleteTeam && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDeleteTeam(team.id)}>
                                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                  </Button>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
