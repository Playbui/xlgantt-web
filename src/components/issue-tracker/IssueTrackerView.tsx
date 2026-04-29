import { useMemo } from 'react'
import { AlertCircle, CalendarDays, CheckCircle2, ClipboardList, Plus, Search } from 'lucide-react'
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
  const selectedIssueId = useIssueStore((s) => s.selectedIssueId)
  const filters = useIssueStore((s) => s.filters)
  const isLoading = useIssueStore((s) => s.isLoading)
  const selectIssue = useIssueStore((s) => s.selectIssue)
  const setFilters = useIssueStore((s) => s.setFilters)
  const createIssue = useIssueStore((s) => s.createIssue)

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

  const handleCreateIssue = async () => {
    if (!project) return
    await createIssue(project.id, {
      issue_no: `ISS-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${issues.length + 1}`,
      title: '새 이슈',
      received_at: new Date().toISOString().slice(0, 10),
    })
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

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
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
