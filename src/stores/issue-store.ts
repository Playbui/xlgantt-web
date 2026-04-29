import { create } from 'zustand'
import type { IssueComment, IssueFilters, IssueItem, IssueWorkLog } from '@/lib/issue-types'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

interface IssueState {
  issues: IssueItem[]
  comments: IssueComment[]
  workLogs: IssueWorkLog[]
  selectedIssueId: string | null
  filters: IssueFilters
  isLoading: boolean
  loadIssues: (projectId: string) => Promise<void>
  selectIssue: (issueId: string | null) => void
  setFilters: (filters: Partial<IssueFilters>) => void
  createIssue: (projectId: string, issue: Partial<IssueItem>) => Promise<string | null>
  updateIssue: (issueId: string, changes: Partial<IssueItem>) => Promise<void>
  deleteIssue: (issueId: string) => Promise<void>
  addComment: (issueId: string, body: string) => Promise<void>
  addWorkLog: (issueId: string, workLog: Partial<IssueWorkLog>) => Promise<void>
  updateWorkLog: (workLogId: string, changes: Partial<IssueWorkLog>) => Promise<void>
  deleteWorkLog: (workLogId: string) => Promise<void>
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function dbRowToIssue(row: Record<string, unknown>): IssueItem {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    related_task_id: optionalString(row.related_task_id),
    import_sequence: row.import_sequence != null ? Number(row.import_sequence) : undefined,
    issue_no: (row.issue_no as string) || '',
    title: (row.title as string) || '',
    description: optionalString(row.description),
    system_name: optionalString(row.system_name),
    status: (row.status as IssueItem['status']) || '접수',
    legacy_status: optionalString(row.legacy_status),
    priority: (row.priority as IssueItem['priority']) || 'normal',
    requester_name: optionalString(row.requester_name),
    assignee_user_id: optionalString(row.assignee_user_id),
    assignee_name: optionalString(row.assignee_name),
    company_id: optionalString(row.company_id),
    received_at: optionalString(row.received_at),
    due_date: optionalString(row.due_date),
    started_at: optionalString(row.started_at),
    completed_at: optionalString(row.completed_at),
    estimated_effort: Number(row.estimated_effort ?? 0),
    actual_effort: Number(row.actual_effort ?? 0),
    total_effort: Number(row.total_effort ?? 0),
    settlement_status: (row.settlement_status as IssueItem['settlement_status']) || '미정산',
    progress: Number(row.progress ?? 0),
    source_url: optionalString(row.source_url),
    legacy_note: optionalString(row.legacy_note),
    predecessor_issue_no: optionalString(row.predecessor_issue_no),
    created_by: optionalString(row.created_by),
    updated_by: optionalString(row.updated_by),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function dbRowToComment(row: Record<string, unknown>): IssueComment {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    issue_id: row.issue_id as string,
    author_user_id: optionalString(row.author_user_id),
    author_name: optionalString(row.author_name),
    body: (row.body as string) || '',
    commented_at: row.commented_at as string,
    created_at: row.created_at as string,
  }
}

function dbRowToWorkLog(row: Record<string, unknown>): IssueWorkLog {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    issue_id: row.issue_id as string,
    worker_user_id: optionalString(row.worker_user_id),
    worker_name: (row.worker_name as string) || '',
    company_id: optionalString(row.company_id),
    work_date: row.work_date as string,
    hours: Number(row.hours ?? 0),
    body: (row.body as string) || '',
    note: optionalString(row.note),
    settlement_month: optionalString(row.settlement_month),
    settled: Boolean(row.settled),
    created_by: optionalString(row.created_by),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function issueToDb(issue: Partial<IssueItem>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  const assign = (key: keyof IssueItem, column: string = key) => {
    if (Object.prototype.hasOwnProperty.call(issue, key)) {
      payload[column] = issue[key] ?? null
    }
  }

  assign('project_id')
  assign('related_task_id')
  assign('import_sequence')
  assign('issue_no')
  assign('title')
  assign('description')
  assign('system_name')
  assign('status')
  assign('legacy_status')
  assign('priority')
  assign('requester_name')
  assign('assignee_user_id')
  assign('assignee_name')
  assign('company_id')
  assign('received_at')
  assign('due_date')
  assign('started_at')
  assign('completed_at')
  assign('estimated_effort')
  assign('actual_effort')
  assign('total_effort')
  assign('settlement_status')
  assign('progress')
  assign('source_url')
  assign('legacy_note')
  assign('predecessor_issue_no')
  assign('created_by')
  assign('updated_by')

  return payload
}

function getCurrentUserLabel() {
  const user = useAuthStore.getState().currentUser
  return {
    userId: user?.id,
    userName: user?.name || user?.email || undefined,
  }
}

export const useIssueStore = create<IssueState>((set, get) => ({
  issues: [],
  comments: [],
  workLogs: [],
  selectedIssueId: null,
  filters: {
    status: 'all',
    priority: 'all',
    assigneeUserId: 'all',
    systemName: 'all',
    search: '',
  },
  isLoading: false,

  loadIssues: async (projectId) => {
    set({ isLoading: true })
    const [{ data: issueData, error: issueError }, { data: commentData, error: commentError }, { data: workLogData, error: workLogError }] = await Promise.all([
      supabase
        .from('issue_items')
        .select('*')
        .eq('project_id', projectId)
        .order('received_at', { ascending: false, nullsFirst: false })
        .order('import_sequence', { ascending: false, nullsFirst: false }),
      supabase
        .from('issue_comments')
        .select('*')
        .eq('project_id', projectId)
        .order('commented_at', { ascending: false }),
      supabase
        .from('issue_work_logs')
        .select('*')
        .eq('project_id', projectId)
        .order('work_date', { ascending: false }),
    ])

    if (issueError) {
      console.error('이슈 목록 로드 실패:', issueError.message)
      set({ issues: [], comments: [], workLogs: [], isLoading: false })
      return
    }
    if (commentError) console.error('이슈 댓글 로드 실패:', commentError.message)
    if (workLogError) console.error('이슈 공수 로그 로드 실패:', workLogError.message)

    const issues = (issueData || []).map((row) => dbRowToIssue(row as Record<string, unknown>))
    set((state) => ({
      issues,
      comments: (commentData || []).map((row) => dbRowToComment(row as Record<string, unknown>)),
      workLogs: (workLogData || []).map((row) => dbRowToWorkLog(row as Record<string, unknown>)),
      selectedIssueId: issues.some((issue) => issue.id === state.selectedIssueId)
        ? state.selectedIssueId
        : (issues[0]?.id ?? null),
      isLoading: false,
    }))
  },

  selectIssue: (selectedIssueId) => set({ selectedIssueId }),

  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),

  createIssue: async (projectId, issue) => {
    const { userId } = getCurrentUserLabel()
    const payload = issueToDb({
      ...issue,
      project_id: projectId,
      issue_no: issue.issue_no || `ISS-${Date.now()}`,
      title: issue.title || '새 이슈',
      status: issue.status || '접수',
      priority: issue.priority || 'normal',
      estimated_effort: issue.estimated_effort ?? 0,
      actual_effort: issue.actual_effort ?? 0,
      total_effort: issue.total_effort ?? 0,
      settlement_status: issue.settlement_status || '미정산',
      progress: issue.progress ?? 0,
      created_by: userId,
      updated_by: userId,
    })
    const { data, error } = await supabase
      .from('issue_items')
      .insert(payload)
      .select('*')
      .single()
    if (error) {
      console.error('이슈 추가 실패:', error.message)
      return null
    }

    const created = dbRowToIssue(data as Record<string, unknown>)
    set((state) => ({
      issues: [created, ...state.issues],
      selectedIssueId: created.id,
    }))
    return created.id
  },

  updateIssue: async (issueId, changes) => {
    const previousIssues = get().issues
    const { userId } = getCurrentUserLabel()
    set((state) => ({
      issues: state.issues.map((issue) =>
        issue.id === issueId ? { ...issue, ...changes, updated_by: userId } : issue
      ),
    }))

    const payload = issueToDb({ ...changes, updated_by: userId })
    delete payload.project_id
    delete payload.created_by

    const { error } = await supabase.from('issue_items').update(payload).eq('id', issueId)
    if (error) {
      console.error('이슈 수정 실패:', error.message)
      set({ issues: previousIssues })
    }
  },

  deleteIssue: async (issueId) => {
    const previousState = {
      issues: get().issues,
      comments: get().comments,
      workLogs: get().workLogs,
      selectedIssueId: get().selectedIssueId,
    }
    set((state) => ({
      issues: state.issues.filter((issue) => issue.id !== issueId),
      comments: state.comments.filter((comment) => comment.issue_id !== issueId),
      workLogs: state.workLogs.filter((log) => log.issue_id !== issueId),
      selectedIssueId: state.selectedIssueId === issueId ? null : state.selectedIssueId,
    }))

    const { error } = await supabase.from('issue_items').delete().eq('id', issueId)
    if (error) {
      console.error('이슈 삭제 실패:', error.message)
      set(previousState)
    }
  },

  addComment: async (issueId, body) => {
    const issue = get().issues.find((item) => item.id === issueId)
    if (!issue || !body.trim()) return

    const { userId, userName } = getCurrentUserLabel()
    const payload = {
      project_id: issue.project_id,
      issue_id: issueId,
      author_user_id: userId || null,
      author_name: userName || null,
      body: body.trim(),
    }
    const { data, error } = await supabase
      .from('issue_comments')
      .insert(payload)
      .select('*')
      .single()
    if (error) {
      console.error('이슈 댓글 추가 실패:', error.message)
      return
    }

    set((state) => ({ comments: [dbRowToComment(data as Record<string, unknown>), ...state.comments] }))
  },

  addWorkLog: async (issueId, workLog) => {
    const issue = get().issues.find((item) => item.id === issueId)
    if (!issue) return

    const { userId, userName } = getCurrentUserLabel()
    const payload = {
      project_id: issue.project_id,
      issue_id: issueId,
      worker_user_id: workLog.worker_user_id || userId || null,
      worker_name: workLog.worker_name || userName || '작업자',
      company_id: workLog.company_id || null,
      work_date: workLog.work_date || new Date().toISOString().slice(0, 10),
      hours: workLog.hours ?? 0,
      body: workLog.body || '',
      note: workLog.note || null,
      settlement_month: workLog.settlement_month || null,
      settled: workLog.settled ?? false,
      created_by: userId || null,
    }
    const { data, error } = await supabase
      .from('issue_work_logs')
      .insert(payload)
      .select('*')
      .single()
    if (error) {
      console.error('이슈 공수 로그 추가 실패:', error.message)
      return
    }

    const createdLog = dbRowToWorkLog(data as Record<string, unknown>)
    const nextActualEffort = issue.actual_effort + createdLog.hours
    const nextTotalEffort = issue.total_effort + createdLog.hours
    set((state) => ({
      workLogs: [createdLog, ...state.workLogs],
      issues: state.issues.map((item) =>
        item.id === issueId
          ? { ...item, actual_effort: nextActualEffort, total_effort: nextTotalEffort }
          : item
      ),
    }))
    const { error: updateError } = await supabase
      .from('issue_items')
      .update({ actual_effort: nextActualEffort, total_effort: nextTotalEffort, updated_by: userId || null })
      .eq('id', issueId)
    if (updateError) console.error('이슈 공수 합계 갱신 실패:', updateError.message)
  },

  updateWorkLog: async (workLogId, changes) => {
    const previousLogs = get().workLogs
    const previousIssues = get().issues
    const currentLog = previousLogs.find((log) => log.id === workLogId)
    if (!currentLog) return

    const nextLog = { ...currentLog, ...changes }
    const issue = get().issues.find((item) => item.id === currentLog.issue_id)
    const effortDelta = nextLog.hours - currentLog.hours

    set((state) => ({
      workLogs: state.workLogs.map((log) => log.id === workLogId ? nextLog : log),
      issues: issue
        ? state.issues.map((item) =>
            item.id === issue.id
              ? { ...item, actual_effort: item.actual_effort + effortDelta, total_effort: item.total_effort + effortDelta }
              : item
          )
        : state.issues,
    }))

    const payload: Record<string, unknown> = {}
    if (Object.prototype.hasOwnProperty.call(changes, 'worker_name')) payload.worker_name = changes.worker_name || ''
    if (Object.prototype.hasOwnProperty.call(changes, 'work_date')) payload.work_date = changes.work_date || null
    if (Object.prototype.hasOwnProperty.call(changes, 'hours')) payload.hours = changes.hours ?? 0
    if (Object.prototype.hasOwnProperty.call(changes, 'body')) payload.body = changes.body || ''
    if (Object.prototype.hasOwnProperty.call(changes, 'note')) payload.note = changes.note || null
    if (Object.prototype.hasOwnProperty.call(changes, 'settled')) payload.settled = changes.settled ?? false

    const { error } = await supabase.from('issue_work_logs').update(payload).eq('id', workLogId)
    if (error) {
      console.error('이슈 공수 로그 수정 실패:', error.message)
      set({ workLogs: previousLogs, issues: previousIssues })
      return
    }

    if (issue && effortDelta !== 0) {
      const nextActualEffort = issue.actual_effort + effortDelta
      const nextTotalEffort = issue.total_effort + effortDelta
      const { userId } = getCurrentUserLabel()
      const { error: updateError } = await supabase
        .from('issue_items')
        .update({ actual_effort: nextActualEffort, total_effort: nextTotalEffort, updated_by: userId || null })
        .eq('id', issue.id)
      if (updateError) console.error('이슈 공수 합계 수정 반영 실패:', updateError.message)
    }
  },

  deleteWorkLog: async (workLogId) => {
    const previousLogs = get().workLogs
    const previousIssues = get().issues
    const currentLog = previousLogs.find((log) => log.id === workLogId)
    if (!currentLog) return
    const issue = get().issues.find((item) => item.id === currentLog.issue_id)

    set((state) => ({
      workLogs: state.workLogs.filter((log) => log.id !== workLogId),
      issues: issue
        ? state.issues.map((item) =>
            item.id === issue.id
              ? { ...item, actual_effort: item.actual_effort - currentLog.hours, total_effort: item.total_effort - currentLog.hours }
              : item
          )
        : state.issues,
    }))

    const { error } = await supabase.from('issue_work_logs').delete().eq('id', workLogId)
    if (error) {
      console.error('이슈 공수 로그 삭제 실패:', error.message)
      set({ workLogs: previousLogs, issues: previousIssues })
      return
    }

    if (issue) {
      const nextActualEffort = issue.actual_effort - currentLog.hours
      const nextTotalEffort = issue.total_effort - currentLog.hours
      const { userId } = getCurrentUserLabel()
      const { error: updateError } = await supabase
        .from('issue_items')
        .update({ actual_effort: nextActualEffort, total_effort: nextTotalEffort, updated_by: userId || null })
        .eq('id', issue.id)
      if (updateError) console.error('이슈 공수 합계 삭제 반영 실패:', updateError.message)
    }
  },
}))
