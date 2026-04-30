import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BarChart3, CalendarDays, ClipboardList, Search } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectStore } from '@/stores/project-store'
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUSES, type IssueItem, type IssuePriority, type IssueStatus } from '@/lib/issue-types'
import type { Project } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type IssueStatsRow = {
  id: string
  project_id: string
  issue_no: string
  title: string
  issue_type?: string | null
  legacy_status?: string | null
  status: IssueStatus
  priority: IssuePriority
  request_source?: string | null
  external_requester?: string | null
  requester_name?: string | null
  internal_owner_name?: string | null
  created_by?: string | null
  received_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
}

type WorkLogStatsRow = {
  id: string
  project_id: string
  issue_id: string
  worker_user_id?: string | null
  worker_name?: string | null
  work_date: string
  hours: number
  body?: string | null
}

type RangeMode = 'all' | 'month' | 'quarter' | 'year' | 'custom'
type TrendUnit = 'day' | 'week' | 'month'

type RankRow = {
  key: string
  label: string
  count: number
  effort: number
}

const statusClasses: Record<IssueStatus, string> = {
  접수: 'bg-sky-50 text-sky-700 border-sky-200',
  검토: 'bg-violet-50 text-violet-700 border-violet-200',
  작업중: 'bg-amber-50 text-amber-700 border-amber-200',
  검수요청: 'bg-blue-50 text-blue-700 border-blue-200',
  완료: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  보류: 'bg-slate-100 text-slate-700 border-slate-200',
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.replaceAll('-', '.')
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
}

function getLocalDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getRange(mode: RangeMode, customFrom: string, customTo: string) {
  const today = new Date()
  const to = getLocalDateInputValue(today)
  if (mode === 'custom') return { from: customFrom, to: customTo }
  if (mode === 'all') return { from: '', to: '' }
  if (mode === 'month') return { from: getLocalDateInputValue(addDays(today, -30)), to }
  if (mode === 'quarter') return { from: getLocalDateInputValue(addDays(today, -90)), to }
  return { from: getLocalDateInputValue(addDays(today, -365)), to }
}

function dateInRange(value: string | null | undefined, from: string, to: string) {
  if (!value) return false
  const key = value.slice(0, 10)
  if (from && key < from) return false
  if (to && key > to) return false
  return true
}

