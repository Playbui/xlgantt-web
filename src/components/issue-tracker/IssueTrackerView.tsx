import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, MessageSquareText, Plus, Save, Search, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { RichContentEditor } from '@/components/task-workspace/RichContentEditor'
import { useProjectStore } from '@/stores/project-store'
import { useIssueStore } from '@/stores/issue-store'
import { useAuthStore } from '@/stores/auth-store'
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUSES, type IssueItem } from '@/lib/issue-types'
import { richTextToPlainText, richTextToPreview, stripRichTextState } from '@/lib/rich-text'
import { cn } from '@/lib/utils'

const statusClasses: Record<IssueItem['status'], string> = {
  접수: 'bg-sky-50 text-sky-700 border-sky-200',
  검토: 'bg-violet-50 text-violet-700 border-violet-200',
  작업중: 'bg-amber-50 text-amber-700 border-amber-200',
  검수요청: 'bg-blue-50 text-blue-700 border-blue-200',
  완료: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  보류: 'bg-slate-100 text-slate-700 border-slate-200',
}

const priorityClasses: Record<IssueItem['priority'], string> = {
  low: 'text-slate-500',
  normal: 'text-slate-700',
  high: 'text-orange-600',
  urgent: 'text-red-600',
}

function formatDate(value?: string) {
  if (!value) return '-'
  return value.replaceAll('-', '.')
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function createIssueInputDraft(issue: IssueItem): Partial<IssueItem> {
  return {
    title: issue.title,
    issue_type: issue.issue_type || issue.legacy_status || '',
    legacy_status: issue.issue_type || issue.legacy_status || '',
    status: issue.status,
    priority: issue.priority,
    received_at: issue.received_at || '',
    due_date: issue.due_date || '',
    internal_owner_name: issue.internal_owner_name || issue.requester_name || '',
    requester_name: issue.internal_owner_name || issue.requester_name || '',
    request_source: issue.request_source || '',
    external_requester: issue.external_requester || issue.source_url || '',
    source_url: issue.external_requester || issue.source_url || '',
    description: issue.description || '',
  }
}

function includesText(issue: IssueItem, query: string) {
  if (!query) return true
  const target = [
    issue.issue_no,
    issue.title,
    richTextToPlainText(issue.description),
    issue.system_name,
    issue.requester_name,
    issue.issue_type,
    issue.request_source,
    issue.external_requester,
    issue.internal_owner_name,
    issue.assignee_name,
    issue.legacy_status,
    issue.source_url,
  ].join(' ').toLowerCase()
  return target.includes(query.toLowerCase())
}

export function IssueTrackerView() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const switchProject = useProjectStore((s) => s.switchProject)
  const currentUser = useAuthStore((s) => s.currentUser)
  const users = useAuthStore((s) => s.users)
  const issues = useIssueStore((s) => s.issues)
  const comments = useIssueStore((s) => s.comments)
  const workLogs = useIssueStore((s) => s.workLogs)
  const selectedIssueId = useIssueStore((s) => s.selectedIssueId)
  const filters = useIssueStore((s) => s.filters)
  const isLoading = useIssueStore((s) => s.isLoading)
  const selectIssue = useIssueStore((s) => s.selectIssue)
  const setFilters = useIssueStore((s) => s.setFilters)
  const createIssue = useIssueStore((s) => s.createIssue)
  const updateIssue = useIssueStore((s) => s.updateIssue)
  const addComment = useIssueStore((s) => s.addComment)
  const addWorkLog = useIssueStore((s) => s.addWorkLog)
  const updateWorkLog = useIssueStore((s) => s.updateWorkLog)
  const deleteWorkLog = useIssueStore((s) => s.deleteWorkLog)
  const loadIssues = useIssueStore((s) => s.loadIssues)
  const loadIssueMembers = useIssueStore((s) => s.loadIssueMembers)
  const issueMembers = useIssueStore((s) => s.issueMembers)
  const issueCategories = useIssueStore((s) => s.issueCategories)
  const loadIssueCategories = useIssueStore((s) => s.loadIssueCategories)
  const addIssueCategory = useIssueStore((s) => s.addIssueCategory)
  const deleteIssueCategory = useIssueStore((s) => s.deleteIssueCategory)
  const [detailTab, setDetailTab] = useState<'input' | 'process'>('input')
  const [draftComment, setDraftComment] = useState('')
  const [draftWorkBody, setDraftWorkBody] = useState('')
  const [draftWorkHours, setDraftWorkHours] = useState('1')
  const [draftWorkDate, setDraftWorkDate] = useState(new Date().toISOString().slice(0, 10))
  const [draftWorkWorkerName, setDraftWorkWorkerName] = useState(currentUser?.name || currentUser?.email || '')
  const [newIssueKind, setNewIssueKind] = useState('')
  const [showIssueKindManager, setShowIssueKindManager] = useState(false)
  const [inputDraft, setInputDraft] = useState<Partial<IssueItem>>({})
  const [inputDirty, setInputDirty] = useState(false)
  const [inputSaving, setInputSaving] = useState(false)
  const selectedProjectId = searchParams.get('project') || ''
  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    if (projects.length === 0) {
      void loadProjects()
    }
  }, [loadProjects, projects.length])

  useEffect(() => {
    if (projects.length === 0) return
    void Promise.all(projects.map((project) => loadIssueMembers(project.id)))
  }, [loadIssueMembers, projects])

  const accessibleProjects = useMemo(() => {
    if (isAdmin) return projects
    if (!currentUser?.id) return []
    return projects.filter((project) =>
      issueMembers.some((member) => member.project_id === project.id && member.user_id === currentUser.id)
    )
  }, [currentUser?.id, isAdmin, issueMembers, projects])

  const project = useMemo(() => {
    return accessibleProjects.find((item) => item.id === selectedProjectId) || accessibleProjects[0] || null
  }, [accessibleProjects, selectedProjectId])

  useEffect(() => {
    if (!project) return
    if (selectedProjectId !== project.id) {
      setSearchParams({ project: project.id }, { replace: true })
      return
    }
    switchProject(project.id)
    void loadIssues(project.id)
    void loadIssueCategories(project.id)
  }, [loadIssueCategories, loadIssues, project, selectedProjectId, setSearchParams, switchProject])

  const issueKinds = useMemo(() => {
    const managed = issueCategories
      .filter((category) => category.project_id === project?.id)
      .map((category) => category.name)
    const legacy = issues.map((issue) => issue.issue_type || issue.legacy_status).filter(Boolean) as string[]
    return Array.from(new Set([...managed, ...legacy])).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [issueCategories, issues, project?.id])

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (filters.status && filters.status !== 'all' && issue.status !== filters.status) return false
      if (filters.priority && filters.priority !== 'all' && issue.priority !== filters.priority) return false
      if (filters.assigneeUserId && filters.assigneeUserId !== 'all' && issue.assignee_user_id !== filters.assigneeUserId) return false
      if (filters.systemName && filters.systemName !== 'all' && (issue.issue_type || issue.legacy_status) !== filters.systemName) return false
      return includesText(issue, filters.search || '')
    })
  }, [filters, issues])

  const summary = useMemo(() => {
    return {
      total: issues.length,
      active: issues.filter((issue) => !['완료', '보류'].includes(issue.status)).length,
      done: issues.filter((issue) => issue.status === '완료').length,
      effort: issues.reduce((sum, issue) => sum + issue.total_effort, 0),
    }
  }, [issues])

  const selectedIssue = useMemo(() => {
    return issues.find((issue) => issue.id === selectedIssueId) || null
  }, [issues, selectedIssueId])

  const selectedComments = useMemo(() => {
    if (!selectedIssue) return []
    return comments.filter((comment) => comment.issue_id === selectedIssue.id)
  }, [comments, selectedIssue])

  const selectedWorkLogs = useMemo(() => {
    if (!selectedIssue) return []
    return workLogs.filter((log) => log.issue_id === selectedIssue.id)
  }, [selectedIssue, workLogs])

  const userLabels = useMemo(() => {
    const labels = new Map<string, string>()
    users.forEach((user) => labels.set(user.id, user.name || user.email || user.id))
    if (currentUser) labels.set(currentUser.id, currentUser.name || currentUser.email || currentUser.id)
    return labels
  }, [currentUser, users])

  const setInputDraftValue = (changes: Partial<IssueItem>) => {
    setInputDraft((draft) => ({ ...draft, ...changes }))
    setInputDirty(true)
  }

  const handleSaveInputDraft = async () => {
    if (!selectedIssue || !inputDirty || inputSaving) return
    setInputSaving(true)
    await updateIssue(selectedIssue.id, inputDraft)
    setInputSaving(false)
    setInputDirty(false)
  }

  useEffect(() => {
    setDraftComment('')
    setDraftWorkBody('')
    setDraftWorkHours('1')
    setDraftWorkDate(new Date().toISOString().slice(0, 10))
    setDraftWorkWorkerName(currentUser?.name || currentUser?.email || '')
    setDetailTab('input')
    if (selectedIssue) {
      setInputDraft(createIssueInputDraft(selectedIssue))
      setInputDirty(false)
    } else {
      setInputDraft({})
      setInputDirty(false)
    }
  }, [currentUser?.email, currentUser?.name, selectedIssueId])

  const handleCreateIssue = async () => {
    if (!project) return
    await createIssue(project.id, {
      issue_no: `ISS-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${issues.length + 1}`,
      title: '제목을 입력하세요',
      issue_type: '이슈',
      legacy_status: '이슈',
      internal_owner_user_id: currentUser?.id,
      internal_owner_name: currentUser?.name || currentUser?.email || '',
      requester_name: currentUser?.name || currentUser?.email || '',
      system_name: project.name,
      received_at: new Date().toISOString().slice(0, 10),
    })
  }

  const handleAddComment = async () => {
    if (!selectedIssue || !richTextToPlainText(draftComment).trim()) return
    await addComment(selectedIssue.id, draftComment)
    setDraftComment('')
  }

  const handleAddWorkLog = async () => {
    if (!selectedIssue || !draftWorkBody.trim()) return
    const hours = Number(draftWorkHours)
    await addWorkLog(selectedIssue.id, {
      hours: Number.isFinite(hours) ? hours : 0,
      body: draftWorkBody,
      work_date: draftWorkDate,
      worker_user_id: currentUser?.id,
      worker_name: draftWorkWorkerName || currentUser?.name || currentUser?.email || '작업자',
    })
    setDraftWorkBody('')
    setDraftWorkHours('1')
    setDraftWorkDate(new Date().toISOString().slice(0, 10))
  }

  const handleAddIssueKind = async () => {
    if (!project || !newIssueKind.trim()) return
    await addIssueCategory(project.id, newIssueKind)
    setNewIssueKind('')
  }

  const handleDeleteIssueKind = async (name: string) => {
    if (!project) return
    const replacements = issueKinds.filter((kind) => kind !== name)
    if (replacements.length === 0) {
      window.alert('삭제하려면 먼저 대체할 구분을 하나 더 등록해야 합니다.')
      return
    }
    const replacement = window.prompt(`"${name}" 구분을 삭제합니다.\n기존 이슈를 대체할 구분명을 입력하세요.`, replacements[0])
    if (!replacement) return
    await deleteIssueCategory(project.id, name, replacement)
    if (selectedIssue && (selectedIssue.issue_type === name || selectedIssue.legacy_status === name)) {
      await updateIssue(selectedIssue.id, { issue_type: replacement, legacy_status: replacement })
    }
  }

  return (
    <main className="flex h-screen min-h-0 flex-col bg-slate-50/60">
      <div className="border-b bg-white px-5 py-2.5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate('/projects')}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            프로젝트 목록
          </button>
          {project && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${project.id}/wbs`)}>
              WBS로 이동
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="text-lg font-semibold text-slate-950">이슈 트래커</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                <span>전체 <strong className="text-slate-950">{summary.total}건</strong></span>
                <span>진행 중 <strong className="text-slate-950">{summary.active}건</strong></span>
                <span>완료 <strong className="text-slate-950">{summary.done}건</strong></span>
                <span>누적 공수 <strong className="text-slate-950">{summary.effort.toFixed(2)} D</strong></span>
              </div>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">프로젝트를 선택해 이슈 접수, 처리 이력, 공수 정산을 관리합니다.</p>
          </div>
          <Button onClick={handleCreateIssue} disabled={!project}>
            <Plus className="h-4 w-4" />
            이슈 추가
          </Button>
        </div>
      </div>

      <div className="border-b bg-white px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={project?.id || ''}
            onChange={(event) => setSearchParams({ project: event.target.value })}
            className="h-9 min-w-[280px] rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          >
            {accessibleProjects.length === 0 ? (
              <option value="">접근 가능한 프로젝트 없음</option>
            ) : (
              accessibleProjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)
            )}
          </select>
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search || ''}
              onChange={(event) => setFilters({ search: event.target.value })}
              placeholder="Task ID, 제목, 내용, 등록자, 외부 요청자 검색"
              className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <select
            value={filters.status || 'all'}
            onChange={(event) => setFilters({ status: event.target.value as IssueItem['status'] | 'all' })}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          >
            <option value="all">상태 전체</option>
            {ISSUE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select
            value={filters.systemName || 'all'}
            onChange={(event) => setFilters({ systemName: event.target.value })}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          >
            <option value="all">구분 전체</option>
            {issueKinds.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden px-5 py-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
              이슈 목록
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {isLoading ? (
                <div className="px-3 py-12 text-center text-sm text-slate-500">이슈를 불러오는 중...</div>
              ) : filteredIssues.length === 0 ? (
                <div className="px-3 py-12 text-center text-sm text-slate-500">표시할 이슈가 없습니다.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredIssues.map((issue) => (
                    <button
                      key={issue.id}
                      onClick={() => selectIssue(issue.id)}
                      className={cn(
                        'block w-full px-3 py-3 text-left transition-colors hover:bg-sky-50/60',
                        selectedIssueId === issue.id && 'bg-sky-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-500">{issue.issue_no}</div>
                          <div className="mt-1 line-clamp-2 font-semibold text-slate-950">{issue.title}</div>
                        </div>
                        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium', statusClasses[issue.status])}>{issue.status}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{issue.issue_type || issue.legacy_status || '이슈'}</span>
                        <span>{ISSUE_PRIORITY_LABELS[issue.priority]}</span>
                        <span>{formatDate(issue.received_at)}</span>
                        <span className="ml-auto tabular-nums">{issue.total_effort.toFixed(2)} D</span>
                      </div>
                      {(issue.description || issue.internal_owner_name || issue.external_requester) && (
                        <div className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">
                          {richTextToPreview(issue.description, 96) || issue.internal_owner_name || issue.external_requester}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white">
          {selectedIssue ? (
            <div className="space-y-5 p-5">
              <section className="rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-500">이슈 번호</div>
                    <div className="mt-0.5 font-semibold text-slate-950">{selectedIssue.issue_no}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', statusClasses[selectedIssue.status])}>{selectedIssue.status}</span>
                    <span className={cn('text-sm font-semibold', priorityClasses[selectedIssue.priority])}>{ISSUE_PRIORITY_LABELS[selectedIssue.priority]}</span>
                  </div>
                </div>

                <div className="border-b border-slate-200 px-4 py-2">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                    <button
                      type="button"
                      onClick={() => setDetailTab('input')}
                      className={cn(
                        'h-8 rounded-md px-4 text-sm font-semibold transition-colors',
                        detailTab === 'input' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      )}
                    >
                      입력
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTab('process')}
                      className={cn(
                        'h-8 rounded-md px-4 text-sm font-semibold transition-colors',
                        detailTab === 'process' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      )}
                    >
                      처리
                    </button>
                  </div>
                </div>

                {detailTab === 'input' && (
                <div className="space-y-5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                      <span>
                        등록자 <strong className="font-semibold text-slate-700">{selectedIssue.created_by ? (userLabels.get(selectedIssue.created_by) || selectedIssue.created_by) : '-'}</strong>
                      </span>
                      <span>
                        등록일 <strong className="font-semibold text-slate-700">{formatDateTime(selectedIssue.created_at)}</strong>
                      </span>
                      <span>
                        최종수정 <strong className="font-semibold text-slate-700">{selectedIssue.updated_by ? (userLabels.get(selectedIssue.updated_by) || selectedIssue.updated_by) : '-'}</strong>
                      </span>
                      <span>
                        수정일 <strong className="font-semibold text-slate-700">{formatDateTime(selectedIssue.updated_at)}</strong>
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => void handleSaveInputDraft()}
                      disabled={!inputDirty || inputSaving}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {inputSaving ? '저장 중' : '입력 저장'}
                    </Button>
                  </div>

                  <Field label="제목">
                    <input
                      value={inputDraft.title || ''}
                      onChange={(event) => setInputDraftValue({ title: event.target.value })}
                      className="h-11 w-full rounded-md border border-slate-300 px-3 text-base font-semibold text-slate-950 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    />
                  </Field>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900">분류 / 상태</div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="구분">
                          <div className="flex gap-2">
                            <select
                            value={inputDraft.issue_type || inputDraft.legacy_status || ''}
                            onChange={(event) => setInputDraftValue({ issue_type: event.target.value, legacy_status: event.target.value })}
                              className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-sm"
                            >
                              {issueKinds.length === 0 && <option value="">구분 없음</option>}
                              {issueKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-9 shrink-0 px-2 text-xs"
                              onClick={() => setShowIssueKindManager((value) => !value)}
                            >
                              관리
                            </Button>
                          </div>
                        </Field>
                        <Field label="상태">
                          <select
                            value={inputDraft.status || selectedIssue.status}
                            onChange={(event) => setInputDraftValue({ status: event.target.value as IssueItem['status'] })}
                            className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          >
                            {ISSUE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        </Field>
                        <Field label="우선순위">
                          <select
                            value={inputDraft.priority || selectedIssue.priority}
                            onChange={(event) => setInputDraftValue({ priority: event.target.value as IssueItem['priority'] })}
                            className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          >
                            {Object.entries(ISSUE_PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </Field>
                      </div>
                      {showIssueKindManager && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-2 flex gap-2">
                            <input
                              value={newIssueKind}
                              onChange={(event) => setNewIssueKind(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') void handleAddIssueKind()
                              }}
                              placeholder="새 구분명"
                              className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm"
                            />
                            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => void handleAddIssueKind()} disabled={!newIssueKind.trim()}>
                              등록
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {issueKinds.map((kind) => (
                              <span key={kind} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                                {kind}
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteIssueKind(kind)}
                                  className="rounded-full px-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                  title="삭제 후 대체"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900">일정</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="등록일">
                          <input
                            type="date"
                            value={inputDraft.received_at || ''}
                            onChange={(event) => setInputDraftValue({ received_at: event.target.value })}
                            className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          />
                        </Field>
                        <Field label="마감요청일">
                          <input
                            type="date"
                            value={inputDraft.due_date || ''}
                            onChange={(event) => setInputDraftValue({ due_date: event.target.value })}
                            className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900">내부 정보</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="프로젝트">
                          <input
                            value={project?.name || selectedIssue.system_name || ''}
                            readOnly
                            className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-sm text-slate-500"
                          />
                        </Field>
                        <Field label="등록자 / 내부 담당">
                          <input
                            value={inputDraft.internal_owner_name || inputDraft.requester_name || ''}
                            onChange={(event) => setInputDraftValue({ internal_owner_name: event.target.value, requester_name: event.target.value })}
                            className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          />
                        </Field>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900">요청 정보</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="요청처">
                          <input
                            value={inputDraft.request_source || ''}
                            onChange={(event) => setInputDraftValue({ request_source: event.target.value })}
                            placeholder="예: 발주처 / 사업부"
                            className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          />
                        </Field>
                        <Field label="외부 요청자">
                          <input
                            value={inputDraft.external_requester || inputDraft.source_url || ''}
                            onChange={(event) => setInputDraftValue({ external_requester: event.target.value, source_url: event.target.value })}
                            placeholder="예: 수협 홍길동"
                            className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  <Field label="상세 내용">
                    <RichContentEditor
                      key={selectedIssue.id}
                      value={inputDraft.description || ''}
                      onChange={(value) => setInputDraftValue({ description: value })}
                      placeholder="발생 현상, 요청 내용, 재현 조건, 확인할 내용을 충분히 입력"
                      minHeight={360}
                      fontSize={14}
                      toolbarVariant="formatting"
                      className="rounded-lg shadow-none"
                    />
                  </Field>
                </div>
                )}
              </section>

              {detailTab === 'process' && (
                <>
              <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <MessageSquareText className="h-4 w-4" />
                    처리 이력
                  </h2>
                  <span className="text-xs text-slate-500">{selectedComments.length}개</span>
                </div>
                <RichContentEditor
                  value={draftComment}
                  onChange={setDraftComment}
                  placeholder="날짜별 진행 상황, 확인 결과, 외부 전달 내용 등을 남깁니다."
                  minHeight={180}
                  fontSize={14}
                  toolbarVariant="formatting"
                  className="rounded-lg shadow-none"
                />
                <Button size="sm" variant="outline" onClick={handleAddComment} disabled={!richTextToPlainText(draftComment).trim()}>이력 추가</Button>
                <div className="space-y-2">
                  {selectedComments.slice(0, 8).map((comment) => (
                    <div key={comment.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <div className="mb-1 flex justify-between gap-2 text-xs text-slate-500">
                        <span>{comment.author_name || '작성자'}</span>
                        <span>{formatDateTime(comment.commented_at)}</span>
                      </div>
                      <div
                        className="prose prose-sm max-w-none text-slate-700"
                        dangerouslySetInnerHTML={{ __html: stripRichTextState(comment.body) || richTextToPlainText(comment.body) }}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h2 className="text-sm font-semibold text-slate-900">공수 로그</h2>
                  <span className="text-xs text-slate-500">{selectedIssue.total_effort.toFixed(2)} D</span>
                </div>
                <div className="grid grid-cols-[150px_150px_90px_minmax(420px,1fr)_64px] gap-2">
                  <input
                    type="date"
                    value={draftWorkDate}
                    onChange={(event) => setDraftWorkDate(event.target.value)}
                    className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                  />
                  <input
                    value={draftWorkWorkerName}
                    onChange={(event) => setDraftWorkWorkerName(event.target.value)}
                    placeholder="작업자"
                    className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                  />
                  <input
                    value={draftWorkHours}
                    onChange={(event) => setDraftWorkHours(event.target.value)}
                    className="h-9 rounded-md border border-slate-200 px-2 text-right text-sm"
                  />
                  <input
                    value={draftWorkBody}
                    onChange={(event) => setDraftWorkBody(event.target.value)}
                    placeholder="작업내역"
                    className="h-9 min-w-0 rounded-md border border-slate-200 px-2 text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={handleAddWorkLog} disabled={!draftWorkBody.trim()}>추가</Button>
                </div>
                <div className="space-y-2">
                  {selectedWorkLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <div className="mb-2 grid grid-cols-[160px_130px_72px_minmax(360px,1fr)_28px] items-center gap-2">
                        <input
                          defaultValue={log.worker_name}
                          onBlur={(event) => updateWorkLog(log.id, { worker_name: event.target.value })}
                          className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
                        />
                        <input
                          type="date"
                          defaultValue={log.work_date}
                          onBlur={(event) => updateWorkLog(log.id, { work_date: event.target.value })}
                          className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
                        />
                        <input
                          defaultValue={log.hours.toString()}
                          onBlur={(event) => {
                            const hours = Number(event.target.value)
                            updateWorkLog(log.id, { hours: Number.isFinite(hours) ? hours : log.hours })
                          }}
                          className="h-8 rounded border border-slate-200 bg-white px-2 text-right text-xs"
                        />
                        <input
                          defaultValue={log.body}
                          onBlur={(event) => updateWorkLog(log.id, { body: event.target.value })}
                          className="h-8 min-w-0 rounded border border-slate-200 bg-white px-2 text-sm text-slate-700"
                        />
                        <button
                          onClick={() => deleteWorkLog(log.id)}
                          className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="공수 로그 삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
                </>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">이슈를 선택하면 상세 정보가 표시됩니다.</div>
          )}
        </aside>
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}
