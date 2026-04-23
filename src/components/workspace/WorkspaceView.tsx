import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus2,
  Folder,
  FolderPlus,
  FolderOpen,
  History,
  KeyRound,
  Link2,
  Paperclip,
  Lock,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
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
import { supabase } from '@/lib/supabase'
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

type DraftState = Pick<WorkspaceItem, 'title' | 'summary' | 'body' | 'status' | 'linkedTaskIds' | 'access_mode' | 'shared_user_ids' | 'password_hash' | 'editor_font_size' | 'item_type' | 'folder_color'>

const ACCESS_LABELS = {
  project: '프로젝트 공개',
  restricted: '공유자만',
  password: '비밀번호',
  private: '비공개',
} as const

const ACCESS_OPTIONS = [
  { mode: 'project', title: '프로젝트 공개', desc: '프로젝트 구성원 모두 열람' },
  { mode: 'restricted', title: '공유자만', desc: '지정한 사람만 열람' },
  { mode: 'password', title: '비밀번호', desc: '비밀번호 입력 후 열람' },
  { mode: 'private', title: '비공개', desc: '작성자/관리자만 열람' },
] as const

const ACCESS_TONES = {
  project: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  restricted: 'border-sky-200 bg-sky-50 text-sky-700',
  password: 'border-amber-200 bg-amber-50 text-amber-700',
  private: 'border-slate-300 bg-slate-100 text-slate-700',
} as const

