import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Search, Users, ClipboardList, ExternalLink, UserCheck, List, LayoutGrid, ChevronDown, ChevronRight, Clock, ArrowUpDown, Building2, FolderTree, Layers3 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useResourceStore } from '@/stores/resource-store'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { useAuthStore } from '@/stores/auth-store'
import { useOrganizationStore } from '@/stores/organization-store'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { TaskEditDialog } from '@/components/gantt/TaskEditDialog'
import { CardDetailModal } from '@/components/mytasks/CardDetailModal'
import { OrganizationPath } from '@/components/organization/OrganizationPath'
import { richTextToPlainText } from '@/lib/rich-text'
import type { Task } from '@/lib/types'
import type { TaskAssignment, TaskDetail, TeamMember } from '@/lib/resource-types'

// ============================================================
// Types
// ============================================================

interface MemberTaskInfo {
  task: Task
  assignment: TaskAssignment
  details: TaskDetail[]
}

interface MemberTreeNode {
  member: TeamMember
  linkedUserId?: string
  companyColor: string
  companyName: string
  departmentName?: string
  teamName?: string
}

interface MemberTreeTeam {
  id: string
  name: string
  members: MemberTreeNode[]
}

interface MemberTreeDepartment {
  id: string
  name: string
  directMembers: MemberTreeNode[]
  teams: MemberTreeTeam[]
}

interface MemberTreeCompany {
  id: string
  name: string
  color: string
  directMembers: MemberTreeNode[]
  departments: MemberTreeDepartment[]
}

const MEMBER_TASKS_VIEW_MODE_KEY = 'xlgantt:memberTasks:detailViewMode'

// ============================================================
// Status badge component
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; tone: string }> = {
  todo: { label: '대기', tone: 'mtv-status-badge--todo' },
  in_progress: { label: '진행', tone: 'mtv-status-badge--progress' },
  done: { label: '완료', tone: 'mtv-status-badge--done' },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.todo
  return (
    <span className={cn('mtv-status-badge', config.tone)}>
      {config.label}
    </span>
  )
}

// ============================================================
// Role badge component
// ============================================================

