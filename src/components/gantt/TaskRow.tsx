import { useCallback, useMemo } from 'react'
import { ArrowUp, ChevronRight, GripVertical } from 'lucide-react'
import type { Task } from '@/lib/types'
import { ROW_HEIGHT } from '@/lib/types'
import { useTaskStore } from '@/stores/task-store'
import { useResourceStore } from '@/stores/resource-store'
import { useProjectStore } from '@/stores/project-store'
import { useAuthStore } from '@/stores/auth-store'
import { TaskCell } from './TaskCell'
import { cn } from '@/lib/utils'
import type { ColumnDef } from '@/lib/column-defs'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface TaskRowProps {
  task: Task
  rowIndex: number
  columns: ColumnDef[]
  onDoubleClick?: (taskId: string) => void
  onContextMenu?: (taskId: string, x: number, y: number) => void
  /** Drag-and-drop */
  isDragging?: boolean
  isDropTarget?: boolean
  dropPosition?: 'above' | 'below' | null
  onDragStart?: (e: React.DragEvent, taskId: string) => void
  onDragEnd?: (e: React.DragEvent) => void
}

export function TaskRow({ task, rowIndex, columns, onDoubleClick, onContextMenu, isDragging, isDropTarget, dropPosition, onDragStart, onDragEnd }: TaskRowProps) {
  const { selectedTaskIds, selectTask, toggleCollapse, updateTask, restoreTask } =
    useTaskStore()
  const { assignments, members, companies, taskDetails } = useResourceStore()
  const theme = useProjectStore((s) => s.theme)
  const users = useAuthStore((s) => s.users)

  // 레벨1 그룹 작업의 테마 색상 (colors[0] = 그룹 계획 색상)
  const level1GroupColor = task.is_group && task.wbs_level === 1 ? theme.colors[0] : undefined

  const isSelected = selectedTaskIds.has(task.id)

  const levelVisual = useMemo(() => {
    switch (task.wbs_level) {
      case 1:
        return {
          titleClass: 'text-[19px] font-bold tracking-[-0.02em] text-[var(--wbs-1)]',
          codeClass: 'text-[18px] font-bold tracking-[-0.02em] text-[var(--wbs-1)]',
          rowClass: 'bg-[color:color-mix(in_srgb,var(--theme-bar-soft)_42%,white)]/70',
          accentOpacity: 1,
        }
      case 2:
        return {
          titleClass: 'text-[15px] font-semibold tracking-[-0.01em] text-[var(--wbs-2)]',
          codeClass: 'text-[14px] font-semibold text-[var(--wbs-2)]',
          rowClass: 'bg-transparent',
          accentOpacity: 0.72,
        }
      case 3:
        return {
          titleClass: 'text-[14px] font-medium text-[var(--wbs-3)]',
          codeClass: 'text-[13px] font-medium text-[var(--wbs-3)]',
          rowClass: 'bg-transparent',
          accentOpacity: 0.48,
        }
      case 4:
        return {
          titleClass: 'text-[13px] font-normal text-[var(--wbs-4)]',
          codeClass: 'text-[12px] font-medium text-[var(--wbs-4)]',
          rowClass: 'bg-transparent',
          accentOpacity: 0.28,
        }
      default:
        return {
          titleClass: 'text-[12px] font-normal text-[var(--wbs-5)]',
          codeClass: 'text-[12px] font-medium text-[var(--wbs-5)]',
          rowClass: 'bg-transparent',
          accentOpacity: 0.18,
        }
    }
  }, [task.wbs_level])

  // 담당자 표시 문자열 생성
  const assigneeDisplay = useMemo(() => {
    const taskAssigns = assignments.filter((a) => a.task_id === task.id)
    if (taskAssigns.length === 0) return ''

    return taskAssigns.map((a) => {
      const member = members.find((m) => m.id === a.member_id)
      if (!member) return ''
      const company = companies.find((c) => c.id === member.company_id)
      const compPrefix = company ? `${company.shortName}/` : ''
      return `${compPrefix}${member.name}`
    }).filter(Boolean).join(', ')
  }, [task.id, assignments, members, companies])

  // 세부항목 카운트
  const detailCount = useMemo(() => {
    const details = taskDetails.filter((d) => d.task_id === task.id)
    if (details.length === 0) return null
    const done = details.filter((d) => d.status === 'done').length
    return { done, total: details.length }
  }, [task.id, taskDetails])

  const archiveMeta = useMemo(() => {
    if (!task.archived_at) return null
    const archivedUser = task.archived_by ? users.find((user) => user.id === task.archived_by) : undefined
    const archivedByName = archivedUser?.name || archivedUser?.email || '알 수 없음'
    let archivedAtLabel = task.archived_at
    try {
      archivedAtLabel = format(new Date(task.archived_at), 'yyyy-MM-dd HH:mm', { locale: ko })
    } catch {
      archivedAtLabel = task.archived_at
    }
    return {
      archivedByName,
      archivedAtLabel,
    }
  }, [task.archived_at, task.archived_by, users])

  // 총 컬럼 너비 계산
  const totalWidth = useMemo(() => columns.reduce((sum, col) => sum + col.width, 0), [columns])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const mode = e.shiftKey ? 'range' : (e.ctrlKey || e.metaKey) ? 'toggle' : 'single'
      selectTask(task.id, mode)
    },
    [task.id, selectTask]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      selectTask(task.id, 'single')
      onContextMenu?.(task.id, e.clientX, e.clientY)
    },
    [task.id, selectTask, onContextMenu]
  )

  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      toggleCollapse(task.id)
    },
    [task.id, toggleCollapse]
  )

  const handleCellChange = useCallback(
    (field: string, value: unknown) => {
      updateTask(task.id, { [field]: value })
    },
    [task.id, updateTask]
  )

  const handleRestore = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      restoreTask(task.id)
    },
    [restoreTask, task.id]
  )

  const renderCell = (col: ColumnDef) => {
    // 작업명 컬럼 - 들여쓰기/접기/펼치기 지원
    if (col.id === 'task_name') {
      const accentColor = theme.colors[0] || '#2f6feb'
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center border-r overflow-hidden"
        >
          {/* Indent spacer */}
          <div style={{ width: 12 + (task.wbs_level - 1) * 18 }} className="flex-shrink-0" />

          <div
            className="h-[18px] w-[3px] rounded-full mr-2 flex-shrink-0"
            style={{
              backgroundColor: accentColor,
              opacity: levelVisual.accentOpacity,
            }}
          />

          {/* Expand/collapse toggle for group tasks */}
          {task.is_group ? (
            <button
              className="flex-shrink-0 p-0.5 hover:bg-accent rounded text-[var(--ink-3)] hover:text-[var(--ink-1)]"
              onClick={handleToggleCollapse}
            >
              {task.is_collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <div className="h-4 w-4 flex items-center justify-center">
                  <div className="w-[2px] h-3 bg-current rounded-full" />
                </div>
              )}
            </button>
          ) : (
            <div className="w-4 flex-shrink-0" />
          )}

          <div className={cn('min-w-0 flex-1', levelVisual.titleClass)}>
            <TaskCell
              taskId={task.id}
              field="task_name"
              value={task.task_name}
              onChange={(v) => handleCellChange('task_name', v)}
              type="text"
            />
          </div>
          {detailCount && (
            <span className={cn(
              "flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded mr-1",
              detailCount.done === detailCount.total
                ? "bg-[var(--ok-bg)] text-[var(--ok)]"
                : "bg-[color:color-mix(in_srgb,var(--theme-bar-soft)_82%,white)] text-[var(--theme-text)]"
            )}>
              {detailCount.done}/{detailCount.total}
            </span>
          )}
        </div>
      )
    }

    // 담당자 컬럼 - resource-store에서 읽기
    if (col.id === 'assignees') {
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center justify-center px-1.5 border-r overflow-hidden"
        >
          {assigneeDisplay ? (
            <div className="flex items-center gap-0.5 overflow-hidden">
              {assignments.filter((a) => a.task_id === task.id).slice(0, 3).map((a) => {
                const member = members.find((m) => m.id === a.member_id)
                const company = member ? companies.find((c) => c.id === member.company_id) : null
                if (!member) return null
                return (
                  <div
                    key={a.id}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0"
                    style={{ backgroundColor: company?.color || '#888' }}
                    title={`${company?.shortName || ''} ${member.name} (${a.allocation_percent}%)`}
                  >
                    {member.name.charAt(0)}
                  </div>
                )
              })}
              {assignments.filter((a) => a.task_id === task.id).length > 3 && (
                <span className="text-[9px] text-muted-foreground ml-0.5">
                  +{assignments.filter((a) => a.task_id === task.id).length - 3}
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground/50 text-[10px]">—</span>
          )}
        </div>
      )
    }

    // 진척률 (actual_progress) - 모던 바 표시
    if (col.id === 'actual_progress') {
      const pct = Math.round(task.actual_progress * 100)
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center justify-center px-2 border-r gap-1.5"
        >
          {task.actual_progress_override != null && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="수동 진척률" />
          )}
          <div className="flex items-center gap-1.5 w-full">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: pct >= 75 ? '#2563eb' : pct >= 50 ? '#3b82f6' : pct >= 25 ? '#f59e0b' : '#f97316',
                }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-foreground/70 w-8 text-right">
              {pct}%
            </span>
          </div>
        </div>
      )
    }

    // 계획진척률 (planned_progress) - 모던 바 표시
    if (col.id === 'planned_progress') {
      const pct = Math.round(task.planned_progress * 100)
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center justify-center px-2 border-r gap-1.5"
        >
          {task.planned_progress_override != null && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="수동 계획진척률" />
          )}
          <div className="flex items-center gap-1.5 w-full">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: '#8b5cf6',
                }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-foreground/70 w-8 text-right">
              {pct}%
            </span>
          </div>
        </div>
      )
    }

    // 불리언 컬럼 (마일스톤, 그룹여부)
    if (col.type === 'boolean') {
      const boolValue = (task as unknown as Record<string, unknown>)[col.id]
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center justify-center border-r"
        >
          <span className={cn(
            "text-[11px] font-medium px-1.5 py-0.5 rounded",
            boolValue ? "bg-primary/10 text-primary" : "text-muted-foreground/40"
          )}>
            {boolValue ? 'Y' : 'N'}
          </span>
        </div>
      )
    }

    // WBS 코드 - 좌측 세로 컬러 바 (레벨별 테마 색 + 계단식 뎁스 표시)
    if (col.id === 'wbs_code') {
      // 테마 팔레트의 서로 다른 hue를 레벨 1~6에 매핑
      const levelColorIdx = [0, 2, 7, 4, 10, 13]
      const idx = levelColorIdx[Math.min(task.wbs_level - 1, 5)] ?? 0
      const barColor = theme.colors[idx] || '#888888'
      const barWidth = 3
      const barOffset = 8 + (task.wbs_level - 1) * 6
      const textPadding = 16 + (task.wbs_level - 1) * 12
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center justify-start border-r relative"
        >
          <div
            className="absolute top-0.5 bottom-0.5 rounded-sm"
            style={{
              backgroundColor: barColor,
              width: `${barWidth}px`,
              left: `${barOffset}px`,
              opacity: levelVisual.accentOpacity,
            }}
          />
          <span
            className={cn('font-mono tabular-nums', levelVisual.codeClass)}
            style={{ paddingLeft: `${textPadding}px` }}
          >
            {task.wbs_code}
          </span>
        </div>
      )
    }

    // 달력유형 (select)
    if (col.id === 'calendar_type') {
      return (
        <div
          key={col.id}
          style={{ width: col.width, minWidth: col.width }}
          className="flex items-center justify-center border-r"
        >
          <span className="text-xs text-muted-foreground">
            {task.calendar_type || 'STD'}
          </span>
        </div>
      )
    }

    // 일반 셀
    const value = (task as unknown as Record<string, unknown>)[col.id]
    // 그룹 작업: 읽기전용 필드
    const groupReadOnlyFields = ['planned_start', 'planned_end', 'total_duration', 'total_workload']
    // 세부항목 있는 작업: 진척률/작업량 자동 계산이므로 읽기전용
    const hasTaskDetails = detailCount !== null
    const autoCalcReadOnlyFields = hasTaskDetails ? ['total_workload', 'actual_progress'] : []
    const isReadOnly = col.id === 'total_duration' || col.id === 'wbs_code' || col.id === 'wbs_level'
      || (task.is_group && groupReadOnlyFields.includes(col.id))
      || (col.readOnlyForGroup && task.is_group)
      || autoCalcReadOnlyFields.includes(col.id)

    // 셀 타입 결정
    const cellType: 'text' | 'date' | 'number' = (() => {
      if (col.type === 'date') return 'date'
      if (col.type === 'number') return 'number'
      if (col.id.includes('date') || col.id.includes('start') || col.id.includes('end')) return 'date'
      if (col.id.includes('workload') || col.id.includes('duration') || col.id.includes('count') || col.id.includes('level')) return 'number'
      return 'text'
    })()

    return (
      <div
        key={col.id}
        style={{ width: col.width, minWidth: col.width }}
        className="flex items-center justify-center border-r"
      >
        {isReadOnly ? (
          <div className={cn("w-full px-2 truncate select-none text-center", task.is_group && task.wbs_level !== 1 && "bg-muted/60 text-muted-foreground", task.is_group && task.wbs_level === 1 && "bg-muted/40")}>
            {value != null ? String(value) : ''}
          </div>
        ) : (
          <TaskCell
            taskId={task.id}
            field={col.id}
            value={value}
            onChange={(v) => handleCellChange(col.id, v)}
            type={cellType}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group/row flex border-b cursor-pointer transition-all duration-100 relative text-[13px]',
        'border-[var(--hairline)]',
        isSelected && 'z-10 bg-red-50/55 ring-2 ring-red-400/90 shadow-[0_10px_30px_rgba(239,68,68,0.18)]',
        !isSelected && task.is_group && levelVisual.rowClass,
        task.archived_at && 'opacity-50 bg-stripes',
        !isSelected && !task.is_group && 'hover:bg-[color:color-mix(in_srgb,var(--accent)_88%,white)]',
        !isSelected && !task.is_group && rowIndex % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--muted)_32%,transparent)]',
        isDragging && 'opacity-40',
      )}
      style={{ height: ROW_HEIGHT, minWidth: totalWidth, ...(level1GroupColor ? { color: level1GroupColor } : {}) }}
      onClick={handleClick}
      onDoubleClick={() => onDoubleClick?.(task.id)}
      onContextMenu={handleContextMenu}
    >
      {/* Drop indicator line */}
      {isDropTarget && dropPosition === 'above' && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-20 pointer-events-none" style={{ transform: 'translateY(-1px)' }}>
          <div className="absolute -left-0.5 -top-1 w-2 h-2 rounded-full bg-blue-500" />
        </div>
      )}
      {isDropTarget && dropPosition === 'below' && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-20 pointer-events-none" style={{ transform: 'translateY(1px)' }}>
          <div className="absolute -left-0.5 -top-1 w-2 h-2 rounded-full bg-blue-500" />
        </div>
      )}

      {/* Drag handle */}
      <div
        className="flex-shrink-0 w-5 flex items-center justify-center opacity-0 group-hover/row:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          onDragStart?.(e, task.id)
        }}
        onDragEnd={(e) => {
          e.stopPropagation()
          onDragEnd?.(e)
        }}
        title="드래그하여 이동"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {columns.map((col) => renderCell(col))}

      {task.archived_at && (
        <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2">
          {archiveMeta && (
            <div className="hidden rounded-md border border-amber-200 bg-white/90 px-2.5 py-1 text-[10px] font-medium text-amber-700 shadow-sm md:block">
              <span className="whitespace-nowrap">삭제 {archiveMeta.archivedByName}</span>
              <span className="mx-1 text-amber-300">|</span>
              <span className="whitespace-nowrap">{archiveMeta.archivedAtLabel}</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleRestore}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-emerald-300 bg-white/90 px-2 text-[10px] font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50 hover:border-emerald-400"
            title={archiveMeta ? `${archiveMeta.archivedByName} · ${archiveMeta.archivedAtLabel}` : '아카이브에서 복원'}
          >
            <ArrowUp className="h-3 w-3" />
            복원
          </button>
        </div>
      )}
    </div>
  )
}