function getWeekKey(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  const day = date.getDay() || 7
  date.setDate(date.getDate() + 4 - day)
  const yearStart = new Date(date.getFullYear(), 0, 1)
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function getPeriodKey(value: string, unit: TrendUnit) {
  const date = value.slice(0, 10)
  if (unit === 'day') return date
  if (unit === 'week') return getWeekKey(date)
  return date.slice(0, 7)
}

function percent(value: number) {
  return Math.max(0, Math.min(100, value))
}

function getProjectPeriodProgress(project: Project) {
  const start = new Date(`${project.start_date}T00:00:00`)
  const end = new Date(`${project.end_date}T00:00:00`)
  const today = new Date()
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0
  return percent(((today.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100)
}

function upsertRank(map: Map<string, RankRow>, key: string, label: string, countDelta = 1, effortDelta = 0) {
  const current = map.get(key) || { key, label, count: 0, effort: 0 }
  current.count += countDelta
  current.effort += effortDelta
  map.set(key, current)
}

function sortRank(map: Map<string, RankRow>, sortBy: 'count' | 'effort' = 'count') {
  return Array.from(map.values()).sort((a, b) => sortBy === 'effort' ? b.effort - a.effort : b.count - a.count)
}

function projectLabel(projects: Map<string, Project>, projectId: string) {
  return projects.get(projectId)?.name || '미지정 프로젝트'
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap text-sm text-[#727780]">
      {label} <strong className="font-semibold text-[#181d26]">{value}</strong>
    </span>
  )
}

function RankList({ title, rows, metric = '건', value = 'count' }: { title: string; rows: RankRow[]; metric?: string; value?: 'count' | 'effort' }) {
  const max = Math.max(...rows.map((row) => value === 'effort' ? row.effort : row.count), 1)
  return (
    <section className="overflow-hidden rounded-xl border border-[#dddddd] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="border-b border-[#dddddd] bg-[#eef4fb] px-4 py-3 text-sm font-semibold text-[#181d26]">{title}</div>
      <div className="divide-y divide-[#ece7de]">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[#727780]">표시할 데이터가 없습니다.</div>
        ) : rows.slice(0, 8).map((row, index) => {
          const amount = value === 'effort' ? row.effort : row.count
          return (
            <div key={row.key} className="px-4 py-3">
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-[#41454d]">{index + 1}. {row.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-[#181d26]">
                  {value === 'effort' ? `${formatNumber(amount, 2)} D` : `${formatNumber(amount)}${metric}`}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#f1ede5]">
                <div className="h-full rounded-full bg-[#181d26]" style={{ width: `${Math.max(3, (amount / max) * 100)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function IssueStatsView() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const users = useAuthStore((s) => s.users)
  const fetchAllUsers = useAuthStore((s) => s.fetchAllUsers)
  const [issues, setIssues] = useState<IssueStatsRow[]>([])
  const [workLogs, setWorkLogs] = useState<WorkLogStatsRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [rangeMode, setRangeMode] = useState<RangeMode>('year')
  const [trendUnit, setTrendUnit] = useState<TrendUnit>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [query, setQuery] = useState('')

  const selectedProjectId = searchParams.get('project') || 'all'
  const range = getRange(rangeMode, customFrom, customTo)

  useEffect(() => {
    void loadProjects()
    void fetchAllUsers()
  }, [fetchAllUsers, loadProjects])

  useEffect(() => {
    let cancelled = false
    async function loadStats() {
      setIsLoading(true)
      const [{ data: issueData, error: issueError }, { data: workLogData, error: workLogError }] = await Promise.all([
        supabase
          .from('issue_items')
          .select('id, project_id, issue_no, title, issue_type, legacy_status, status, priority, request_source, external_requester, requester_name, internal_owner_name, created_by, received_at, completed_at, created_at, updated_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('issue_work_logs')
          .select('id, project_id, issue_id, worker_user_id, worker_name, work_date, hours, body')
          .order('work_date', { ascending: false }),
      ])

      if (cancelled) return
      if (issueError) console.error('이슈 통계 로드 실패:', issueError.message)
      if (workLogError) console.error('이슈 공수 통계 로드 실패:', workLogError.message)

      setIssues((issueData || []) as IssueStatsRow[])
      setWorkLogs((workLogData || []).map((row) => ({ ...row, hours: Number(row.hours ?? 0) })) as WorkLogStatsRow[])
      setIsLoading(false)
    }

    void loadStats()
    return () => {
      cancelled = true
    }
  }, [])

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])

  const stats = useMemo(() => {
    const selectedIssues = issues.filter((issue) => {
      if (selectedProjectId !== 'all' && issue.project_id !== selectedProjectId) return false
      if (!dateInRange(issue.created_at || issue.received_at, range.from, range.to)) return false
      if (!query.trim()) return true
      const text = [
        issue.issue_no,
        issue.title,
        issue.issue_type,
        issue.legacy_status,
        issue.status,
        issue.request_source,
        issue.external_requester,
        issue.requester_name,
        issue.internal_owner_name,
        projectLabel(projectMap, issue.project_id),
      ].join(' ').toLowerCase()
      return text.includes(query.trim().toLowerCase())
    })

    const selectedIssueIds = new Set(selectedIssues.map((issue) => issue.id))
    const selectedWorkLogs = workLogs.filter((log) => {
      if (selectedProjectId !== 'all' && log.project_id !== selectedProjectId) return false
      if (!selectedIssueIds.has(log.issue_id)) return false
      return dateInRange(log.work_date, range.from, range.to)
    })

    const workLogsByIssue = new Map<string, number>()
    selectedWorkLogs.forEach((log) => {
      workLogsByIssue.set(log.issue_id, (workLogsByIssue.get(log.issue_id) || 0) + log.hours)
    })

    const projectRanks = new Map<string, RankRow>()
    const projectIssueRanks = new Map<string, RankRow>()
    const issueTypeRanks = new Map<string, RankRow>()
    const statusRanks = new Map<string, RankRow>()
    const internalRequesterRanks = new Map<string, RankRow>()
    const externalRequesterRanks = new Map<string, RankRow>()
    const requestSourceRanks = new Map<string, RankRow>()
    const workerRanks = new Map<string, RankRow>()
    const trendMap = new Map<string, { key: string; issues: number; completed: number; effort: number }>()

    selectedIssues.forEach((issue) => {
      const effort = workLogsByIssue.get(issue.id) || 0
      const projectName = projectLabel(projectMap, issue.project_id)
      const type = issue.issue_type || issue.legacy_status || '미지정'
      const internalUser = issue.created_by ? userMap.get(issue.created_by) : undefined
      const internalLabel = internalUser?.name || issue.internal_owner_name || issue.requester_name || '미지정'
      const externalLabel = issue.external_requester || '미지정'
      const sourceLabel = issue.request_source || '미지정'
      const issueKey = getPeriodKey(issue.created_at || issue.received_at || '', trendUnit)

      upsertRank(projectRanks, issue.project_id, projectName, 0, effort)
      upsertRank(projectIssueRanks, issue.project_id, projectName, 1, 0)
      upsertRank(issueTypeRanks, type, type, 1, effort)
      upsertRank(statusRanks, issue.status, issue.status, 1, effort)
      upsertRank(internalRequesterRanks, issue.created_by || internalLabel, internalLabel, 1, effort)
      upsertRank(externalRequesterRanks, externalLabel, externalLabel, 1, effort)
      upsertRank(requestSourceRanks, sourceLabel, sourceLabel, 1, effort)

      if (issueKey) {
        const current = trendMap.get(issueKey) || { key: issueKey, issues: 0, completed: 0, effort: 0 }
        current.issues += 1
        if (issue.status === '완료') current.completed += 1
        trendMap.set(issueKey, current)
      }
    })

    selectedWorkLogs.forEach((log) => {
      const workerLabel = log.worker_name || (log.worker_user_id ? userMap.get(log.worker_user_id)?.name : undefined) || '미지정'
      upsertRank(workerRanks, log.worker_user_id || workerLabel, workerLabel, 1, log.hours)

      const workKey = getPeriodKey(log.work_date, trendUnit)
      const current = trendMap.get(workKey) || { key: workKey, issues: 0, completed: 0, effort: 0 }
      current.effort += log.hours
      trendMap.set(workKey, current)
    })

    const totalEffort = selectedWorkLogs.reduce((sum, log) => sum + log.hours, 0)
    const doneCount = selectedIssues.filter((issue) => issue.status === '완료').length
    const activeCount = selectedIssues.length - doneCount

    const projectRows = Array.from(projectMap.values())
      .filter((project) => selectedProjectId === 'all' || project.id === selectedProjectId)
      .map((project) => {
        const projectIssues = selectedIssues.filter((issue) => issue.project_id === project.id)
        const projectWorkLogs = selectedWorkLogs.filter((log) => log.project_id === project.id)
        const typeCounts = new Map<string, number>()
        projectIssues.forEach((issue) => {
          const type = issue.issue_type || issue.legacy_status || '미지정'
          typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
        })
        const mainType = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0]
        return {
          project,
          issueCount: projectIssues.length,
          doneCount: projectIssues.filter((issue) => issue.status === '완료').length,
          effort: projectWorkLogs.reduce((sum, log) => sum + log.hours, 0),
          mainType: mainType ? `${mainType[0]} ${mainType[1]}건` : '-',
          periodProgress: getProjectPeriodProgress(project),
        }
      })
      .filter((row) => row.issueCount > 0 || row.effort > 0 || selectedProjectId !== 'all')
      .sort((a, b) => b.effort - a.effort || b.issueCount - a.issueCount)

    return {
      totalIssues: selectedIssues.length,
      activeCount,
      doneCount,
      totalEffort,
      avgEffort: selectedIssues.length > 0 ? totalEffort / selectedIssues.length : 0,
      projectRows,
      projectEffortRows: sortRank(projectRanks, 'effort'),
      projectIssueRows: sortRank(projectIssueRanks),
      issueTypeRows: sortRank(issueTypeRanks),
      statusRows: sortRank(statusRanks),
      workerRows: sortRank(workerRanks, 'effort'),
      internalRequesterRows: sortRank(internalRequesterRanks),
      externalRequesterRows: sortRank(externalRequesterRanks),
      requestSourceRows: sortRank(requestSourceRanks),
      trendRows: Array.from(trendMap.values()).sort((a, b) => a.key.localeCompare(b.key)),
    }
  }, [issues, projectMap, query, range.from, range.to, selectedProjectId, trendUnit, userMap, workLogs])

  const maxTrendIssues = Math.max(...stats.trendRows.map((row) => row.issues), 1)
  const maxTrendEffort = Math.max(...stats.trendRows.map((row) => row.effort), 1)

  return (
    <main className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#ffffff_0%,#fbfaf7_100%)] text-[#181d26]">
      <header className="border-b border-[#dddddd] bg-white/95 px-4 py-2 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => navigate('/issues')}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-[#41454d] hover:bg-[#f5f2ea]"
          >
            <ArrowLeft className="h-4 w-4" />
            이슈 목록
          </button>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
            <h1 className="flex items-center gap-2 text-xl font-medium tracking-[-0.02em] text-[#181d26]">
              <BarChart3 className="h-5 w-5 text-[#727780]" />
              이슈 통계
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatPill label="전체" value={`${formatNumber(stats.totalIssues)}건`} />
              <StatPill label="진행" value={`${formatNumber(stats.activeCount)}건`} />
              <StatPill label="완료" value={`${formatNumber(stats.doneCount)}건`} />
              <StatPill label="누적" value={`${formatNumber(stats.totalEffort, 2)} D`} />
              <StatPill label="평균" value={`${formatNumber(stats.avgEffort, 2)} D`} />
            </div>
          </div>
          <Button size="sm" onClick={() => navigate('/issues')}>
            <ClipboardList className="h-4 w-4" />
            이슈로 이동
          </Button>
        </div>
      </header>

      <section className="border-b border-[#dddddd] bg-[#fbfaf7] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedProjectId}
            onChange={(event) => setSearchParams(event.target.value === 'all' ? {} : { project: event.target.value })}
            className="h-9 min-w-[280px] rounded-md border border-[#dddddd] bg-white px-3 text-sm font-semibold text-[#181d26] outline-none focus:border-[#9297a0] focus:ring-2 focus:ring-[#f5e9d4]"
          >
            <option value="all">전체 프로젝트</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <select
            value={rangeMode}
            onChange={(event) => setRangeMode(event.target.value as RangeMode)}
            className="h-9 rounded-md border border-[#dddddd] bg-white px-3 text-sm outline-none focus:border-[#9297a0] focus:ring-2 focus:ring-[#f5e9d4]"
          >
            <option value="month">최근 30일</option>
            <option value="quarter">최근 90일</option>
            <option value="year">최근 1년</option>
            <option value="all">전체 기간</option>
            <option value="custom">직접 지정</option>
          </select>
          {rangeMode === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="h-9 rounded-md border border-[#dddddd] bg-white px-3 text-sm outline-none focus:border-[#9297a0] focus:ring-2 focus:ring-[#f5e9d4]" />
              <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="h-9 rounded-md border border-[#dddddd] bg-white px-3 text-sm outline-none focus:border-[#9297a0] focus:ring-2 focus:ring-[#f5e9d4]" />
            </>
          )}
          <select
            value={trendUnit}
            onChange={(event) => setTrendUnit(event.target.value as TrendUnit)}
            className="h-9 rounded-md border border-[#dddddd] bg-white px-3 text-sm outline-none focus:border-[#9297a0] focus:ring-2 focus:ring-[#f5e9d4]"
          >
            <option value="day">일별</option>
            <option value="week">주별</option>
            <option value="month">월별</option>
          </select>
          <div className="relative min-w-[280px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#727780]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="프로젝트, 이슈번호, 구분, 요청자, 요청처 검색"
              className="h-9 w-full rounded-md border border-[#dddddd] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#9297a0] focus:ring-2 focus:ring-[#f5e9d4]"
            />
          </div>
        </div>
      </section>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="rounded-xl border border-[#dddddd] bg-white px-4 py-16 text-center text-sm text-[#727780]">통계를 불러오는 중...</div>
        ) : (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-xl border border-[#dddddd] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <div className="flex items-center gap-2 border-b border-[#dddddd] bg-[#eef4fb] px-4 py-3 text-sm font-semibold text-[#181d26]">
                <CalendarDays className="h-4 w-4 text-[#727780]" />
                프로젝트 정보와 공수
              </div>
              <div className="overflow-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-white text-xs text-[#727780]">
                    <tr className="border-b border-[#dddddd]">
                      <th className="px-3 py-2 text-left font-semibold">프로젝트</th>
                      <th className="px-3 py-2 text-left font-semibold">기간</th>
                      <th className="px-3 py-2 text-left font-semibold">기준일</th>
                      <th className="px-3 py-2 text-right font-semibold">기간 진행률</th>
                      <th className="px-3 py-2 text-right font-semibold">이슈 완료율</th>
                      <th className="px-3 py-2 text-right font-semibold">이슈</th>
                      <th className="px-3 py-2 text-right font-semibold">공수</th>
                      <th className="px-3 py-2 text-left font-semibold">주요 구분</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ece7de]">
                    {stats.projectRows.length === 0 ? (
                      <tr><td colSpan={8} className="px-3 py-10 text-center text-[#727780]">표시할 프로젝트 통계가 없습니다.</td></tr>
                    ) : stats.projectRows.map((row) => {
                      const issueDoneRate = row.issueCount > 0 ? (row.doneCount / row.issueCount) * 100 : 0
                      return (
                        <tr key={row.project.id} className="hover:bg-[#fbfaf7]">
                          <td className="px-3 py-2">
                            <div className="font-semibold text-[#181d26]">{row.project.name}</div>
                            {row.project.category && <div className="text-xs text-[#727780]">{row.project.category}</div>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-[#41454d]">{formatDate(row.project.start_date)} - {formatDate(row.project.end_date)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-[#41454d]">{formatDate(row.project.status_date)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.periodProgress, 1)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatNumber(issueDoneRate, 1)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.issueCount)}건</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(row.effort, 2)} D</td>
                          <td className="px-3 py-2 text-[#41454d]">{row.mainType}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
              <RankList title="공수 많이 쓴 프로젝트" rows={stats.projectEffortRows} value="effort" />
              <RankList title="이슈가 많은 프로젝트" rows={stats.projectIssueRows} />
              <RankList title="처리를 많이 한 사람" rows={stats.workerRows} value="effort" />
              <RankList title="내부 등록자별 요구" rows={stats.internalRequesterRows} />
              <RankList title="외부 요청자별 요구" rows={stats.externalRequesterRows} />
              <RankList title="요청처별 요구" rows={stats.requestSourceRows} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <section className="overflow-hidden rounded-xl border border-[#dddddd] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="border-b border-[#dddddd] bg-[#eef4fb] px-4 py-3 text-sm font-semibold text-[#181d26]">구분 / 상태 분포</div>
                <div className="grid gap-0 divide-y divide-[#ece7de] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                  <div className="p-3">
                    <div className="mb-2 text-xs font-semibold text-[#727780]">구분</div>
                    <div className="space-y-2">
                      {stats.issueTypeRows.slice(0, 8).map((row) => (
                        <div key={row.key} className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate text-[#41454d]">{row.label}</span>
                          <span className="font-semibold tabular-nums text-[#181d26]">{formatNumber(row.count)}건 · {formatNumber(row.effort, 2)}D</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="mb-2 text-xs font-semibold text-[#727780]">상태</div>
                    <div className="flex flex-wrap gap-2">
                      {ISSUE_STATUSES.map((status) => {
                        const row = stats.statusRows.find((item) => item.key === status)
                        return (
                          <span key={status} className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', statusClasses[status])}>
                            {status} {row?.count || 0}건
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-[#dddddd] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="border-b border-[#dddddd] bg-[#eef4fb] px-4 py-3 text-sm font-semibold text-[#181d26]">요구 / 공수 추이</div>
                <div className="space-y-2 p-3">
                  {stats.trendRows.length === 0 ? (
                    <div className="py-10 text-center text-sm text-[#727780]">표시할 추이 데이터가 없습니다.</div>
                  ) : stats.trendRows.slice(-18).map((row) => (
                    <div key={row.key} className="grid grid-cols-[92px_minmax(0,1fr)_92px] items-center gap-3 text-sm">
                      <span className="font-medium text-[#41454d]">{row.key}</span>
                      <div className="grid gap-1">
                        <div className="h-2 overflow-hidden rounded-full bg-[#f1ede5]">
                          <div className="h-full rounded-full bg-[#527fbf]" style={{ width: `${Math.max(2, (row.issues / maxTrendIssues) * 100)}%` }} />
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#f1ede5]">
                          <div className="h-full rounded-full bg-[#181d26]" style={{ width: `${Math.max(2, (row.effort / maxTrendEffort) * 100)}%` }} />
                        </div>
                      </div>
                      <span className="text-right text-xs tabular-nums text-[#41454d]">{row.issues}건 · {formatNumber(row.effort, 1)}D</span>
                    </div>
                  ))}
                  <div className="flex gap-4 pt-2 text-xs text-[#727780]">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-[#527fbf]" />요구 건수</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-[#181d26]" />공수</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
