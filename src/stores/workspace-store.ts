import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { WorkspaceItem, WorkspaceLink } from '@/lib/types'
import { useAuthStore } from '@/stores/auth-store'

interface WorkspaceState {
  items: WorkspaceItem[]
  selectedItemId: string | null
  isLoading: boolean
  loadItems: (projectId: string) => Promise<void>
  createItem: (projectId: string) => Promise<string | null>
  selectItem: (id: string | null) => void
  updateItem: (id: string, changes: Partial<WorkspaceItem>) => Promise<void>
  deleteItem: (id: string) => Promise<void>
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

function dbRowToWorkspaceItem(
  row: Record<string, unknown>,
  linkedTaskIds: string[]
): WorkspaceItem {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
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

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  items: [],
  selectedItemId: null,
  isLoading: false,

  loadItems: async (projectId) => {
    set({ isLoading: true })
    const [{ data: itemsData, error: itemsError }, { data: linkData, error: linkError }] = await Promise.all([
      supabase
        .from('workspace_items')
        .select('*')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('workspace_item_task_links')
        .select('workspace_item_id, task_id'),
    ])

    if (itemsError) {
      console.error('업무노트 로드 실패:', itemsError.message)
      set({ items: [], isLoading: false })
      return
    }

    if (linkError) {
      console.error('업무노트 연결 로드 실패:', linkError.message)
    }

    const linkMap = new Map<string, string[]>()
    for (const row of linkData || []) {
      const itemId = row.workspace_item_id as string
      const taskId = row.task_id as string
      const current = linkMap.get(itemId) || []
      current.push(taskId)
      linkMap.set(itemId, current)
    }

    const items = (itemsData || []).map((row) =>
      dbRowToWorkspaceItem(row as Record<string, unknown>, linkMap.get(row.id as string) || [])
    )

    set((state) => ({
      items,
      selectedItemId:
        items.some((item) => item.id === state.selectedItemId)
          ? state.selectedItemId
          : (items[0]?.id ?? null),
      isLoading: false,
    }))
  },

  createItem: async (projectId) => {
    const currentUserId = useAuthStore.getState().currentUser?.id
    const payload = {
      project_id: projectId,
      title: '새 업무노트',
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
      items: [item, ...state.items],
      selectedItemId: item.id,
    }))
    return item.id
  },

  selectItem: (selectedItemId) => set({ selectedItemId }),

  updateItem: async (id, changes) => {
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
        if (insertError) {
          console.error('업무노트 연결 추가 실패:', insertError.message)
        }
      }

      for (const taskId of toDelete) {
        const { error: deleteError } = await supabase
          .from('workspace_item_task_links')
          .delete()
          .eq('workspace_item_id', id)
          .eq('task_id', taskId)
        if (deleteError) {
          console.error('업무노트 연결 삭제 실패:', deleteError.message)
        }
      }
    }
  },

  deleteItem: async (id) => {
    const previousItems = get().items
    const previousSelectedId = get().selectedItemId
    set((state) => {
      const nextItems = state.items.filter((item) => item.id !== id)
      return {
        items: nextItems,
        selectedItemId: state.selectedItemId === id ? (nextItems[0]?.id ?? null) : state.selectedItemId,
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
}))
