import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { WorkspaceAttachment, WorkspaceItem, WorkspaceLink, WorkspaceRevision } from '@/lib/types'
import { useAuthStore } from '@/stores/auth-store'

interface WorkspaceState {
  items: WorkspaceItem[]
  revisions: WorkspaceRevision[]
  attachments: WorkspaceAttachment[]
  selectedItemId: string | null
  isLoading: boolean
  loadItems: (projectId: string) => Promise<void>
  createItem: (projectId: string, parentId?: string | null) => Promise<string | null>
  selectItem: (id: string | null) => void
  updateItem: (id: string, changes: Partial<WorkspaceItem>, changeType?: WorkspaceRevision['change_type']) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  uploadAttachment: (itemId: string, file: File) => Promise<void>
}

function parseLinks(value: unknown): WorkspaceLink[] {
  if (!value) return []
  if (Array.isArray(value)) return value as WorkspaceLink[]
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as WorkspaceLink[]
    } catch {
      return []
    }
  }
  return []
}

function dbRowToWorkspaceItem(row: Record<string, unknown>, linkedTaskIds: string[]): WorkspaceItem {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    parent_id: (row.parent_id as string) || undefined,
    sort_order: Number(row.sort_order ?? 0),
    title: (row.title as string) || '',
    summary: (row.summary as string) || '',
    body: (row.body as string) || '',
    status: ((row.status as WorkspaceItem['status']) || 'draft'),
    linkedTaskIds,
    links: parseLinks(row.links),
    created_by: (row.created_by as string) || undefined,
    updated_by: (row.updated_by as string) || undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function dbRowToRevision(row: Record<string, unknown>): WorkspaceRevision {
  const profile = row.profiles as { name?: string; email?: string } | null
  return {
    id: row.id as string,
    workspace_item_id: row.workspace_item_id as string,
    project_id: row.project_id as string,
    changed_by: (row.changed_by as string) || undefined,
    changed_by_name: profile?.name || profile?.email || undefined,
    change_type: (row.change_type as WorkspaceRevision['change_type']) || 'body',
    snapshot_title: (row.snapshot_title as string) || undefined,
    snapshot_summary: (row.snapshot_summary as string) || undefined,
    snapshot_body: (row.snapshot_body as string) || undefined,
    created_at: row.created_at as string,
  }
}

function dbRowToAttachment(row: Record<string, unknown>): WorkspaceAttachment {
  const profile = row.profiles as { name?: string; email?: string } | null
  return {
    id: row.id as string,
    workspace_item_id: row.workspace_item_id as string,
    project_id: row.project_id as string,
    filename: row.filename as string,
    size: Number(row.size ?? 0),
    mime_type: (row.mime_type as string) || undefined,
    storage_path: row.storage_path as string,
    public_url: (row.public_url as string) || undefined,
    uploaded_by: (row.uploaded_by as string) || undefined,
    uploaded_by_name: profile?.name || profile?.email || undefined,
    created_at: row.created_at as string,
  }
}

async function writeRevision(item: WorkspaceItem, changeType: WorkspaceRevision['change_type']) {
  const currentUserId = useAuthStore.getState().currentUser?.id
  const { error } = await supabase.from('workspace_item_revisions').insert({
    workspace_item_id: item.id,
    project_id: item.project_id,
    changed_by: currentUserId || null,
    change_type: changeType,
    snapshot_title: item.title,
    snapshot_summary: item.summary || null,
    snapshot_body: item.body || null,
  })
  if (error) console.error('업무노트 이력 저장 실패:', error.message)
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  items: [],
  revisions: [],
  attachments: [],
  selectedItemId: null,
  isLoading: false,

  loadItems: async (projectId) => {
    set({ isLoading: true })
    const [{ data: itemsData, error: itemsError }, { data: linkData, error: linkError }, { data: revisionData }, { data: attachmentData }] = await Promise.all([
      supabase
        .from('workspace_items')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('updated_at', { ascending: false }),
      supabase
        .from('workspace_item_task_links')
        .select('workspace_item_id, task_id'),
      supabase
        .from('workspace_item_revisions')
        .select('*, profiles:changed_by(name,email)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('workspace_item_attachments')
        .select('*, profiles:uploaded_by(name,email)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
    ])

    if (itemsError) {
      console.error('업무노트 로드 실패:', itemsError.message)
      set({ items: [], revisions: [], attachments: [], isLoading: false })
      return
    }

    if (linkError) console.error('업무노트 연결 로드 실패:', linkError.message)

    const linkMap = new Map<string, string[]>()
    for (const row of linkData || []) {
      const itemId = row.workspace_item_id as string
      const taskId = row.task_id as string
      linkMap.set(itemId, [...(linkMap.get(itemId) || []), taskId])
    }

    const items = (itemsData || []).map((row) =>
      dbRowToWorkspaceItem(row as Record<string, unknown>, linkMap.get(row.id as string) || [])
    )

    set((state) => ({
      items,
      revisions: (revisionData || []).map((row) => dbRowToRevision(row as Record<string, unknown>)),
      attachments: (attachmentData || []).map((row) => dbRowToAttachment(row as Record<string, unknown>)),
      selectedItemId:
        items.some((item) => item.id === state.selectedItemId)
          ? state.selectedItemId
          : (items[0]?.id ?? null),
      isLoading: false,
    }))
  },

  createItem: async (projectId, parentId = null) => {
    const currentUserId = useAuthStore.getState().currentUser?.id
    const siblingCount = get().items.filter((item) => (item.parent_id || null) === (parentId || null)).length
    const payload = {
      project_id: projectId,
      parent_id: parentId || null,
      sort_order: (siblingCount + 1) * 1000,
      title: '새 문서',
      summary: '',
      body: '',
      status: 'draft',
      links: [],
      created_by: currentUserId || null,
      updated_by: currentUserId || null,
    }

    const { data, error } = await supabase
      .from('workspace_items')
      .insert(payload)
      .select('*')
      .single()

    if (error || !data) {
      console.error('업무노트 생성 실패:', error?.message)
      return null
    }

    const item = dbRowToWorkspaceItem(data as Record<string, unknown>, [])
    set((state) => ({
      items: [...state.items, item],
      selectedItemId: item.id,
    }))
    await writeRevision(item, 'created')
    return item.id
  },

  selectItem: (selectedItemId) => set({ selectedItemId }),

  updateItem: async (id, changes, changeType = 'body') => {
    const prev = get().items.find((item) => item.id === id)
    if (!prev) return

    const currentUserId = useAuthStore.getState().currentUser?.id
    const nextLinkedTaskIds = changes.linkedTaskIds ?? prev.linkedTaskIds
    const optimistic: WorkspaceItem = {
      ...prev,
      ...changes,
      linkedTaskIds: nextLinkedTaskIds,
      updated_by: currentUserId || prev.updated_by,
      updated_at: new Date().toISOString(),
    }

    set((state) => ({
      items: state.items.map((item) => (item.id === id ? optimistic : item)),
    }))

    const { error } = await supabase
      .from('workspace_items')
      .update({
        parent_id: optimistic.parent_id || null,
        sort_order: optimistic.sort_order,
        title: optimistic.title,
        summary: optimistic.summary || null,
        body: optimistic.body || null,
        status: optimistic.status,
        links: optimistic.links || [],
        updated_by: currentUserId || null,
      })
      .eq('id', id)

    if (error) {
      console.error('업무노트 저장 실패:', error.message)
      return
    }

    if (changes.linkedTaskIds) {
      const desired = new Set(changes.linkedTaskIds)
      const previous = new Set(prev.linkedTaskIds)
      const toInsert = changes.linkedTaskIds.filter((taskId) => !previous.has(taskId))
      const toDelete = prev.linkedTaskIds.filter((taskId) => !desired.has(taskId))

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from('workspace_item_task_links').insert(
          toInsert.map((taskId) => ({
            workspace_item_id: id,
            task_id: taskId,
          }))
        )
        if (insertError) console.error('업무노트 연결 추가 실패:', insertError.message)
      }

      for (const taskId of toDelete) {
        const { error: deleteError } = await supabase
          .from('workspace_item_task_links')
          .delete()
          .eq('workspace_item_id', id)
          .eq('task_id', taskId)
        if (deleteError) console.error('업무노트 연결 삭제 실패:', deleteError.message)
      }
    }

    await writeRevision(optimistic, changeType)
    const { data: latestRevision } = await supabase
      .from('workspace_item_revisions')
      .select('*, profiles:changed_by(name,email)')
      .eq('workspace_item_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
    if (latestRevision?.[0]) {
      set((state) => ({
        revisions: [dbRowToRevision(latestRevision[0] as Record<string, unknown>), ...state.revisions].slice(0, 200),
      }))
    }
  },

  deleteItem: async (id) => {
    const previousItems = get().items
    const previousSelectedId = get().selectedItemId
    const deletingIds = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const item of previousItems) {
        if (item.parent_id && deletingIds.has(item.parent_id) && !deletingIds.has(item.id)) {
          deletingIds.add(item.id)
          changed = true
        }
      }
    }

    set((state) => {
      const nextItems = state.items.filter((item) => !deletingIds.has(item.id))
      return {
        items: nextItems,
        selectedItemId: state.selectedItemId && deletingIds.has(state.selectedItemId) ? (nextItems[0]?.id ?? null) : state.selectedItemId,
      }
    })

    const { error } = await supabase.from('workspace_items').delete().eq('id', id)
    if (error) {
      console.error('업무노트 삭제 실패:', error.message)
      set({
        items: previousItems,
        selectedItemId: previousSelectedId,
      })
    }
  },

  uploadAttachment: async (itemId, file) => {
    const item = get().items.find((candidate) => candidate.id === itemId)
    if (!item) return
    const currentUserId = useAuthStore.getState().currentUser?.id
    const safeName = file.name.replace(/[^\w.\-가-힣 ]/g, '_')
    const storagePath = `${item.project_id}/${item.id}/${crypto.randomUUID()}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('workspace-attachments')
      .upload(storagePath, file, { upsert: false })
    if (uploadError) {
      console.error('첨부 업로드 실패:', uploadError.message)
      return
    }

    const { data: publicUrlData } = supabase.storage.from('workspace-attachments').getPublicUrl(storagePath)
    const { data, error } = await supabase
      .from('workspace_item_attachments')
      .insert({
        workspace_item_id: item.id,
        project_id: item.project_id,
        filename: file.name,
        size: file.size,
        mime_type: file.type || null,
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
        uploaded_by: currentUserId || null,
      })
      .select('*, profiles:uploaded_by(name,email)')
      .single()

    if (error || !data) {
      console.error('첨부 저장 실패:', error?.message)
      return
    }

    await writeRevision(item, 'attachment')
    set((state) => ({
      attachments: [dbRowToAttachment(data as Record<string, unknown>), ...state.attachments],
    }))
  },
}))
