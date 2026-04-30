import { useRef, useState } from 'react'
import {
  Plus,
  Trash2,
  Indent,
  Outdent,
  ArrowUp,
  ArrowDown,
  FileEdit,
  Search,
  X,
  Undo2,
  Redo2,
  TrendingUp,
  CalendarCheck,
  Archive,
  ListOrdered,
  Download,
  FileSpreadsheet,
  SlidersHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { useResourceStore } from '@/stores/resource-store'
import { useAuthStore } from '@/stores/auth-store'
import { DEFAULT_GANTT_FILTERS, useUIStore } from '@/stores/ui-store'
import { useUndoRedo } from '@/hooks/use-undo-redo'
import { ColumnSettingsDropdown } from './ColumnSettingsDropdown'
import { findIndentParent, recalculateWBSCodes } from '@/lib/wbs'
import { downloadWbsExcelTemplate } from '@/lib/wbs-excel'
import { WbsExcelImportDialog } from './WbsExcelImportDialog'
import { cn } from '@/lib/utils'

interface GanttToolbarProps {
  onOpenTaskDialog: (taskId: string) => void
  onScrollToToday?: () => void
}

export function GanttToolbar({ onOpenTaskDialog, onScrollToToday }: GanttToolbarProps) {
  const { tasks, selectedTaskIds, addTask, archiveTask, restoreTask, purgeTask, updateTask, setTasks } = useTaskStore()
  const project = useProjectStore((s) => s.currentProject)
  const getMyProjectRole = useProjectStore((s) => s.getMyProjectRole)
  const {
    searchQuery,
    setSearchQuery,
    showProgressLine,
    toggleProgressLine,
    showArchived,
    toggleShowArchived,
    rowHeight,
    setRowHeight,
    showFilterPanel,
    toggleFilterPanel,
    ganttFilters,
    resetGanttFilters,
  } = useUIStore()
  const { taskDetails, assignments } = useResourceStore()
  const currentUser = useAuthStore((s) => s.currentUser)
  const { canUndo, canRedo, undo, redo } = useUndoRedo()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [excelDialogOpen, setExcelDialogOpen] = useState(false)

  const safeSelectedTaskIds = selectedTaskIds ?? new Set<string>()
  const selectedId = safeSelectedTaskIds.size === 1 ? Array.from(safeSelectedTaskIds)[0] : null
  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) : null
  const hasSelection = safeSelectedTaskIds.size > 0
  const myProjectRole = project && currentUser ? getMyProjectRole(project.id, currentUser.id) : null
  const canManageWbsImport = currentUser?.role === 'admin' || currentUser?.role === 'pm' || myProjectRole === 'pm'
  const activeFilterCount = [
    ganttFilters.status !== DEFAULT_GANTT_FILTERS.status,
    ganttFilters.structure !== DEFAULT_GANTT_FILTERS.structure,
    ganttFilters.assignee !== DEFAULT_GANTT_FILTERS.assignee,
    ganttFilters.workspace !== DEFAULT_GANTT_FILTERS.workspace,
    ganttFilters.deliverable !== DEFAULT_GANTT_FILTERS.deliverable,
    ganttFilters.level !== DEFAULT_GANTT_FILTERS.level,
  ].filter(Boolean).length
  const hasActiveFilters = activeFilterCount > 0

  // 작업 추가 (선택된 작업 아래에)
  const handleAddTask = () => {
    if (!project) return

    const selectedIndex = selectedTask
      ? tasks.findIndex((t) => t.id === selectedTask.id)
      : tasks.length - 1

    const prevTask = tasks[selectedIndex]
    const nextTask = tasks[selectedIndex + 1]

    const newSortOrder = prevTask
      ? nextTask
        ? Math.floor((prevTask.sort_order + nextTask.sort_order) / 2)
        : prevTask.sort_order + 1000
      : 1000

    const newLevel = selectedTask ? selectedTask.wbs_level : 1

    const newTask = {
      id: crypto.randomUUID(),
      project_id: project.id,
      sort_order: newSortOrder,
      wbs_code: '',
      wbs_level: newLevel,
      is_group: false,
      task_name: '새 작업',
      calendar_type: 'STD' as const,
      planned_progress: 0,
      actual_progress: 0,
      is_milestone: false,
      parent_id: selectedTask?.parent_id,
      is_collapsed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    addTask(newTask)
    // 자동으로 WBS 코드 재계산
    recalcWBS()
  }

  // 작업 "이미 진행" 판단
  const isTaskUntouched = (taskId: string): boolean => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return true
    const hasChildren = tasks.some((t) => t.parent_id === taskId)
    const hasProgress = (task.actual_progress || 0) > 0
    const hasActualData = !!task.actual_start || !!task.actual_end || !!task.actual_workload
    const hasDetails = taskDetails.some((d) => d.task_id === taskId)
    const hasAssignments = assignments.some((a) => a.task_id === taskId)
    return !hasChildren && !hasProgress && !hasActualData && !hasDetails && !hasAssignments
  }

  // 작업 삭제 (하이브리드: 빈껍데기 → 즉시삭제, 진행된 작업 → 아카이브)
  const handleDeleteTask = () => {
    if (!hasSelection) return

    // 이미 아카이브된 작업을 삭제하려는 경우 → 영구 삭제
    if (selectedTask?.archived_at) {
      if (!confirm(`"${selectedTask.task_name}"을(를) 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return
      for (const id of safeSelectedTaskIds) purgeTask(id)
      return
    }

    // 선택된 작업들 중 진행된 것과 빈 것을 분류
    const idsToArchive: string[] = []
    const idsToPurge: string[] = []
    for (const id of safeSelectedTaskIds) {
      if (isTaskUntouched(id)) idsToPurge.push(id)
      else idsToArchive.push(id)
    }

    const messages: string[] = []
    if (idsToPurge.length > 0) messages.push(`${idsToPurge.length}개 작업은 바로 삭제됩니다 (진행 데이터 없음)`)
    if (idsToArchive.length > 0) messages.push(`${idsToArchive.length}개 작업은 아카이브됩니다 (진행 이력 보존)`)
    if (!confirm(`선택한 작업을 삭제하시겠습니까?\n\n${messages.join('\n')}`)) return

    for (const id of idsToPurge) purgeTask(id)
    for (const id of idsToArchive) archiveTask(id)
  }

  // 아카이브된 작업 복원
  const handleRestoreTask = () => {
    if (!selectedTask?.archived_at) return
    restoreTask(selectedTask.id)
  }

  // 들여쓰기 (레벨 증가)
  const handleIndent = () => {
    if (!selectedTask || selectedTask.wbs_level >= 6) return
    const parentTask = findIndentParent(tasks, selectedTask.id)
    if (!parentTask) return

    updateTask(selectedTask.id, {
      wbs_level: selectedTask.wbs_level + 1,
      parent_id: parentTask.id,
    })
    // Mark parent as group
    if (!parentTask.is_group) {
      updateTask(parentTask.id, { is_group: true })
    }
    recalcWBS()
  }

  // 내어쓰기 (레벨 감소)
  const handleOutdent = () => {
    if (!selectedTask || selectedTask.wbs_level <= 1) return

    const parent = selectedTask.parent_id
      ? tasks.find((t) => t.id === selectedTask.parent_id)
      : null

    updateTask(selectedTask.id, {
      wbs_level: selectedTask.wbs_level - 1,
      parent_id: parent?.parent_id || undefined,
    })
    recalcWBS()
  }

  // 위로 이동
  const handleMoveUp = () => {
    if (!selectedTask) return
    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === selectedTask.id)
    if (index <= 0) return

    const prevTask = sorted[index - 1]
    const tempOrder = selectedTask.sort_order

    updateTask(selectedTask.id, { sort_order: prevTask.sort_order })
    updateTask(prevTask.id, { sort_order: tempOrder })
    recalcWBS()
  }

  // 아래로 이동
  const handleMoveDown = () => {
    if (!selectedTask) return
    const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
    const index = sorted.findIndex((t) => t.id === selectedTask.id)
    if (index >= sorted.length - 1) return

    const nextTask = sorted[index + 1]
    const tempOrder = selectedTask.sort_order

    updateTask(selectedTask.id, { sort_order: nextTask.sort_order })
    updateTask(nextTask.id, { sort_order: tempOrder })
    recalcWBS()
  }

  // 작업 상세 편집 다이얼로그
  const handleEditTask = () => {
    if (!selectedId) return
    onOpenTaskDialog(selectedId)
  }

  // WBS 코드 재계산
  const recalcWBS = () => {
    setTimeout(async () => {
      const currentTasks = useTaskStore.getState().tasks
      let updated = recalculateWBSCodes(currentTasks)
      // 자식이 없는데 is_group인 작업을 자동 해제
      updated = updated.map((task) => {
        if (task.is_group) {
          const hasChildren = updated.some((t) => t.parent_id === task.id)
          if (!hasChildren) return { ...task, is_group: false }
        }
        return task
      })
      setTasks(updated)
      // DB에도 wbs_code/wbs_level/sort_order 업데이트
      const { supabase } = await import('@/lib/supabase')
      for (const task of updated) {
        const original = currentTasks.find((t) => t.id === task.id)
        if (!original) continue
        const changed =
          original.wbs_code !== task.wbs_code ||
          original.wbs_level !== task.wbs_level ||
          original.is_group !== task.is_group ||
          original.sort_order !== task.sort_order
        if (changed) {
          supabase.from('tasks').update({
            wbs_code: task.wbs_code,
            wbs_level: task.wbs_level,
            is_group: task.is_group,
            sort_order: task.sort_order,
          }).eq('id', task.id)
            .then(({ error }) => { if (error) console.error('WBS 업데이트 실패:', error.message) })
        }
      }
    }, 0)
  }

  const handleDownloadTemplate = () => {
    downloadWbsExcelTemplate()
  }

  const handleExpandToLevel = async (level: number) => {
    const updated = tasks.map((task) => {
      if (!task.is_group) return task
      return {
        ...task,
        is_collapsed: task.wbs_level >= level,
      }
    })
    setTasks(updated)

    const { supabase } = await import('@/lib/supabase')
    for (const task of updated) {
      const original = tasks.find((item) => item.id === task.id)
      if (!original || original.is_collapsed === task.is_collapsed) continue
      supabase
        .from('tasks')
        .update({ is_collapsed: task.is_collapsed })
        .eq('id', task.id)
        .then(({ error }) => {
          if (error) console.error('WBS 레벨 펼치기 저장 실패:', error.message)
        })
    }
  }

  const ToolbarButton = ({
    icon: Icon,
    label,
    onClick,
    disabled,
  }: {
    icon: React.ElementType
    label: string
    onClick: () => void
    disabled?: boolean
  }) => (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-md border border-transparent text-[#41454d] hover:border-[#dddddd] hover:bg-[#f7f3ec] hover:text-[#181d26]"
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )

  return (
    <div className="flex h-11 items-center gap-1 border-b border-[#dddddd] bg-[#fbfaf7] px-4">
      <ToolbarButton icon={Undo2} label="실행 취소 (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
      <ToolbarButton icon={Redo2} label="다시 실행 (Ctrl+Y)" onClick={redo} disabled={!canRedo} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton icon={Plus} label="작업 추가" onClick={handleAddTask} />
      <ToolbarButton icon={Trash2} label="작업 삭제 (Delete)" onClick={handleDeleteTask} disabled={!hasSelection} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton icon={Indent} label="들여쓰기 (Tab)" onClick={handleIndent} disabled={!selectedTask || !findIndentParent(tasks, selectedTask.id)} />
      <ToolbarButton icon={Outdent} label="내어쓰기 (Shift+Tab)" onClick={handleOutdent} disabled={!selectedTask || (selectedTask?.wbs_level ?? 0) <= 1} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton icon={ArrowUp} label="위로 이동" onClick={handleMoveUp} disabled={!selectedTask} />
      <ToolbarButton icon={ArrowDown} label="아래로 이동" onClick={handleMoveDown} disabled={!selectedTask} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton icon={FileEdit} label="작업 상세 편집" onClick={handleEditTask} disabled={!selectedId} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[11px] font-medium text-[#727780]">레벨 펼치기</span>
        {[1, 2, 3, 4, 5].map((level) => (
          <Button
            key={level}
            variant="outline"
            size="sm"
            className="h-7 w-8 border-[#dddddd] bg-white px-0 text-xs text-[#41454d] hover:bg-[#f7f3ec]"
            onClick={() => void handleExpandToLevel(level)}
            title={`${level}레벨까지 펼치기`}
          >
            {level}
          </Button>
        ))}
      </div>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <div className="flex items-center gap-2 px-1">
        <span className="text-[11px] font-medium text-[#727780]">줄간격</span>
        <input
          type="range"
          min={20}
          max={60}
          step={2}
          value={rowHeight}
          onChange={(e) => setRowHeight(Number(e.target.value))}
          className="h-1.5 w-24 accent-primary"
          title="줄간격 조절"
        />
        <span className="w-5 text-right text-[11px] font-semibold tabular-nums text-[#181d26]">{rowHeight}</span>
      </div>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        icon={ListOrdered}
        label="WBS 순번 재정렬 (전체 재계산)"
        onClick={() => {
          if (!confirm('전체 작업의 WBS 코드와 순번을 트리 구조 기준으로 재계산하시겠습니까?')) return
          recalcWBS()
        }}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md border border-transparent text-[#41454d] hover:border-[#dddddd] hover:bg-[#f7f3ec] hover:text-[#181d26]"
            title={canManageWbsImport ? 'WBS 일괄등록 도구' : '관리자 또는 PM만 사용할 수 있습니다'}
            disabled={!canManageWbsImport}
          >
            <FileSpreadsheet className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48 border-[#dddddd] bg-white">
          <DropdownMenuGroup>
            <DropdownMenuLabel>WBS 일괄등록</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-xs" onClick={handleDownloadTemplate} disabled={!canManageWbsImport}>
              <Download className="h-3.5 w-3.5" />
              양식 다운로드
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => setExcelDialogOpen(true)} disabled={!canManageWbsImport}>
              <FileSpreadsheet className="h-3.5 w-3.5" />
              엑셀 등록
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant={showProgressLine ? 'default' : 'ghost'}
        size="icon"
        className={cn(
          'h-8 w-8 rounded-md',
          showProgressLine
            ? 'bg-[#181d26] text-white hover:bg-[#2a3140]'
            : 'border border-transparent text-[#41454d] hover:border-[#dddddd] hover:bg-[#f7f3ec] hover:text-[#181d26]'
        )}
        onClick={toggleProgressLine}
        title="Progress Line 표시/숨기기"
      >
        <TrendingUp className="h-4 w-4" />
      </Button>

      <Button
        variant={showArchived ? 'default' : 'ghost'}
        size="icon"
        className={cn(
          'h-8 w-8 rounded-md',
          showArchived
            ? 'bg-[#181d26] text-white hover:bg-[#2a3140]'
            : 'border border-transparent text-[#41454d] hover:border-[#dddddd] hover:bg-[#f7f3ec] hover:text-[#181d26]'
        )}
        onClick={toggleShowArchived}
        title={showArchived ? '아카이브 숨기기' : '아카이브 보기'}
      >
        <Archive className="h-4 w-4" />
      </Button>

      {/* 복원 버튼 - 아카이브된 작업 선택 시 */}
      {selectedTask?.archived_at && (
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleRestoreTask}>
          <ArrowUp className="h-3.5 w-3.5 mr-1" />복원
        </Button>
      )}

      <ToolbarButton icon={CalendarCheck} label="오늘로 이동" onClick={() => onScrollToToday?.()} />

      {/* 선택 정보 */}
      {selectedTask && (
        <span className="ml-3 text-xs text-[#727780]">
          선택: [{selectedTask.wbs_code}] {selectedTask.task_name}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* 컬럼 설정 */}
      <ColumnSettingsDropdown />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant={showFilterPanel || hasActiveFilters ? 'default' : 'outline'}
        size="sm"
        className={cn(
          'h-8 gap-1.5 text-xs',
          hasActiveFilters
            ? 'border-[#181d26] bg-[#181d26] text-white hover:bg-[#2a3140]'
            : showFilterPanel
              ? 'border-[#d9d3c8] bg-[#f7f3ec] text-[#181d26] hover:bg-[#f1ebdf]'
              : 'border-[#dddddd] bg-white text-[#41454d] hover:bg-[#f7f3ec]'
        )}
        onClick={toggleFilterPanel}
        title={hasActiveFilters ? `필터 ${activeFilterCount}개 적용 중` : '필터 패널 열기/닫기'}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        필터
        {hasActiveFilters && (
          <span className="ml-0.5 rounded-full bg-white/20 px-1.5 text-[10px] font-bold">{activeFilterCount}</span>
        )}
      </Button>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs font-semibold text-[#aa2d00] hover:bg-[#f7e3da] hover:text-[#8f2600]"
          onClick={resetGanttFilters}
          title="적용된 필터 초기화"
        >
          초기화
        </Button>
      )}

      {/* 검색 입력창 */}
      <div className="relative flex items-center ml-2">
        <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-[#727780]" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="작업명 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearchQuery('')
              searchInputRef.current?.blur()
            }
          }}
          className="h-8 w-52 border-[#dddddd] bg-white pl-7 pr-7 text-xs focus-visible:ring-[#f5e9d4]"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-1.5 rounded-sm p-0.5 hover:bg-[#f7f3ec]"
            title="검색 초기화 (ESC)"
          >
            <X className="h-3 w-3 text-[#727780]" />
          </button>
        )}
      </div>

      {project && (
        <WbsExcelImportDialog
          open={excelDialogOpen}
          onOpenChange={(nextOpen) => {
            if (nextOpen && !canManageWbsImport) return
            setExcelDialogOpen(nextOpen)
          }}
          projectId={project.id}
          currentMaxSortOrder={tasks.length > 0 ? Math.max(...tasks.map((task) => task.sort_order)) : 0}
          onImported={recalcWBS}
        />
      )}
    </div>
  )
}
