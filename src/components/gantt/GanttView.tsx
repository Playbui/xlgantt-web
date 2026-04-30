import { useRef, useCallback, useMemo, useEffect, useState, type ReactNode } from 'react'
import { BarChart3, BriefcaseBusiness, CalendarDays, Sigma } from 'lucide-react'
import { TaskTable } from './TaskTable'
import { GanttChart } from './GanttChart'
import { GanttToolbar } from './GanttToolbar'
import { TaskEditDialog } from './TaskEditDialog'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { useUIStore, type GanttFilters } from '@/stores/ui-store'
import { useResourceStore } from '@/stores/resource-store'
import { useAuthStore } from '@/stores/auth-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { getVisibleTasks } from '@/lib/wbs'
import { createGanttScale, dateToX } from '@/lib/gantt-math'
import { useKeyboard } from '@/hooks/use-keyboard'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'

const FILTER_LABELS = {
  status: {
    all: '전체',
    not_started: '미착수',
    in_progress: '진행중',
    completed: '완료',
    delayed: '지연',
  },
  structure: {
    all: '전체',
    group: '그룹',
    leaf: '작업',
    milestone: '마일스톤',
  },
  assignee: {
    all: '전체',
    mine: '내 업무',
    assigned: '담당 있음',
    unassigned: '담당 없음',
  },
  workspace: {
    all: '전체',
    linked: '노트 연결',
    unlinked: '노트 없음',
  },
  deliverable: {
    all: '전체',
    has: '산출물 있음',
    missing: '산출물 없음',
  },
} as const

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 rounded-md border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function GanttFilterPanel() {
  const { ganttFilters, setGanttFilters, resetGanttFilters } = useUIStore()
  const activeFilterCount = [
    ganttFilters.status !== 'all',
    ganttFilters.structure !== 'all',
    ganttFilters.assignee !== 'all',
    ganttFilters.workspace !== 'all',
    ganttFilters.deliverable !== 'all',
    ganttFilters.level !== null,
  ].filter(Boolean).length

  const renderGroup = <K extends keyof GanttFilters>(
    label: string,
    key: K,
    options: { value: NonNullable<GanttFilters[K]>; label: string }[]
  ) => (
    <div className="flex items-center gap-1.5">
      <span className="w-14 text-[11px] font-semibold text-muted-foreground">{label}</span>
      {options.map((option) => (
        <FilterChip
          key={String(option.value)}
          active={ganttFilters[key] === option.value}
          onClick={() => setGanttFilters({ [key]: option.value } as Partial<GanttFilters>)}
        >
          {option.label}
        </FilterChip>
      ))}
    </div>
  )

  return (
    <div className="flex min-h-12 flex-shrink-0 items-center gap-4 overflow-x-auto border-b border-[#dddddd] bg-[#fbfaf7] px-4 py-2 shadow-[inset_0_-1px_0_rgba(24,29,38,.03)]">
      <div className="flex flex-shrink-0 items-center gap-2 rounded-full border border-[#d9d3c8] bg-white px-3 py-1.5 text-xs font-bold text-[#181d26]">
        필터
        {activeFilterCount > 0 && <span className="rounded-full bg-[#181d26] px-1.5 text-[10px] text-white">{activeFilterCount}</span>}
      </div>
      {renderGroup('상태', 'status', Object.entries(FILTER_LABELS.status).map(([value, label]) => ({ value: value as GanttFilters['status'], label })))}
      <div className="h-5 w-px flex-shrink-0 bg-border" />
      {renderGroup('담당자', 'assignee', Object.entries(FILTER_LABELS.assignee).map(([value, label]) => ({ value: value as GanttFilters['assignee'], label })))}
      <div className="h-5 w-px flex-shrink-0 bg-border" />
      {renderGroup('WBS', 'structure', Object.entries(FILTER_LABELS.structure).map(([value, label]) => ({ value: value as GanttFilters['structure'], label })))}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground">레벨</span>
        <FilterChip active={ganttFilters.level === null} onClick={() => setGanttFilters({ level: null })}>전체</FilterChip>
        {[1, 2, 3, 4, 5].map((level) => (
          <FilterChip key={level} active={ganttFilters.level === level} onClick={() => setGanttFilters({ level })}>
            {level}
          </FilterChip>
        ))}
      </div>
      <div className="h-5 w-px flex-shrink-0 bg-border" />
      {renderGroup('연계', 'workspace', Object.entries(FILTER_LABELS.workspace).map(([value, label]) => ({ value: value as GanttFilters['workspace'], label })))}
      <div className="h-5 w-px flex-shrink-0 bg-border" />
      {renderGroup('산출물', 'deliverable', Object.entries(FILTER_LABELS.deliverable).map(([value, label]) => ({ value: value as GanttFilters['deliverable'], label })))}
      <button type="button" className="ml-auto h-7 flex-shrink-0 rounded-md border border-[#dddddd] bg-white px-3 text-xs font-bold text-[#41454d] hover:border-[#dfb09f] hover:bg-[#f7e3da] hover:text-[#aa2d00]" onClick={resetGanttFilters}>
        초기화
      </button>
    </div>
  )
}