const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  owner: { label: 'Owner', bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-600 dark:text-purple-400' },
  pm: { label: 'PM', bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-600 dark:text-orange-400' },
  editor: { label: '편집자', bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-600 dark:text-blue-400' },
  viewer: { label: '뷰어', bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' },
}

function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.viewer
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', config.bg, config.text)}>
      {config.label}
    </span>
  )
}

// ============================================================
// Main MemberTasksView
// ============================================================

export function MemberTasksView() {
  const { companies, members, assignments, taskDetails } = useResourceStore()
  const tasks = useTaskStore((s) => s.tasks)
  const project = useProjectStore((s) => s.currentProject)
  const { projectMembers } = useProjectStore()
  const allUsers = useAuthStore((s) => s.users)
  const orgCompanies = useOrganizationStore((s) => s.companies)
  const orgDepartments = useOrganizationStore((s) => s.departments)
  const orgTeams = useOrganizationStore((s) => s.teams)
  const orgAssignments = useOrganizationStore((s) => s.assignments)
  const loadOrganization = useOrganizationStore((s) => s.loadOrganization)

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [hideDone, setHideDone] = useState(false)
  const [detailViewMode, setDetailViewMode] = useState<'list' | 'card'>(() => {
    if (typeof window === 'undefined') return 'list'
    const saved = window.localStorage.getItem(MEMBER_TASKS_VIEW_MODE_KEY)
    return saved === 'card' || saved === 'list' ? saved : 'list'
  })
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set())
  const [cardDetailId, setCardDetailId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'wbs' | 'name' | 'allocation' | 'date' | 'progress'>('wbs')
  const [sortAsc, setSortAsc] = useState(true)
  const [taskSearchQuery, setTaskSearchQuery] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set())
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set())
  const lastCollapsedMemberIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(MEMBER_TASKS_VIEW_MODE_KEY, detailViewMode)
  }, [detailViewMode])

  useEffect(() => {
    loadOrganization()
  }, [loadOrganization])

  const handleOpenTask = useCallback((taskId: string) => {
    setEditTaskId(taskId)
    setDialogOpen(true)
  }, [])

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setEditTaskId(null)
  }, [])

  // Task count per member (non-group tasks only, task_assignments + detail assignee_ids)
  const memberTaskCounts = useMemo(() => {
    const memberTasks: Record<string, Set<string>> = {}
    // 1. task_assignments 기반
    for (const a of assignments) {
      const task = tasks.find((t) => t.id === a.task_id && !t.is_group && !t.archived_at)
      if (task) {
        if (!memberTasks[a.member_id]) memberTasks[a.member_id] = new Set()
        memberTasks[a.member_id].add(task.id)
      }
    }
    // 2. task_details.assignee_ids 기반 (세부항목 담당자도 포함)
    for (const detail of taskDetails) {
      const task = tasks.find((t) => t.id === detail.task_id && !t.is_group && !t.archived_at)
      if (!task) continue
      const assigneeIds = detail.assignee_ids || (detail.assignee_id ? [detail.assignee_id] : [])
      for (const memberId of assigneeIds) {
        if (!memberTasks[memberId]) memberTasks[memberId] = new Set()
        memberTasks[memberId].add(task.id)
      }
    }
    const counts: Record<string, number> = {}
    for (const [memberId, taskSet] of Object.entries(memberTasks)) {
      counts[memberId] = taskSet.size
    }
    return counts
  }, [assignments, tasks, taskDetails])

  // Completion rate per member (task_assignments + detail assignee_ids)
  const memberCompletionRates = useMemo(() => {
    const rates: Record<string, number> = {}
    for (const member of members) {
      // task_assignments + detail assignee_ids 합산
      const taskIdSet = new Set<string>()
      for (const a of assignments) {
        if (a.member_id === member.id) taskIdSet.add(a.task_id)
      }
      for (const d of taskDetails) {
        const ids = d.assignee_ids || (d.assignee_id ? [d.assignee_id] : [])
        if (ids.includes(member.id)) taskIdSet.add(d.task_id)
      }
      const memberTasks = [...taskIdSet]
        .map((tid) => tasks.find((t) => t.id === tid && !t.is_group))
        .filter(Boolean) as Task[]
      if (memberTasks.length === 0) {
        rates[member.id] = 0
        continue
      }
      const totalProgress = memberTasks.reduce((sum, t) => sum + (t.actual_progress || 0), 0)
      rates[member.id] = totalProgress / memberTasks.length
    }
    return rates
  }, [members, assignments, tasks, taskDetails])

  // Project role per member (match by email or name, case-insensitive)
  const memberProjectRoles = useMemo(() => {
    if (!project) return {} as Record<string, string>
    const currentProjectMembers = projectMembers.filter((m) => m.projectId === project.id)
    const roles: Record<string, string> = {}
    for (const member of members) {
      // Find matching user by email (case-insensitive) or name
      const matchedUser = allUsers.find(
        (u) => (member.email && u.email?.toLowerCase() === member.email.toLowerCase()) || u.name === member.name
      )
      if (matchedUser) {
        const pm = currentProjectMembers.find((m) => m.userId === matchedUser.id)
        if (pm) roles[member.id] = pm.role
      }
    }
    return roles
  }, [project, projectMembers, members, allUsers])

  const resolveLinkedUser = useCallback((member: TeamMember) => {
    if (member.linked_user_id) {
      return allUsers.find((user) => user.id === member.linked_user_id)
    }
    return allUsers.find(
      (user) => (member.email && user.email?.toLowerCase() === member.email.toLowerCase()) || user.name === member.name
    )
  }, [allUsers])

  // Filter members by search query and build organization tree
  const groupedMemberTree = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    const orgAssignmentMap = new Map(orgAssignments.map((assignment) => [assignment.user_id, assignment]))
    const grouped = new Map<string, MemberTreeCompany>()

    for (const member of members) {
      const linkedUser = resolveLinkedUser(member)
      const orgAssignment = linkedUser ? orgAssignmentMap.get(linkedUser.id) : undefined
      const orgCompany = orgAssignment ? orgCompanies.find((item) => item.id === orgAssignment.company_id) : undefined
      const projectCompany = companies.find((company) => company.id === member.company_id)
      const companyId = orgCompany?.id || `project-${projectCompany?.id || 'ungrouped'}`
      const companyName = orgCompany?.name || projectCompany?.name || '기타 담당자'
      const companyColor = orgCompany?.color || projectCompany?.color || '#64748b'
      const departmentName = orgAssignment ? orgDepartments.find((item) => item.id === orgAssignment.department_id)?.name : undefined
      const teamName = orgAssignment?.team_id ? orgTeams.find((item) => item.id === orgAssignment.team_id)?.name : undefined

      const searchable = [
        companyName,
        departmentName,
        teamName,
        member.name,
        member.email,
        member.role,
      ].filter(Boolean).some((field) => field?.toLowerCase().includes(query))

      if (query && !searchable) continue

      const companyNode = grouped.get(companyId) || {
        id: companyId,
        name: companyName,
        color: companyColor,
        directMembers: [],
        departments: [],
      }

      const memberNode: MemberTreeNode = {
        member,
        linkedUserId: linkedUser?.id,
        companyColor,
        companyName,
        departmentName,
        teamName,
      }

      if (!departmentName || !orgAssignment?.department_id) {
        companyNode.directMembers.push(memberNode)
        grouped.set(companyId, companyNode)
        continue
      }

      let departmentNode = companyNode.departments.find((department) => department.id === orgAssignment.department_id)
      if (!departmentNode) {
        departmentNode = {
          id: orgAssignment.department_id,
          name: departmentName,
          directMembers: [],
          teams: [],
        }
        companyNode.departments.push(departmentNode)
      }

      if (!teamName || !orgAssignment.team_id) {
        departmentNode.directMembers.push(memberNode)
      } else {
        let teamNode = departmentNode.teams.find((team) => team.id === orgAssignment.team_id)
        if (!teamNode) {
          teamNode = {
            id: orgAssignment.team_id,
            name: teamName,
            members: [],
          }
          departmentNode.teams.push(teamNode)
        }
        teamNode.members.push(memberNode)
      }

      grouped.set(companyId, companyNode)
    }

    return [...grouped.values()]
      .map((company) => ({
        ...company,
        directMembers: company.directMembers.sort((a, b) => a.member.name.localeCompare(b.member.name, 'ko')),
        departments: company.departments
          .map((department) => ({
            ...department,
            directMembers: department.directMembers.sort((a, b) => a.member.name.localeCompare(b.member.name, 'ko')),
            teams: department.teams
              .map((team) => ({
                ...team,
                members: team.members.sort((a, b) => a.member.name.localeCompare(b.member.name, 'ko')),
              }))
              .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [companies, members, searchQuery, orgAssignments, orgCompanies, orgDepartments, orgTeams, resolveLinkedUser])

  const toggleCompany = useCallback((companyId: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev)
      next.has(companyId) ? next.delete(companyId) : next.add(companyId)
      return next
    })
  }, [])

  const toggleDepartment = useCallback((departmentId: string) => {
    setExpandedDepartments((prev) => {
      const next = new Set(prev)
      next.has(departmentId) ? next.delete(departmentId) : next.add(departmentId)
      return next
    })
  }, [])

  const countCompanyMembers = useCallback((company: MemberTreeCompany) => (
    company.directMembers.length +
    company.departments.reduce(
      (sum, department) => sum + department.directMembers.length + department.teams.reduce((teamSum, team) => teamSum + team.members.length, 0),
      0
    )
  ), [])

  // Total counts
  const totalMembers = members.length
  const totalAssignedTasks = useMemo(() => {
    const taskIds = new Set<string>()
    for (const a of assignments) {
      const task = tasks.find((t) => t.id === a.task_id && !t.is_group && !t.archived_at)
      if (task) taskIds.add(task.id)
    }
    for (const d of taskDetails) {
      if ((d.assignee_ids?.length || 0) > 0 || d.assignee_id) {
        const task = tasks.find((t) => t.id === d.task_id && !t.is_group)
        if (task) taskIds.add(task.id)
      }
    }
    return taskIds.size
  }, [assignments, tasks, taskDetails])

  // WBS 코드 비교 (자연순: 1.1 < 1.2 < 1.10 < 2.1)
  const compareWbs = useCallback((a: string, b: string) => {
    const pa = (a || '').split('.').map(Number)
    const pb = (b || '').split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0, nb = pb[i] ?? 0
      if (na !== nb) return na - nb
    }
    return 0
  }, [])

  // Selected member tasks (task_assignments + detail assignee_ids)
  const selectedMemberTasks: MemberTaskInfo[] = useMemo(() => {
    if (!selectedMemberId) return []
    const memberAssigns = assignments.filter((a) => a.member_id === selectedMemberId)
    const taskIdSet = new Set(memberAssigns.map((a) => a.task_id))
    for (const detail of taskDetails) {
      const ids = detail.assignee_ids || (detail.assignee_id ? [detail.assignee_id] : [])
      if (ids.includes(selectedMemberId)) {
        taskIdSet.add(detail.task_id)
      }
    }
    const result: MemberTaskInfo[] = []
    for (const taskId of taskIdSet) {
      const task = tasks.find((t) => t.id === taskId && !t.is_group)
      if (!task) continue
      if (hideDone && task.actual_progress >= 1) continue
      const assign = memberAssigns.find((a) => a.task_id === taskId) || { id: '', task_id: taskId, member_id: selectedMemberId, allocation_percent: 100, progress_percent: 0 }
      const dets = taskDetails.filter((d) => d.task_id === task.id).sort((a, b) => a.sort_order - b.sort_order)
      result.push({ task, assignment: assign, details: hideDone ? dets.filter((d) => d.status !== 'done') : dets })
    }
    // 정렬
    result.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'wbs') cmp = compareWbs(a.task.wbs_code, b.task.wbs_code)
      else if (sortBy === 'name') cmp = (a.task.task_name || '').localeCompare(b.task.task_name || '', 'ko')
      else if (sortBy === 'date') cmp = (a.task.planned_start || '9999').localeCompare(b.task.planned_start || '9999')
      else if (sortBy === 'progress') cmp = (a.task.actual_progress || 0) - (b.task.actual_progress || 0)
      else if (sortBy === 'allocation') cmp = (a.assignment.allocation_percent || 0) - (b.assignment.allocation_percent || 0)
      return sortAsc ? cmp : -cmp
    })
    return result
  }, [selectedMemberId, assignments, tasks, taskDetails, hideDone, sortBy, sortAsc, compareWbs])

  // 작업명 검색 필터
  const filteredMemberTasks = useMemo(() => {
    if (!taskSearchQuery.trim()) return selectedMemberTasks
    const q = taskSearchQuery.trim().toLowerCase()
    return selectedMemberTasks.filter(({ task, details }) =>
      task.task_name?.toLowerCase().includes(q) ||
      task.wbs_code?.toLowerCase().includes(q) ||
      details.some((d) => d.title.toLowerCase().includes(q))
    )
  }, [selectedMemberTasks, taskSearchQuery])

  const selectedMember = selectedMemberId ? members.find((m) => m.id === selectedMemberId) : null
  const selectedMemberCompany = selectedMember ? companies.find((c) => c.id === selectedMember.company_id) : null

  useEffect(() => {
    if (!selectedMemberId || lastCollapsedMemberIdRef.current === selectedMemberId) return

    const defaultCollapsed = new Set(
      selectedMemberTasks
        .filter(({ details }) => details.length > 0)
        .map(({ task }) => task.id)
    )
    setCollapsedTasks(defaultCollapsed)
    lastCollapsedMemberIdRef.current = selectedMemberId
  }, [selectedMemberId, selectedMemberTasks])

  useEffect(() => {
    if (!selectedMemberId) {
      setSelectedTaskId(null)
      return
    }

    const taskIds = filteredMemberTasks.map(({ task }) => task.id)
    if (taskIds.length === 0) {
      setSelectedTaskId(null)
      return
    }

    setSelectedTaskId((prev) => (prev && taskIds.includes(prev) ? prev : taskIds[0]))
  }, [selectedMemberId, filteredMemberTasks])

  useEffect(() => {
    if (!selectedMemberId || filteredMemberTasks.length === 0) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      if (isInput) return

      const hasOpenDialog = document.querySelector('[role="dialog"][data-state="open"]')
      if (hasOpenDialog) return

      const taskIds = filteredMemberTasks.map(({ task }) => task.id)
      if (taskIds.length === 0) return

      const currentIndex = selectedTaskId ? taskIds.indexOf(selectedTaskId) : -1
      const selectedInfo = filteredMemberTasks.find(({ task }) => task.id === selectedTaskId)

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          if (currentIndex > 0) setSelectedTaskId(taskIds[currentIndex - 1])
          else if (currentIndex === -1) setSelectedTaskId(taskIds[taskIds.length - 1])
          break
        case 'ArrowDown':
          e.preventDefault()
          if (currentIndex >= 0 && currentIndex < taskIds.length - 1) setSelectedTaskId(taskIds[currentIndex + 1])
          else if (currentIndex === -1) setSelectedTaskId(taskIds[0])
          break
        case 'ArrowLeft':
          if (selectedInfo && selectedInfo.details.length > 0 && !collapsedTasks.has(selectedInfo.task.id)) {
            e.preventDefault()
            setCollapsedTasks((prev) => new Set(prev).add(selectedInfo.task.id))
          }
          break
        case 'ArrowRight':
          if (selectedInfo && selectedInfo.details.length > 0 && collapsedTasks.has(selectedInfo.task.id)) {
            e.preventDefault()
            setCollapsedTasks((prev) => {
              const next = new Set(prev)
              next.delete(selectedInfo.task.id)
              return next
            })
          }
          break
        case 'Enter':
          if (selectedTaskId) {
            e.preventDefault()
            handleOpenTask(selectedTaskId)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedMemberId, filteredMemberTasks, selectedTaskId, collapsedTasks, handleOpenTask])

  return (
    <div className="flex h-full overflow-hidden">
      {/* ===== Left Panel: Member List ===== */}
      <div className="member-panel">
        {/* Summary */}
        <div className="member-panel-head">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">담당자별 업무</h2>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground whitespace-nowrap">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {totalMembers}명
            </span>
            <span className="flex items-center gap-1">
              <ClipboardList className="h-3 w-3" />
              {totalAssignedTasks}건
            </span>
            <label className="flex items-center gap-1 cursor-pointer select-none ml-auto">
              <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="w-3 h-3 rounded accent-primary" />
              <span>완료숨김</span>
            </label>
          </div>
        </div>

        {/* Search */}
        <div className="member-panel-search">
          <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                placeholder="회사/부서/팀/담당자 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {/* Member list grouped by company */}
        <div className="flex-1 overflow-y-auto">
          {groupedMemberTree.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground/50">
              {searchQuery ? '검색 결과가 없습니다' : '등록된 담당자가 없습니다'}
            </div>
          )}
          {groupedMemberTree.map((company) => {
            const isCompanyExpanded = expandedCompanies.has(company.id) || searchQuery.length > 0

            const renderMemberCard = (node: MemberTreeNode, level: 0 | 1 | 2) => {
              const member = node.member
              const isSelected = selectedMemberId === member.id
              const taskCount = memberTaskCounts[member.id] || 0
              const completionRate = memberCompletionRates[member.id] || 0
              const completionPct = Math.round(completionRate * 100)
              const projectRole = memberProjectRoles[member.id]

              return (
                <div
                  key={member.id}
                  className={cn('member-item', isSelected ? 'member-item--active' : 'member-item--idle', level > 0 && 'member-item--nested')}
                  style={{ marginLeft: `${level * 14}px` }}
                  onClick={() => setSelectedMemberId(member.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedMemberId(member.id)
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                      style={{ backgroundColor: node.companyColor }}
                    >
                      {member.name.charAt(0)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{member.name}</span>
                        {projectRole && <RoleBadge role={projectRole} />}
                      </div>
                      {member.role && (
                        <span className="text-[10px] text-muted-foreground">{member.role}</span>
                      )}
                      {node.linkedUserId && (
                        <div className="mt-0.5">
                          <OrganizationPath userId={node.linkedUserId} emptyLabel="" />
                        </div>
                      )}
                    </div>

                    <span className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0',
                      taskCount > 0
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted/60 text-muted-foreground/50'
                    )}>
                      {taskCount}
                    </span>
                  </div>

                  {taskCount > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-muted/60 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            completionPct >= 100
                              ? 'bg-green-500'
                              : completionPct > 0
                                ? 'bg-primary'
                                : 'bg-muted'
                          )}
                          style={{ width: `${Math.min(completionPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-muted-foreground font-mono w-7 text-right">
                        {completionPct}%
                      </span>
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div key={company.id}>
                <button
                  type="button"
                  className="member-company-head w-full"
                  onClick={() => toggleCompany(company.id)}
                >
                  {isCompanyExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: company.color }}>
                    <Building2 className="h-2.5 w-2.5 text-white" />
                  </div>
                  <span className="truncate flex-1 text-left">{company.name}</span>
                  <span className="text-muted-foreground/60 font-normal">({countCompanyMembers(company)})</span>
                </button>

                {isCompanyExpanded && (
                  <div className="pb-1">
                    {company.directMembers.map((node) => renderMemberCard(node, 0))}
                    {company.departments.map((department) => {
                      const isDepartmentExpanded = expandedDepartments.has(department.id) || searchQuery.length > 0
                      const departmentMemberCount =
                        department.directMembers.length + department.teams.reduce((sum, team) => sum + team.members.length, 0)

                      return (
                        <div key={department.id} className="member-department-wrap">
                          <button
                            type="button"
                            className="member-department-head w-full"
                            onClick={() => toggleDepartment(department.id)}
                          >
                            {isDepartmentExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <FolderTree className="h-3.5 w-3.5 text-primary" />
                            <span className="truncate flex-1 text-left">{department.name}</span>
                            <span className="text-muted-foreground/60 font-normal">({departmentMemberCount})</span>
                          </button>

                          {isDepartmentExpanded && (
                            <div className="pb-1">
                              {department.directMembers.map((node) => renderMemberCard(node, 1))}
                              {department.teams.map((team) => (
                                <div key={team.id} className="member-team-wrap">
                                  <div className="member-team-head">
                                    <Layers3 className="h-3.5 w-3.5 text-slate-500" />
                                    <span className="truncate flex-1">팀 · {team.name}</span>
                                    <span className="text-muted-foreground/60 font-normal">({team.members.length})</span>
                                  </div>
                                  {team.members.map((node) => renderMemberCard(node, 2))}
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
      </div>

      {/* ===== Right Panel: Task List ===== */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {!selectedMember ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <UserCheck className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">좌측에서 담당자를 선택하세요</p>
              <p className="text-[11px] text-muted-foreground/40 mt-1">배정된 작업 목록과 세부항목을 확인할 수 있습니다</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0 px-4 py-3 md:px-6 xl:px-8">
            {/* Selected member header */}
            <div className="rounded-t-2xl border border-slate-300 border-b-0 bg-white px-5 py-3 flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: selectedMemberCompany?.color || '#888' }}
              >
                {selectedMember.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{selectedMember.name}</span>
                  {selectedMember.role && (
                    <span className="text-[11px] text-muted-foreground">{selectedMember.role}</span>
                  )}
                  {memberProjectRoles[selectedMember.id] && (
                    <RoleBadge role={memberProjectRoles[selectedMember.id]} />
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                  <span>{selectedMemberCompany?.name}</span>
                  {selectedMember.email && (
                    <>
                      <span className="text-border">|</span>
                      <span>{selectedMember.email}</span>
                    </>
                  )}
                  {selectedMember.email && (
                    <>
                      <span className="text-border">|</span>
                      <OrganizationPath userId={allUsers.find((u) => u.email?.toLowerCase() === selectedMember.email?.toLowerCase() || u.name === selectedMember.name)?.id || ''} emptyLabel="" />
                    </>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-primary">{selectedMemberTasks.length}</div>
                <div className="text-[10px] text-muted-foreground">배정 작업</div>
              </div>
            </div>

            {/* 작업 검색 + 완료 숨기기 */}
            <div className="border border-slate-300/90 border-t-0 bg-white px-4 py-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <Input
                  placeholder="작업명/WBS 검색..."
                  value={taskSearchQuery}
                  onChange={(e) => setTaskSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer select-none flex-shrink-0">
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="w-3 h-3 rounded accent-primary" />
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">완료 숨기기</span>
              </label>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto rounded-b-2xl border border-slate-300 border-t-0 bg-white shadow-[0_18px_40px_-32px_rgba(15,23,42,0.35)]">
              {filteredMemberTasks.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-muted-foreground/50">
                  {taskSearchQuery ? '검색 결과가 없습니다' : '배정된 작업이 없습니다'}
                </div>
              ) : (
                <div className="border-t border-border/50">
                  {/* Table header with sort */}
                  <div className="mtv-table-header">
                    <div className="grid grid-cols-[32px_92px_minmax(0,1fr)_140px_76px_76px] gap-3 flex-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <span></span>
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-0.5 select-none"
                        onClick={() => { if (sortBy === 'wbs') setSortAsc(!sortAsc); else { setSortBy('wbs'); setSortAsc(true) } }}
                      >
                        WBS {sortBy === 'wbs' && <ArrowUpDown className="h-2.5 w-2.5" />}
                      </span>
                      <span
                        className="cursor-pointer hover:text-foreground flex items-center gap-0.5 select-none"
                        onClick={() => { if (sortBy === 'name') setSortAsc(!sortAsc); else { setSortBy('name'); setSortAsc(true) } }}
                      >
                        작업명 {sortBy === 'name' && <ArrowUpDown className="h-2.5 w-2.5" />}
                      </span>
                      <span
                        className="text-center cursor-pointer hover:text-foreground flex items-center justify-center gap-0.5 select-none whitespace-nowrap"
                        onClick={() => { if (sortBy === 'date') setSortAsc(!sortAsc); else { setSortBy('date'); setSortAsc(true) } }}
                      >
                        기간 {sortBy === 'date' && <ArrowUpDown className="h-2.5 w-2.5" />}
                      </span>
                      <span
                        className="text-right cursor-pointer hover:text-foreground flex items-center justify-end gap-0.5 select-none"
                        onClick={() => { if (sortBy === 'progress') setSortAsc(!sortAsc); else { setSortBy('progress'); setSortAsc(false) } }}
                      >
                        진척률 {sortBy === 'progress' && <ArrowUpDown className="h-2.5 w-2.5" />}
                      </span>
                      <span
                        className="text-right cursor-pointer hover:text-foreground flex items-center justify-end gap-0.5 select-none"
                        onClick={() => { if (sortBy === 'allocation') setSortAsc(!sortAsc); else { setSortBy('allocation'); setSortAsc(false) } }}
                      >
                        투입률 {sortBy === 'allocation' && <ArrowUpDown className="h-2.5 w-2.5" />}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <button
                        onClick={() => setDetailViewMode('list')}
                        className={cn('p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40', detailViewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground')}
                        title="리스트 보기"
                      >
                        <List className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDetailViewMode('card')}
                        className={cn('p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40', detailViewMode === 'card' ? 'bg-primary/10 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground')}
                        title="카드 보기"
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Task rows */}
                  {filteredMemberTasks.map(({ task, assignment, details }) => {
                    const startStr = task.planned_start ? format(new Date(task.planned_start), 'MM/dd') : '-'
                    const endStr = task.planned_end ? format(new Date(task.planned_end), 'MM/dd') : '-'
                    const progressPct = Math.round((task.actual_progress || 0) * 100)
                    const isCollapsed = collapsedTasks.has(task.id)
                    const rowTone =
                      progressPct >= 100
                        ? 'mtv-task-row--done'
                        : progressPct > 0
                          ? 'mtv-task-row--progress'
                          : 'mtv-task-row--todo'
                    const toggleCollapse = (e: React.MouseEvent) => {
                      e.stopPropagation()
                      setCollapsedTasks((prev) => {
                        const next = new Set(prev)
                        next.has(task.id) ? next.delete(task.id) : next.add(task.id)
                        return next
                      })
                    }

                    return (
                      <div key={`${task.id}_${assignment.id}`} className="mtv-task-block">
                        {/* Task row */}
                        <div
                          className={cn(
                            'mtv-task-row group',
                            rowTone,
                            selectedTaskId === task.id && 'mtv-task-row--selected'
                          )}
                          onClick={() => setSelectedTaskId(task.id)}
                          onDoubleClick={() => handleOpenTask(task.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setSelectedTaskId(task.id)
                            }
                          }}
                          title={`${task.task_name} (더블클릭하여 상세 편집)`}
                        >
                          {/* 접기 토글 */}
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
                            {details.length > 0 ? (
                              <button
                                onClick={(e) => {
                                  setSelectedTaskId(task.id)
                                  toggleCollapse(e)
                                }}
                                className={cn(
                                  'flex h-6 w-6 items-center justify-center rounded hover:bg-accent/50 text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
                                )}
                                title={isCollapsed ? '세부항목 펼치기' : '세부항목 접기'}
                              >
                                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            ) : (
                              <span className="block h-6 w-6" />
                            )}
                          </span>
                          <span className="mtv-row-wbs">
                            {task.wbs_code}
                          </span>
                          <span className="text-xs truncate flex items-center gap-1.5">
                            <span className="truncate">{task.task_name}</span>
                            {details.length > 0 && <span className="text-[10px] text-slate-600/80 font-semibold">({details.filter(d => d.status === 'done').length}/{details.length})</span>}
                            <ExternalLink className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                          </span>
                          <span className="mtv-row-period">
                            {startStr} ~ {endStr}
                          </span>
                          <span className="text-right text-xs font-mono">
                            <span className={cn(
                              progressPct >= 100 ? 'text-green-600' : progressPct > 0 ? 'text-blue-600' : 'text-muted-foreground'
                            )}>
                              {progressPct}%
                            </span>
                          </span>
                          <span className="text-right text-xs font-mono text-muted-foreground">
                            {assignment.allocation_percent}%
                          </span>
                        </div>

                        {/* Task details - 리스트 모드 */}
                        {details.length > 0 && !isCollapsed && detailViewMode === 'list' && (
                          <div className="mtv-detail-list">
                            {details.map((detail) => (
                              <div
                                key={detail.id}
                                className="mtv-detail-row"
                                onClick={() => setCardDetailId(detail.id)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setCardDetailId(detail.id)
                                  }
                                }}
                              >
                                <StatusBadge status={detail.status} />
                                <span className={cn('flex-1 truncate', detail.status === 'done' && 'line-through text-muted-foreground/60')}>
                                  {detail.title}
                                </span>
                                {detail.due_date && (
                                  <span className={cn('text-[10px] font-mono flex-shrink-0',
                                    detail.status !== 'done' && detail.due_date < new Date().toISOString().slice(0, 10) ? 'text-red-500' : 'text-muted-foreground'
                                  )}>
                                    ~{format(new Date(detail.due_date), 'MM/dd')}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Task details - 카드 모드 */}
                        {details.length > 0 && !isCollapsed && detailViewMode === 'card' && (
                          <div className="bg-muted/10 border-b border-border/20 px-5 py-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pl-7">
                              {details.map((detail) => {
                                const isOverdue = detail.status !== 'done' && detail.due_date && detail.due_date < new Date().toISOString().slice(0, 10)
                                return (
                                  <div
                                    key={detail.id}
                                    className={cn(
                                      'rounded-lg border border-border/40 border-l-[3px] p-2.5 cursor-pointer hover:shadow-md transition-all bg-card',
                                      detail.status === 'done' ? 'border-l-emerald-400' : detail.status === 'in_progress' ? 'border-l-blue-400' : 'border-l-amber-400',
                                      isOverdue && 'ring-1 ring-red-300'
                                    )}
                                    onClick={() => setCardDetailId(detail.id)}
                                  >
                                    <div className="flex items-start gap-2">
                                      <StatusBadge status={detail.status} />
                                      <span className={cn('text-xs font-medium flex-1 leading-snug', detail.status === 'done' && 'line-through text-muted-foreground/60')}>
                                        {detail.title}
                                      </span>
                                    </div>
                                    {(detail.due_date || detail.description) && (
                                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                                        {detail.due_date && (
                                          <span className={cn('flex items-center gap-0.5', isOverdue && 'text-red-500 font-medium')}>
                                            <Clock className="h-2.5 w-2.5" />{detail.due_date}
                                          </span>
                                        )}
                                        {detail.description && <span className="truncate max-w-[100px] italic">{richTextToPlainText(detail.description).split('\n')[0]}</span>}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Task Edit Dialog */}
      <TaskEditDialog
        taskId={editTaskId}
        open={dialogOpen}
        onClose={handleCloseDialog}
      />

      {/* Card Detail Sliding Panel */}
      <CardDetailModal
        detailId={cardDetailId}
        open={!!cardDetailId}
        onClose={() => setCardDetailId(null)}
      />
    </div>
  )
}
