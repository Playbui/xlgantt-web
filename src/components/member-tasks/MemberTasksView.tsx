import { useState, useMemo, useCallback } from 'react'
import { Search, Users, ClipboardList, ExternalLink, UserCheck } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useResourceStore } from '@/stores/resource-store'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { TaskEditDialog } from '@/components/gantt/TaskEditDialog'
import type { Task } from '@/lib/types'
import type { TaskAssignment, TaskDetail } from '@/lib/resource-types'

// ============================================================
// Types
// ============================================================

interface MemberTaskInfo {
  task: Task
  assignment: TaskAssignment
  details: TaskDetail[]
}

// ============================================================
// Status badge component
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  todo: { label: '\uB300\uAE30', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' },
  in_progress: { label: '\uC9C4\uD589', bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-600 dark:text-blue-400' },
  done: { label: '\uC644\uB8CC', bg: 'bg-green-50 dark:bg-green-950', text: 'text-green-600 dark:text-green-400' },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.todo
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', config.bg, config.text)}>
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
  editor: { label: '\uD3B8\uC9D1\uC790', bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-600 dark:text-blue-400' },
  viewer: { label: '\uBDF0\uC5B4', bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' },
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

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleOpenTask = useCallback((taskId: string) => {
    setEditTaskId(taskId)
    setDialogOpen(true)
  }, [])

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setEditTaskId(null)
  }, [])

  // Task count per member (non-group tasks only)
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

  // Completion rate per member
  const memberCompletionRates = useMemo(() => {
    const rates: Record<string, number> = {}
    for (const member of members) {
      const memberAssigns = assignments.filter((a) => a.member_id === member.id)
      const memberTasks = memberAssigns
        .map((a) => tasks.find((t) => t.id === a.task_id && !t.is_group))
        .filter(Boolean) as Task[]
      if (memberTasks.length === 0) {
        rates[member.id] = 0
        continue
      }
      const totalProgress = memberTasks.reduce((sum, t) => sum + (t.actual_progress || 0), 0)
      rates[member.id] = totalProgress / memberTasks.length
    }
    return rates
  }, [members, assignments, tasks])

  // Project role per member (match by email or name)
  const memberProjectRoles = useMemo(() => {
    if (!project) return {} as Record<string, string>
    const currentProjectMembers = projectMembers.filter((m) => m.projectId === project.id)
    const roles: Record<string, string> = {}
    for (const member of members) {
      // Find matching user by email or name
      const matchedUser = allUsers.find(
        (u) => (member.email && u.email === member.email) || u.name === member.name
      )
      if (matchedUser) {
        const pm = currentProjectMembers.find((m) => m.userId === matchedUser.id)
        if (pm) roles[member.id] = pm.role
      }
    }
    return roles
  }, [project, projectMembers, members, allUsers])

  // Filter members by search query
  const filteredCompanies = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    return companies
      .map((company) => {
        const companyMembers = members.filter((m) => m.company_id === company.id)
        if (!query) return { company, members: companyMembers }
        const matchesCompany = company.name.toLowerCase().includes(query) || company.shortName.toLowerCase().includes(query)
        const filtered = matchesCompany
          ? companyMembers
          : companyMembers.filter((m) => m.name.toLowerCase().includes(query))
        return { company, members: filtered }
      })
      .filter((g) => g.members.length > 0)
  }, [companies, members, searchQuery])

  // Total counts
  const totalMembers = members.length
  const totalAssignedTasks = useMemo(() => {
    const taskIds = new Set<string>()
    for (const a of assignments) {
      const task = tasks.find((t) => t.id === a.task_id && !t.is_group)
      if (task) taskIds.add(task.id)
    }
    return taskIds.size
  }, [assignments, tasks])

  // Selected member tasks
  const selectedMemberTasks: MemberTaskInfo[] = useMemo(() => {
    if (!selectedMemberId) return []
    const memberAssigns = assignments.filter((a) => a.member_id === selectedMemberId)
    const result: MemberTaskInfo[] = []
    for (const assign of memberAssigns) {
      const task = tasks.find((t) => t.id === assign.task_id && !t.is_group)
      if (task) {
        const details = taskDetails.filter((d) => d.task_id === task.id).sort((a, b) => a.sort_order - b.sort_order)
        result.push({ task, assignment: assign, details })
      }
    }
    result.sort((a, b) => {
      const aDate = a.task.planned_start || '9999'
      const bDate = b.task.planned_start || '9999'
      return aDate.localeCompare(bDate)
    })
    return result
  }, [selectedMemberId, assignments, tasks, taskDetails])

  const selectedMember = selectedMemberId ? members.find((m) => m.id === selectedMemberId) : null
  const selectedMemberCompany = selectedMember ? companies.find((c) => c.id === selectedMember.company_id) : null

  return (
    <div className="flex h-full overflow-hidden">
      {/* ===== Left Panel: Member List ===== */}
      <div className="w-[280px] flex-shrink-0 border-r border-border/40 flex flex-col bg-background">
        {/* Summary */}
        <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">\uB2F4\uB2F9\uC790\uBCC4 \uC5C5\uBB34</h2>
          </div>
          <div className="flex gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              \uB2F4\uB2F9\uC790 {totalMembers}\uBA85
            </span>
            <span className="flex items-center gap-1">
              <ClipboardList className="h-3 w-3" />
              \uBC30\uC815 \uC791\uC5C5 {totalAssignedTasks}\uAC74
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              placeholder="\uB2F4\uB2F9\uC790/\uD68C\uC0AC\uBA85 \uAC80\uC0C9..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {/* Member list grouped by company */}
        <div className="flex-1 overflow-y-auto">
          {filteredCompanies.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground/50">
              {searchQuery ? '\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4' : '\uB4F1\uB85D\uB41C \uB2F4\uB2F9\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4'}
            </div>
          )}
          {filteredCompanies.map(({ company, members: companyMembers }) => (
            <div key={company.id}>
              {/* Company header */}
              <div className="px-3 py-1.5 bg-muted/40 text-[11px] font-semibold flex items-center gap-1.5 sticky top-0 z-10">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: company.color }} />
                <span className="truncate">{company.name}</span>
                <span className="text-muted-foreground/60 font-normal">({companyMembers.length})</span>
              </div>

              {/* Members */}
              {companyMembers.map((member) => {
                const isSelected = selectedMemberId === member.id
                const taskCount = memberTaskCounts[member.id] || 0
                const completionRate = memberCompletionRates[member.id] || 0
                const completionPct = Math.round(completionRate * 100)
                const projectRole = memberProjectRoles[member.id]

                return (
                  <div
                    key={member.id}
                    className={cn(
                      'px-3 py-2 cursor-pointer transition-all border-l-2',
                      isSelected
                        ? 'bg-primary/5 border-l-primary'
                        : 'border-l-transparent hover:bg-accent/40'
                    )}
                    onClick={() => setSelectedMemberId(member.id)}
                  >
                    <div className="flex items-center gap-2">
                      {/* Avatar */}
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                        style={{ backgroundColor: company.color }}
                      >
                        {member.name.charAt(0)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">{member.name}</span>
                          {projectRole && <RoleBadge role={projectRole} />}
                        </div>
                        {member.role && (
                          <span className="text-[10px] text-muted-foreground">{member.role}</span>
                        )}
                      </div>

                      {/* Task count badge */}
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0',
                        taskCount > 0
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted/60 text-muted-foreground/50'
                      )}>
                        {taskCount}
                      </span>
                    </div>

                    {/* Mini progress bar */}
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
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ===== Right Panel: Task List ===== */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {!selectedMember ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <UserCheck className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">\uC88C\uCE21\uC5D0\uC11C \uB2F4\uB2F9\uC790\uB97C \uC120\uD0DD\uD558\uC138\uC694</p>
              <p className="text-[11px] text-muted-foreground/40 mt-1">\uBC30\uC815\uB41C \uC791\uC5C5 \uBAA9\uB85D\uACFC \uC138\uBD80\uD56D\uBAA9\uC744 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4</p>
            </div>
          </div>
        ) : (
          <>
            {/* Selected member header */}
            <div className="px-5 py-3 border-b border-border/40 bg-muted/10 flex items-center gap-3">
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
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-primary">{selectedMemberTasks.length}</div>
                <div className="text-[10px] text-muted-foreground">\uBC30\uC815 \uC791\uC5C5</div>
              </div>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto">
              {selectedMemberTasks.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-muted-foreground/50">
                  \uBC30\uC815\uB41C \uC791\uC5C5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4
                </div>
              ) : (
                <div>
                  {/* Table header */}
                  <div className="grid grid-cols-[80px_1fr_120px_70px_70px] gap-1 px-5 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 border-b border-border/30 sticky top-0 z-10">
                    <span>WBS</span>
                    <span>\uC791\uC5C5\uBA85</span>
                    <span className="text-center">\uAE30\uAC04</span>
                    <span className="text-right">\uC9C4\uCC99\uB960</span>
                    <span className="text-right">\uD22C\uC785\uB960</span>
                  </div>

                  {/* Task rows */}
                  {selectedMemberTasks.map(({ task, assignment, details }) => {
                    const startStr = task.planned_start ? format(new Date(task.planned_start), 'MM/dd') : '-'
                    const endStr = task.planned_end ? format(new Date(task.planned_end), 'MM/dd') : '-'
                    const progressPct = Math.round((task.actual_progress || 0) * 100)

                    return (
                      <div key={`${task.id}_${assignment.id}`}>
                        {/* Task row */}
                        <div
                          className="grid grid-cols-[80px_1fr_120px_70px_70px] gap-1 px-5 py-2 hover:bg-accent/30 cursor-pointer items-center group border-b border-border/20 transition-colors"
                          onClick={() => handleOpenTask(task.id)}
                          title={`${task.task_name} (\uD074\uB9AD\uD558\uC5EC \uC0C1\uC138 \uD3B8\uC9D1)`}
                        >
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {task.wbs_code}
                          </span>
                          <span className="text-xs truncate flex items-center gap-1">
                            <span className="truncate">{task.task_name}</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                          </span>
                          <span className="text-center text-[11px] text-muted-foreground font-mono">
                            {startStr} ~ {endStr}
                          </span>
                          <span className="text-right text-xs font-mono">
                            <span className={cn(
                              progressPct >= 100 ? 'text-green-600 dark:text-green-400' :
                              progressPct > 0 ? 'text-blue-600 dark:text-blue-400' :
                              'text-muted-foreground'
                            )}>
                              {progressPct}%
                            </span>
                          </span>
                          <span className="text-right text-xs font-mono text-muted-foreground">
                            {assignment.allocation_percent}%
                          </span>
                        </div>

                        {/* Task details (sub-items) */}
                        {details.length > 0 && (
                          <div className="bg-muted/10 border-b border-border/20">
                            {details.map((detail) => (
                              <div
                                key={detail.id}
                                className="flex items-center gap-2 pl-10 pr-5 py-1.5 text-[11px] hover:bg-accent/20 transition-colors"
                              >
                                <StatusBadge status={detail.status} />
                                <span className={cn(
                                  'flex-1 truncate',
                                  detail.status === 'done' && 'line-through text-muted-foreground/60'
                                )}>
                                  {detail.title}
                                </span>
                                {detail.due_date && (
                                  <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                                    ~{format(new Date(detail.due_date), 'MM/dd')}
                                  </span>
                                )}
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
          </>
        )}
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
