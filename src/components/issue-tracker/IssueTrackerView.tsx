import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, CheckCircle2, ClipboardList, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/project-store'
import { useIssueStore } from '@/stores/issue-store'
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUSES, type IssueItem } from '@/lib/issue-types'
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

function includesText(issue: IssueItem, query: string) {
  if (!query) return true
  const target = [
    issue.issue_no,
    issue.title,
    issue.description,
    issue.system_name,
    issue.requester_name,
    issue.assignee_name,
    issue.legacy_status,
  ].join(' ').toLowerCase()
  return target.includes(query.toLowerCase())
}

export function IssueTrackerView() {
  const project = useProjectStore((s) => s.currentProject)
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
  const [draftComment, setDraftComment] = useState('')
  const [draftWorkBody, setDraftWorkBody] = useState('')
  const [draftWorkHours, setDraftWorkHours] = useState('1')

  const systemNames = useMemo(() => {
    return Array.from(new Set(issues.map((issue) => issue.system_name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [issues])

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (filters.status && filters.status !== 'all' && issue.status !== filters.status) return false
      if (filters.priority && filters.priority !== 'all' && issue.priority !== filters.priority) return false
      if (filters.assigneeUserId && filters.assigneeUserId !== 'all' && issue.assignee_user_id !== filters.assigneeUserId) return false
      if (filters.systemName && filters.systemName !== 'all' && issue.system_name !== filters.systemName) return false
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

  useEffect(() => {
    setDraftComment('')
    setDraftWorkBody('')
    setDraftWorkHours('1')
  }, [selectedIssueId])

  const handleCreateIssue = async () => {
    if (!project) return
    await createIssue(project.id, {
      issue_no: `ISS-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${issues.length + 1}`,
      title: '새 이슈',
      received_at: new Date().toISOString().slice(0, 10),
    })
  }

  const handleAddComment = async () => {
    if (!selectedIssue || !draftComment.trim()) return
    await addComment(selectedIssue.id, draftComment)
    setDraftComment('')
  }

  const handleAddWorkLog = async () => {
    if (!selectedIssue || !draftWorkBody.trim()) return
    const hours = Number(draftWorkHours)
    await addWorkLog(selectedIssue.id, {
      hours: Number.isFinite(hours) ? hours : 0,
      body: draftWorkBody,
    })
    setDraftWorkBody('')
    setDraftWorkHours('1')
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-slate-50/60">
      <div className="border-b bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-950">이슈 트래커</h1>
            <p className="mt-1 text-sm text-slate-500">{project?.name || '프로젝트'} 내부 이슈와 공수 흐름</p>
          </div>
          <Button onClick={handleCreateIssue} disabled={!project}>
            <Plus className="h-4 w-4" />
            이슈 추가
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryItem icon={<ClipboardList className="h-4 w-4" />} label="전체" value={`${summary.total}건`} />
          <SummaryItem icon={<AlertCircle className="h-4 w-4" />} label="진행 중" value={`${summary.active}건`} />
          <SummaryItem icon={<CheckCircle2 className="h-4 w-4" />} label="완료" value={`${summary.done}건`} />
          <SummaryItem icon={<CalendarDays className="h-4 w-4" />} label="누적 공수" value={`${summary.effort.toFixed(2)} D`} />
        </div>
      </div>

      <div className="border-b bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search || ''}
              onChange={(event) => setFilters({ search: event.target.value })}
              placeholder="Task ID, 제목, 요청자 검색"
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
            <option value="all">사업 전체</option>
            {systemNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden px-5 py-4">
        <div className="min-w-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white">
          <div className="min-w-[1080px]">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-36 px-3 py-2 text-left">Task ID</th>
                  <th className="w-36 px-3 py-2 text-left">사업명</th>
                  <th className="px-3 py-2 text-left">내용</th>
                  <th className="w-28 px-3 py-2 text-left">상태</th>
                  <th className="w-24 px-3 py-2 text-left">우선순위</th>
                  <th className="w-28 px-3 py-2 text-left">요청자</th>
                  <th className="w-28 px-3 py-2 text-left">등록일</th>
                  <th className="w-24 px-3 py-2 text-right">공수</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-500">이슈를 불러오는 중...</td></tr>
                ) : filteredIssues.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-500">표시할 이슈가 없습니다.</td></tr>
                ) : (
                  filteredIssues.map((issue) => (
                    <tr
                      key={issue.id}
                      onClick={() => selectIssue(issue.id)}
                      className={cn(
                        'cursor-pointer border-t border-slate-100 hover:bg-sky-50/50',
                        selectedIssueId === issue.id && 'bg-sky-50'
                      )}
                    >
                      <td className="px-3 py-3 font-medium text-slate-900">{issue.issue_no}</td>
                      <td className="px-3 py-3 text-slate-600">{issue.system_name || '-'}</td>
                      <td className="px-3 py-3">
                        <div className="line-clamp-1 font-medium text-slate-900">{issue.title}</div>
                        {issue.description && <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{issue.description}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', statusClasses[issue.status])}>{issue.status}</span>
                      </td>
                      <td className={cn('px-3 py-3 font-medium', priorityClasses[issue.priority])}>{ISSUE_PRIORITY_LABELS[issue.priority]}</td>
                      <td className="px-3 py-3 text-slate-600">{issue.requester_name || '-'}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(issue.received_at)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{issue.total_effort.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="hidden w-[420px] shrink-0 overflow-auto rounded-lg border border-slate-200 bg-white xl:block">
          {selectedIssue ? (
            <div className="space-y-5 p-4">
              <section className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500">{selectedIssue.issue_no}</div>
                    <input
                      value={selectedIssue.title}
                      onChange={(event) => updateIssue(selectedIssue.id, { title: event.target.value })}
                      className="mt-1 w-full rounded-md border border-transparent px-0 text-base font-semibold text-slate-950 outline-none focus:border-slate-200 focus:px-2"
                    />
                  </div>
                  <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', statusClasses[selectedIssue.status])}>{selectedIssue.status}</span>
                </div>

                <textarea
                  value={selectedIssue.description || ''}
                  onChange={(event) => updateIssue(selectedIssue.id, { description: event.target.value })}
                  placeholder="이슈 내용을 입력"
                  className="min-h-28 w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />

                <div className="grid grid-cols-2 gap-2">
                  <Field label="상태">
                    <select
                      value={selectedIssue.status}
                      onChange={(event) => updateIssue(selectedIssue.id, { status: event.target.value as IssueItem['status'] })}
                      className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm"
                    >
                      {ISSUE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </Field>
                  <Field label="우선순위">
                    <select
                      value={selectedIssue.priority}
                      onChange={(event) => updateIssue(selectedIssue.id, { priority: event.target.value as IssueItem['priority'] })}
                      className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm"
                    >
                      {Object.entries(ISSUE_PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="사업명">
                    <input
                      value={selectedIssue.system_name || ''}
                      onChange={(event) => updateIssue(selectedIssue.id, { system_name: event.target.value })}
                      className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm"
                    />
                  </Field>
                  <Field label="요청자">
                    <input
                      value={selectedIssue.requester_name || ''}
                      onChange={(event) => updateIssue(selectedIssue.id, { requester_name: event.target.value })}
                      className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm"
                    />
                  </Field>
                  <Field label="등록일">
                    <input
                      type="date"
                      value={selectedIssue.received_at || ''}
                      onChange={(event) => updateIssue(selectedIssue.id, { received_at: event.target.value })}
                      className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm"
                    />
                  </Field>
                  <Field label="마감요청일">
                    <input
                      type="date"
                      value={selectedIssue.due_date || ''}
                      onChange={(event) => updateIssue(selectedIssue.id, { due_date: event.target.value })}
                      className="h-8 w-full rounded-md border border-slate-200 px-2 text-sm"
                    />
                  </Field>
                </div>
              </section>

              <section className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">댓글</h2>
                  <span className="text-xs text-slate-500">{selectedComments.length}개</span>
                </div>
                <textarea
                  value={draftComment}
                  onChange={(event) => setDraftComment(event.target.value)}
                  placeholder="처리 이력 또는 메모 입력"
                  className="min-h-20 w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
                <Button size="sm" variant="outline" onClick={handleAddComment} disabled={!draftComment.trim()}>댓글 추가</Button>
                <div className="space-y-2">
                  {selectedComments.slice(0, 8).map((comment) => (
                    <div key={comment.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <div className="mb-1 flex justify-between gap-2 text-xs text-slate-500">
                        <span>{comment.author_name || '작성자'}</span>
                        <span>{formatDate(comment.commented_at.slice(0, 10))}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-slate-700">{comment.body}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">공수 로그</h2>
                  <span className="text-xs text-slate-500">{selectedIssue.total_effort.toFixed(2)} D</span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={draftWorkHours}
                    onChange={(event) => setDraftWorkHours(event.target.value)}
                    className="h-8 w-20 rounded-md border border-slate-200 px-2 text-sm"
                  />
                  <input
                    value={draftWorkBody}
                    onChange={(event) => setDraftWorkBody(event.target.value)}
                    placeholder="작업내역"
                    className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={handleAddWorkLog} disabled={!draftWorkBody.trim()}>추가</Button>
                </div>
                <div className="space-y-2">
                  {selectedWorkLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <div className="mb-2 grid grid-cols-[1fr_92px_64px_28px] items-center gap-2">
                        <input
                          defaultValue={log.worker_name}
                          onBlur={(event) => updateWorkLog(log.id, { worker_name: event.target.value })}
                          className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
                        />
                        <input
                          type="date"
                          defaultValue={log.work_date}
                          onBlur={(event) => updateWorkLog(log.id, { work_date: event.target.value })}
                          className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
                        />
                        <input
                          defaultValue={log.hours.toString()}
                          onBlur={(event) => {
                            const hours = Number(event.target.value)
                            updateWorkLog(log.id, { hours: Number.isFinite(hours) ? hours : log.hours })
                          }}
                          className="h-7 rounded border border-slate-200 bg-white px-2 text-right text-xs"
                        />
                        <button
                          onClick={() => deleteWorkLog(log.id)}
                          className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="공수 로그 삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        defaultValue={log.body}
                        onBlur={(event) => updateWorkLog(log.id, { body: event.target.value })}
                        className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-sm text-slate-700"
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">이슈를 선택하면 상세 정보가 표시됩니다.</div>
          )}
        </aside>
      </div>
    </main>
  )
}

function SummaryItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
    </div>
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