const REVISION_LABELS = {
  created: '문서 생성',
  title: '제목 변경',
  summary: '요약 변경',
  body: '본문 저장',
  status: '상태 변경',
  wbs: 'WBS 연결 변경',
  attachment: '첨부 변경',
  structure: '설정 변경',
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

function AccessIcon({ mode, className }: { mode: WorkspaceItem['access_mode']; className?: string }) {
  if (mode === 'project') return <ShieldCheck className={className} />
  if (mode === 'restricted') return <Users className={className} />
  if (mode === 'password') return <KeyRound className={className} />
  return <ShieldOff className={className} />
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
  const fetchAllUsers = useAuthStore((s) => s.fetchAllUsers)

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
  const [shareableUsers, setShareableUsers] = useState<typeof users>([])
  const [shareUsersLoading, setShareUsersLoading] = useState(false)
  const [shareUsersError, setShareUsersError] = useState('')
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

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
      item_type: selectedItem.item_type || 'document',
      folder_color: selectedItem.folder_color || '#f59e0b',
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
    return revisions.filter((revision) => revision.workspace_item_id === selectedItem.id)
  }, [revisions, selectedItem])

  const visibleRevisions = itemRevisions.slice(0, 5)

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

  const approvedUsers = useMemo(() => users.filter((user) => user.approved), [users])
  const visibleShareUsers = useMemo(() => {
    const source = shareableUsers.length > 0 ? shareableUsers : approvedUsers
    return source
      .filter((user) => user.approved)
      .filter((user) => user.id !== currentUser?.id)
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'ko'))
  }, [approvedUsers, currentUser?.id, shareableUsers])

  const sharedUsers = useMemo(() => {
    const ids = draft?.shared_user_ids || []
    return ids
      .map((id) => users.find((user) => user.id === id))
      .filter(Boolean)
  }, [draft?.shared_user_ids, users])

  const accessSummary = useMemo(() => {
    if (!draft) return ''
    if (draft.access_mode === 'project') return '프로젝트 구성원 전체'
    if (draft.access_mode === 'password') return draft.password_hash ? '비밀번호 설정됨' : '비밀번호 미설정'
    if (draft.access_mode === 'private') return '작성자/관리자만'
    if (sharedUsers.length === 0) return '공유자 미지정'
    const first = sharedUsers[0]
    const firstName = first?.name || first?.email || '공유자'
    return sharedUsers.length === 1 ? firstName : `${firstName} 외 ${sharedUsers.length - 1}명`
  }, [draft, sharedUsers])

  useEffect(() => {
    if (!securityDialogOpen) return

    let cancelled = false

    const loadShareUsers = async () => {
      setShareUsersLoading(true)
      setShareUsersError('')

      try {
        if (currentProject?.id) {
          const { data, error } = await supabase.rpc('project_visible_users', { p_project_id: currentProject.id })
          if (!error && data) {
            const nextUsers = ((data || []) as Array<Record<string, unknown>>).map((row) => ({
              id: row.id as string,
              email: (row.email as string) || '',
              name: (row.name as string) || '',
              role: (row.role as 'admin' | 'pm' | 'member' | 'guest') || 'member',
              approved: (row.approved as boolean) ?? false,
              avatar_url: (row.avatar_url as string) || undefined,
              force_password_change: (row.force_password_change as boolean) ?? false,
              created_at: (row.created_at as string) || new Date().toISOString(),
            }))
            if (!cancelled) setShareableUsers(nextUsers)
            return
          }
        }

        await fetchAllUsers()
        if (!cancelled && useAuthStore.getState().users.length === 0) {
          setShareUsersError('공유 가능한 사용자를 불러오지 못했습니다.')
        }
      } catch {
        if (!cancelled) setShareUsersError('공유 가능한 사용자를 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setShareUsersLoading(false)
      }
    }

    void loadShareUsers()

    return () => {
      cancelled = true
    }
  }, [currentProject?.id, fetchAllUsers, securityDialogOpen])

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

  const handleCreate = async (parentId?: string | null, itemType: WorkspaceItem['item_type'] = 'document') => {
    if (!currentProject) return
    if (dirty && !confirm('저장하지 않은 변경이 있습니다. 새 항목을 만들까요?')) return
    const id = await createItem(currentProject.id, parentId, itemType)
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
      alert('작성자 또는 관리자만 삭제할 수 있습니다.')
      return
    }
    const confirmed = confirm(`"${selectedItem.title || '제목 없음'}" ${selectedItem.item_type === 'folder' ? '폴더' : '문서'}를 삭제하시겠습니까?\n하위 항목이 있다면 함께 삭제됩니다.`)
    if (!confirmed) return
    await deleteItem(selectedItem.id)
  }

  const isDescendantOf = (itemId: string, maybeAncestorId: string) => {
    let current = items.find((item) => item.id === itemId)
    while (current?.parent_id) {
      if (current.parent_id === maybeAncestorId) return true
      current = items.find((item) => item.id === current?.parent_id)
    }
    return false
  }

  const moveItemToFolder = async (itemId: string, targetFolderId: string | null) => {
    const moving = items.find((item) => item.id === itemId)
    if (!moving) return
    const target = targetFolderId ? items.find((item) => item.id === targetFolderId) : null
    if (targetFolderId && (!target || target.item_type !== 'folder')) return
    if (targetFolderId === itemId || (targetFolderId && isDescendantOf(targetFolderId, itemId))) return

    const nextParentId = targetFolderId || undefined
    const siblingCount = items.filter((item) => item.id !== itemId && (item.parent_id || null) === (targetFolderId || null)).length
    await updateItem(itemId, {
      parent_id: nextParentId,
      sort_order: (siblingCount + 1) * 1000,
    }, 'structure')
    if (targetFolderId) setExpandedIds((prev) => new Set([...prev, targetFolderId]))
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
            data-workspace-tree-item="true"
            draggable
            onDragStart={(e) => {
              setDraggedItemId(item.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', item.id)
            }}
            onDragEnd={() => {
              setDraggedItemId(null)
              setDragOverFolderId(null)
            }}
            onDragOver={(e) => {
              if (item.item_type !== 'folder' || !draggedItemId || draggedItemId === item.id) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDragOverFolderId(item.id)
            }}
            onDragLeave={() => {
              if (dragOverFolderId === item.id) setDragOverFolderId(null)
            }}
            onDrop={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              const movingId = e.dataTransfer.getData('text/plain') || draggedItemId
              setDragOverFolderId(null)
              setDraggedItemId(null)
              if (item.item_type === 'folder' && movingId) await moveItemToFolder(movingId, item.id)
            }}
            className={cn(
              'group flex h-9 items-center gap-1 rounded-lg px-2 text-left text-sm transition-colors',
              active ? 'bg-primary/8 text-primary' : 'hover:bg-accent/50',
              draggedItemId === item.id && 'opacity-45',
              dragOverFolderId === item.id && 'bg-amber-100/80 ring-2 ring-amber-300'
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
                <span className="h-5 w-5" />
              )}
            </button>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left" onClick={() => handleSelectItem(item.id)}>
              {item.item_type === 'folder'
                ? expanded
                  ? <FolderOpen className="h-4 w-4 flex-shrink-0" style={{ color: item.folder_color || '#f59e0b' }} />
                  : <Folder className="h-4 w-4 flex-shrink-0" style={{ color: item.folder_color || '#f59e0b' }} />
                : <FileText className="h-4 w-4 flex-shrink-0 text-slate-500" />}
              {item.title || '제목 없음'}
            </button>
            {item.access_mode !== 'project' && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            {item.item_type === 'document' && item.linkedTaskIds.length > 0 && <span className="text-[10px] text-muted-foreground">W{item.linkedTaskIds.length}</span>}
            {item.item_type === 'folder' && <span className="text-[10px] text-muted-foreground">{(tree.get(item.id) || []).length}</span>}
            {item.item_type === 'folder' && (
              <button
                type="button"
                className="hidden h-6 w-6 items-center justify-center rounded hover:bg-background group-hover:flex"
                onClick={() => void handleCreate(item.id, 'folder')}
                title="하위 폴더 추가"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              className="hidden h-6 w-6 items-center justify-center rounded hover:bg-background group-hover:flex"
              onClick={() => void handleCreate(item.id, 'document')}
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
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-white" onClick={() => void handleCreate(null, 'folder')} disabled={!currentProject}>
                <FolderPlus className="h-3.5 w-3.5" />
                폴더
              </Button>
              <Button size="sm" className="h-8 gap-1.5" onClick={() => void handleCreate(null, 'document')} disabled={!currentProject}>
                <FilePlus2 className="h-3.5 w-3.5" />
                문서
              </Button>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="문서 검색" className="h-9 pl-8 text-sm" />
          </div>
        </div>

        <div
          className={cn('min-h-0 flex-1 overflow-y-auto p-2', dragOverFolderId === 'root' && 'bg-blue-50/70')}
          onDragOver={(e) => {
            if (!draggedItemId) return
            if ((e.target as HTMLElement).closest('[data-workspace-tree-item]')) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDragOverFolderId('root')
          }}
          onDragLeave={() => {
            if (dragOverFolderId === 'root') setDragOverFolderId(null)
          }}
          onDrop={async (e) => {
            e.preventDefault()
            if ((e.target as HTMLElement).closest('[data-workspace-tree-item]')) return
            const movingId = e.dataTransfer.getData('text/plain') || draggedItemId
            setDragOverFolderId(null)
            setDraggedItemId(null)
            if (movingId) await moveItemToFolder(movingId, null)
          }}
        >
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
        ) : selectedLocked ? (
          <div className="flex h-full items-center justify-center px-6">
            <div className="rounded-2xl border border-slate-300 bg-card px-8 py-12 text-center shadow-sm">
              <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
              <div className="mt-4 text-lg font-semibold">잠긴 항목입니다</div>
              <p className="mt-2 text-sm text-muted-foreground">공유자로 지정되었거나 비밀번호를 입력해야 볼 수 있습니다.</p>
              {selectedItem?.access_mode === 'password' && (
                <Button className="mt-5" onClick={() => setUnlockDialogOpen(true)}>비밀번호 입력</Button>
              )}
            </div>
          </div>
        ) : selectedItem && draft && draft.item_type === 'folder' ? (
          <div className="flex h-full items-center justify-center px-6">
            <div className="w-full max-w-xl rounded-3xl border border-amber-200 bg-[linear-gradient(135deg,#fffaf0,#f8fbff)] px-8 py-10 text-center shadow-sm">
              <FolderOpen className="mx-auto h-12 w-12" style={{ color: draft.folder_color || '#f59e0b' }} />
              <Input
                value={draft.title}
                onChange={(e) => updateDraft({ title: e.target.value })}
                placeholder="폴더명"
                className="mx-auto mt-5 h-12 max-w-md border-none bg-transparent text-center text-3xl font-black shadow-none focus-visible:ring-0"
              />
              <p className="mt-2 text-sm text-slate-600">이 폴더 아래에 문서나 하위 폴더를 추가해서 자료를 정리합니다.</p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <label className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                  폴더 색상
                  <input
                    type="color"
                    value={draft.folder_color || '#f59e0b'}
                    onChange={(e) => updateDraft({ folder_color: e.target.value })}
                    className="h-6 w-8 cursor-pointer rounded border border-slate-200 p-0"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setSecurityDialogOpen(true)}
                  className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold', ACCESS_TONES[draft.access_mode])}
                >
                  <AccessIcon mode={draft.access_mode} className="h-3.5 w-3.5" />
                  {ACCESS_LABELS[draft.access_mode]}
                </button>
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button variant="outline" className="gap-1.5 bg-white" onClick={() => void handleCreate(selectedItem.id, 'folder')}>
                  <FolderPlus className="h-4 w-4" />
                  하위 폴더
                </Button>
                <Button className="gap-1.5" onClick={() => void handleCreate(selectedItem.id, 'document')}>
                  <FilePlus2 className="h-4 w-4" />
                  문서 추가
                </Button>
                <Button variant="outline" onClick={() => void saveDraft('structure')} disabled={!dirty || saving}>
                  {saving ? '저장 중' : '폴더 저장'}
                </Button>
                <Button variant="outline" className="gap-1.5 text-red-600" onClick={handleDeleteSelected} disabled={!canManageDocument}>
                  <Trash2 className="h-4 w-4" />
                  폴더 삭제
                </Button>
              </div>
            </div>
          </div>
        ) : selectedItem && draft && !selectedLocked ? (
          <div className="mx-auto max-w-5xl px-8 py-6">
            <div className="rounded-2xl border border-slate-300 bg-[linear-gradient(135deg,#f8fbff_0%,#eef7f4_58%,#f7f8fb_100%)] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <WorkspaceStatusBadge status={draft.status} />
                    <button
                      type="button"
                      onClick={() => setSecurityDialogOpen(true)}
                      className={cn('inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold', ACCESS_TONES[draft.access_mode])}
                    >
                      <AccessIcon mode={draft.access_mode} className="h-3.5 w-3.5" />
                      {ACCESS_LABELS[draft.access_mode]}
                    </button>
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                      {accessSummary}
                    </span>
                    <span className="text-xs text-slate-500">수정 {new Date(selectedItem.updated_at).toLocaleString('ko-KR')}</span>
                    {dirty && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">저장 안 됨</span>}
                  </div>

                  <Input
                    value={draft.title}
                    onChange={(e) => updateDraft({ title: e.target.value })}
                    placeholder="문서 제목"
                    className="mt-4 h-14 border-none bg-transparent px-0 text-3xl font-black tracking-tight text-slate-950 shadow-none focus-visible:ring-0"
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    {linkedTasks.length > 0 ? (
                      linkedTasks.map((task) => (
                        <Badge key={task!.id} variant="secondary" className="h-7 gap-1.5 rounded-full bg-white/85 px-3 text-slate-800 ring-1 ring-slate-200">
                          <span className="font-mono text-[11px] text-slate-600">{task!.wbs_code}</span>
                          <span className="max-w-[220px] truncate">{task!.task_name}</span>
                        </Badge>
                      ))
                    ) : (
                      <button type="button" className="rounded-full border border-dashed border-slate-300 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-primary/50 hover:text-primary" onClick={() => setWbsDialogOpen(true)}>
                        연결된 WBS가 없습니다. 클릭해서 연결하세요.
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-white/80" onClick={() => setMetaDialogOpen(true)}>
                    <Settings2 className="h-3.5 w-3.5" />
                    상태
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-white/80" onClick={() => setSecurityDialogOpen(true)}>
                    <Lock className="h-3.5 w-3.5" />
                    공유/보안
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-white/80" onClick={() => setWbsDialogOpen(true)}>
                    <Link2 className="h-3.5 w-3.5" />
                    WBS 연결
                  </Button>
                  <Button size="sm" className="h-8 gap-1.5" onClick={() => void saveDraft('body')} disabled={!dirty || saving}>
                    <Save className="h-3.5 w-3.5" />
                    {saving ? '저장 중' : '저장'}
                  </Button>
                </div>
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
                placeholder={'조사 배경, 검토안, 회의 메모, 결정사항, 미결 이슈를 자유롭게 작성하세요.'}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-card px-8 py-12 text-center">
              <div className="text-lg font-semibold">문서를 만들어보세요</div>
              <p className="mt-2 text-sm text-muted-foreground">트리로 문서를 정리하고 WBS와 연결할 수 있습니다.</p>
              <Button className="mt-5 gap-1.5" onClick={() => void handleCreate(null, 'document')} disabled={!currentProject}>
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
                  disabled={!selectedItem || selectedItem.item_type === 'folder'}
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
                <div className="text-xs text-muted-foreground">{selectedItem?.item_type === 'folder' ? '폴더에는 첨부를 추가하지 않습니다.' : '첨부된 문서가 없습니다.'}</div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-300 bg-card">
            <div className="flex items-center justify-between border-b border-slate-300 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <History className="h-4 w-4" />
                수정 이력
              </div>
              <span className="text-[10px] text-muted-foreground">최근 {Math.min(itemRevisions.length, 5)} / {itemRevisions.length}</span>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto px-4 py-4">
              {visibleRevisions.length > 0 ? visibleRevisions.map((revision) => (
                <div key={revision.id} className="rounded-lg border border-slate-300 bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{REVISION_LABELS[revision.change_type] || '변경 저장'}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(revision.created_at).toLocaleString('ko-KR')}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{revision.changed_by_name || '사용자'}</div>
                </div>
              )) : (
                <div className="text-xs text-muted-foreground">아직 표시할 이력이 없습니다.</div>
              )}
              {itemRevisions.length > 5 && (
                <div className="pt-1 text-center text-[11px] text-muted-foreground">나머지 {itemRevisions.length - 5}건은 활동 로그에서 확인</div>
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
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          <div className="border-b border-slate-300 bg-[linear-gradient(135deg,#f8fbff,#eef7f4)] px-6 py-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              공유/보안 및 접근 설정
            </DialogTitle>
          </DialogHeader>
            <p className="mt-2 text-sm text-slate-600">문서를 누가 볼 수 있는지 정하고, 필요한 경우 공유자나 비밀번호를 지정합니다.</p>
          </div>
          {draft && (
            <div className="space-y-5 px-6 py-5">
              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">문서 공개 범위</div>
                <div className="grid grid-cols-4 gap-2">
                  {ACCESS_OPTIONS.map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      className={cn(
                        'min-h-[92px] rounded-xl border px-3 py-3 text-left transition-all',
                        draft.access_mode === option.mode
                          ? 'border-primary bg-primary/5 shadow-[inset_0_0_0_1px_rgba(0,102,204,.18)]'
                          : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
                      )}
                      onClick={() => updateDraft({ access_mode: option.mode })}
                    >
                      <div className={cn('mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg border', ACCESS_TONES[option.mode])}>
                        <AccessIcon mode={option.mode} className="h-4 w-4" />
                      </div>
                      <div className="text-sm font-bold text-slate-900">{option.title}</div>
                      <div className="mt-1 text-[11px] leading-4 text-slate-500">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {draft.access_mode === 'restricted' && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">공유자 지정</div>
                      <div className="mt-1 text-xs text-slate-500">{accessSummary}</div>
                    </div>
                    <Badge variant="outline" className="bg-white">{draft.shared_user_ids.length}명 선택</Badge>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-300 bg-white">
                    {shareUsersLoading ? (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">공유자 목록을 불러오는 중입니다...</div>
                    ) : visibleShareUsers.length > 0 ? visibleShareUsers.map((user) => {
                      const checked = draft.shared_user_ids.includes(user.id)
                      return (
                        <label key={user.id} className={cn('flex cursor-pointer items-center gap-3 border-b border-slate-200 px-3 py-2 text-sm last:border-b-0 hover:bg-accent/40', checked && 'bg-sky-50')}>
                          <input type="checkbox" checked={checked} onChange={() => toggleSharedUser(user.id)} />
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                            {(user.name || user.email || '?').slice(0, 1)}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">{user.name || user.email}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </label>
                      )
                    }) : (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        {shareUsersError || '선택 가능한 프로젝트 사용자가 없습니다.'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {draft.access_mode === 'password' && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="mb-2 text-sm font-bold text-slate-900">문서 비밀번호</div>
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
