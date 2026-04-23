import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  History,
  Link2,
  Paperclip,
  Lock,
  Save,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RichContentEditor } from '@/components/task-workspace/RichContentEditor'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import type { WorkspaceItem } from '@/lib/types'

const STATUS_LABELS = {
  draft: '초안',
  active: '진행중',
  done: '완료',
  archived: '보관',
} as const

const STATUS_TONES = {
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  active: 'bg-blue-50 text-blue-700 border-blue-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
} as const

type DraftState = Pick<WorkspaceItem, 'title' | 'summary' | 'body' | 'status' | 'linkedTaskIds' | 'access_mode' | 'shared_user_ids' | 'password_hash' | 'editor_font_size'>

const ACCESS_LABELS = {
  project: '프로젝트 공개',
  restricted: '공유자만',
  password: '비밀번호',
  private: '비공개',
} as const

async function hashText(text: string) {
  const encoded = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('')
}

function WorkspaceStatusBadge({ status }: { status: WorkspaceItem['status'] }) {
  return (
    <Badge variant="outline" className={cn('h-5 px-2 text-[10px]', STATUS_TONES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function buildTree(items: WorkspaceItem[]) {
  const byParent = new Map<string, WorkspaceItem[]>()
  for (const item of items) {
    const key = item.parent_id || 'root'
    byParent.set(key, [...(byParent.get(key) || []), item])
  }
  for (const [key, value] of byParent) {
    byParent.set(
      key,
      [...value].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
    )
  }
  return byParent
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function WorkspaceView() {
  const {
    items,
    revisions,
    attachments,
    selectedItemId,
    createItem,
    selectItem,
    updateItem,
    deleteItem,
    uploadAttachment,
    isLoading,
  } = useWorkspaceStore()
  const tasks = useTaskStore((s) => s.tasks)
  const currentProject = useProjectStore((s) => s.currentProject)
  const currentUser = useAuthStore((s) => s.currentUser)
  const users = useAuthStore((s) => s.users)

  const [query, setQuery] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [wbsDialogOpen, setWbsDialogOpen] = useState(false)
  const [metaDialogOpen, setMetaDialogOpen] = useState(false)
  const [securityDialogOpen, setSecurityDialogOpen] = useState(false)
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false)
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  const [passwordInput, setPasswordInput] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [wbsQuery, setWbsQuery] = useState('')

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ??
    items[0] ??
    null

  useEffect(() => {
    if (!selectedItem && items.length > 0) selectItem(items[0].id)
  }, [items, selectedItem, selectItem])

  useEffect(() => {
    if (!selectedItem) {
      setDraft(null)
      setDirty(false)
      return
    }
    setDraft({
      title: selectedItem.title,
      summary: selectedItem.summary || '',
      body: selectedItem.body || '',
      status: selectedItem.status,
      linkedTaskIds: selectedItem.linkedTaskIds,
      access_mode: selectedItem.access_mode,
      shared_user_ids: selectedItem.shared_user_ids,
      password_hash: selectedItem.password_hash,
      editor_font_size: selectedItem.editor_font_size || 15,
    })
    setDirty(false)
  }, [selectedItem?.id])

  useEffect(() => {
    setExpandedIds(new Set(items.filter((item) => item.parent_id).map((item) => item.parent_id!)))
  }, [items.length])

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter((item) =>
      [item.title, item.summary || '', item.body || ''].some((value) => value.toLowerCase().includes(normalized))
    )
  }, [items, query])

  const tree = useMemo(() => buildTree(filteredItems), [filteredItems])

  const linkedTasks = useMemo(() => {
    const linkedIds = draft?.linkedTaskIds || selectedItem?.linkedTaskIds || []
    return linkedIds
      .map((taskId) => tasks.find((task) => task.id === taskId))
      .filter(Boolean)
  }, [draft?.linkedTaskIds, selectedItem?.linkedTaskIds, tasks])

  const itemRevisions = useMemo(() => {
    if (!selectedItem) return []
    return revisions.filter((revision) => revision.workspace_item_id === selectedItem.id).slice(0, 12)
  }, [revisions, selectedItem])

  const itemAttachments = useMemo(() => {
    if (!selectedItem) return []
    return attachments.filter((attachment) => attachment.workspace_item_id === selectedItem.id)
  }, [attachments, selectedItem])

  const filteredTasks = useMemo(() => {
    const normalized = wbsQuery.trim().toLowerCase()
    if (!normalized) return tasks
    return tasks.filter((task) =>
      [task.wbs_code, task.task_name].some((value) => value.toLowerCase().includes(normalized))
    )
  }, [tasks, wbsQuery])

  const updateDraft = (changes: Partial<DraftState>) => {
    setDraft((prev) => (prev ? { ...prev, ...changes } : prev))
    setDirty(true)
  }

  const canManageDocument = useMemo(() => {
    if (!selectedItem || !currentUser) return false
    return currentUser.role === 'admin' || selectedItem.created_by === currentUser.id || selectedItem.updated_by === currentUser.id
  }, [currentUser, selectedItem])

  const canReadItem = (item: WorkspaceItem) => {
    if (!currentUser) return false
    if (currentUser.role === 'admin') return true
    if (item.access_mode === 'project') return true
    if (item.created_by === currentUser.id || item.updated_by === currentUser.id) return true
    if (item.access_mode === 'restricted') return item.shared_user_ids.includes(currentUser.id)
    if (item.access_mode === 'password') return unlockedIds.has(item.id)
    if (item.access_mode === 'private') return false
    return false
  }

  const selectedLocked = selectedItem ? !canReadItem(selectedItem) : false

  const saveDraft = async (changeType: Parameters<typeof updateItem>[2] = 'body') => {
    if (!selectedItem || !draft || !dirty) return
    setSaving(true)
    await updateItem(selectedItem.id, draft, changeType)
    setSaving(false)
    setDirty(false)
  }

  const handleSelectItem = (id: string) => {
    if (dirty && !confirm('저장하지 않은 변경이 있습니다. 이동하시겠습니까?')) return
    selectItem(id)
    const item = items.find((candidate) => candidate.id === id)
    if (item && item.access_mode === 'password' && !canReadItem(item)) {
      setPasswordInput('')
      setPasswordError('')
      setUnlockDialogOpen(true)
    }
  }

  const handleCreate = async (parentId?: string | null) => {
    if (!currentProject) return
    if (dirty && !confirm('저장하지 않은 변경이 있습니다. 새 문서를 만들까요?')) return
    const id = await createItem(currentProject.id, parentId)
    if (id && parentId) setExpandedIds((prev) => new Set([...prev, parentId]))
  }

  const toggleTask = (taskId: string) => {
    if (!draft) return
    const exists = draft.linkedTaskIds.includes(taskId)
    updateDraft({
      linkedTaskIds: exists
        ? draft.linkedTaskIds.filter((id) => id !== taskId)
        : [...draft.linkedTaskIds, taskId],
    })
  }

  const toggleSharedUser = (userId: string) => {
    if (!draft) return
    const exists = draft.shared_user_ids.includes(userId)
    updateDraft({
      shared_user_ids: exists
        ? draft.shared_user_ids.filter((id) => id !== userId)
        : [...draft.shared_user_ids, userId],
    })
  }

  const applyNewPassword = async () => {
    if (!newPassword.trim()) {
      updateDraft({ password_hash: undefined })
      return
    }
    updateDraft({ password_hash: await hashText(newPassword.trim()), access_mode: 'password' })
    setNewPassword('')
  }

  const tryUnlock = async () => {
    if (!selectedItem) return
    const hashed = await hashText(passwordInput)
    if (hashed !== selectedItem.password_hash) {
      setPasswordError('비밀번호가 일치하지 않습니다.')
      return
    }
    setUnlockedIds((prev) => new Set([...prev, selectedItem.id]))
    setUnlockDialogOpen(false)
    setPasswordInput('')
    setPasswordError('')
  }

  const handleDeleteSelected = async () => {
    if (!selectedItem) return
    if (!canManageDocument) {
      alert('문서 작성자 또는 관리자만 삭제할 수 있습니다.')
      return
    }
    const confirmed = confirm(`"${selectedItem.title || '제목 없음'}" 문서를 삭제하시겠습니까?\n하위 문서가 있다면 함께 삭제됩니다.`)
    if (!confirmed) return
    await deleteItem(selectedItem.id)
  }

  const renderTree = (parentId?: string, depth = 0): React.ReactNode => {
    const children = tree.get(parentId || 'root') || []
    return children.map((item) => {
      const hasChildren = (tree.get(item.id) || []).length > 0
      const expanded = expandedIds.has(item.id)
      const active = item.id === selectedItem?.id
      return (
        <div key={item.id}>
          <div
            className={cn(
              'group flex h-9 items-center gap-1 rounded-lg px-2 text-left text-sm transition-colors',
              active ? 'bg-primary/8 text-primary' : 'hover:bg-accent/50'
            )}
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded hover:bg-background/80"
              onClick={() => hasChildren && setExpandedIds((prev) => {
                const next = new Set(prev)
                if (next.has(item.id)) next.delete(item.id)
                else next.add(item.id)
                return next
              })}
            >
              {hasChildren ? (
                expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
              )}
            </button>
            <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => handleSelectItem(item.id)}>
              {item.title || '제목 없음'}
            </button>
            {item.access_mode !== 'project' && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            {item.linkedTaskIds.length > 0 && <span className="text-[10px] text-muted-foreground">W{item.linkedTaskIds.length}</span>}
            <button
              type="button"
              className="hidden h-6 w-6 items-center justify-center rounded hover:bg-background group-hover:flex"
              onClick={() => void handleCreate(item.id)}
              title="하위 문서 추가"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {expanded && renderTree(item.id, depth + 1)}
        </div>
      )
    })
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)_300px] bg-background">
      <aside className="flex min-h-0 flex-col border-r border-slate-300 bg-slate-50/80">
        <div className="border-b border-slate-300 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">업무노트</div>
              <p className="mt-1 text-xs text-muted-foreground">문서 트리와 WBS를 연결해 관리합니다.</p>
            </div>
            <Button size="sm" className="h-8 gap-1.5" onClick={() => void handleCreate(null)} disabled={!currentProject}>
              <FilePlus2 className="h-3.5 w-3.5" />
              문서
            </Button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="문서 검색" className="h-9 pl-8 text-sm" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {renderTree()}
          {filteredItems.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-background px-4 py-10 text-center text-sm text-muted-foreground">
              검색 결과가 없습니다.
            </div>
          )}
        </div>
      </aside>

      <section className="min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">업무노트를 불러오는 중입니다...</div>
        ) : selectedItem && draft && !selectedLocked ? (
          <div className="mx-auto max-w-5xl px-8 py-6">
            <div className="border-b border-slate-300 pb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <WorkspaceStatusBadge status={draft.status} />
                  <span className="text-xs text-muted-foreground">수정 {new Date(selectedItem.updated_at).toLocaleString('ko-KR')}</span>
                  {dirty && <span className="text-xs font-medium text-amber-600">저장 안 됨</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setMetaDialogOpen(true)}>
                    <Settings2 className="h-3.5 w-3.5" />
                    상태
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setSecurityDialogOpen(true)}>
                    <Lock className="h-3.5 w-3.5" />
                    공유/보안
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setWbsDialogOpen(true)}>
                    <Link2 className="h-3.5 w-3.5" />
                    WBS 연결
                  </Button>
                  <Button size="sm" className="h-8 gap-1.5" onClick={() => void saveDraft('body')} disabled={!dirty || saving}>
                    <Save className="h-3.5 w-3.5" />
                    {saving ? '저장 중' : '저장'}
                  </Button>
                </div>
              </div>

              <Input
                value={draft.title}
                onChange={(e) => updateDraft({ title: e.target.value })}
                placeholder="문서 제목"
                className="mt-4 h-12 border-none px-0 text-3xl font-semibold shadow-none focus-visible:ring-0"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                {linkedTasks.length > 0 ? (
                  linkedTasks.map((task) => (
                    <Badge key={task!.id} variant="secondary" className="h-7 gap-1.5 rounded-full px-3">
                      <span className="font-mono text-[11px]">{task!.wbs_code}</span>
                      <span className="max-w-[220px] truncate">{task!.task_name}</span>
                    </Badge>
                  ))
                ) : (
                  <button type="button" className="text-xs text-muted-foreground hover:text-primary" onClick={() => setWbsDialogOpen(true)}>
                    연결된 WBS가 없습니다. 클릭해서 연결하세요.
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <textarea
                value={draft.summary}
                onChange={(e) => updateDraft({ summary: e.target.value })}
                rows={2}
                placeholder="문서 목적, 현재 결론, 남은 쟁점을 짧게 적어주세요."
                className="w-full resize-none rounded-xl border border-slate-300 bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/20"
              />

              <RichContentEditor
                value={draft.body || ''}
                onChange={(value) => updateDraft({ body: value })}
                minHeight={560}
                fontSize={draft.editor_font_size}
                onFontSizeChange={(fontSize) => updateDraft({ editor_font_size: fontSize })}
                placeholder={'조사 배경, 검토안, 회의 메모, 결정사항, 미결 이슈를 자유롭게 작성하세요.'}
              />
            </div>
          </div>
        ) : selectedLocked ? (
          <div className="flex h-full items-center justify-center px-6">
            <div className="rounded-2xl border border-slate-300 bg-card px-8 py-12 text-center shadow-sm">
              <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
              <div className="mt-4 text-lg font-semibold">잠긴 문서입니다</div>
              <p className="mt-2 text-sm text-muted-foreground">공유자로 지정되었거나 비밀번호를 입력해야 볼 수 있습니다.</p>
              {selectedItem?.access_mode === 'password' && (
                <Button className="mt-5" onClick={() => setUnlockDialogOpen(true)}>비밀번호 입력</Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-card px-8 py-12 text-center">
              <div className="text-lg font-semibold">문서를 만들어보세요</div>
              <p className="mt-2 text-sm text-muted-foreground">트리로 문서를 정리하고 WBS와 연결할 수 있습니다.</p>
              <Button className="mt-5 gap-1.5" onClick={() => void handleCreate(null)} disabled={!currentProject}>
                <FilePlus2 className="h-4 w-4" />
                첫 문서 만들기
              </Button>
            </div>
          </div>
        )}
      </section>

      <aside className="min-h-0 overflow-y-auto border-l border-slate-300 bg-slate-50/70 px-4 py-5">
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-300 bg-card">
            <div className="flex items-center gap-2 border-b border-slate-300 px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <History className="h-4 w-4" />
              수정 이력
            </div>
            <div className="space-y-3 px-4 py-4">
              {itemRevisions.length > 0 ? itemRevisions.map((revision) => (
                <div key={revision.id} className="rounded-lg border border-slate-300 bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{revision.changed_by_name || '사용자'}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(revision.created_at).toLocaleString('ko-KR')}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{revision.change_type}</div>
                </div>
              )) : (
                <div className="text-xs text-muted-foreground">아직 표시할 이력이 없습니다.</div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-300 bg-card">
            <div className="flex items-center justify-between border-b border-slate-300 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <Paperclip className="h-4 w-4" />
                첨부
              </div>
              <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
                추가
                <input
                  type="file"
                  className="hidden"
                  multiple
                  disabled={!selectedItem}
                  onChange={async (e) => {
                    if (!selectedItem) return
                    const files = Array.from(e.target.files || [])
                    for (const file of files) await uploadAttachment(selectedItem.id, file)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
            </div>
            <div className="space-y-2 px-4 py-4">
              {itemAttachments.length > 0 ? itemAttachments.map((file) => (
                <a
                  key={file.id}
                  href={file.public_url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-slate-300 bg-background px-3 py-2 hover:bg-accent/40"
                >
                  <div className="truncate text-xs font-medium">{file.filename}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{formatBytes(file.size)} · {file.uploaded_by_name || '사용자'}</div>
                </a>
              )) : (
                <div className="text-xs text-muted-foreground">첨부된 문서가 없습니다.</div>
              )}
            </div>
          </section>

          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full gap-1.5 text-red-600"
            onClick={handleDeleteSelected}
            disabled={!selectedItem || !canManageDocument}
          >
            <Trash2 className="h-3.5 w-3.5" />
            문서 삭제
          </Button>
        </div>
      </aside>

      <Dialog open={wbsDialogOpen} onOpenChange={setWbsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>WBS 연결 선택</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={wbsQuery} onChange={(e) => setWbsQuery(e.target.value)} placeholder="WBS 코드 또는 작업명 검색" />
            <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-slate-300">
              {filteredTasks.map((task) => {
                const checked = draft?.linkedTaskIds.includes(task.id) || false
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    className={cn('flex w-full items-center gap-3 border-b border-slate-200 px-4 py-3 text-left hover:bg-accent/40', checked && 'bg-primary/5')}
                  >
                    <span className={cn('flex h-5 w-5 items-center justify-center rounded border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                      {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
                    </span>
                    <span className="w-20 font-mono text-xs text-muted-foreground">{task.wbs_code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{task.task_name}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setWbsDialogOpen(false)}>닫기</Button>
              <Button onClick={() => { setWbsDialogOpen(false); void saveDraft('wbs') }} disabled={!dirty || saving}>연결 저장</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={metaDialogOpen} onOpenChange={setMetaDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>문서 상태 변경</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(['draft', 'active', 'done', 'archived'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => updateDraft({ status })}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm',
                  draft?.status === status ? 'border-primary/40 bg-primary/5 text-primary' : 'border-slate-300 hover:bg-accent/40'
                )}
              >
                <span>{STATUS_LABELS[status]}</span>
                {draft?.status === status && <CheckCircle2 className="h-4 w-4" />}
              </button>
            ))}
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="outline" onClick={() => setMetaDialogOpen(false)}>닫기</Button>
              <Button onClick={() => { setMetaDialogOpen(false); void saveDraft('status') }} disabled={!dirty || saving}>상태 저장</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={securityDialogOpen} onOpenChange={setSecurityDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>공유/보안 및 접근 설정</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">문서 공개 범위</div>
                <div className="grid grid-cols-4 gap-2">
                  {(['project', 'restricted', 'password', 'private'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={cn('rounded-lg border px-3 py-2 text-sm', draft.access_mode === mode ? 'border-primary bg-primary/5 text-primary' : 'border-slate-300 hover:bg-accent/40')}
                      onClick={() => updateDraft({ access_mode: mode })}
                    >
                      {ACCESS_LABELS[mode]}
                    </button>
                  ))}
                </div>
              </div>

              {draft.access_mode === 'restricted' && (
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">공유자 지정</div>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-300">
                    {users.filter((user) => user.approved).map((user) => (
                      <label key={user.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-200 px-3 py-2 text-sm hover:bg-accent/40">
                        <input type="checkbox" checked={draft.shared_user_ids.includes(user.id)} onChange={() => toggleSharedUser(user.id)} />
                        <span className="min-w-0 flex-1 truncate">{user.name || user.email}</span>
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {draft.access_mode === 'password' && (
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">문서 비밀번호</div>
                  <div className="flex gap-2">
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={draft.password_hash ? '새 비밀번호 입력' : '비밀번호 입력'} />
                    <Button variant="outline" onClick={() => void applyNewPassword()}>적용</Button>
                  </div>
                  {draft.password_hash && <div className="mt-2 text-xs text-muted-foreground">비밀번호가 설정되어 있습니다.</div>}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSecurityDialogOpen(false)}>닫기</Button>
                <Button onClick={() => { setSecurityDialogOpen(false); void saveDraft('structure') }} disabled={!dirty || saving}>설정 저장</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>비밀번호 입력</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="문서 비밀번호" onKeyDown={(e) => { if (e.key === 'Enter') void tryUnlock() }} />
            {passwordError && <div className="text-sm text-red-600">{passwordError}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setUnlockDialogOpen(false)}>취소</Button>
              <Button onClick={() => void tryUnlock()}>열기</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