export function GanttView() {
  // 글로벌 키보드 단축키 등록
  useKeyboard()
  const tasks = useTaskStore((s) => s.tasks)
  const dependencies = useTaskStore((s) => s.dependencies)
  const setTasks = useTaskStore((s) => s.setTasks)
  const project = useProjectStore((s) => s.currentProject)
  const theme = useProjectStore((s) => s.theme)
  const {
    zoomLevel,
    tableWidth,
    setTableWidth,
    tableCollapsed,
    setTableCollapsed,
    searchQuery,
    showArchived,
    customDateRange,
    setVisibleTaskIds,
    showFilterPanel,
    ganttFilters,
  } = useUIStore()
  const { assignments, members } = useResourceStore()
  const currentUser = useAuthStore((s) => s.currentUser)
  const workspaceItems = useWorkspaceStore((s) => s.items)

  const containerRef = useRef<HTMLDivElement>(null)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const chartScrollRef = useRef<HTMLDivElement>(null)
  const isResizing = useRef(false)
  const savedTableWidth = useRef(tableWidth)

  // Task edit dialog state
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const myMember = useMemo(() => {
    if (!currentUser) return null
    return members.find((member) => member.email === currentUser.email) || members.find((member) => member.name === currentUser.name) || null
  }, [currentUser, members])

  const assignedTaskIds = useMemo(() => new Set(assignments.map((assignment) => assignment.task_id)), [assignments])
  const myTaskIds = useMemo(
    () => new Set(assignments.filter((assignment) => assignment.member_id === myMember?.id).map((assignment) => assignment.task_id)),
    [assignments, myMember?.id]
  )
  const workspaceLinkedTaskIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of workspaceItems) {
      for (const taskId of item.linkedTaskIds) ids.add(taskId)
    }
    return ids
  }, [workspaceItems])

  const visibleTasks = useMemo(() => {
    // 아카이브 필터: 기본은 제외, showArchived 시 포함
    const filteredByArchive = showArchived ? tasks : tasks.filter((t) => !t.archived_at)
    let collapsed = getVisibleTasks(filteredByArchive)

    // 기간 필터: customDateRange와 겹치지 않는 작업 제외
    if (customDateRange) {
      const rangeStart = customDateRange.start
      const rangeEnd = customDateRange.end
      const idsInRange = new Set<string>()
      for (const task of collapsed) {
        const taskStart = task.planned_start
        const taskEnd = task.planned_end
        // 날짜가 없는 작업(그룹 등)은 자식 기준으로 판단해야 하므로 일단 포함
        if (!taskStart && !taskEnd) {
          idsInRange.add(task.id)
          continue
        }
        // overlap 조건: task.end >= rangeStart && task.start <= rangeEnd
        const effectiveStart = taskStart || taskEnd || ''
        const effectiveEnd = taskEnd || taskStart || ''
        if (effectiveEnd >= rangeStart && effectiveStart <= rangeEnd) {
          idsInRange.add(task.id)
        }
      }
      // 조상 노드 포함 (트리 구조 유지)
      const withAncestors = new Set<string>(idsInRange)
      for (const id of idsInRange) {
        let current = collapsed.find((t) => t.id === id)
        while (current?.parent_id) {
          withAncestors.add(current.parent_id)
          current = collapsed.find((t) => t.id === current!.parent_id)
        }
      }
      collapsed = collapsed.filter((t) => withAncestors.has(t.id))
    }

    const today = project?.status_date ? new Date(project.status_date) : new Date()
    today.setHours(0, 0, 0, 0)

    const matchesAdvancedFilters = (task: Task) => {
      if (ganttFilters.status !== 'all') {
        const plannedEnd = task.planned_end ? new Date(task.planned_end) : null
        const delayed = !!plannedEnd && plannedEnd < today && task.actual_progress < 1
        if (ganttFilters.status === 'delayed' && !delayed) return false
        if (ganttFilters.status === 'completed' && task.actual_progress < 1) return false
        if (ganttFilters.status === 'in_progress' && !(task.actual_progress > 0 && task.actual_progress < 1)) return false
        if (ganttFilters.status === 'not_started' && task.actual_progress > 0) return false
      }

      if (ganttFilters.structure === 'group' && !task.is_group) return false
      if (ganttFilters.structure === 'leaf' && task.is_group) return false
      if (ganttFilters.structure === 'milestone' && !task.is_milestone) return false
      if (ganttFilters.level !== null && task.wbs_level !== ganttFilters.level) return false

      if (ganttFilters.assignee === 'mine' && !myTaskIds.has(task.id)) return false
      if (ganttFilters.assignee === 'assigned' && !assignedTaskIds.has(task.id)) return false
      if (ganttFilters.assignee === 'unassigned' && assignedTaskIds.has(task.id)) return false

      if (ganttFilters.workspace === 'linked' && !workspaceLinkedTaskIds.has(task.id)) return false
      if (ganttFilters.workspace === 'unlinked' && workspaceLinkedTaskIds.has(task.id)) return false

      if (ganttFilters.deliverable === 'has' && !task.deliverables?.trim()) return false
      if (ganttFilters.deliverable === 'missing' && task.deliverables?.trim()) return false

      return true
    }

    const hasAdvancedFilter =
      ganttFilters.status !== 'all' ||
      ganttFilters.structure !== 'all' ||
      ganttFilters.assignee !== 'all' ||
      ganttFilters.workspace !== 'all' ||
      ganttFilters.deliverable !== 'all' ||
      ganttFilters.level !== null

    // No filter active — return as-is
    if (!searchQuery && !hasAdvancedFilter) return collapsed

    const query = searchQuery.toLowerCase()

    // Determine which tasks match the filter criteria
    const matchingIds = new Set<string>()

    for (const task of collapsed) {
      let matchesSearch = true
      let matchesFilter = matchesAdvancedFilters(task)

      // Search filter: case-insensitive task_name match
      if (searchQuery) {
        matchesSearch = task.task_name.toLowerCase().includes(query)
      }

      if (matchesSearch && matchesFilter) {
        matchingIds.add(task.id)
      }
    }

    // Collect ancestor IDs so parent groups remain visible
    const visibleIds = new Set<string>(matchingIds)
    for (const id of matchingIds) {
      let current = collapsed.find((t) => t.id === id)
      while (current?.parent_id) {
        visibleIds.add(current.parent_id)
        current = collapsed.find((t) => t.id === current!.parent_id)
      }
    }

    return collapsed.filter((t) => visibleIds.has(t.id))
  }, [tasks, searchQuery, showArchived, project?.status_date, customDateRange, ganttFilters, myTaskIds, assignedTaskIds, workspaceLinkedTaskIds])

  useEffect(() => {
    setVisibleTaskIds(visibleTasks.map((task) => task.id))
  }, [visibleTasks, setVisibleTaskIds])

  const scale = useMemo(() => {
    if (!project) return null
    // customDateRange가 있으면 그 기간으로 (패딩 0), 없으면 프로젝트 전체 기간
    const start = customDateRange?.start || project.start_date
    const end = customDateRange?.end || project.end_date
    return createGanttScale(
      new Date(start),
      new Date(end),
      zoomLevel,
      customDateRange ? 0 : undefined
    )
  }, [project, zoomLevel, customDateRange])

  const ganttSummary = useMemo(() => {
    const activeTasks = tasks.filter((task) => !task.archived_at)
    const leafTasks = activeTasks.filter((task) => !task.is_group)
    const totalWorkload = leafTasks.reduce((sum, task) => sum + (task.total_workload || 0), 0)
    const weightedProgress =
      totalWorkload > 0
        ? leafTasks.reduce((sum, task) => sum + (task.actual_progress || 0) * (task.total_workload || 0), 0) / totalWorkload
        : leafTasks.length > 0
          ? leafTasks.reduce((sum, task) => sum + (task.actual_progress || 0), 0) / leafTasks.length
          : 0

    const starts = activeTasks.map((task) => task.planned_start).filter(Boolean).sort() as string[]
    const ends = activeTasks.map((task) => task.planned_end).filter(Boolean).sort() as string[]

    return {
      totalTasks: activeTasks.length,
      leafTasks: leafTasks.length,
      totalWorkload,
      progressPercent: Math.round(weightedProgress * 100),
      start: starts[0] || project?.start_date || '',
      end: ends[ends.length - 1] || project?.end_date || '',
    }
  }, [tasks, project?.start_date, project?.end_date])

  // Auto-scroll to project start date on mount
  useEffect(() => {
    if (scale && chartScrollRef.current && project) {
      const startX = dateToX(new Date(project.start_date), scale)
      chartScrollRef.current.scrollLeft = Math.max(0, startX - 50)
    }
  }, [scale, project])

  // 기준일(status_date) 변경 시 계획 진척률 재계산
  useEffect(() => {
    const current = useTaskStore.getState().tasks
    if (current.length > 0) {
      setTasks([...current])
    }
  }, [project?.status_date, setTasks])

  // Sync vertical scroll between table and chart
  const handleTableScroll = useCallback(() => {
    if (tableScrollRef.current && chartScrollRef.current) {
      chartScrollRef.current.scrollTop = tableScrollRef.current.scrollTop
    }
  }, [])

  const handleChartScroll = useCallback(() => {
    if (chartScrollRef.current && tableScrollRef.current) {
      tableScrollRef.current.scrollTop = chartScrollRef.current.scrollTop
    }
  }, [])

  // Open task edit dialog
  const handleOpenTaskDialog = useCallback((taskId: string) => {
    setEditTaskId(taskId)
    setDialogOpen(true)
  }, [])

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setEditTaskId(null)
  }, [])

  const scrollChartToDate = useCallback((targetDate: Date) => {
    if (!scale || !chartScrollRef.current) return

    const targetX = dateToX(targetDate, scale)
    const viewportWidth = chartScrollRef.current.clientWidth
    const leadPadding = Math.min(180, Math.max(72, viewportWidth * 0.14))
    chartScrollRef.current.scrollLeft = Math.max(0, targetX - leadPadding)
  }, [scale])

  // Toggle table collapse/expand
  const handleToggleTable = useCallback(() => {
    if (tableCollapsed) {
      // Expand: restore saved width
      setTableWidth(savedTableWidth.current)
      setTableCollapsed(false)
    } else {
      // Collapse: save current width and set to 0
      savedTableWidth.current = tableWidth
      setTableWidth(0)
      setTableCollapsed(true)
    }
  }, [tableCollapsed, tableWidth, setTableWidth, setTableCollapsed])

  // Resize handle for split pane
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      isResizing.current = true

      const startX = e.clientX
      const startWidth = tableWidth

      const handleMove = (moveEvent: PointerEvent) => {
        if (!isResizing.current) return
        const delta = moveEvent.clientX - startX
        const newWidth = Math.max(400, Math.min(1200, startWidth + delta))
        setTableWidth(newWidth)
      }

      const handleUp = () => {
        isResizing.current = false
        document.removeEventListener('pointermove', handleMove)
        document.removeEventListener('pointerup', handleUp)
      }

      document.addEventListener('pointermove', handleMove)
      document.addEventListener('pointerup', handleUp)
    },
    [tableWidth, setTableWidth]
  )

  if (!project || !scale) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        프로젝트를 선택하거나 생성해주세요.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <GanttToolbar onOpenTaskDialog={handleOpenTaskDialog} onScrollToToday={() => {
        scrollChartToDate(new Date())
      }} />

      {showFilterPanel && <GanttFilterPanel />}

      <div className="flex h-11 flex-shrink-0 items-center gap-5 border-b border-[#dddddd] bg-white px-5 text-sm">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="h-4 w-4 text-[#727780]" />
          <span className="text-xs text-[#727780]">작업</span>
          <span className="font-bold text-[#181d26]">{ganttSummary.totalTasks.toLocaleString()}개</span>
          <span className="text-xs font-medium text-[#727780]">(단위 {ganttSummary.leafTasks.toLocaleString()}개)</span>
        </div>
        <div className="h-4 w-px bg-[#e5e0d8]" />
        <div className="flex items-center gap-2">
          <Sigma className="h-4 w-4 text-[#727780]" />
          <span className="text-xs text-[#727780]">총 공수</span>
          <span className="font-bold text-[#181d26]">{ganttSummary.totalWorkload.toLocaleString(undefined, { maximumFractionDigits: 1 })}일</span>
        </div>
        <div className="h-4 w-px bg-[#e5e0d8]" />
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#727780]" />
          <span className="text-xs text-[#727780]">전체 진척률</span>
          <span className="font-bold text-[#181d26]">{ganttSummary.progressPercent}%</span>
        </div>
        <div className="h-4 w-px bg-[#e5e0d8]" />
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#727780]" />
          <span className="text-xs text-[#727780]">기간</span>
          <span className="font-bold text-[#181d26]">
            {ganttSummary.start || '-'} ~ {ganttSummary.end || '-'}
          </span>
        </div>
      </div>

      {/* Main split pane */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Task Table (Left Pane) */}
        {!tableCollapsed && (
          <div
            style={{ width: tableWidth, minWidth: 300 }}
            className="flex-shrink-0 border-r border-[#dddddd] bg-white shadow-[1px_0_2px_rgba(16,24,40,0.04)]"
          >
            <TaskTable
              tasks={visibleTasks}
              scrollRef={tableScrollRef}
              onScroll={handleTableScroll}
              onDoubleClickTask={handleOpenTaskDialog}
            />
          </div>
        )}

        {/* Resize Handle with Toggle Button */}
        <div
          className="group relative w-[6px] flex-shrink-0 cursor-col-resize bg-transparent transition-all duration-150 hover:bg-[#f1ebdf]"
          onPointerDown={!tableCollapsed ? handleResizeStart : undefined}
          style={{ cursor: tableCollapsed ? 'default' : 'col-resize' }}
        >
          {/* Visible divider line (2px, slate-400 → hover primary) */}
          <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 w-[2px] -translate-x-1/2 bg-[#b8b2a8] transition-colors group-hover:bg-[#181d26]" />
          {/* Toggle Button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleToggleTable()
            }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 z-50
              w-5 h-10 flex items-center justify-center
              border border-[#d9d3c8] bg-white rounded-sm shadow-md
              hover:bg-[#f7f3ec] hover:border-[#181d26]/35 hover:shadow-lg
              opacity-60 group-hover:opacity-100 hover:!opacity-100
              transition-all duration-200 cursor-pointer"
            title={tableCollapsed ? '테이블 펼치기' : '테이블 접기'}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg
              width="10"
              height="14"
              viewBox="0 0 10 14"
              fill="none"
              className="text-[#727780] transition-colors hover:text-[#181d26]"
            >
              {tableCollapsed ? (
                <path d="M2 1L8 7L2 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M8 1L2 7L8 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>

        {/* Gantt Chart (Right Pane) */}
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          <GanttChart
            tasks={visibleTasks}
            dependencies={dependencies}
            scale={scale}
            theme={theme}
            scrollRef={chartScrollRef}
            onScroll={handleChartScroll}
            onDoubleClickTask={handleOpenTaskDialog}
            onOpenTaskDialog={handleOpenTaskDialog}
          />
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
