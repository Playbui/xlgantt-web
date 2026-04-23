import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  Link2,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useTaskStore } from '@/stores/task-store'
import { useResourceStore } from '@/stores/resource-store'
import { useAuthStore } from '@/stores/auth-store'
import type { Task, DependencyType, TaskWorkspaceAttachment, TaskWorkspaceComment, TaskWorkspaceLink } from '@/lib/types'
import { DEP_TYPE_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MemberPicker } from '@/components/common/MemberPicker'
import { DatePicker } from '@/components/ui/date-picker'
import { RichContentEditor } from '@/components/task-workspace/RichContentEditor'
import { supabase } from '@/lib/supabase'

interface TaskEditDialogProps {
  taskId: string | null
  open: boolean
  onClose: () => void
}

function Section({
  title,
  count,
  children,
  className,
  brand = false,
}: {
  title: string
  count?: number
  children: React.ReactNode
  className?: string
  brand?: boolean
}) {
  return (
    <div className={cn('rounded-lg border border-border/60 bg-card overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/30">
        <div className={cn('h-4 w-1 rounded-full bg-foreground/75', brand && 'bg-gradient-to-b from-cyan-500 to-emerald-500')} />
        <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{title}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[10px]">
            {count}
          </Badge>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground/80 tracking-tight">
        {label}
      </label>
      {children}
    </div>
  )
}

function formatBytes(size: number) {
  if (size < 1024) return `${size}B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`
  return `${(size / 1048576).toFixed(1)}MB`
}

export function TaskEditDialog({ taskId, open, onClose }: TaskEditDialogProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const { tasks, dependencies, addDependency, removeDependency, _updateTaskSilent } = useTaskStore()
  const {
    companies,
    members,
    assignments,
    taskDetails,
    addAssignment,
    updateAssignment,
    removeAssignment,
    addTaskDetail,
    updateTaskDetail,
    deleteTaskDetail,
    uploadAttachment,
    removeAttachment,
  } = useResourceStore()

  const task = taskId ? tasks.find((t) => t.id === taskId) : null

  const [taskName, setTaskName] = useState('')
  const [taskSummary, setTaskSummary] = useState('')
  const [taskBody, setTaskBody] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')
  const [actualProgress, setActualProgress] = useState('')
  const [calendarType, setCalendarType] = useState('STD')
  const [isMilestone, setIsMilestone] = useState(false)
  const [newPredId, setNewPredId] = useState('')
  const [newPredType, setNewPredType] = useState<DependencyType>(1)
  const [newSuccId, setNewSuccId] = useState('')
  const [newSuccType, setNewSuccType] = useState<DependencyType>(1)
  const [newAssignMemberIds, setNewAssignMemberIds] = useState<string[]>([])
  const [newAssignPercent, setNewAssignPercent] = useState('100')
  const [newDetailTitle, setNewDetailTitle] = useState('')
  const [hideCompletedDetails, setHideCompletedDetails] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [taskUploading, setTaskUploading] = useState(false)
  const [taskAttachments, setTaskAttachments] = useState<TaskWorkspaceAttachment[]>([])
  const [taskComments, setTaskComments] = useState<TaskWorkspaceComment[]>([])
  const [taskLinks, setTaskLinks] = useState<TaskWorkspaceLink[]>([])
  const [newComment, setNewComment] = useState('')
  const [newLinkTitle, setNewLinkTitle] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const didInitRef = useRef(false)
  const lastSavedRef = useRef('')

  useEffect(() => {
    if (!task) return
    setTaskName(task.task_name || '')
    setTaskSummary(task.task_summary || task.remarks || '')
    setTaskBody(task.task_body || '')
    setPlannedStart(task.planned_start || '')
    setPlannedEnd(task.planned_end || '')
    setActualProgress(String(Math.round((task.actual_progress || 0) * 100)))
    setCalendarType(task.calendar_type || 'STD')
    setIsMilestone(task.is_milestone || false)
    setTaskAttachments(task.task_attachments || [])
    setTaskComments(task.task_comments || [])
    setTaskLinks(task.task_links || [])
    setNewComment('')
    setNewLinkTitle('')
    setNewLinkUrl('')
    setAutoSaveState('idle')
    didInitRef.current = false
  }, [task])

  const taskAssignments = useMemo(() => {
    if (!taskId) return []
    return assignments.filter((a) => a.task_id === taskId).map((a) => {
      const member = members.find((m) => m.id === a.member_id)
      const company = member ? companies.find((c) => c.id === member.company_id) : null
      return { ...a, member, company }
    })
  }, [taskId, assignments, members, companies])

  const predecessors = useMemo(() => {
    if (!taskId) return []
    return dependencies.filter((d) => d.successor_id === taskId).map((d) => ({
      ...d,
      task: tasks.find((t) => t.id === d.predecessor_id),
    }))
  }, [taskId, dependencies, tasks])

  const successors = useMemo(() => {
    if (!taskId) return []
    return dependencies.filter((d) => d.predecessor_id === taskId).map((d) => ({
      ...d,
      task: tasks.find((t) => t.id === d.successor_id),
    }))
  }, [taskId, dependencies, tasks])

  const availableForPred = useMemo(() => {
    if (!taskId) return []
    const existingIds = new Set(predecessors.map((p) => p.predecessor_id))
    return tasks.filter((t) => t.id !== taskId && !existingIds.has(t.id))
  }, [taskId, tasks, predecessors])

  const availableForSucc = useMemo(() => {
    if (!taskId) return []
    const existingIds = new Set(successors.map((s) => s.successor_id))
    return tasks.filter((t) => t.id !== taskId && !existingIds.has(t.id))
  }, [taskId, tasks, successors])

  const currentDetails = useMemo(() => {
    if (!taskId) return []
    return taskDetails
      .filter((d) => d.task_id === taskId)
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [taskId, taskDetails])

  const visibleDetails = useMemo(
    () => currentDetails.filter((d) => !hideCompletedDetails || d.status !== 'done'),
    [currentDetails, hideCompletedDetails]
  )

  const detailProgress = useMemo(() => {
    if (currentDetails.length === 0) return 0
    const done = currentDetails.filter((d) => d.status === 'done').length
    return Math.round((done / currentDetails.length) * 100)
  }, [currentDetails])

  useEffect(() => {
    if (!taskId || !task || !open) return

    const payload = JSON.stringify({
      taskName,
      taskSummary,
      taskBody,
      plannedStart,
      plannedEnd,
      actualProgress: currentDetails.length > 0 ? detailProgress : actualProgress,
      calendarType,
      isMilestone,
      taskAttachments,
      taskComments,
      taskLinks,
    })

    if (!didInitRef.current) {
      didInitRef.current = true
      lastSavedRef.current = payload
      return
    }

    if (payload === lastSavedRef.current) return

    setAutoSaveState('saving')
    const timer = window.setTimeout(() => {
      const changes: Partial<Task> = {
        task_name: taskName,
        task_summary: taskSummary || undefined,
        task_body: taskBody || undefined,
        remarks: taskSummary || undefined,
        planned_start: plannedStart || undefined,
        planned_end: isMilestone && plannedStart ? plannedStart : (plannedEnd || undefined),
        calendar_type: calendarType as 'STD' | 'UD1' | 'UD2',
        is_milestone: isMilestone,
        task_attachments: taskAttachments,
        task_comments: taskComments,
        task_links: taskLinks,
        updated_by: currentUser?.id,
      }

      if (currentDetails.length === 0) {
        changes.actual_progress = actualProgress ? parseFloat(actualProgress) / 100 : 0
      }

      _updateTaskSilent(taskId, changes)
      lastSavedRef.current = payload
      setAutoSaveState('saved')
    }, 900)

    return () => window.clearTimeout(timer)
  }, [
    taskId,
    task,
    open,
    taskName,
    taskSummary,
    taskBody,
    plannedStart,
    plannedEnd,
    actualProgress,
    calendarType,
    isMilestone,
    taskAttachments,
    taskComments,
    taskLinks,
    currentDetails.length,
    detailProgress,
    currentUser?.id,
    _updateTaskSilent,
  ])

  const detailAttachmentItems = useMemo(() => {
    return currentDetails.flatMap((detail) =>
      (detail.attachments || []).map((attachment) => ({
        detail,
        attachment,
      }))
    )
  }, [currentDetails])

  const handleAddPred = () => {
    if (!taskId || !newPredId) return
    addDependency({
      id: crypto.randomUUID(),
      project_id: task?.project_id || '',
      predecessor_id: newPredId,
      successor_id: taskId,
      dep_type: newPredType,
      lag_days: 0,
      created_at: new Date().toISOString(),
    })
    setNewPredId('')
  }

  const handleAddSucc = () => {
    if (!taskId || !newSuccId) return
    addDependency({
      id: crypto.randomUUID(),
      project_id: task?.project_id || '',
      predecessor_id: taskId,
      successor_id: newSuccId,
      dep_type: newSuccType,
      lag_days: 0,
      created_at: new Date().toISOString(),
    })
    setNewSuccId('')
  }

  const handleAddAssignment = () => {
    if (!taskId || newAssignMemberIds.length === 0) return
    const existingMemberIds = new Set(taskAssignments.map((a) => a.member_id))
    newAssignMemberIds.forEach((memberId) => {
      if (!existingMemberIds.has(memberId)) {
        addAssignment({
          id: crypto.randomUUID(),
          task_id: taskId,
          member_id: memberId,
          allocation_percent: parseInt(newAssignPercent, 10) || 100,
        })
      }
    })
    setNewAssignMemberIds([])
  }

  const handleAddDetail = () => {
    if (!taskId || !newDetailTitle.trim()) return
    addTaskDetail({
      id: crypto.randomUUID(),
      task_id: taskId,
      sort_order: currentDetails.length * 1000 + 1000,
      title: newDetailTitle.trim(),
      status: 'todo',
      created_at: new Date().toISOString(),
    })
    setNewDetailTitle('')
  }

  const handleDetailStatusSet = (detailId: string, newStatus: 'todo' | 'in_progress' | 'done') => {
    updateTaskDetail(detailId, { status: newStatus })
  }

  const handleDetailStatusChange = (detailId: string, currentStatus: string) => {
    const next =
      currentStatus === 'todo'
        ? 'in_progress'
        : currentStatus === 'in_progress'
          ? 'done'
          : 'todo'
    handleDetailStatusSet(detailId, next as 'todo' | 'in_progress' | 'done')
  }

  const handleAddTaskComment = () => {
    if (!newComment.trim()) return
    const comment: TaskWorkspaceComment = {
      id: crypto.randomUUID(),
      user_id: currentUser?.id || 'system',
      user_name: currentUser?.name || '시스템',
      content: newComment.trim(),
      created_at: new Date().toISOString(),
    }
    setTaskComments((prev) => [...prev, comment])
    setNewComment('')
  }

  const handleDeleteTaskComment = (commentId: string) => {
    setTaskComments((prev) => prev.filter((comment) => comment.id !== commentId))
  }

  const handleAddTaskLink = () => {
    if (!newLinkTitle.trim() || !newLinkUrl.trim()) return
    const link: TaskWorkspaceLink = {
      id: crypto.randomUUID(),
      title: newLinkTitle.trim(),
      url: newLinkUrl.trim(),
      created_by: currentUser?.id || 'system',
      created_at: new Date().toISOString(),
    }
    setTaskLinks((prev) => [...prev, link])
    setTaskBody((prev) => `${prev}${prev.trim() ? '\n' : ''}<div data-link-card="true" style="margin:12px 0; border:1px solid rgba(55,53,47,.12); border-radius:10px; padding:12px 14px; background:rgba(247,246,243,.72);">
  <div style="font-size:13px; font-weight:600; color:#37352f;">${link.title.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</div>
  <a href="${link.url}" target="_blank" rel="noreferrer" style="display:block; margin-top:4px; font-size:12px; color:#2f6feb; text-decoration:none;">${link.url.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</a>
</div><p></p>`)
    setNewLinkTitle('')
    setNewLinkUrl('')
  }

  const handleDeleteTaskLink = (linkId: string) => {
    setTaskLinks((prev) => prev.filter((link) => link.id !== linkId))
  }

  const uploadTaskWorkspaceFiles = async (files: File[]) => {
    if (!taskId || files.length === 0) return []

    const uploadedItems: TaskWorkspaceAttachment[] = []
    const uploadedUrls: string[] = []

    for (const file of files) {
      const attachmentId = crypto.randomUUID()
      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const storagePath = `${taskId}/_task_workspace/${attachmentId}_${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('task-attachments')
        .upload(storagePath, file, { upsert: false })

      if (uploadError) {
        console.error('작업 자료 업로드 실패:', uploadError.message)
        continue
      }

      const { data } = supabase.storage
        .from('task-attachments')
        .getPublicUrl(storagePath)

      const attachment: TaskWorkspaceAttachment = {
        id: attachmentId,
        filename: file.name,
        size: file.size,
        type: file.type,
        storage_path: storagePath,
        url: data.publicUrl,
        uploaded_by: currentUser?.id || 'system',
        uploaded_name: currentUser?.name || '시스템',
        uploaded_at: new Date().toISOString(),
      }

      uploadedItems.push(attachment)
      uploadedUrls.push(data.publicUrl)
    }

    if (uploadedItems.length > 0) {
      setTaskAttachments((prev) => [...prev, ...uploadedItems])
    }

    return uploadedUrls
  }

  const handleUploadTaskAttachments = async (files: File[]) => {
    setTaskUploading(true)
    try {
      await uploadTaskWorkspaceFiles(files)
    } finally {
      setTaskUploading(false)
    }
  }

  const handleDeleteTaskAttachment = async (attachmentId: string) => {
    const target = taskAttachments.find((attachment) => attachment.id === attachmentId)
    if (!target) return

    setTaskAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId))

    if (target.storage_path) {
      const { error } = await supabase.storage
        .from('task-attachments')
        .remove([target.storage_path])

      if (error) {
        console.error('작업 자료 삭제 실패:', error.message)
      }
    }
  }

  if (!task) return null

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-[1240px] w-[96vw] max-h-[92vh] overflow-hidden p-0">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Badge variant="outline" className="bg-primary/5 px-2 py-0.5 font-mono text-sm border-primary/20">
              {task.wbs_code}
            </Badge>
            <span className="truncate text-base font-semibold">{task.task_name || '작업 상세'}</span>
            <Badge variant="secondary" className="h-5 px-2 text-[10px]">
              {currentDetails.length > 0 ? `세부항목 ${currentDetails.length}` : '작업 문서'}
            </Badge>
            {taskAssignments.length > 0 && (
              <Badge className="h-5 px-2 text-[10px] bg-cyan-50 text-cyan-700 border border-cyan-200">
                담당 {taskAssignments.length}명
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex items-center text-[11px] text-muted-foreground">
              {autoSaveState === 'saving' && '자동 저장 중...'}
              {autoSaveState === 'saved' && '자동 저장됨'}
              {autoSaveState === 'idle' && '자동 저장 대기'}
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>닫기</Button>
          </div>
        </div>

        <div className="grid max-h-[calc(92vh-57px)] grid-cols-[minmax(0,1.2fr)_380px] overflow-hidden">
          <div className="overflow-y-auto border-r bg-background">
            <div className="space-y-4 p-5">
              <Section title="작업 개요" brand>
                <div className="space-y-3">
                  <Field label="작업명">
                    <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} className="h-9 text-sm font-medium" />
                  </Field>
                  <Field label="한 줄 요약">
                    <textarea
                      value={taskSummary}
                      onChange={(e) => setTaskSummary(e.target.value)}
                      rows={3}
                      placeholder="이 항목의 현재 상태나 핵심 판단을 짧게 정리하세요"
                      className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                  </Field>
                </div>
              </Section>

              <Section title="작업 본문" brand>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>조사 내용, 회의 메모, 판단 근거, 다음 액션을 한 흐름으로 정리합니다.</span>
                    <span>{taskBody.length.toLocaleString()}자</span>
                  </div>
                  <RichContentEditor
                    value={taskBody}
                    onChange={setTaskBody}
                    minHeight={420}
                    placeholder={'예)\n- 조사 배경\n- 현재까지 확인된 내용\n- 비교안 A / B\n- 미결 이슈\n- 다음 액션'}
                    onUploadImages={async (files) => {
                      setTaskUploading(true)
                      try {
                        return await uploadTaskWorkspaceFiles(files)
                      } finally {
                        setTaskUploading(false)
                      }
                    }}
                  />
                </div>
              </Section>

              <Section title="실행 체크리스트" count={currentDetails.length}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${detailProgress}%` }} />
                    </div>
                    <span className="tabular-nums text-[11px] font-medium text-primary">{detailProgress}%</span>
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={hideCompletedDetails}
                      onChange={(e) => setHideCompletedDetails(e.target.checked)}
                      className="h-3 w-3 rounded accent-primary"
                    />
                    완료 숨기기
                  </label>
                  <div className="ml-auto flex gap-2">
                    <Input
                      placeholder="새 세부항목 제목..."
                      value={newDetailTitle}
                      onChange={(e) => setNewDetailTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddDetail()}
                      className="h-8 w-56 text-xs"
                    />
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleAddDetail} disabled={!newDetailTitle.trim()}>
                      <Plus className="mr-1 h-3 w-3" />
                      추가
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {visibleDetails.map((detail) => {
                    const accent = {
                      todo: { card: 'border-l-amber-400 bg-amber-50/30', chip: 'bg-amber-100 text-amber-700 border-amber-200', check: 'text-amber-500', label: '대기' },
                      in_progress: { card: 'border-l-blue-400 bg-blue-50/30', chip: 'bg-blue-100 text-blue-700 border-blue-200', check: 'text-blue-500', label: '진행중' },
                      done: { card: 'border-l-emerald-400 bg-emerald-50/30', chip: 'bg-emerald-100 text-emerald-700 border-emerald-200', check: 'text-emerald-500', label: '완료' },
                    }[detail.status]

                    return (
                      <div key={detail.id} className={cn('space-y-1.5 rounded-md border border-border/40 border-l-[3px] px-2.5 py-2 shadow-sm transition-all hover:shadow', accent.card)}>
                        <div className="flex items-center gap-1.5">
                          <button className="shrink-0" onClick={() => handleDetailStatusChange(detail.id, detail.status)}>
                            {detail.status === 'done'
                              ? <CheckSquare className={cn('h-4 w-4', accent.check)} />
                              : <Square className={cn('h-4 w-4', accent.check)} />
                            }
                          </button>
                          <Input
                            value={detail.title}
                            onChange={(e) => updateTaskDetail(detail.id, { title: e.target.value })}
                            className={cn(
                              'h-7 flex-1 border-transparent bg-white/80 px-1.5 text-xs font-medium shadow-none focus-visible:border-border focus-visible:ring-1',
                              detail.status === 'done' && 'text-muted-foreground line-through'
                            )}
                          />
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deleteTaskDetail(detail.id)}>
                            <X className="h-3 w-3 text-red-500" />
                          </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pl-6">
                          <Select value={detail.status} onValueChange={(value) => handleDetailStatusSet(detail.id, value as 'todo' | 'in_progress' | 'done')}>
                            <SelectTrigger className={cn('h-6 min-w-[68px] rounded-full border px-2.5 text-[11px] font-semibold shadow-none', accent.chip)}>
                              <SelectValue>{accent.label}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="todo">대기</SelectItem>
                              <SelectItem value="in_progress">진행중</SelectItem>
                              <SelectItem value="done">완료</SelectItem>
                            </SelectContent>
                          </Select>

                          <MemberPicker
                            value={detail.assignee_ids || (detail.assignee_id ? [detail.assignee_id] : [])}
                            onChange={(ids) => updateTaskDetail(detail.id, { assignee_ids: ids, assignee_id: ids[0] || undefined })}
                            placeholder="담당자"
                            size="sm"
                          />

                          <DatePicker
                            value={detail.due_date || ''}
                            onChange={(value) => updateTaskDetail(detail.id, { due_date: value || undefined })}
                            placeholder="기한 없음"
                            className="h-6 rounded-full border border-border/40 bg-white/60 px-2 text-[11px]"
                          />
                        </div>

                        <div className="pl-6">
                          <textarea
                            value={detail.description || ''}
                            onChange={(e) => updateTaskDetail(detail.id, { description: e.target.value })}
                            rows={2}
                            placeholder="메모..."
                            className="w-full rounded border border-border/40 bg-white/60 px-2 py-1 text-[11px] text-foreground/70 outline-none placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {currentDetails.length === 0 && (
                  <div className="py-6 text-center text-xs text-muted-foreground/40">
                    세부항목이 없습니다
                  </div>
                )}
              </Section>
            </div>
          </div>

          <div className="overflow-y-auto bg-muted/10">
            <div className="space-y-4 p-5">
              <Section title="작업 속성">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="계획 시작">
                    <DatePicker value={plannedStart} onChange={setPlannedStart} placeholder="선택" className="h-8 text-xs" />
                  </Field>
                  <Field label="계획 완료">
                    <DatePicker value={plannedEnd} onChange={setPlannedEnd} placeholder="선택" className="h-8 text-xs" />
                  </Field>
                  <Field label="진척률">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={currentDetails.length > 0 ? detailProgress : actualProgress}
                      onChange={(e) => setActualProgress(e.target.value)}
                      disabled={currentDetails.length > 0}
                      className={cn('h-8 text-xs', currentDetails.length > 0 && 'bg-muted/60 text-muted-foreground')}
                    />
                  </Field>
                  <Field label="일정 타입">
                    <Select value={calendarType} onValueChange={(value) => setCalendarType(value || 'STD')}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STD">표준</SelectItem>
                        <SelectItem value="UD1">사용자1</SelectItem>
                        <SelectItem value="UD2">사용자2</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="유형" className="col-span-2">
                    <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-xs">
                      <input type="checkbox" checked={isMilestone} onChange={(e) => setIsMilestone(e.target.checked)} className="h-3.5 w-3.5 rounded accent-primary" />
                      마일스톤으로 표시
                    </label>
                  </Field>
                </div>
              </Section>

              <Section title="담당자" count={taskAssignments.length}>
                <div className="space-y-2">
                  {taskAssignments.map((assignment) => (
                    <div key={assignment.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-2.5 py-2">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: assignment.company?.color || '#888' }}
                      >
                        {assignment.member?.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{assignment.member?.name || '?'}</div>
                        <div className="text-[10px] text-muted-foreground">{assignment.company?.shortName || '소속 미지정'}</div>
                      </div>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={assignment.allocation_percent}
                        onChange={(e) => updateAssignment(assignment.id, { allocation_percent: parseInt(e.target.value, 10) || 100 })}
                        className="h-7 w-16 text-right text-[11px]"
                      />
                      <span className="text-[10px] text-muted-foreground">%</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeAssignment(assignment.id)}>
                        <X className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <div className="flex-1">
                      <MemberPicker value={newAssignMemberIds} onChange={setNewAssignMemberIds} placeholder="담당자 선택..." size="sm" />
                    </div>
                    <Input type="number" min="1" max="100" value={newAssignPercent} onChange={(e) => setNewAssignPercent(e.target.value)} className="h-8 w-16 text-xs" />
                    <Button size="sm" variant="outline" className="h-8" onClick={handleAddAssignment} disabled={newAssignMemberIds.length === 0}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Section>

              <Section title="의존관계" count={predecessors.length + successors.length}>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <ArrowLeft className="h-3 w-3 text-blue-500" />
                      <span className="text-[11px] font-semibold text-muted-foreground">선행 작업</span>
                    </div>
                    <div className="space-y-1">
                      {predecessors.map((pred) => (
                        <div key={pred.id} className="flex items-center gap-1.5 rounded-md border border-blue-100/60 bg-blue-50/40 px-2 py-1">
                          <code className="text-[10px] text-blue-600/70">{pred.task?.wbs_code}</code>
                          <span className="flex-1 truncate text-xs">{pred.task?.task_name || '?'}</span>
                          <Badge variant="outline" className="h-4 border-blue-200 px-1 text-[10px] text-blue-600">
                            {DEP_TYPE_LABELS[pred.dep_type]}
                          </Badge>
                          <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => removeDependency(pred.id)}>
                            <X className="h-2.5 w-2.5 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      <Select value={newPredId} onValueChange={(value) => setNewPredId(value || '')}>
                        <SelectTrigger className="h-7 flex-1 text-xs">
                          <SelectValue placeholder="선행 작업 선택..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableForPred.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              [{item.wbs_code}] {item.task_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={String(newPredType)} onValueChange={(value) => setNewPredType(Number(value) as DependencyType)}>
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue>{DEP_TYPE_LABELS[newPredType]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">{DEP_TYPE_LABELS[1]}</SelectItem>
                          <SelectItem value="2">{DEP_TYPE_LABELS[2]}</SelectItem>
                          <SelectItem value="3">{DEP_TYPE_LABELS[3]}</SelectItem>
                          <SelectItem value="4">{DEP_TYPE_LABELS[4]}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleAddPred} disabled={!newPredId}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <ArrowRight className="h-3 w-3 text-emerald-500" />
                      <span className="text-[11px] font-semibold text-muted-foreground">후행 작업</span>
                    </div>
                    <div className="space-y-1">
                      {successors.map((succ) => (
                        <div key={succ.id} className="flex items-center gap-1.5 rounded-md border border-emerald-100/60 bg-emerald-50/40 px-2 py-1">
                          <code className="text-[10px] text-emerald-600/70">{succ.task?.wbs_code}</code>
                          <span className="flex-1 truncate text-xs">{succ.task?.task_name || '?'}</span>
                          <Badge variant="outline" className="h-4 border-emerald-200 px-1 text-[10px] text-emerald-600">
                            {DEP_TYPE_LABELS[succ.dep_type]}
                          </Badge>
                          <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => removeDependency(succ.id)}>
                            <X className="h-2.5 w-2.5 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      <Select value={newSuccId} onValueChange={(value) => setNewSuccId(value || '')}>
                        <SelectTrigger className="h-7 flex-1 text-xs">
                          <SelectValue placeholder="후행 작업 선택..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableForSucc.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              [{item.wbs_code}] {item.task_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={String(newSuccType)} onValueChange={(value) => setNewSuccType(Number(value) as DependencyType)}>
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue>{DEP_TYPE_LABELS[newSuccType]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">{DEP_TYPE_LABELS[1]}</SelectItem>
                          <SelectItem value="2">{DEP_TYPE_LABELS[2]}</SelectItem>
                          <SelectItem value="3">{DEP_TYPE_LABELS[3]}</SelectItem>
                          <SelectItem value="4">{DEP_TYPE_LABELS[4]}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleAddSucc} disabled={!newSuccId}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="참고 링크" count={taskLinks.length}>
                <div className="space-y-2">
                  {taskLinks.map((link) => (
                    <div key={link.id} className="flex items-start gap-2 rounded-md bg-muted/30 px-2.5 py-2">
                      <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{link.title}</div>
                        <a href={link.url} target="_blank" rel="noreferrer" className="truncate text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                          {link.url}
                        </a>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteTaskLink(link.id)}>
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  <div className="space-y-2 border-t border-border/40 pt-2">
                    <Input value={newLinkTitle} onChange={(e) => setNewLinkTitle(e.target.value)} placeholder="링크 제목" className="h-8 text-xs" />
                    <div className="flex gap-2">
                      <Input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="https://..." className="h-8 text-xs" />
                      <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={handleAddTaskLink} disabled={!newLinkTitle.trim() || !newLinkUrl.trim()}>
                        <Plus className="mr-1 h-3 w-3" />
                        추가
                      </Button>
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="협업 메모" count={taskComments.length}>
                <div className="space-y-2">
                  {taskComments.map((comment) => (
                    <div key={comment.id} className="rounded-md border border-border/50 bg-background px-2.5 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-semibold text-foreground">{comment.user_name}</span>
                          <span className="text-muted-foreground">
                            {new Date(comment.created_at).toLocaleString('ko-KR')}
                          </span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleDeleteTaskComment(comment.id)}>
                          <X className="h-3 w-3 text-red-500" />
                        </Button>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-5 text-foreground/80">{comment.content}</p>
                    </div>
                  ))}

                  <div className="space-y-2 border-t border-border/40 pt-2">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={3}
                      placeholder="짧은 의견, 요청, 확인사항을 남기세요"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" className="h-8" onClick={handleAddTaskComment} disabled={!newComment.trim()}>
                        <MessageSquare className="mr-1 h-3 w-3" />
                        메모 추가
                      </Button>
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="작업 자료" count={taskAttachments.length}>
                <div
                  className={cn(
                    'cursor-pointer rounded-md border border-dashed p-3 text-center transition-colors',
                    taskUploading ? 'border-primary/40 bg-primary/5' : 'border-border/50 hover:border-primary/40'
                  )}
                  onClick={() => {
                    if (taskUploading) return
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.multiple = true
                    input.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.7z'
                    input.onchange = async (event) => {
                      const files = Array.from((event.target as HTMLInputElement).files || [])
                      if (files.length === 0) return
                      await handleUploadTaskAttachments(files)
                    }
                    input.click()
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDrop={async (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const files = Array.from(e.dataTransfer.files || [])
                    if (files.length === 0) return
                    await handleUploadTaskAttachments(files)
                  }}
                >
                  {taskUploading ? (
                    <Loader2 className="mx-auto mb-1 h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Paperclip className="mx-auto mb-1 h-4 w-4 text-muted-foreground/50" />
                  )}
                  <p className="text-xs text-muted-foreground/70">
                    {taskUploading ? '업로드 중...' : '파일을 드래그하거나 클릭'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/40">본문 이미지와 일반 자료를 함께 보관합니다</p>
                </div>

                {taskAttachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {taskAttachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <a href={attachment.url} target="_blank" rel="noreferrer" className="block truncate text-xs hover:text-primary">
                            {attachment.filename}
                          </a>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {attachment.uploaded_name || '시스템'} · {formatBytes(attachment.size)}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => void handleDeleteTaskAttachment(attachment.id)}>
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="실행 첨부" count={detailAttachmentItems.length}>
                <div
                  className={cn(
                    'cursor-pointer rounded-md border border-dashed p-3 text-center transition-colors',
                    uploading ? 'border-primary/40 bg-primary/5' : 'border-border/50 hover:border-primary/40'
                  )}
                  onClick={() => {
                    if (uploading || currentDetails.length === 0) return
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.multiple = true
                    input.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.7z'
                    input.onchange = async (event) => {
                      const files = (event.target as HTMLInputElement).files
                      if (!files || files.length === 0) return
                      setUploading(true)
                      const targetDetail = currentDetails[0]
                      for (const file of Array.from(files)) {
                        await uploadAttachment(targetDetail.id, file)
                      }
                      setUploading(false)
                    }
                    input.click()
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDrop={async (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (uploading || currentDetails.length === 0) return
                    const files = e.dataTransfer.files
                    if (!files || files.length === 0) return
                    setUploading(true)
                    const targetDetail = currentDetails[0]
                    for (const file of Array.from(files)) {
                      await uploadAttachment(targetDetail.id, file)
                    }
                    setUploading(false)
                  }}
                >
                  {uploading ? (
                    <Loader2 className="mx-auto mb-1 h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Paperclip className="mx-auto mb-1 h-4 w-4 text-muted-foreground/50" />
                  )}
                  <p className="text-xs text-muted-foreground/70">
                    {currentDetails.length === 0 ? '세부항목을 먼저 추가하세요' : uploading ? '업로드 중...' : '파일을 드래그하거나 클릭'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/40">현재는 세부항목 기준으로 첨부됩니다</p>
                </div>

                {detailAttachmentItems.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {detailAttachmentItems.map(({ detail, attachment }) => (
                      <div key={attachment.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <a href={attachment.url} target="_blank" rel="noreferrer" className="block truncate text-xs hover:text-primary">
                            {attachment.filename}
                          </a>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {detail.title} · {formatBytes(attachment.size)}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeAttachment(detail.id, attachment.id)}>
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
