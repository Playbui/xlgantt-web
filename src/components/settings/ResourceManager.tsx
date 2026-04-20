import { useState, useMemo, useCallback, useEffect } from 'react'
import { Plus, Trash2, Building2, Users, ClipboardList, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useResourceStore } from '@/stores/resource-store'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore, type ProjectRole } from '@/stores/project-store'
import { useAuthStore } from '@/stores/auth-store'
import { useOrganizationStore } from '@/stores/organization-store'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { TaskEditDialog } from '@/components/gantt/TaskEditDialog'
import { OrganizationUserPicker } from '@/components/organization/OrganizationUserPicker'
import { OrganizationPath } from '@/components/organization/OrganizationPath'
import type { Task } from '@/lib/types'
import type { TaskAssignment } from '@/lib/resource-types'
import type { OrganizationCompany } from '@/lib/organization-types'

const COLORS = ['#3b82f6', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#e11d48', '#4f46e5']

// ============================================================
// Member task list sub-component
// ============================================================

interface MemberTaskInfo {
  task: Task
  assignment: TaskAssignment
}

function MemberTaskList({
  memberId,
  onOpenTask,
}: {
  memberId: string
  onOpenTask: (taskId: string) => void
}) {
  const tasks = useTaskStore((s) => s.tasks)
  const assignments = useResourceStore((s) => s.assignments)

  const memberTasks: MemberTaskInfo[] = useMemo(() => {
    const memberAssigns = assignments.filter((a) => a.member_id === memberId)
    const result: MemberTaskInfo[] = []
    for (const assign of memberAssigns) {
      const task = tasks.find((t) => t.id === assign.task_id)
      if (task && !task.is_group) {
        result.push({ task, assignment: assign })
      }
    }
    // Sort by planned_start
    result.sort((a, b) => {
      const aDate = a.task.planned_start || '9999'
      const bDate = b.task.planned_start || '9999'
      return aDate.localeCompare(bDate)
    })
    return result
  }, [memberId, tasks, assignments])

  if (memberTasks.length === 0) {
    return (
      <div className="px-4 py-2 text-xs text-muted-foreground italic">
        배정된 작업이 없습니다.
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/20">
      {/* Header */}
      <div className="grid grid-cols-[1fr_100px_60px_60px] gap-1 px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20">
        <span>작업명</span>
        <span className="text-center">기간</span>
        <span className="text-right">진척률</span>
        <span className="text-right">투입률</span>
      </div>
      {memberTasks.map(({ task, assignment }) => {
        const startStr = task.planned_start ? format(new Date(task.planned_start), 'MM/dd') : '-'
        const endStr = task.planned_end ? format(new Date(task.planned_end), 'MM/dd') : '-'
        const progressPct = Math.round(task.actual_progress * 100)

        return (
          <div
            key={`${task.id}_${assignment.id}`}
            className="grid grid-cols-[1fr_100px_60px_60px] gap-1 px-4 py-1.5 hover:bg-accent/30 cursor-pointer items-center group text-xs"
            onClick={() => onOpenTask(task.id)}
            title={`${task.task_name} (클릭하여 상세 편집)`}
          >
            <span className="truncate flex items-center gap-1">
              <span className="truncate">{task.task_name}</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
            </span>
            <span className="text-center text-muted-foreground font-mono text-[10px]">
              {startStr} ~ {endStr}
            </span>
            <span className="text-right font-mono">
              <span className={cn(
                progressPct >= 100 ? 'text-green-600 dark:text-green-400' :
                progressPct > 0 ? 'text-blue-600 dark:text-blue-400' :
                'text-muted-foreground'
              )}>
                {progressPct}%
              </span>
            </span>
            <span className="text-right font-mono text-muted-foreground">
              {assignment.allocation_percent}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// Main ResourceManager component
// ============================================================

export function ResourceManager() {
  const {
    companies, members, assignments,
    addCompany, updateCompany, deleteCompany,
    addMember, updateMember, deleteMember,
  } = useResourceStore()

  const tasks = useTaskStore((s) => s.tasks)
  const currentUser = useAuthStore((s) => s.currentUser)
  const authMode = useAuthStore((s) => s.authMode)
  const allUsers = useAuthStore((s) => s.users).filter((u) => u.approved)
  const fetchAllUsers = useAuthStore((s) => s.fetchAllUsers)
  const project = useProjectStore((s) => s.currentProject)
  const { addProjectMember, projectMembers, updateProjectMemberRole } = useProjectStore()
  const loadOrganization = useOrganizationStore((s) => s.loadOrganization)
  const getUserAssignment = useOrganizationStore((s) => s.getUserAssignment)
  const orgCompanies = useOrganizationStore((s) => s.companies)
  const orgDepartments = useOrganizationStore((s) => s.departments)
  const orgTeams = useOrganizationStore((s) => s.teams)
  const isAdmin = currentUser?.role === 'admin'
  const myProjectRole = project ? useProjectStore.getState().getMyProjectRole(project.id, currentUser?.id || '') : null
  const canManageMembers = isAdmin || myProjectRole === 'pm'

  // 현재 프로젝트에 이미 참여 중인 회원만 제외
  const currentProjectMemberUserIds = new Set(
    project
      ? projectMembers
          .filter((member) => member.projectId === project.id)
          .map((member) => member.userId)
      : []
  )
  const availableUsers = allUsers.filter((user) => user.role !== 'admin' && !currentProjectMemberUserIds.has(user.id))
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState<ProjectRole>('editor')
  const [addMode, setAddMode] = useState<'user' | 'manual'>('user')

  // Company form
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyShort, setNewCompanyShort] = useState('')
  const [newCompanyColor, setNewCompanyColor] = useState(COLORS[0])

  // Member form
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('')
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [newMemberCompany, setNewMemberCompany] = useState('')

  // Expanded member (to show task list)
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)

  // Task detail dialog
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const usersByEmail = useMemo(() => {
    const map = new Map<string, (typeof allUsers)[number]>()
    for (const user of allUsers) {
      const normalizedEmail = user.email?.trim().toLowerCase()
      if (!normalizedEmail) continue
      map.set(normalizedEmail, user)
    }
    return map
  }, [allUsers])

  const getLinkedUser = useCallback((email?: string) => {
    const normalizedEmail = email?.trim().toLowerCase()
    if (!normalizedEmail) return undefined
    return usersByEmail.get(normalizedEmail)
  }, [usersByEmail])

  const getProjectRoleLabel = useCallback((role?: ProjectRole) => {
    switch (role) {
      case 'pm':
        return 'PM'
      case 'viewer':
        return '뷰어'
      case 'owner':
        return '소유자'
      case 'editor':
      default:
        return '편집자'
    }
  }, [])

  const handleOpenTask = useCallback((taskId: string) => {
    setEditTaskId(taskId)
    setDialogOpen(true)
  }, [])

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setEditTaskId(null)
  }, [])

  useEffect(() => {
    loadOrganization()
  }, [loadOrganization])

  useEffect(() => {
    if (authMode !== 'supabase') return
    if (!canManageMembers) return
    fetchAllUsers()
  }, [authMode, canManageMembers, fetchAllUsers])

  useEffect(() => {
    if (!selectedUserId) return
    const assignment = getUserAssignment(selectedUserId)
    const orgCompany = assignment ? orgCompanies.find((company) => company.id === assignment.company_id) : undefined
    if (!orgCompany) return

    const matchedProjectCompany = companies.find((company) =>
      company.name.trim().toLowerCase() === orgCompany.name.trim().toLowerCase() ||
      company.shortName.trim().toLowerCase() === (orgCompany.short_name || '').trim().toLowerCase()
    )

    if (matchedProjectCompany) {
      setNewMemberCompany(matchedProjectCompany.id)
    }
  }, [selectedUserId, getUserAssignment, orgCompanies, companies])

  const toggleMemberExpand = useCallback((memberId: string) => {
    setExpandedMemberId((prev) => prev === memberId ? null : memberId)
  }, [])

  // Task count per member
  const memberTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of assignments) {
      const task = tasks.find((t) => t.id === a.task_id && !t.is_group)
      if (task) {
        counts[a.member_id] = (counts[a.member_id] || 0) + 1
      }
    }
    return counts
  }, [assignments, tasks])

  const handleAddCompany = () => {
    if (!newCompanyName.trim()) return
    addCompany({
      id: crypto.randomUUID(),
      name: newCompanyName,
      shortName: newCompanyShort || newCompanyName.substring(0, 3),
      color: newCompanyColor,
      created_at: new Date().toISOString(),
    })
    setNewCompanyName('')
    setNewCompanyShort('')
  }

  const handleAddMember = () => {
    if (!newMemberName.trim() || !newMemberCompany) return
    addMember({
      id: crypto.randomUUID(),
      company_id: newMemberCompany,
      name: newMemberName,
      role: newMemberRole || undefined,
      email: newMemberEmail || undefined,
      created_at: new Date().toISOString(),
    })
    setNewMemberName('')
    setNewMemberRole('')
    setNewMemberEmail('')
  }

  const ensureProjectCompanyForOrg = useCallback((orgCompany: OrganizationCompany) => {
    const matched = companies.find((company) =>
      company.name.trim().toLowerCase() === orgCompany.name.trim().toLowerCase() ||
      company.shortName.trim().toLowerCase() === (orgCompany.short_name || '').trim().toLowerCase()
    )
    if (matched) {
      return matched.id
    }

    const newCompanyId = crypto.randomUUID()
    addCompany({
      id: newCompanyId,
      name: orgCompany.name,
      shortName: orgCompany.short_name || orgCompany.name.substring(0, 3),
      color: orgCompany.color || COLORS[0],
      created_at: new Date().toISOString(),
    })
    return newCompanyId
  }, [addCompany, companies])

  useEffect(() => {
    if (orgCompanies.length === 0) return

    orgCompanies.forEach((orgCompany) => {
      const matched = companies.find((company) =>
        company.name.trim().toLowerCase() === orgCompany.name.trim().toLowerCase() ||
        company.shortName.trim().toLowerCase() === (orgCompany.short_name || '').trim().toLowerCase()
      )
      if (!matched) {
        ensureProjectCompanyForOrg(orgCompany)
      }
    })
  }, [companies, ensureProjectCompanyForOrg, orgCompanies])

  const companySourceOptions = useMemo(() => {
    if (orgCompanies.length > 0) {
      return orgCompanies.map((company) => ({
        id: companies.find((projectCompany) =>
          projectCompany.name.trim().toLowerCase() === company.name.trim().toLowerCase() ||
          projectCompany.shortName.trim().toLowerCase() === (company.short_name || '').trim().toLowerCase()
        )?.id || '',
        label: company.name,
        shortLabel: company.short_name || company.name,
        color: company.color || '#2563eb',
        managedByOrganization: true,
      }))
    }

    return companies.map((company) => ({
      id: company.id,
      label: company.name,
      shortLabel: company.shortName,
      color: company.color,
      managedByOrganization: false,
    }))
  }, [companies, orgCompanies])

  const companyMemberCounts = useMemo(() => {
    return members.reduce<Record<string, number>>((acc, member) => {
      const linkedUser = getLinkedUser(member.email)
      const assignment = linkedUser ? getUserAssignment(linkedUser.id) : undefined
      const orgCompany = assignment ? orgCompanies.find((company) => company.id === assignment.company_id) : undefined
      const projectCompany = companies.find((company) => company.id === member.company_id)
      const key = orgCompany?.id || projectCompany?.id || 'ungrouped'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }, [members, getLinkedUser, getUserAssignment, orgCompanies, companies])

  const memberTree = useMemo(() => {
    type TreeMember = {
      member: (typeof members)[number]
      linkedUser?: (typeof allUsers)[number]
      projectRole?: ProjectRole
      taskCount: number
      orgPath?: string
    }

    type TeamNode = {
      id: string
      name: string
      members: TreeMember[]
    }

    type DepartmentNode = {
      id: string
      name: string
      teamNodes: TeamNode[]
      directMembers: TreeMember[]
    }

    type CompanyNode = {
      id: string
      name: string
      color: string
      shortName?: string
      departments: DepartmentNode[]
      directMembers: TreeMember[]
    }

    const tree: CompanyNode[] = []

    const ensureCompanyNode = (id: string, name: string, color: string, shortName?: string) => {
      let node = tree.find((item) => item.id === id)
      if (!node) {
        node = { id, name, color, shortName, departments: [], directMembers: [] }
        tree.push(node)
      }
      return node
    }

    const ensureDepartmentNode = (companyNode: CompanyNode, id: string, name: string) => {
      let node = companyNode.departments.find((item) => item.id === id)
      if (!node) {
        node = { id, name, teamNodes: [], directMembers: [] }
        companyNode.departments.push(node)
      }
      return node
    }

    const ensureTeamNode = (departmentNode: DepartmentNode, id: string, name: string) => {
      let node = departmentNode.teamNodes.find((item) => item.id === id)
      if (!node) {
        node = { id, name, members: [] }
        departmentNode.teamNodes.push(node)
      }
      return node
    }

    members.forEach((member) => {
      const linkedUser = getLinkedUser(member.email)
      const assignment = linkedUser ? getUserAssignment(linkedUser.id) : undefined
      const orgCompany = assignment ? orgCompanies.find((company) => company.id === assignment.company_id) : undefined
      const orgDepartment = assignment ? orgDepartments.find((department) => department.id === assignment.department_id) : undefined
      const orgTeam = assignment?.team_id ? orgTeams.find((team) => team.id === assignment.team_id) : undefined
      const projectCompany = companies.find((company) => company.id === member.company_id)
      const projectRole = (linkedUser && project)
        ? projectMembers.find((m) => m.projectId === project.id && m.userId === linkedUser.id)?.role
        : undefined

      const treeMember: TreeMember = {
        member,
        linkedUser,
        projectRole,
        taskCount: memberTaskCounts[member.id] || 0,
        orgPath: linkedUser ? useOrganizationStore.getState().getPathLabel(linkedUser.id) : undefined,
      }

      const companyNode = ensureCompanyNode(
        orgCompany?.id || projectCompany?.id || 'ungrouped',
        orgCompany?.name || projectCompany?.name || '조직 미지정',
        orgCompany?.color || projectCompany?.color || '#64748b',
        orgCompany?.short_name || projectCompany?.shortName
      )

      if (!orgDepartment) {
        companyNode.directMembers.push(treeMember)
        return
      }

      const departmentNode = ensureDepartmentNode(companyNode, orgDepartment.id, orgDepartment.name)
      if (!orgTeam) {
        departmentNode.directMembers.push(treeMember)
        return
      }

      const teamNode = ensureTeamNode(departmentNode, orgTeam.id, orgTeam.name)
      teamNode.members.push(treeMember)
    })

    return tree
      .map((companyNode) => ({
        ...companyNode,
        departments: companyNode.departments
          .map((departmentNode) => ({
            ...departmentNode,
            teamNodes: departmentNode.teamNodes.sort((a, b) => a.name.localeCompare(b.name, 'ko')),
            directMembers: departmentNode.directMembers.sort((a, b) => a.member.name.localeCompare(b.member.name, 'ko')),
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
        directMembers: companyNode.directMembers.sort((a, b) => a.member.name.localeCompare(b.member.name, 'ko')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [members, allUsers, getLinkedUser, getUserAssignment, orgCompanies, orgDepartments, orgTeams, companies, project, projectMembers, memberTaskCounts])

  const renderMemberRow = useCallback((params: {
    member: (typeof members)[number]
    linkedUser?: (typeof allUsers)[number]
    projectRole?: ProjectRole
    taskCount: number
    color: string
    orgPath?: string
  }) => {
    const { member, linkedUser, projectRole, taskCount, color, orgPath } = params
    const isExpanded = expandedMemberId === member.id
    const isLinkedUser = !!linkedUser

    return (
      <div key={member.id}>
        <div
          className={cn(
            "flex items-center px-4 py-2 hover:bg-accent/30 text-sm gap-2 cursor-pointer transition-colors rounded-lg",
            isExpanded && "bg-accent/20"
          )}
          onClick={() => toggleMemberExpand(member.id)}
        >
          <span className="text-muted-foreground w-4 flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>

          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: color }}>
            {member.name.charAt(0)}
          </div>

          <div className="min-w-0 flex-1 grid grid-cols-[minmax(120px,180px)_minmax(180px,1fr)_minmax(160px,240px)] items-center gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate">{member.name}</span>
              {isLinkedUser && (
                <span className="text-[10px] text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-md flex-shrink-0">
                  회원
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs text-muted-foreground/80">{member.email || '이메일 없음'}</div>
              {orgPath && <div className="truncate text-[11px] text-muted-foreground">{orgPath}</div>}
            </div>
            <div className="flex items-center gap-2 justify-end">
              {taskCount > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md">
                  <ClipboardList className="h-3 w-3" />
                  {taskCount}
                </span>
              )}
              {project && linkedUser && (
                canManageMembers ? (
                  <Select
                    value={projectRole || 'viewer'}
                    onValueChange={(v) => {
                      if (!v) return
                      const nextRole = v as ProjectRole
                      const hasProjectMember = projectMembers.some((m) => m.projectId === project.id && m.userId === linkedUser.id)
                      if (hasProjectMember) {
                        updateProjectMemberRole(project.id, linkedUser.id, nextRole)
                      } else {
                        addProjectMember({ projectId: project.id, userId: linkedUser.id, role: nextRole })
                      }
                      updateMember(member.id, {
                        role: getProjectRoleLabel(nextRole),
                      })
                    }}
                  >
                    <SelectTrigger
                      className="h-7 w-[96px] text-xs flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pm" className="text-xs">PM</SelectItem>
                      <SelectItem value="editor" className="text-xs">편집자</SelectItem>
                      <SelectItem value="viewer" className="text-xs">뷰어</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-muted-foreground bg-muted/70 px-2 py-1 rounded-md flex-shrink-0 min-w-[72px] text-center">
                    {getProjectRoleLabel(projectRole)}
                  </span>
                )
              )}
              {!isLinkedUser && (
                <>
                  <input
                    className="font-medium bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-20"
                    defaultValue={member.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => updateMember(member.id, { name: e.target.value })}
                  />
                  <input
                    className="text-xs text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-24"
                    defaultValue={member.email || ''}
                    placeholder="이메일"
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => updateMember(member.id, { email: e.target.value || undefined })}
                  />
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`"${member.name}" 인원을 삭제하시겠습니까?`)) {
                    deleteMember(member.id)
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </Button>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="bg-muted/10 border-t border-border/20 rounded-b-lg">
            <MemberTaskList memberId={member.id} onOpenTask={handleOpenTask} />
          </div>
        )}
      </div>
    )
  }, [expandedMemberId, toggleMemberExpand, project, canManageMembers, projectMembers, updateProjectMemberRole, addProjectMember, updateMember, getProjectRoleLabel, deleteMember, handleOpenTask])

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-lg font-bold text-foreground">담당자 관리</h2>
        <p className="text-sm text-muted-foreground mt-0.5">회사 및 인원을 등록하고 관리합니다</p>
      </div>

      {/* ========== 회사 기준 ========== */}
      <div className="bg-card rounded-xl border border-border/50 shadow-sm">
        <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{orgCompanies.length > 0 ? '조직 회사 기준' : '회사 관리'}</h3>
          <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md font-medium">
            {orgCompanies.length > 0 ? orgCompanies.length : companies.length}개
          </span>
        </div>

        {orgCompanies.length === 0 && (
          <div className="p-4 border-b bg-muted/30">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">회사명</label>
                <Input
                  placeholder="예: (주) 지엠티"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                />
              </div>
              <div className="w-28">
                <label className="text-xs text-muted-foreground">약칭</label>
                <Input
                  placeholder="GMT"
                  value={newCompanyShort}
                  onChange={(e) => setNewCompanyShort(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">색상</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    value={newCompanyColor}
                    onChange={(e) => setNewCompanyColor(e.target.value)}
                    className="w-8 h-8 rounded border border-border cursor-pointer p-0"
                  />
                  <span className="text-xs text-muted-foreground font-mono">{newCompanyColor}</span>
                </div>
              </div>
              <Button onClick={handleAddCompany} size="sm" className="mb-0.5">
                <Plus className="h-4 w-4 mr-1" />
                추가
              </Button>
            </div>
          </div>
        )}

        {orgCompanies.length > 0 && (
          <div className="px-4 py-3 border-b bg-muted/30 text-xs text-muted-foreground">
            조직 관리에서 등록한 회사를 기준으로 담당자 소속을 표시합니다. 회사 추가/수정은 사용자 관리의 `조직 관리` 탭에서 진행하세요.
          </div>
        )}

        <div className="divide-y">
          {(orgCompanies.length > 0
            ? orgCompanies.map((company) => ({
                id: company.id,
                name: company.name,
                shortName: company.short_name || '',
                color: company.color || '#2563eb',
                managedByOrganization: true,
              }))
            : companies.map((company) => ({
                id: company.id,
                name: company.name,
                shortName: company.shortName,
                color: company.color,
                managedByOrganization: false,
              }))
          ).map((company) => (
            <div key={company.id} className="flex items-center px-4 py-2.5 hover:bg-accent/30 gap-2">
              {company.managedByOrganization ? (
                <div className="w-6 h-6 rounded-full border border-border/40" style={{ backgroundColor: company.color }} />
              ) : (
                <input
                  type="color"
                  value={company.color}
                  onChange={(e) => updateCompany(company.id, { color: e.target.value })}
                  className="w-6 h-6 rounded-full border-0 cursor-pointer p-0"
                  title="색상 변경"
                />
              )}
              <div className="flex-1 min-w-0">
                {company.managedByOrganization ? (
                  <>
                    <div className="font-medium text-sm">{company.name}</div>
                    <div className="text-xs text-muted-foreground ml-1">{company.shortName}</div>
                  </>
                ) : (
                  <>
                    <input
                      className="font-medium text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-full"
                      defaultValue={company.name}
                      onBlur={(e) => updateCompany(company.id, { name: e.target.value })}
                    />
                    <input
                      className="text-xs text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none w-16 ml-1"
                      defaultValue={company.shortName}
                      onBlur={(e) => updateCompany(company.id, { shortName: e.target.value })}
                    />
                  </>
                )}
              </div>
              <span className="text-xs text-muted-foreground mr-2">
                {companyMemberCounts[company.id] || 0}명
              </span>
              {!company.managedByOrganization && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    if (confirm(`"${company.name}" 회사를 삭제하시겠습니까?\n소속 인원도 함께 삭제됩니다.`)) {
                      deleteCompany(company.id)
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ========== 인원 관리 + 담당자별 작업 ========== */}
      <div className="bg-card rounded-xl border border-border/50 shadow-sm">
        <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">인원 관리</h3>
          <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md font-medium">{members.length}명</span>
          <span className="ml-auto text-[10px] text-muted-foreground">담당자를 클릭하면 배정 작업 목록을 확인할 수 있습니다</span>
        </div>

        {/* 인원 추가 - 2가지 방법 */}
        {canManageMembers && (
        <div className="p-4 border-b bg-muted/30 space-y-3">
          {/* 탭 전환 */}
          <div className="flex gap-1">
            <button
              className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors",
                addMode === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
              )}
              onClick={() => setAddMode('user')}
            >
              등록회원 추가
            </button>
            <button
              className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors",
                addMode === 'manual' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
              )}
              onClick={() => setAddMode('manual')}
            >
              수동 입력
            </button>
          </div>

          {addMode === 'user' ? (
            /* 등록회원에서 추가 */
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">등록회원</label>
                <OrganizationUserPicker
                  users={availableUsers}
                  value={selectedUserId || undefined}
                  onChange={(userId) => setSelectedUserId(userId || '')}
                  className="w-full max-w-[640px]"
                  popoverClassName="w-[min(92vw,720px)] max-w-[720px]"
                />
              </div>
              {selectedUserId && (
                <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                  <div className="text-[11px] text-muted-foreground mb-1">조직 경로</div>
                  <OrganizationPath userId={selectedUserId} emptyLabel="조직 미지정" />
                </div>
              )}
              <div className="flex gap-2 items-end">
              <div className="w-48">
                <label className="text-xs text-muted-foreground">소속 회사</label>
                <Select value={newMemberCompany} onValueChange={(v) => v && setNewMemberCompany(v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="회사">
                      {newMemberCompany ? companySourceOptions.find((c) => c.id === newMemberCompany)?.shortLabel : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {companySourceOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.shortLabel}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24">
                <label className="text-xs text-muted-foreground">프로젝트 역할</label>
                <Select value={selectedRole} onValueChange={(v) => v && setSelectedRole(v as ProjectRole)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pm" className="text-xs">PM</SelectItem>
                    <SelectItem value="editor" className="text-xs">편집자</SelectItem>
                    <SelectItem value="viewer" className="text-xs">뷰어</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" className="h-9" disabled={!selectedUserId || !newMemberCompany} onClick={() => {
                const user = allUsers.find((u) => u.id === selectedUserId)
                if (!user || !newMemberCompany) return
                const normalizedEmail = user.email?.trim().toLowerCase()
                const roleLabel = selectedRole === 'pm' ? 'PM' : selectedRole === 'editor' ? '편집자' : '뷰어'
                const userOrgAssignment = getUserAssignment(user.id)
                const mappedOrgCompany = userOrgAssignment
                  ? orgCompanies.find((company) => company.id === userOrgAssignment.company_id)
                  : undefined
                const existingMember = members.find((member) => {
                  const memberEmail = member.email?.trim().toLowerCase()
                  return !!normalizedEmail && memberEmail === normalizedEmail
                })

                if (existingMember) {
                  updateMember(existingMember.id, {
                    company_id: newMemberCompany,
                    name: user.name,
                    email: user.email,
                    role: mappedOrgCompany ? `${roleLabel} · ${mappedOrgCompany.name}` : roleLabel,
                  })
                } else {
                  addMember({
                    id: crypto.randomUUID(),
                    company_id: newMemberCompany,
                    name: user.name,
                    email: user.email,
                    role: mappedOrgCompany ? `${roleLabel} · ${mappedOrgCompany.name}` : roleLabel,
                    created_at: new Date().toISOString(),
                  })
                }

                if (project) addProjectMember({ projectId: project.id, userId: user.id, role: selectedRole })
                setSelectedUserId('')
              }}>
                <Plus className="h-4 w-4 mr-1" />추가
              </Button>
              </div>
            </div>
          ) : (
            /* 수동 입력 */
            <div className="flex gap-2 items-end">
              <div className="w-36">
                <label className="text-xs text-muted-foreground">소속 회사</label>
                <Select value={newMemberCompany} onValueChange={(v) => v && setNewMemberCompany(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="회사">
                      {newMemberCompany ? companySourceOptions.find((c) => c.id === newMemberCompany)?.shortLabel : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {companySourceOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.shortLabel}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">이름</label>
                <Input placeholder="홍길동" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} />
              </div>
              <div className="w-28">
                <label className="text-xs text-muted-foreground">직책</label>
                <Input placeholder="PM" value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">이메일</label>
                <Input placeholder="email@company.com" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} />
              </div>
              <Button onClick={handleAddMember} size="sm" className="mb-0.5" disabled={!newMemberCompany}>
                <Plus className="h-4 w-4 mr-1" />추가
              </Button>
            </div>
          )}
        </div>
        )}

        {/* 인원 목록 (회사 > 부서 > 팀 > 사람) */}
        <div className="p-4 space-y-4">
          {memberTree.map((companyNode) => (
            <div key={companyNode.id} className="rounded-xl border border-border/50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/40 border-b border-border/40">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: companyNode.color }} />
                <div className="font-semibold text-sm">{companyNode.name}</div>
                <span className="text-[11px] text-muted-foreground">{companyMemberCounts[companyNode.id] || 0}명</span>
              </div>

              <div className="p-3 space-y-3">
                {companyNode.directMembers.length > 0 && (
                  <div className="rounded-lg border border-dashed border-border/50 bg-muted/15">
                    <div className="px-4 py-2 text-xs font-semibold text-muted-foreground">부서 미지정</div>
                    <div className="px-2 pb-2 space-y-1">
                      {companyNode.directMembers.map((treeMember) => renderMemberRow({
                        member: treeMember.member,
                        linkedUser: treeMember.linkedUser,
                        projectRole: treeMember.projectRole,
                        taskCount: treeMember.taskCount,
                        color: companyNode.color,
                        orgPath: treeMember.orgPath,
                      }))}
                    </div>
                  </div>
                )}

                {companyNode.departments.map((departmentNode) => (
                  <div key={departmentNode.id} className="rounded-lg border border-border/40 bg-background">
                    <div className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">부서</span>
                      <span className="font-medium text-sm">{departmentNode.name}</span>
                    </div>

                    <div className="p-3 space-y-3">
                      {departmentNode.directMembers.length > 0 && (
                        <div className="rounded-lg border border-dashed border-border/50 bg-muted/15">
                          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground">팀 미지정</div>
                          <div className="px-2 pb-2 space-y-1">
                            {departmentNode.directMembers.map((treeMember) => renderMemberRow({
                              member: treeMember.member,
                              linkedUser: treeMember.linkedUser,
                              projectRole: treeMember.projectRole,
                              taskCount: treeMember.taskCount,
                              color: companyNode.color,
                              orgPath: treeMember.orgPath,
                            }))}
                          </div>
                        </div>
                      )}

                      {departmentNode.teamNodes.map((teamNode) => (
                        <div key={teamNode.id} className="rounded-lg border border-border/40 bg-muted/10 overflow-hidden">
                          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground border-b border-border/30">
                            팀 · {teamNode.name}
                          </div>
                          <div className="px-2 py-2 space-y-1">
                            {teamNode.members.map((treeMember) => renderMemberRow({
                              member: treeMember.member,
                              linkedUser: treeMember.linkedUser,
                              projectRole: treeMember.projectRole,
                              taskCount: treeMember.taskCount,
                              color: companyNode.color,
                              orgPath: treeMember.orgPath,
                            }))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Task Edit Dialog */}
      <TaskEditDialog
        taskId={editTaskId}
        open={dialogOpen}
        onClose={handleCloseDialog}
      />
    </div>
  )
}
