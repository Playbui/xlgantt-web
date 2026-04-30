import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileLock2,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import {
  canManageWeeklyReports,
  getWeeklyReportMembers,
  WEEKLY_REPORT_TEAM_KEY,
  WEEKLY_REPORT_TEAM_NAME,
} from '@/lib/weekly-report-access'
import { useAuthStore } from '@/stores/auth-store'

type WeeklyStatus = '입력중' | '취합중' | '완료'

interface StrategyMeetingRow {
  org: string
  category: string
  content: string
  startDate: string
  targetDate: string
  endDate: string
  action: string
  status: string
}

interface IssueRow {
  category: string
  issue: string
  action: string
  memberUpdates?: Array<{
    email: string
    name: string
    issue: string
    action: string
    updatedAt?: string
    updatedByName?: string
  }>
}

interface MemberWorkUpdate {
  email: string
  name: string
  content: string
  note: string
  updatedAt?: string
  updatedByName?: string
}

interface WorkReportRow {
  projectName: string
  category: string
  period: string
  pm: string
  pl: string
  targetRate: string
  actualRate: string
  detail: string
  note: string
  memberUpdates?: MemberWorkUpdate[]
}

interface PlannedWorkRow {
  projectName: string
  category: string
  bidType: string
  budget: string
  pm: string
  probability: string
  detail: string
  note: string
  memberUpdates?: MemberWorkUpdate[]
}

interface MemberEntry {
  email: string
  name: string
  role: 'manager' | 'member'
  thisWeek: string
  nextWeek: string
  done: boolean
  updatedAt?: string
  updatedByName?: string
}

interface MajorWorkItem {
  label: string
  thisWeek: string
  nextWeek: string
  memberUpdates?: Array<{
    email: string
    name: string
    thisWeek: string
    nextWeek: string
    updatedAt?: string
    updatedByName?: string
  }>
}

interface WeeklyReportPayload {
  strategyMeetings: StrategyMeetingRow[]
  issues: IssueRow[]
  carryOver: WorkReportRow[]
  inProgress: WorkReportRow[]
  planned: PlannedWorkRow[]
  tbd: PlannedWorkRow[]
  majorWorkItems: MajorWorkItem[]
  memberEntries: MemberEntry[]
  leaderMemo: string
}

interface WeeklyReportRecord {
  id: string
  title: string
  status: WeeklyStatus
  payload: WeeklyReportPayload
  updated_at: string
  finalized_at?: string | null
}

const WEEK_OPTIONS = buildWeekOptions()
const STRATEGY_STATUS_OPTIONS = ['대기', '진행중', '완료']
const TEAM_MEMBERS = getWeeklyReportMembers().filter((member) => member.email !== 'admin@gmtc.kr')
const TEAM_INPUT_MEMBERS = TEAM_MEMBERS.filter((member) => member.role !== 'manager')

const INITIAL_STRATEGY_ROWS: StrategyMeetingRow[] = [
  {
    org: '항해통신사업부',
    category: '전략회의',
    content: '',
    startDate: '',
    targetDate: '',
    endDate: '',
    action: '',
    status: '대기',
  },
]

const INITIAL_ISSUE_ROWS: IssueRow[] = [
  {
    category: '[해경] Deep Blue Eye 실증 - ICD 협의',
    issue: '- 항공단 ICD 협의 및 신호확인 위한 현장실사 필요\n- 카메라 물리적 연동관련 분석 필요',
    action: '- ICD문서(보안) 취합하여 분석 중 (w.LIG)\n- 항공단 협조하에 비행 동승 예정. (업무프로세스 및 실동작환경 확인)',
    memberUpdates: [],
  },
]

const INITIAL_CARRY_OVER_ROWS: WorkReportRow[] = [
  {
    projectName: '[수협] 조업정보알리미 앱 유지보수',
    category: '수행',
    period: '24.09.24 ~ 26.09.23',
    pm: '이준혁(전)',
    pl: '',
    targetRate: '81%',
    actualRate: '81%',
    detail: '- DB서버 정보보호본부 업무 대응.\n- 통합관리콘솔 잦은 오류 발송분 원인 파악 및 대응방안 차주 보고(수협)\n- 9월 이후 유지보수 계약 방향 논의 중',
    note: '',
    memberUpdates: [],
  },
]

const INITIAL_IN_PROGRESS_ROWS: WorkReportRow[] = [
  {
    projectName: '[수협] 26년 어선안전조업관리(FIS)시스템 유지보수 [4064]',
    category: '유지보수',
    period: '26.02.24 ~ 26.12.31',
    pm: '이준혁(전)',
    pl: 'DXL',
    targetRate: '19%',
    actualRate: '19%',
    detail: '- 위치미수신 분석프로그램 업데이트 후 기능오류로 롤백. 차주 재포팅\n- DB, 스토리지 통합을 위한 DB구조 및 크기 파악대응',
    note: '',
    memberUpdates: [],
  },
  {
    projectName: '[수협] 26년 해상디지털 통신망(D-MF/HF) 운영시스템 유지보수 [4010]',
    category: '유지보수',
    period: '26.01.01 ~ 26.12.31',
    pm: '김주영(전)',
    pl: 'DXL',
    targetRate: '31%',
    actualRate: '31%',
    detail: '- 울릉도동 D-MF/HF 중계소 이전 옥외 함체 2.2M 견적중\n- 1분기 대금청구 진행',
    note: '',
    memberUpdates: [],
  },
  {
    projectName: '[해경] 항공 채증영상 기반 분석 AI Deep Blue Eye 실증',
    category: '용역',
    period: '4월 13일 협약 진행 예정',
    pm: '한규혁(수) / 신진우(선)',
    pl: '',
    targetRate: '4%',
    actualRate: '2%',
    detail: '- WBS 작성, 요구사항정의서 수정, 추정손익 작성 중\n- 협약 변경 (투입인력/사업비 변경, 증빙서류 작성)\n- 기구 제작 업체 컨택 및 견적 요청\n- 전시회 홍보영상 제작 (스토리보드 초안, 업체 컨택)',
    note: '',
    memberUpdates: [],
  },
]

const INITIAL_PLANNED_ROWS: PlannedWorkRow[] = [
  {
    projectName: '[육군] 26년 해안경계통합시스템 유지보수',
    category: '유지보수',
    bidType: '수의 계약',
    budget: '0.54억',
    pm: '신진우(선)',
    probability: '',
    detail: '- 계약 수의시담완료, 계약품의 진행. 차주 내 계약 진행 예정',
    note: '',
    memberUpdates: [],
  },
  {
    projectName: '[해양수산부] 2026년 어선사고징후 모니터링 시스템 (FIS고도화)',
    category: '용역사업(HW)',
    bidType: '조달평가',
    budget: '14.5억',
    pm: '황준호(수)',
    probability: '',
    detail: '- RFP초안 분석 중\n- S/W구매를 제외한 H/W구매 수행 예산으로 7.8억 공고예정\n- 오션인포 주관업무진행 타당성 파악 중',
    note: '',
    memberUpdates: [],
  },
]

const INITIAL_TBD_ROWS: PlannedWorkRow[] = [
  {
    projectName: '[육군] 육군 5군단 원격사격통제 체계',
    category: '제품',
    bidType: '수의 계약',
    budget: '2억',
    pm: '',
    probability: '',
    detail: '- 5군단 차주 방문 진행\n- 사업 의뢰 담당자 병원 입원으로 인한 사업 추진 일정 재협의 (차주)',
    note: '',
    memberUpdates: [],
  },
]

const INITIAL_MAJOR_WORK_ITEMS: MajorWorkItem[] = [
  {
    label: '[항해통신사업부]',
    thisWeek: '',
    nextWeek: '',
    memberUpdates: [],
  },
  {
    label: '[해양경찰청]',
    thisWeek: '',
    nextWeek: '',
    memberUpdates: [],
  },
  {
    label: '[수협중앙회]',
    thisWeek: '',
    nextWeek: '',
    memberUpdates: [],
  },
  {
    label: '[해양수산부]',
    thisWeek: '',
    nextWeek: '',
    memberUpdates: [],
  },
]

export function WeeklyReportsPage() {
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.currentUser)
  const canManage = canManageWeeklyReports(currentUser)
  const [selectedWeek, setSelectedWeek] = useState(WEEK_OPTIONS[0]?.value ?? '')
  const [report, setReport] = useState<WeeklyReportRecord | null>(null)
  const [payload, setPayload] = useState<WeeklyReportPayload>(() => buildDefaultPayload())
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [managerTab, setManagerTab] = useState<'setup' | 'collect' | 'summary'>('setup')

  const currentMemberEntry = useMemo(() => {
    const email = normalizeEmail(currentUser?.email)
    return payload.memberEntries.find((entry) => normalizeEmail(entry.email) === email) ?? null
  }, [currentUser?.email, payload.memberEntries])

  const completedMembers = useMemo(
    () => payload.memberEntries.filter((member) => member.done),
    [payload.memberEntries]
  )
  const pendingMembers = useMemo(
    () => payload.memberEntries.filter((member) => !member.done),
    [payload.memberEntries]
  )
  const weeklyStatus: WeeklyStatus = report?.status ?? deriveWeeklyStatus(payload.memberEntries)
  const completionRate = payload.memberEntries.length > 0
    ? Math.round((completedMembers.length / payload.memberEntries.length) * 100)
    : 0

  const loadReport = useCallback(async () => {
    const { year, month, week } = parseWeekValue(selectedWeek)
    setIsLoading(true)
    setErrorMessage(null)
    setNotice(null)

    const query = supabase
      .from('weekly_reports')
      .select('id, title, status, payload, updated_at, finalized_at')
      .eq('team_key', WEEKLY_REPORT_TEAM_KEY)
      .eq('report_year', year)
      .eq('report_month', month)
      .eq('report_week', week)
      .maybeSingle()

    const { data, error } = await query

    if (error) {
      setErrorMessage(`주간보고 로드 실패: ${error.message}`)
      setPayload(buildDefaultPayload())
      setReport(null)
      setIsDirty(false)
      setIsLoading(false)
      return
    }

    if (!data) {
      if (canManage && currentUser) {
        let nextPayload = buildDefaultPayload()
        let createdNotice = '이번 주 보고서 틀을 생성했어요. 이제 바로 입력하면 됩니다.'
        const previousWeekValue = getPreviousWeekValue(selectedWeek)

        if (previousWeekValue) {
          const prev = parseWeekValue(previousWeekValue)
          const { data: previousData } = await supabase
            .from('weekly_reports')
            .select('payload')
            .eq('team_key', WEEKLY_REPORT_TEAM_KEY)
            .eq('report_year', prev.year)
            .eq('report_month', prev.month)
            .eq('report_week', prev.week)
            .maybeSingle()

          if (previousData?.payload) {
            nextPayload = clonePayloadForNewWeek(normalizePayload(previousData.payload))
            createdNotice = '지난 주차 내용을 기준으로 이번 주 보고서 틀을 만들었어요. 필요한 사업만 추가/정리하면 됩니다.'
          }
        }

        const created = await upsertWeeklyReport({
          year,
          month,
          week,
          payload: nextPayload,
          status: '입력중',
          currentUserId: currentUser.id,
          currentUserName: currentUser.name || currentUser.email,
          existingId: null,
          preserveFinalized: false,
        })

        if (created.error) {
          setErrorMessage(`이번 주 보고서 생성 실패: ${created.error}`)
          setPayload(buildDefaultPayload())
          setReport(null)
          setIsDirty(false)
          setIsLoading(false)
          return
        }

        setPayload(created.record.payload)
        setReport(created.record)
        setNotice(createdNotice)
      } else {
        setPayload(buildDefaultPayload())
        setReport(null)
        setErrorMessage('이번 주차 보고서가 아직 생성되지 않았습니다. 팀장이 먼저 틀을 열어줘야 입력할 수 있어요.')
      }

      setIsDirty(false)
      setIsLoading(false)
      return
    }

    const normalizedPayload = normalizePayload(data.payload)
    setPayload(normalizedPayload)
    setReport({
      id: data.id as string,
      title: (data.title as string) || getWeekTitle(selectedWeek),
      status: ((data.status as WeeklyStatus) || deriveWeeklyStatus(normalizedPayload.memberEntries)),
      payload: normalizedPayload,
      updated_at: (data.updated_at as string) || new Date().toISOString(),
      finalized_at: (data.finalized_at as string | null) ?? null,
    })
    setIsDirty(false)
    setIsLoading(false)
  }, [canManage, currentUser, selectedWeek])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  const updatePayload = useCallback((updater: (prev: WeeklyReportPayload) => WeeklyReportPayload) => {
    setPayload((prev) => updater(prev))
    setIsDirty(true)
    setNotice(null)
  }, [])

  const touchCurrentMember = useCallback((prev: WeeklyReportPayload) => {
    if (canManage || !currentUser) return prev
    return {
      ...prev,
      memberEntries: prev.memberEntries.map((entry) =>
        normalizeEmail(entry.email) === normalizeEmail(currentUser.email)
          ? {
              ...entry,
              updatedAt: new Date().toISOString(),
              updatedByName: currentUser.name || currentUser.email,
            }
          : entry
      ),
    }
  }, [canManage, currentUser])

  const updateCurrentMemberWork = useCallback((
    updates: MemberWorkUpdate[] | undefined,
    key: 'content' | 'note',
    value: string,
  ) => {
    const base = normalizeMemberWorkUpdates(updates)
    if (!currentUser) return base
    return base.map((entry) =>
      normalizeEmail(entry.email) === normalizeEmail(currentUser.email)
        ? {
            ...entry,
            [key]: value,
            updatedAt: new Date().toISOString(),
            updatedByName: currentUser.name || currentUser.email,
          }
        : entry
    )
  }, [currentUser])

  const updateCurrentMemberMajor = useCallback((
    updates: MajorWorkItem['memberUpdates'],
    key: 'thisWeek' | 'nextWeek',
    value: string,
  ) => {
    const base = normalizeMemberMajorUpdates(updates)
    if (!currentUser) return base
    return base.map((entry) =>
      normalizeEmail(entry.email) === normalizeEmail(currentUser.email)
        ? {
            ...entry,
            [key]: value,
            updatedAt: new Date().toISOString(),
            updatedByName: currentUser.name || currentUser.email,
          }
        : entry
    )
  }, [currentUser])

  const updateCurrentMemberIssue = useCallback((
    updates: IssueRow['memberUpdates'],
    key: 'issue' | 'action',
    value: string,
  ) => {
    const base = normalizeMemberIssueUpdates(updates)
    if (!currentUser) return base
    return base.map((entry) =>
      normalizeEmail(entry.email) === normalizeEmail(currentUser.email)
        ? {
            ...entry,
            [key]: value,
            updatedAt: new Date().toISOString(),
            updatedByName: currentUser.name || currentUser.email,
          }
        : entry
    )
  }, [currentUser])

  const saveReport = useCallback(async (options?: { finalize?: boolean; completeMyInput?: boolean }) => {
    if (!currentUser) return
    if (!report && !canManage) {
      window.alert('이번 주 보고서가 아직 생성되지 않았습니다. 팀장에게 먼저 틀 생성을 요청해주세요.')
      return
    }

    setIsSaving(true)
    setErrorMessage(null)
    setNotice(null)

    let nextPayload = payload
    if (options?.completeMyInput && currentMemberEntry) {
      nextPayload = {
        ...payload,
        memberEntries: payload.memberEntries.map((entry) =>
          normalizeEmail(entry.email) === normalizeEmail(currentMemberEntry.email)
            ? {
                ...entry,
                done: !entry.done,
                updatedAt: new Date().toISOString(),
                updatedByName: currentUser.name || currentUser.email,
              }
            : entry
        ),
      }
      setPayload(nextPayload)
    }

    const { year, month, week } = parseWeekValue(selectedWeek)
    const preserveFinalized = Boolean(report?.finalized_at) && !options?.finalize

    const result = await upsertWeeklyReport({
      year,
      month,
      week,
      payload: nextPayload,
      status: options?.finalize ? '완료' : deriveWeeklyStatus(nextPayload.memberEntries, report?.status),
      currentUserId: currentUser.id,
      currentUserName: currentUser.name || currentUser.email,
      existingId: report?.id ?? null,
      preserveFinalized,
      finalizeNow: options?.finalize ?? false,
    })

    setIsSaving(false)

    if (result.error) {
      setErrorMessage(`저장 실패: ${result.error}`)
      return
    }

    setReport(result.record)
    setPayload(result.record.payload)
    setIsDirty(false)
    setNotice(
      options?.finalize
        ? '최종 저장이 완료됐어요. 이제 이 주차는 제출본 기준으로 볼 수 있습니다.'
        : options?.completeMyInput
          ? currentMemberEntry?.done
            ? '내 입력 완료를 해제했어요.'
            : '내 입력 완료로 표시했어요.'
          : '변경 내용을 저장했어요.'
    )
  }, [canManage, currentMemberEntry, currentUser, payload, report, selectedWeek])

  const addStrategyRow = () => updatePayload((prev) => ({
    ...prev,
    strategyMeetings: [...prev.strategyMeetings, { org: '', category: '', content: '', startDate: '', targetDate: '', endDate: '', action: '', status: '대기' }],
  }))

  const addIssueRow = () => updatePayload((prev) => ({
    ...prev,
    issues: [...prev.issues, { category: '', issue: '', action: '', memberUpdates: buildMemberIssueUpdates() }],
  }))

  const addWorkRow = (section: 'carryOver' | 'inProgress') => updatePayload((prev) => ({
    ...prev,
    [section]: [
      ...prev[section],
      { projectName: '', category: '', period: '', pm: '', pl: '', targetRate: '', actualRate: '', detail: '', note: '', memberUpdates: buildMemberWorkUpdates() },
    ],
  }))

  const addPlannedRow = (section: 'planned' | 'tbd') => updatePayload((prev) => ({
    ...prev,
    [section]: [
      ...prev[section],
      { projectName: '', category: '', bidType: '', budget: '', pm: '', probability: '', detail: '', note: '', memberUpdates: buildMemberWorkUpdates() },
    ],
  }))

  const addMajorWorkItem = () => updatePayload((prev) => ({
    ...prev,
    majorWorkItems: [
      ...prev.majorWorkItems,
      { label: '', thisWeek: '', nextWeek: '', memberUpdates: buildMemberMajorUpdates() },
    ],
  }))

  return (
    <div className="std-page">
      <header className="std-page-header">
        <div className="std-page-header-inner max-w-[1760px]">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => navigate('/projects')}>
              <ArrowLeft className="h-3.5 w-3.5" />
              프로젝트 목록
            </Button>
            <div className="hidden items-center gap-2 rounded-full border border-[#d7dde4] bg-[#f8fafc] px-3 py-1 text-[11px] text-[#425466] md:flex">
              <FileLock2 className="h-3 w-3" />
              {WEEKLY_REPORT_TEAM_NAME} 전용
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#425466]">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{canManage ? '팀장 편집 권한' : '팀원 입력 권한'}</span>
          </div>
        </div>
      </header>

      <main className="std-page-main max-w-[1920px] space-y-6">
        <section className="overflow-hidden rounded-[22px] border border-[#d7dde4] bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <div className="border-b border-[#e4e7ec] bg-[linear-gradient(180deg,#fffdfb_0%,#f8fafc_100%)] px-5 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="h-6 rounded-full border-[#d7dde4] bg-white px-2.5 text-[11px] text-[#344054]">
                    <Users className="h-3 w-3" />
                    {WEEKLY_REPORT_TEAM_NAME}
                  </Badge>
                  <StatusBadge status={weeklyStatus} />
                </div>
                <div>
                  <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-[#101828]">주간업무보고</h1>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-[#667085]">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4" />
                    <span>{getWeekTitle(selectedWeek)}</span>
                  </div>
                  {report?.updated_at && (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      <span>최근 저장 {formatDateTime(report.updated_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {canManage && (
                <div className="grid gap-3 md:grid-cols-3">
                  <MetricCard label="입력 완료" value={`${completedMembers.length}명`} accent="green" />
                  <MetricCard label="미완료" value={`${pendingMembers.length}명`} accent="red" />
                  <MetricCard label="최근 저장" value={report?.updated_at ? formatDateTime(report.updated_at) : '-'} accent="blue" />
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 border-t border-[#eef2f6] bg-[#fcfcfd] px-5 py-4 xl:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-[#d7dde4] bg-white px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <label className="flex items-center gap-2 text-sm font-medium text-[#344054]">
                    <CalendarDays className="h-4 w-4 text-[#667085]" />
                    주차 선택
                  </label>
                  <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                    <SelectTrigger className="h-10 min-w-[260px] rounded-xl border-[#d0d5dd] bg-white text-sm shadow-none">
                      <SelectValue placeholder="주차 선택">
                        {WEEK_OPTIONS.find((option) => option.value === selectedWeek)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="min-w-[280px] rounded-xl border border-[#d7dde4] bg-white">
                      {WEEK_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {canManage && <div className="text-xs text-[#667085]">새 주차는 지난 주차 기준으로 이어서 관리합니다.</div>}
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-[#667085]">
                  <span>입력 진행률</span>
                  <span className="tabular-nums">{completionRate}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#e4e7ec]">
                  <div className="h-full rounded-full bg-[#1d4f91]" style={{ width: `${completionRate}%` }} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d7dde4] bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => void saveReport()} disabled={isLoading || isSaving || (!canManage && !report)}>
                  {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  저장
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => void saveReport({ completeMyInput: true })}
                  disabled={isLoading || isSaving || !currentMemberEntry || !report}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  {currentMemberEntry?.done ? '내 완료 해제' : '내 입력 완료'}
                </Button>
                <Button
                  size="sm"
                  className="h-9 text-xs"
                  disabled={!canManage || isLoading || isSaving}
                  onClick={() => void saveReport({ finalize: true })}
                >
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  최종 저장
                </Button>
                <Button variant="outline" size="sm" className="h-9 text-xs" disabled>
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                  엑셀 출력
                </Button>
              </div>
              <Separator className="my-3 bg-[#edf0f4]" />
              <div className="text-xs leading-6 text-[#667085]">
                {isDirty ? '아직 저장되지 않은 변경이 있어요.' : '현재 화면은 저장된 최신 기준과 맞춰져 있어요.'}
              </div>
            </div>
          </div>
        </section>

        {errorMessage && (
          <div className="rounded-2xl border border-[#f0d8d3] bg-[#fff7f4] px-4 py-3 text-sm text-[#8f3b2e]">
            {errorMessage}
          </div>
        )}

        {notice && (
          <div className="rounded-2xl border border-[#dbe6f4] bg-[#f7faff] px-4 py-3 text-sm text-[#1d4f91]">
            {notice}
          </div>
        )}

        <section className="rounded-[22px] border border-[#d7dde4] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
          <SectionHeader
            title={report?.title ?? `${getWeekTitle(selectedWeek)} 주간보고`}
            description={canManage ? '' : '회색으로 보이는 칸은 팀장이 관리하는 영역입니다.'}
          />

          {isLoading ? (
            <div className="flex min-h-[320px] items-center justify-center p-10 text-sm text-[#667085]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              주간보고를 불러오는 중입니다...
            </div>
          ) : canManage ? (
            <Tabs value={managerTab} onValueChange={(value) => setManagerTab(value as 'setup' | 'collect' | 'summary')} className="p-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <TabsList className="h-10 rounded-xl bg-[#eef3f8] p-1">
                  <TabsTrigger value="setup" className="px-4 text-sm">사업등록</TabsTrigger>
                  <TabsTrigger value="collect" className="px-4 text-sm">취합상황</TabsTrigger>
                  <TabsTrigger value="summary" className="px-4 text-sm">취합목록</TabsTrigger>
                </TabsList>

                {managerTab !== 'setup' && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#667085]">
                    <span className="rounded-full border border-[#dbeadf] bg-[#f7fbf8] px-2.5 py-1 text-[#14532d]">완료 {completedMembers.length}명</span>
                    <span className="rounded-full border border-[#f0e2bb] bg-[#fffbf0] px-2.5 py-1 text-[#9a6700]">미완료 {pendingMembers.length}명</span>
                  </div>
                )}
              </div>

              <TabsContent value="setup" className="space-y-6">
                <EditableStrategySection
                  rows={payload.strategyMeetings}
                  editable
                  onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                    ...prev,
                    strategyMeetings: prev.strategyMeetings.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
                  }))}
                  onAdd={addStrategyRow}
                  onRemove={(rowIndex) => updatePayload((prev) => ({
                    ...prev,
                    strategyMeetings: prev.strategyMeetings.filter((_, index) => index !== rowIndex),
                  }))}
                />

                <EditableIssueSection
                  rows={payload.issues}
                  editable
                  onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                    ...prev,
                    issues: prev.issues.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
                  }))}
                  onAdd={addIssueRow}
                  onRemove={(rowIndex) => updatePayload((prev) => ({
                    ...prev,
                    issues: prev.issues.filter((_, index) => index !== rowIndex),
                  }))}
                />

                <div className="space-y-4">
                  <SectionLabel index="3." title="업무보고" />
                  <SetupWorkReportTable
                    title="이월 사업"
                    rows={payload.carryOver}
                    editable
                    onAdd={() => addWorkRow('carryOver')}
                    onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                      ...prev,
                      carryOver: prev.carryOver.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
                    }))}
                    onRemove={(rowIndex) => updatePayload((prev) => ({
                      ...prev,
                      carryOver: prev.carryOver.filter((_, index) => index !== rowIndex),
                    }))}
                  />
                  <SetupWorkReportTable
                    title="진행 사업"
                    rows={payload.inProgress}
                    editable
                    onAdd={() => addWorkRow('inProgress')}
                    onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                      ...prev,
                      inProgress: prev.inProgress.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
                    }))}
                    onRemove={(rowIndex) => updatePayload((prev) => ({
                      ...prev,
                      inProgress: prev.inProgress.filter((_, index) => index !== rowIndex),
                    }))}
                  />
                  <SetupPlannedWorkTable
                    title="예정 사업"
                    rows={payload.planned}
                    editable
                    onAdd={() => addPlannedRow('planned')}
                    onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                      ...prev,
                      planned: prev.planned.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
                    }))}
                    onRemove={(rowIndex) => updatePayload((prev) => ({
                      ...prev,
                      planned: prev.planned.filter((_, index) => index !== rowIndex),
                    }))}
                  />
                  <SetupPlannedWorkTable
                    title="미정 사업"
                    rows={payload.tbd}
                    editable
                    onAdd={() => addPlannedRow('tbd')}
                    onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                      ...prev,
                      tbd: prev.tbd.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
                    }))}
                    onRemove={(rowIndex) => updatePayload((prev) => ({
                      ...prev,
                      tbd: prev.tbd.filter((_, index) => index !== rowIndex),
                    }))}
                  />
                </div>

                <div className="space-y-4">
                  <SectionLabel index="4." title="기타 주요 업무 항목 등록" />
                  <EditableMajorWorkItems
                    rows={payload.majorWorkItems}
                    editable
                    onAdd={addMajorWorkItem}
                    onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                      ...prev,
                      majorWorkItems: prev.majorWorkItems.map((row, index) =>
                        index === rowIndex ? { ...row, [key]: value } : row
                      ),
                    }))}
                    onRemove={(rowIndex) => updatePayload((prev) => ({
                      ...prev,
                      majorWorkItems: prev.majorWorkItems.filter((_, index) => index !== rowIndex),
                    }))}
                  />
                </div>

                <SidebarCard title="참고사항" description="사업등록 단계에서 팀장 참고 메모를 남깁니다.">
                  <Textarea
                    value={payload.leaderMemo}
                    onChange={(event) => updatePayload((prev) => ({ ...prev, leaderMemo: event.target.value }))}
                    placeholder="예: 미완료 2명 오전까지 확인 / 표현 통일 필요"
                    className="min-h-[120px] rounded-2xl border-[#d0d5dd] bg-white"
                  />
                </SidebarCard>
              </TabsContent>

              <TabsContent value="collect" className="space-y-6">
                <div className="space-y-4">
                  <ManagerCompletionOverview
                    completedMembers={completedMembers}
                    pendingMembers={pendingMembers}
                  />
                </div>
              </TabsContent>

              <TabsContent value="summary" className="space-y-6">
                <div className="space-y-4">
                  <SectionLabel index="1." title="전략회의 최종본" />
                  <FinalStrategySection
                    rows={payload.strategyMeetings}
                    onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                      ...prev,
                      strategyMeetings: prev.strategyMeetings.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
                    }))}
                  />
                </div>

                <div className="space-y-4">
                  <SectionLabel index="2." title="이슈보고 최종 취합본" />
                  <FinalIssueTable
                    rows={payload.issues}
                    onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                      ...prev,
                      issues: prev.issues.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
                    }))}
                  />
                </div>

                <div className="space-y-4">
                  <SectionLabel index="3." title="최종 취합본 작성" />
                  <FinalWorkReportTable
                    title="이월 사업"
                    rows={payload.carryOver}
                    onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                      ...prev,
                      carryOver: prev.carryOver.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
                    }))}
                  />
                  <FinalWorkReportTable
                    title="진행 사업"
                    rows={payload.inProgress}
                    onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                      ...prev,
                      inProgress: prev.inProgress.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
                    }))}
                  />
                  <FinalPlannedWorkTable
                    title="예정 사업"
                    rows={payload.planned}
                    onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                      ...prev,
                      planned: prev.planned.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
                    }))}
                  />
                  <FinalPlannedWorkTable
                    title="미정 사업"
                    rows={payload.tbd}
                    onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                      ...prev,
                      tbd: prev.tbd.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row),
                    }))}
                  />
                </div>

                <div className="space-y-4">
                  <SectionLabel index="4." title="기타 주요 업무 최종본" />
                  <FinalMajorWorkItems
                    rows={payload.majorWorkItems}
                    onChange={(rowIndex, key, value) => updatePayload((prev) => ({
                      ...prev,
                      majorWorkItems: prev.majorWorkItems.map((row, index) =>
                        index === rowIndex ? { ...row, [key]: value } : row
                      ),
                    }))}
                  />
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="space-y-6 p-5">
              <WeeklyReadOnlySummary currentMemberEntry={currentMemberEntry} />

              <div className="space-y-4">
                <SectionLabel index="2." title="이슈보고" />
                <MemberIssueInputTable
                  rows={payload.issues}
                  onChange={(rowIndex, key, value) => updatePayload((prev) => touchCurrentMember({
                    ...prev,
                    issues: prev.issues.map((row, index) => index === rowIndex
                      ? { ...row, memberUpdates: updateCurrentMemberIssue(row.memberUpdates, key, value) }
                      : row),
                  }))}
                />
              </div>

              <div className="space-y-4">
                <SectionLabel index="3." title="주간업무작성" />
                <MemberWorkInputTable
                  title="이월 사업"
                  rows={payload.carryOver}
                  onChange={(rowIndex, key, value) => updatePayload((prev) => touchCurrentMember({
                    ...prev,
                    carryOver: prev.carryOver.map((row, index) => index === rowIndex
                      ? { ...row, memberUpdates: updateCurrentMemberWork(row.memberUpdates, key, value) }
                      : row),
                  }))}
                />
                <MemberWorkInputTable
                  title="진행 사업"
                  rows={payload.inProgress}
                  onChange={(rowIndex, key, value) => updatePayload((prev) => touchCurrentMember({
                    ...prev,
                    inProgress: prev.inProgress.map((row, index) => index === rowIndex
                      ? { ...row, memberUpdates: updateCurrentMemberWork(row.memberUpdates, key, value) }
                      : row),
                  }))}
                />
                <MemberPlannedInputTable
                  title="예정 사업"
                  rows={payload.planned}
                  onChange={(rowIndex, key, value) => updatePayload((prev) => touchCurrentMember({
                    ...prev,
                    planned: prev.planned.map((row, index) => index === rowIndex
                      ? { ...row, memberUpdates: updateCurrentMemberWork(row.memberUpdates, key, value) }
                      : row),
                  }))}
                />
                <MemberPlannedInputTable
                  title="미정 사업"
                  rows={payload.tbd}
                  onChange={(rowIndex, key, value) => updatePayload((prev) => touchCurrentMember({
                    ...prev,
                    tbd: prev.tbd.map((row, index) => index === rowIndex
                      ? { ...row, memberUpdates: updateCurrentMemberWork(row.memberUpdates, key, value) }
                      : row),
                  }))}
                />
              </div>

              <div className="space-y-4">
                <SectionLabel index="4." title="기타 주요 업무" />
                <MemberMajorInputTable
                  rows={payload.majorWorkItems}
                  onChange={(rowIndex, key, value) => updatePayload((prev) => touchCurrentMember({
                    ...prev,
                    majorWorkItems: prev.majorWorkItems.map((row, index) =>
                      index === rowIndex ? { ...row, memberUpdates: updateCurrentMemberMajor(row.memberUpdates, key, value) } : row
                    ),
                  }))}
                />
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function buildWeekOptions() {
  const now = new Date()
  return Array.from({ length: 10 }, (_, index) => {
    const target = new Date(now)
    target.setDate(now.getDate() - index * 7)
    const { year, month, week } = getWeekOfMonth(target)
    return {
      value: `${year}-${String(month).padStart(2, '0')}-${week}`,
      label: `${year}년 ${month}월 ${week}주차`,
    }
  })
}

function getWeekOfMonth(date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const firstDay = new Date(year, date.getMonth(), 1)
  const offset = firstDay.getDay()
  const week = Math.ceil((date.getDate() + offset) / 7)
  return { year, month, week }
}

function parseWeekValue(value: string) {
  const [yearText, monthText, weekText] = value.split('-')
  return {
    year: Number(yearText),
    month: Number(monthText),
    week: Number(weekText),
  }
}

function getWeekTitle(value: string) {
  const target = WEEK_OPTIONS.find((option) => option.value === value)
  return target?.label || value
}

function getPreviousWeekValue(value: string) {
  const index = WEEK_OPTIONS.findIndex((option) => option.value === value)
  if (index < 0 || index >= WEEK_OPTIONS.length - 1) return null
  return WEEK_OPTIONS[index + 1]?.value ?? null
}

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function buildDefaultPayload(): WeeklyReportPayload {
  return {
    strategyMeetings: deepCopy(INITIAL_STRATEGY_ROWS),
    issues: deepCopy(INITIAL_ISSUE_ROWS),
    carryOver: deepCopy(INITIAL_CARRY_OVER_ROWS),
    inProgress: deepCopy(INITIAL_IN_PROGRESS_ROWS),
    planned: deepCopy(INITIAL_PLANNED_ROWS),
    tbd: deepCopy(INITIAL_TBD_ROWS),
    majorWorkItems: deepCopy(INITIAL_MAJOR_WORK_ITEMS),
    memberEntries: TEAM_MEMBERS.map((member) => ({
      email: member.email,
      name: member.name,
      role: member.role,
      thisWeek: '',
      nextWeek: '',
      done: false,
    })),
    leaderMemo: '',
  }
}

function clonePayloadForNewWeek(source: WeeklyReportPayload): WeeklyReportPayload {
  return {
    ...deepCopy(source),
    issues: source.issues.map((row) => ({
      ...row,
      memberUpdates: buildMemberIssueUpdates(),
    })),
    carryOver: source.carryOver.map((row) => ({
      ...row,
      memberUpdates: buildMemberWorkUpdates(),
    })),
    inProgress: source.inProgress.map((row) => ({
      ...row,
      memberUpdates: buildMemberWorkUpdates(),
    })),
    planned: source.planned.map((row) => ({
      ...row,
      memberUpdates: buildMemberWorkUpdates(),
    })),
    tbd: source.tbd.map((row) => ({
      ...row,
      memberUpdates: buildMemberWorkUpdates(),
    })),
    majorWorkItems: source.majorWorkItems.map((row) => ({
      ...row,
      memberUpdates: buildMemberMajorUpdates(),
    })),
    memberEntries: TEAM_MEMBERS.map((member) => ({
      email: member.email,
      name: member.name,
      role: member.role,
      thisWeek: '',
      nextWeek: '',
      done: false,
    })),
  }
}

function normalizePayload(raw: unknown): WeeklyReportPayload {
  const base = buildDefaultPayload()
  const source = (raw && typeof raw === 'object') ? raw as Partial<WeeklyReportPayload> : {}
  const rawEntries = Array.isArray(source.memberEntries) ? source.memberEntries : []

  return {
    strategyMeetings: normalizeRows(source.strategyMeetings, base.strategyMeetings),
    issues: normalizeIssueRows(source.issues, base.issues),
    carryOver: normalizeWorkRows(source.carryOver, base.carryOver),
    inProgress: normalizeWorkRows(source.inProgress, base.inProgress),
    planned: normalizePlannedRows(source.planned, base.planned),
    tbd: normalizePlannedRows(source.tbd, base.tbd),
    majorWorkItems: normalizeMajorWorkItems(source.majorWorkItems, base.majorWorkItems),
    memberEntries: base.memberEntries.map((defaultEntry) => {
      const incoming = rawEntries.find((entry) => normalizeEmail(entry?.email) === normalizeEmail(defaultEntry.email))
      return {
        ...defaultEntry,
        ...(incoming || {}),
      }
    }),
    leaderMemo: typeof source.leaderMemo === 'string' ? source.leaderMemo : '',
  }
}

function normalizeRows<T>(rows: unknown, fallback: T[]): T[] {
  if (!Array.isArray(rows)) return deepCopy(fallback)
  return rows as T[]
}

function buildMemberWorkUpdates() {
  return TEAM_INPUT_MEMBERS.map((member) => ({
    email: member.email,
    name: member.name,
    content: '',
    note: '',
  }))
}

function buildMemberIssueUpdates() {
  return TEAM_INPUT_MEMBERS.map((member) => ({
    email: member.email,
    name: member.name,
    issue: '',
    action: '',
  }))
}

function buildMemberMajorUpdates() {
  return TEAM_INPUT_MEMBERS.map((member) => ({
    email: member.email,
    name: member.name,
    thisWeek: '',
    nextWeek: '',
  }))
}

function normalizeMemberWorkUpdates(raw: unknown) {
  const source = Array.isArray(raw) ? raw : []
  return buildMemberWorkUpdates().map((defaultEntry) => {
    const incoming = source.find((entry) => normalizeEmail(entry?.email) === normalizeEmail(defaultEntry.email))
    return {
      ...defaultEntry,
      ...(incoming || {}),
    }
  })
}

function normalizeMemberIssueUpdates(raw: unknown) {
  const source = Array.isArray(raw) ? raw : []
  return buildMemberIssueUpdates().map((defaultEntry) => {
    const incoming = source.find((entry) => normalizeEmail(entry?.email) === normalizeEmail(defaultEntry.email))
    return {
      ...defaultEntry,
      ...(incoming || {}),
    }
  })
}

function normalizeMemberMajorUpdates(raw: unknown) {
  const source = Array.isArray(raw) ? raw : []
  return buildMemberMajorUpdates().map((defaultEntry) => {
    const incoming = source.find((entry) => normalizeEmail(entry?.email) === normalizeEmail(defaultEntry.email))
    return {
      ...defaultEntry,
      ...(incoming || {}),
    }
  })
}

function normalizeWorkRows(rows: unknown, fallback: WorkReportRow[]) {
  const normalized = normalizeRows(rows, fallback)
  return normalized.map((row) => ({
    ...row,
    memberUpdates: normalizeMemberWorkUpdates(row.memberUpdates),
  }))
}

function normalizeIssueRows(rows: unknown, fallback: IssueRow[]) {
  const normalized = normalizeRows(rows, fallback)
  return normalized.map((row) => ({
    ...row,
    memberUpdates: normalizeMemberIssueUpdates(row.memberUpdates),
  }))
}

function normalizePlannedRows(rows: unknown, fallback: PlannedWorkRow[]) {
  const normalized = normalizeRows(rows, fallback)
  return normalized.map((row) => ({
    ...row,
    memberUpdates: normalizeMemberWorkUpdates(row.memberUpdates),
  }))
}

function normalizeMajorWorkItems(rows: unknown, fallback: MajorWorkItem[]) {
  const normalized = normalizeRows(rows, fallback)
  return normalized.map((row) => ({
    ...row,
    memberUpdates: normalizeMemberMajorUpdates(row.memberUpdates),
  }))
}

function normalizeEmail(email?: string | null) {
  return (email || '').trim().toLowerCase()
}

function deriveWeeklyStatus(memberEntries: MemberEntry[], currentStatus?: WeeklyStatus | null): WeeklyStatus {
  if (currentStatus === '완료') return '완료'
  if (memberEntries.length === 0) return '입력중'
  return memberEntries.every((entry) => entry.done) ? '취합중' : '입력중'
}

async function upsertWeeklyReport(options: {
  year: number
  month: number
  week: number
  payload: WeeklyReportPayload
  status: WeeklyStatus
  currentUserId: string
  currentUserName: string
  existingId: string | null
  preserveFinalized: boolean
  finalizeNow?: boolean
}) {
  const nextStatus = options.finalizeNow ? '완료' : options.status
  const now = new Date().toISOString()
  const teamLabel = getWeekTitle(`${options.year}-${String(options.month).padStart(2, '0')}-${options.week}`)
  const memberCompletion = options.payload.memberEntries.map((entry) => ({
    email: entry.email,
    name: entry.name,
    done: entry.done,
    updatedAt: entry.updatedAt || null,
  }))

  const row = {
    id: options.existingId ?? undefined,
    team_key: WEEKLY_REPORT_TEAM_KEY,
    team_name: WEEKLY_REPORT_TEAM_NAME,
    report_year: options.year,
    report_month: options.month,
    report_week: options.week,
    title: `${WEEKLY_REPORT_TEAM_NAME} ${teamLabel} 주간보고`,
    status: nextStatus,
    payload: options.payload,
    member_completion: memberCompletion,
    created_by: options.existingId ? undefined : options.currentUserId,
    updated_by: options.currentUserId,
    finalized_by: options.finalizeNow ? options.currentUserId : undefined,
    finalized_at: options.finalizeNow ? now : options.preserveFinalized ? undefined : null,
  }

  const { data, error } = await supabase
    .from('weekly_reports')
    .upsert(row, { onConflict: 'team_key,report_year,report_month,report_week' })
    .select('id, title, status, payload, updated_at, finalized_at')
    .single()

  if (error || !data) {
    return { error: error?.message || 'unknown', record: null as never }
  }

  const record: WeeklyReportRecord = {
    id: data.id as string,
    title: (data.title as string) || `${WEEKLY_REPORT_TEAM_NAME} ${teamLabel} 주간보고`,
    status: (data.status as WeeklyStatus) || nextStatus,
    payload: normalizePayload(data.payload),
    updated_at: (data.updated_at as string) || now,
    finalized_at: (data.finalized_at as string | null) ?? null,
  }

  return { error: null, record }
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: 'green' | 'red' | 'amber' | 'blue' | 'slate' }) {
  const accentMap = {
    green: 'border-[#dbeadf] bg-[#f7fbf8] text-[#14532d]',
    red: 'border-[#f0d8d3] bg-[#fff7f4] text-[#8f3b2e]',
    amber: 'border-[#f0e2bb] bg-[#fffbf0] text-[#9a6700]',
    blue: 'border-[#dbe6f4] bg-[#f7faff] text-[#1d4f91]',
    slate: 'border-[#e4e7ec] bg-[#fbfcfd] text-[#344054]',
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] ${accentMap[accent]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: WeeklyStatus }) {
  const tone = status === '입력중'
    ? 'border-[#f0e2bb] bg-[#fffbf0] text-[#9a6700]'
    : status === '취합중'
      ? 'border-[#dbe6f4] bg-[#f7faff] text-[#1d4f91]'
      : 'border-[#dbeadf] bg-[#f7fbf8] text-[#14532d]'

  return (
    <Badge variant="outline" className={`h-6 rounded-full px-2.5 text-[11px] ${tone}`}>
      {status}
    </Badge>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-[#e4e7ec] bg-[linear-gradient(180deg,#fbfcfe_0%,#f4f7fb_100%)] px-5 py-4">
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#101828]">{title}</h2>
      {description ? <p className="mt-1 text-sm text-[#667085]">{description}</p> : null}
    </div>
  )
}

function SectionLabel({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-[#344054]">{index}</span>
      <h3 className="text-base font-semibold tracking-[-0.02em] text-[#101828]">{title}</h3>
    </div>
  )
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: ReactNode
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#d7dde4]">
      <div className="flex items-center justify-between gap-3 border-b border-[#d7dde4] bg-[linear-gradient(180deg,#f9fbfd_0%,#eef3f8_100%)] px-4 py-2 text-sm font-semibold text-[#101828]">
        <div>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

function EditableStrategySection(props: {
  rows: StrategyMeetingRow[]
  editable: boolean
  onChange: (rowIndex: number, key: keyof StrategyMeetingRow, value: string) => void
  onAdd: () => void
  onRemove: (rowIndex: number) => void
}) {
  return (
    <div className="space-y-3">
      <SectionCard
        title="■ 전략회의"
        action={props.editable ? (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={props.onAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            행 추가
          </Button>
        ) : undefined}
      >
        <div className="space-y-4 bg-white p-4">
          {props.rows.map((row, rowIndex) => (
            <StrategyMeetingEditorCard
              key={`strategy-${rowIndex}`}
              row={row}
              editable={props.editable}
              onChange={(key, value) => props.onChange(rowIndex, key, value)}
              onRemove={props.editable ? () => props.onRemove(rowIndex) : undefined}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function FinalStrategySection(props: {
  rows: StrategyMeetingRow[]
  onChange: (rowIndex: number, key: keyof StrategyMeetingRow, value: string) => void
}) {
  return (
    <SectionCard title="■ 전략회의">
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => (
          <StrategyMeetingEditorCard
            key={`final-strategy-${rowIndex}`}
            row={row}
            editable
            onChange={(key, value) => props.onChange(rowIndex, key, value)}
          />
        ))}
      </div>
    </SectionCard>
  )
}

function EditableIssueSection(props: {
  rows: IssueRow[]
  editable: boolean
  onChange: (rowIndex: number, key: keyof IssueRow, value: string) => void
  onAdd: () => void
  onRemove: (rowIndex: number) => void
}) {
  return (
    <div className="space-y-3">
      <SectionLabel index="2." title="이슈보고" />
      <div className="overflow-x-auto rounded-2xl border border-[#d7dde4] bg-white">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="bg-[#edf2f7] text-[#344054]">
            <tr>
              {['구분', '이슈 내용', '조치계획 및 결과'].map((column) => (
                <th key={column} className="border-b border-r border-[#d7dde4] px-3 py-2 text-left font-semibold last:border-r-0">
                  {column}
                </th>
              ))}
              {props.editable && (
                <th className="w-[84px] border-b border-[#d7dde4] px-3 py-2 text-left font-semibold">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={props.onAdd}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    행 추가
                  </Button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, rowIndex) => (
              <tr key={`issue-${rowIndex}`} className="align-top odd:bg-white even:bg-[#fcfcfd]">
                <EditableCell><TextareaCell editable={props.editable} value={row.category} onChange={(value) => props.onChange(rowIndex, 'category', value)} placeholder="구분" /></EditableCell>
                <EditableCell><TextareaCell editable={props.editable} value={row.issue} onChange={(value) => props.onChange(rowIndex, 'issue', value)} placeholder="이슈 내용" /></EditableCell>
                <EditableCell><TextareaCell editable={props.editable} value={row.action} onChange={(value) => props.onChange(rowIndex, 'action', value)} placeholder="조치계획 및 결과" /></EditableCell>
                {props.editable && (
                  <td className="border-t border-[#e4e7ec] px-3 py-3">
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-[#b42318]" onClick={() => props.onRemove(rowIndex)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StrategyMeetingEditorCard(props: {
  row: StrategyMeetingRow
  editable: boolean
  onChange: (key: keyof StrategyMeetingRow, value: string) => void
  onRemove?: () => void
}) {
  const row = props.row

  return (
    <div className="overflow-hidden rounded-2xl border border-[#cfd8e3] bg-[#fcfcfd] shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="grid gap-0 border-b border-[#d6deea] bg-[linear-gradient(180deg,#eef4fb_0%,#e8f0f8_100%)] md:grid-cols-[minmax(220px,1.3fr)_minmax(260px,1.6fr)_110px_110px_110px_120px]">
        <SummaryFieldEditor
          label="조직명"
          editable={props.editable}
          value={row.org}
          onChange={(value) => props.onChange('org', value)}
          placeholder="조직명"
        />
        <SummaryFieldEditor
          label="구분"
          editable={props.editable}
          value={row.category}
          onChange={(value) => props.onChange('category', value)}
          placeholder="구분"
        />
        <SummaryFieldEditor
          label="시작일자"
          editable={props.editable}
          value={row.startDate}
          onChange={(value) => props.onChange('startDate', value)}
          placeholder="YYYY.MM.DD"
        />
        <SummaryFieldEditor
          label="계획일자"
          editable={props.editable}
          value={row.targetDate}
          onChange={(value) => props.onChange('targetDate', value)}
          placeholder="YYYY.MM.DD"
        />
        <SummaryFieldEditor
          label="종료일자"
          editable={props.editable}
          value={row.endDate}
          onChange={(value) => props.onChange('endDate', value)}
          placeholder="YYYY.MM.DD"
        />
        <div className="space-y-1 border-l border-[#d6deea] bg-[#fff8ea] px-4 py-3">
          <div className="text-[11px] font-semibold text-[#8a5a12]">상태</div>
          {props.editable ? (
            <Select value={row.status || STRATEGY_STATUS_OPTIONS[0]} onValueChange={(value) => props.onChange('status', value)}>
              <SelectTrigger className="h-9 rounded-xl border-[#d0d5dd] bg-white text-sm shadow-none">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                {STRATEGY_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-xl border border-[#e1d0aa] bg-white px-3 py-2 text-sm font-medium text-[#7a4b16]">
              {row.status || '입력 예정'}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 border-b border-[#d9e2ec] bg-[#f5f9ff] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[#34506b]">내용</div>
          <TextareaCell
            editable={props.editable}
            value={row.content}
            onChange={(value) => props.onChange('content', value)}
            placeholder="세부 사업 수행 방안, 보고 내용 등을 입력"
            minHeightClass="min-h-[180px]"
          />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[#34506b]">조치계획 및 결과</div>
          <TextareaCell
            editable={props.editable}
            value={row.action}
            onChange={(value) => props.onChange('action', value)}
            placeholder="조치계획 / 결과 / 예정 일정 등을 입력"
            minHeightClass="min-h-[180px]"
          />
        </div>
      </div>

      {props.onRemove ? (
        <div className="flex justify-end bg-[#fffdfa] px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 px-2 text-[#b42318]" onClick={props.onRemove}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            삭제
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function MemberIssueInputTable(props: {
  rows: IssueRow[]
  onChange: (rowIndex: number, key: 'issue' | 'action', value: string) => void
}) {
  return (
    <SectionCard title="■ 이슈보고 입력">
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => {
          const currentUpdate = getCurrentMemberIssueUpdate(row.memberUpdates)
          return (
            <div key={`member-issue-${rowIndex}`} className="overflow-hidden rounded-2xl border border-[#d7dde4] bg-[#fcfcfd]">
              <div className="border-b border-[#dbe3ec] bg-[linear-gradient(180deg,#f8fbff_0%,#f2f6fb_100%)] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c6b82]">구분</div>
                <div className="mt-1 break-words text-sm font-medium text-[#0f172a]">{row.category || '-'}</div>
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#344054]">이슈 내용</div>
                  <Textarea
                    value={currentUpdate?.issue || ''}
                    onChange={(event) => props.onChange(rowIndex, 'issue', event.target.value)}
                    placeholder="이슈 내용 입력"
                    className="min-h-[170px] rounded-2xl border-[#cfd8e3] bg-white text-sm leading-6"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#344054]">조치계획 및 결과</div>
                  <Textarea
                    value={currentUpdate?.action || ''}
                    onChange={(event) => props.onChange(rowIndex, 'action', event.target.value)}
                    placeholder="조치계획 및 결과 입력"
                    className="min-h-[170px] rounded-2xl border-[#cfd8e3] bg-white text-sm leading-6"
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

function ContributionIssueTable(props: { rows: IssueRow[] }) {
  return (
    <SectionCard title="■ 이슈보고 입력 현황">
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => (
          <div key={`contribution-issue-${rowIndex}`} className="overflow-hidden rounded-2xl border border-[#d7dde4] bg-[#fcfcfd]">
            <div className="border-b border-[#dbe3ec] bg-[linear-gradient(180deg,#f8fbff_0%,#f2f6fb_100%)] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c6b82]">구분</div>
              <div className="mt-1 break-words text-sm font-medium text-[#0f172a]">{row.category || '-'}</div>
            </div>
            <div className="grid gap-3 p-4 xl:grid-cols-2">
              {normalizeMemberIssueUpdates(row.memberUpdates).map((entry) => (
                <div key={entry.email} className="rounded-2xl border border-[#d9e2ec] bg-white p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[#101828]">{entry.name}</div>
                      <div className="text-xs text-[#667085]">{entry.email}</div>
                    </div>
                    <div className="text-right text-[11px] text-[#667085]">
                      {entry.updatedAt ? formatDateTime(entry.updatedAt) : '미입력'}
                      {entry.updatedByName ? <div>{entry.updatedByName}</div> : null}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#e4e7ec] bg-[#f8fafc] px-3 py-2 text-sm text-[#475467]">
                    {entry.updatedAt ? '입력 완료' : '아직 작성 전'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function FinalIssueTable(props: {
  rows: IssueRow[]
  onChange: (rowIndex: number, key: keyof IssueRow, value: string) => void
}) {
  return (
    <SectionCard title="■ 이슈보고">
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => (
          <div key={`final-issue-${rowIndex}`} className="overflow-hidden rounded-2xl border border-[#cfd8e3] bg-[#fcfcfd] shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="border-b border-[#d6deea] bg-[linear-gradient(180deg,#eef4fb_0%,#e6eef8_100%)] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c6b82]">구분</div>
              <div className="mt-1 break-words text-sm font-semibold text-[#0f172a]">{row.category || '-'}</div>
            </div>
            <div className="grid gap-4 border-b border-[#d9e2ec] bg-[#f5f9ff] p-4 xl:grid-cols-2">
              <AggregatePreviewPanel
                title="팀원 입력 합본 - 이슈 내용"
                value={aggregateIssueText(row.memberUpdates, 'issue')}
              />
              <AggregatePreviewPanel
                title="팀원 입력 합본 - 조치계획 및 결과"
                value={aggregateIssueText(row.memberUpdates, 'action')}
              />
            </div>
            <div className="grid gap-4 bg-[#fffdfa] p-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#7a4b16]">최종 이슈 내용</div>
                <TextareaCell
                  editable
                  value={row.issue}
                  onChange={(value) => props.onChange(rowIndex, 'issue', value)}
                  placeholder="이슈 내용 입력"
                  minHeightClass="min-h-[156px]"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#7a4b16]">최종 조치계획 및 결과</div>
                <TextareaCell
                  editable
                  value={row.action}
                  onChange={(value) => props.onChange(rowIndex, 'action', value)}
                  placeholder="조치계획 및 결과 입력"
                  minHeightClass="min-h-[156px]"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function SetupWorkReportTable(props: {
  title: string
  rows: WorkReportRow[]
  editable: boolean
  onAdd: () => void
  onChange: (rowIndex: number, key: keyof WorkReportRow, value: string) => void
  onRemove: (rowIndex: number) => void
}) {
  return (
    <SectionCard
      title={`■ ${props.title}`}
      action={props.editable ? (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={props.onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          사업 추가
        </Button>
      ) : undefined}
    >
      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="bg-white text-[#344054]">
            <tr>
              {['프로젝트명', '구분', '사업 기간', '사업PM', '개발PL'].map((column) => (
                <th key={column} className="border-b border-r border-[#d7dde4] px-3 py-2 text-left font-semibold last:border-r-0">
                  {column}
                </th>
              ))}
              {props.editable && <th className="w-[72px] border-b border-[#d7dde4] px-3 py-2 text-left font-semibold">작업</th>}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, rowIndex) => (
              <tr key={`${props.title}-${rowIndex}`} className="align-top odd:bg-white even:bg-[#fcfcfd]">
                <EditableCell><InputCell editable={props.editable} value={row.projectName} onChange={(value) => props.onChange(rowIndex, 'projectName', value)} placeholder="프로젝트명" /></EditableCell>
                <EditableCell><InputCell editable={props.editable} value={row.category} onChange={(value) => props.onChange(rowIndex, 'category', value)} placeholder="구분" /></EditableCell>
                <EditableCell><InputCell editable={props.editable} value={row.period} onChange={(value) => props.onChange(rowIndex, 'period', value)} placeholder="사업 기간" /></EditableCell>
                <EditableCell><InputCell editable={props.editable} value={row.pm} onChange={(value) => props.onChange(rowIndex, 'pm', value)} placeholder="사업PM" /></EditableCell>
                <EditableCell><InputCell editable={props.editable} value={row.pl} onChange={(value) => props.onChange(rowIndex, 'pl', value)} placeholder="개발PL" /></EditableCell>
                {props.editable && (
                  <td className="border-t border-[#e4e7ec] px-3 py-3">
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-[#b42318]" onClick={() => props.onRemove(rowIndex)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function SetupPlannedWorkTable(props: {
  title: string
  rows: PlannedWorkRow[]
  editable: boolean
  onAdd: () => void
  onChange: (rowIndex: number, key: keyof PlannedWorkRow, value: string) => void
  onRemove: (rowIndex: number) => void
}) {
  return (
    <SectionCard
      title={`■ ${props.title}`}
      action={props.editable ? (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={props.onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          사업 추가
        </Button>
      ) : undefined}
    >
      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="bg-white text-[#344054]">
            <tr>
              {['프로젝트명', '사업유형', '입찰 구분', '사업예산', '사업PM'].map((column) => (
                <th key={column} className="border-b border-r border-[#d7dde4] px-3 py-2 text-left font-semibold last:border-r-0">
                  {column}
                </th>
              ))}
              {props.editable && <th className="w-[72px] border-b border-[#d7dde4] px-3 py-2 text-left font-semibold">작업</th>}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, rowIndex) => (
              <tr key={`${props.title}-${rowIndex}`} className="align-top odd:bg-white even:bg-[#fcfcfd]">
                <EditableCell><InputCell editable={props.editable} value={row.projectName} onChange={(value) => props.onChange(rowIndex, 'projectName', value)} placeholder="프로젝트명" /></EditableCell>
                <EditableCell><InputCell editable={props.editable} value={row.category} onChange={(value) => props.onChange(rowIndex, 'category', value)} placeholder="사업유형" /></EditableCell>
                <EditableCell><InputCell editable={props.editable} value={row.bidType} onChange={(value) => props.onChange(rowIndex, 'bidType', value)} placeholder="입찰 구분" /></EditableCell>
                <EditableCell><InputCell editable={props.editable} value={row.budget} onChange={(value) => props.onChange(rowIndex, 'budget', value)} placeholder="사업예산" /></EditableCell>
                <EditableCell><InputCell editable={props.editable} value={row.pm} onChange={(value) => props.onChange(rowIndex, 'pm', value)} placeholder="사업PM" /></EditableCell>
                {props.editable && (
                  <td className="border-t border-[#e4e7ec] px-3 py-3">
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-[#b42318]" onClick={() => props.onRemove(rowIndex)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function FinalWorkReportTable(props: {
  title: string
  rows: WorkReportRow[]
  onChange: (rowIndex: number, key: keyof WorkReportRow, value: string) => void
}) {
  return (
    <SectionCard title={`■ ${props.title}`}>
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => (
          <div key={`${props.title}-collect-${rowIndex}`} className="overflow-hidden rounded-2xl border border-[#cfd8e3] bg-[#fcfcfd] shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="grid gap-0 border-b border-[#d6deea] bg-[linear-gradient(180deg,#eef4fb_0%,#e8f0f8_100%)] px-0 py-0 md:grid-cols-[minmax(460px,2.8fr)_120px_190px_170px_140px_110px_120px]">
              <SummaryField label="프로젝트명" value={row.projectName} />
              <SummaryField label="구분" value={row.category} />
              <SummaryField label="사업 기간" value={row.period} />
              <SummaryField label="사업PM" value={row.pm} />
              <SummaryField label="개발PL" value={row.pl} />
              <SummaryField label="목표율" value={row.targetRate || '-'} />
              <div className="space-y-1 border-l border-[#d6deea] bg-[#fff8ea] px-4 py-3">
                <div className="text-[11px] font-semibold text-[#8a5a12]">달성율</div>
                <InputCell
                  editable
                  value={row.actualRate}
                  onChange={(value) => props.onChange(rowIndex, 'actualRate', value)}
                  placeholder="달성율"
                />
              </div>
            </div>
            <div className="grid gap-4 border-b border-[#d9e2ec] bg-[#f5f9ff] p-4 xl:grid-cols-2">
              <AggregatePreviewPanel
                title="팀원 입력 합본 - 내용"
                value={aggregateMemberText(row.memberUpdates, 'content')}
              />
              <AggregatePreviewPanel
                title="팀원 입력 합본 - 비고"
                value={aggregateMemberText(row.memberUpdates, 'note')}
              />
            </div>
            <div className="grid gap-4 bg-[#fffdfa] p-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#7a4b16]">최종 내용</div>
                <TextareaCell
                  editable
                  value={row.detail}
                  onChange={(value) => props.onChange(rowIndex, 'detail', value)}
                  placeholder="진행 내용 입력"
                  minHeightClass="min-h-[156px]"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#7a4b16]">최종 비고</div>
                <TextareaCell
                  editable
                  value={row.note}
                  onChange={(value) => props.onChange(rowIndex, 'note', value)}
                  placeholder="비고 입력"
                  minHeightClass="min-h-[156px]"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function FinalPlannedWorkTable(props: {
  title: string
  rows: PlannedWorkRow[]
  onChange: (rowIndex: number, key: keyof PlannedWorkRow, value: string) => void
}) {
  return (
    <SectionCard title={`■ ${props.title}`}>
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => (
          <div key={`${props.title}-collect-planned-${rowIndex}`} className="overflow-hidden rounded-2xl border border-[#cfd8e3] bg-[#fcfcfd] shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="grid gap-0 border-b border-[#d6deea] bg-[linear-gradient(180deg,#eef4fb_0%,#e8f0f8_100%)] px-0 py-0 md:grid-cols-[minmax(460px,2.8fr)_150px_150px_130px_170px_130px]">
              <SummaryField label="프로젝트명" value={row.projectName} />
              <SummaryField label="사업유형" value={row.category} />
              <SummaryField label="입찰 구분" value={row.bidType} />
              <SummaryField label="사업예산" value={row.budget} />
              <SummaryField label="사업PM" value={row.pm} />
              <div className="space-y-1 border-l border-[#d6deea] bg-[#fff8ea] px-4 py-3">
                <div className="text-[11px] font-semibold text-[#8a5a12]">수주확률</div>
                <InputCell
                  editable
                  value={row.probability}
                  onChange={(value) => props.onChange(rowIndex, 'probability', value)}
                  placeholder="수주확률"
                />
              </div>
            </div>
            <div className="grid gap-4 border-b border-[#d9e2ec] bg-[#f5f9ff] p-4 xl:grid-cols-2">
              <AggregatePreviewPanel
                title="팀원 입력 합본 - 내용"
                value={aggregateMemberText(row.memberUpdates, 'content')}
              />
              <AggregatePreviewPanel
                title="팀원 입력 합본 - 비고"
                value={aggregateMemberText(row.memberUpdates, 'note')}
              />
            </div>
            <div className="grid gap-4 bg-[#fffdfa] p-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#7a4b16]">최종 내용</div>
                <TextareaCell
                  editable
                  value={row.detail}
                  onChange={(value) => props.onChange(rowIndex, 'detail', value)}
                  placeholder="사업관리 및 영업 진행 현황 입력"
                  minHeightClass="min-h-[156px]"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#7a4b16]">최종 비고</div>
                <TextareaCell
                  editable
                  value={row.note}
                  onChange={(value) => props.onChange(rowIndex, 'note', value)}
                  placeholder="비고 입력"
                  minHeightClass="min-h-[156px]"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function EditableMajorWorkItems(props: {
  rows: MajorWorkItem[]
  editable: boolean
  onAdd: () => void
  onChange: (rowIndex: number, key: keyof MajorWorkItem, value: string) => void
  onRemove: (rowIndex: number) => void
}) {
  return (
    <SectionCard
      title="■ 기타 주요 업무 항목"
      action={props.editable ? (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={props.onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          항목 추가
        </Button>
      ) : undefined}
    >
      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead className="bg-white text-[#344054]">
            <tr>
              {['항목명'].map((column) => (
                <th key={column} className="border-b border-r border-[#d7dde4] px-3 py-2 text-left font-semibold last:border-r-0">
                  {column}
                </th>
              ))}
              {props.editable && <th className="w-[72px] border-b border-[#d7dde4] px-3 py-2 text-left font-semibold">작업</th>}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, rowIndex) => (
              <tr key={`major-work-${rowIndex}`} className="align-top odd:bg-white even:bg-[#fcfcfd]">
                <EditableCell><InputCell editable={props.editable} value={row.label} onChange={(value) => props.onChange(rowIndex, 'label', value)} placeholder="예: [항해통신사업부]" /></EditableCell>
                {props.editable && (
                  <td className="border-t border-[#e4e7ec] px-3 py-3">
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-[#b42318]" onClick={() => props.onRemove(rowIndex)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function FinalMajorWorkItems(props: {
  rows: MajorWorkItem[]
  onChange: (rowIndex: number, key: keyof MajorWorkItem, value: string) => void
}) {
  return (
    <SectionCard title="■ 기타 주요 업무">
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => (
          <div key={`collect-major-${rowIndex}`} className="overflow-hidden rounded-2xl border border-[#cfd8e3] bg-[#fcfcfd] shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="border-b border-[#d6deea] bg-[linear-gradient(180deg,#eef4fb_0%,#e8f0f8_100%)] px-4 py-3">
              <div className="text-sm font-semibold text-[#101828]">{row.label || '항목명 입력'}</div>
            </div>
            <div className="grid gap-4 border-b border-[#d9e2ec] bg-[#f5f9ff] p-4 xl:grid-cols-2">
              <AggregatePreviewPanel
                title="팀원 입력 합본 - 금주 진행 업무"
                value={aggregateMajorText(row.memberUpdates, 'thisWeek')}
              />
              <AggregatePreviewPanel
                title="팀원 입력 합본 - 차주 예정 업무"
                value={aggregateMajorText(row.memberUpdates, 'nextWeek')}
              />
            </div>
            <div className="grid gap-4 bg-[#fffdfa] p-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#7a4b16]">최종 금주 진행 업무</div>
                <TextareaCell
                  editable
                  value={row.thisWeek}
                  onChange={(value) => props.onChange(rowIndex, 'thisWeek', value)}
                  placeholder="금주 진행 업무 입력"
                  minHeightClass="min-h-[140px]"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#7a4b16]">최종 차주 예정 업무</div>
                <TextareaCell
                  editable
                  value={row.nextWeek}
                  onChange={(value) => props.onChange(rowIndex, 'nextWeek', value)}
                  placeholder="차주 예정 업무 입력"
                  minHeightClass="min-h-[140px]"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function MemberWorkInputTable(props: {
  title: string
  rows: WorkReportRow[]
  onChange: (rowIndex: number, key: 'content' | 'note', value: string) => void
}) {
  return (
    <SectionCard title={`■ ${props.title}`}>
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => {
          const currentUpdate = getCurrentMemberWorkUpdate(row.memberUpdates)
          return (
            <ProjectInputBlock
              key={`${props.title}-member-${rowIndex}`}
              summary={[
                { label: '프로젝트명', value: row.projectName, grow: true },
                { label: '구분', value: row.category },
                { label: '사업 기간', value: row.period },
                { label: '사업PM', value: row.pm },
                { label: '개발PL', value: row.pl || '-' },
                { label: '목표율', value: row.targetRate || '-' },
                { label: '달성율', value: row.actualRate || '-', alignEnd: true },
              ]}
              content={currentUpdate?.content || ''}
              note={currentUpdate?.note || ''}
              onContentChange={(value) => props.onChange(rowIndex, 'content', value)}
              onNoteChange={(value) => props.onChange(rowIndex, 'note', value)}
            />
          )
        })}
      </div>
    </SectionCard>
  )
}

function MemberPlannedInputTable(props: {
  title: string
  rows: PlannedWorkRow[]
  onChange: (rowIndex: number, key: 'content' | 'note', value: string) => void
}) {
  return (
    <SectionCard title={`■ ${props.title}`}>
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => {
          const currentUpdate = getCurrentMemberWorkUpdate(row.memberUpdates)
          return (
            <ProjectInputBlock
              key={`${props.title}-member-planned-${rowIndex}`}
              summary={[
                { label: '프로젝트명', value: row.projectName, grow: true },
                { label: '사업유형', value: row.category },
                { label: '입찰 구분', value: row.bidType },
                { label: '사업예산', value: row.budget },
                { label: '사업PM', value: row.pm },
                { label: '수주확률', value: row.probability || '-', alignEnd: true },
              ]}
              content={currentUpdate?.content || ''}
              note={currentUpdate?.note || ''}
              onContentChange={(value) => props.onChange(rowIndex, 'content', value)}
              onNoteChange={(value) => props.onChange(rowIndex, 'note', value)}
            />
          )
        })}
      </div>
    </SectionCard>
  )
}

function ContributionWorkReportTable(props: {
  title: string
  rows: WorkReportRow[]
}) {
  return (
    <SectionCard title={`■ ${props.title}`}>
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => (
          <ContributionProjectBlock
            key={`${props.title}-contrib-${rowIndex}`}
            summary={[
              { label: '프로젝트명', value: row.projectName, grow: true },
              { label: '구분', value: row.category },
              { label: '사업 기간', value: row.period },
              { label: '사업PM', value: row.pm },
              { label: '개발PL', value: row.pl || '-' },
              { label: '달성율', value: row.actualRate || '-', alignEnd: true },
            ]}
            updates={normalizeMemberWorkUpdates(row.memberUpdates)}
            statusOnly
          />
        ))}
      </div>
    </SectionCard>
  )
}

function ContributionPlannedWorkTable(props: {
  title: string
  rows: PlannedWorkRow[]
}) {
  return (
    <SectionCard title={`■ ${props.title}`}>
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => (
          <ContributionProjectBlock
            key={`${props.title}-contrib-planned-${rowIndex}`}
            summary={[
              { label: '프로젝트명', value: row.projectName, grow: true },
              { label: '사업유형', value: row.category },
              { label: '입찰 구분', value: row.bidType },
              { label: '사업예산', value: row.budget },
              { label: '사업PM', value: row.pm },
              { label: '수주확률', value: row.probability || '-', alignEnd: true },
            ]}
            updates={normalizeMemberWorkUpdates(row.memberUpdates)}
            statusOnly
          />
        ))}
      </div>
    </SectionCard>
  )
}

function MemberMajorInputTable(props: {
  rows: MajorWorkItem[]
  onChange: (rowIndex: number, key: 'thisWeek' | 'nextWeek', value: string) => void
}) {
  return (
    <SectionCard title="■ 기타 주요 업무">
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => {
          const currentUpdate = getCurrentMemberMajorUpdate(row.memberUpdates)
          return (
            <MajorWorkBlock
              key={`major-member-${rowIndex}`}
              label={row.label}
              thisWeek={currentUpdate?.thisWeek || ''}
              nextWeek={currentUpdate?.nextWeek || ''}
              onThisWeekChange={(value) => props.onChange(rowIndex, 'thisWeek', value)}
              onNextWeekChange={(value) => props.onChange(rowIndex, 'nextWeek', value)}
            />
          )
        })}
      </div>
    </SectionCard>
  )
}

function ContributionMajorWorkItems(props: { rows: MajorWorkItem[] }) {
  return (
    <SectionCard title="■ 기타 주요 업무 입력 현황">
      <div className="space-y-4 bg-white p-4">
        {props.rows.map((row, rowIndex) => (
          <MajorContributionBlock
            key={`major-contrib-${rowIndex}`}
            label={row.label}
            updates={normalizeMemberMajorUpdates(row.memberUpdates)}
            statusOnly
          />
        ))}
      </div>
    </SectionCard>
  )
}

function ProjectInputBlock(props: {
  summary: Array<{ label: string; value: string; grow?: boolean; alignEnd?: boolean }>
  content: string
  note: string
  onContentChange: (value: string) => void
  onNoteChange: (value: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#d7dde4] bg-[#fcfcfd]">
      <div className="grid gap-0 border-b border-[#dbe3ec] bg-[linear-gradient(180deg,#f8fbff_0%,#f2f6fb_100%)] md:grid-cols-12">
        {props.summary.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className={`min-w-0 border-b border-r border-[#dbe3ec] px-4 py-3 md:border-b-0 ${item.grow ? 'md:col-span-4' : 'md:col-span-1'} ${item.alignEnd ? 'bg-[#fffaf0]' : index % 2 === 0 ? 'bg-white/40' : 'bg-[#f8fbff]'}`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c6b82]">{item.label}</div>
            <div className="mt-1 break-words text-sm font-medium text-[#0f172a]">{item.value || '-'}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[#344054]">내용</div>
          <Textarea
            value={props.content}
            onChange={(event) => props.onContentChange(event.target.value)}
            placeholder="내용 입력"
            className="min-h-[170px] rounded-2xl border-[#cfd8e3] bg-white text-sm leading-6"
          />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[#344054]">비고</div>
          <Textarea
            value={props.note}
            onChange={(event) => props.onNoteChange(event.target.value)}
            placeholder="비고 입력"
            className="min-h-[170px] rounded-2xl border-[#cfd8e3] bg-white text-sm leading-6"
          />
        </div>
      </div>
    </div>
  )
}

function ContributionProjectBlock(props: {
  summary: Array<{ label: string; value: string; grow?: boolean; alignEnd?: boolean }>
  updates: MemberWorkUpdate[]
  statusOnly?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#d7dde4] bg-[#fcfcfd]">
      <div className="grid gap-0 border-b border-[#dbe3ec] bg-[linear-gradient(180deg,#f8fbff_0%,#f2f6fb_100%)] md:grid-cols-12">
        {props.summary.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className={`min-w-0 border-b border-r border-[#dbe3ec] px-4 py-3 md:border-b-0 ${item.grow ? 'md:col-span-4' : 'md:col-span-1'} ${item.alignEnd ? 'bg-[#fffaf0]' : index % 2 === 0 ? 'bg-white/40' : 'bg-[#f8fbff]'}`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c6b82]">{item.label}</div>
            <div className="mt-1 break-words text-sm font-medium text-[#0f172a]">{item.value || '-'}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 p-4 xl:grid-cols-2">
        {props.updates.map((entry) => (
          <div key={entry.email} className="rounded-2xl border border-[#d9e2ec] bg-white p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#101828]">{entry.name}</div>
                <div className="text-xs text-[#667085]">{entry.email}</div>
              </div>
              <div className="text-right text-[11px] text-[#667085]">
                {entry.updatedAt ? formatDateTime(entry.updatedAt) : '미입력'}
                {entry.updatedByName ? <div>{entry.updatedByName}</div> : null}
              </div>
            </div>
            {props.statusOnly ? (
              <div className="rounded-2xl border border-[#e4e7ec] bg-[#f8fafc] px-3 py-2 text-sm text-[#475467]">
                {entry.updatedAt ? '입력 완료' : '아직 작성 전'}
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                <ContributionPreview label="내용" value={entry.content} />
                <ContributionPreview label="비고" value={entry.note} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function MajorWorkBlock(props: {
  label: string
  thisWeek: string
  nextWeek: string
  onThisWeekChange: (value: string) => void
  onNextWeekChange: (value: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#d7dde4] bg-[#fcfcfd]">
      <div className="border-b border-[#dbe3ec] bg-[linear-gradient(180deg,#f8fbff_0%,#f2f6fb_100%)] px-4 py-3">
        <div className="text-sm font-semibold text-[#101828]">{props.label || '항목명 미정'}</div>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[#344054]">금주 진행 업무</div>
          <Textarea value={props.thisWeek} onChange={(event) => props.onThisWeekChange(event.target.value)} className="min-h-[150px] rounded-2xl border-[#cfd8e3] bg-white text-sm leading-6" />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[#344054]">차주 예정 업무</div>
          <Textarea value={props.nextWeek} onChange={(event) => props.onNextWeekChange(event.target.value)} className="min-h-[150px] rounded-2xl border-[#cfd8e3] bg-white text-sm leading-6" />
        </div>
      </div>
    </div>
  )
}

function MajorContributionBlock(props: {
  label: string
  updates: NonNullable<MajorWorkItem['memberUpdates']>
  statusOnly?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#d7dde4] bg-[#fcfcfd]">
      <div className="border-b border-[#dbe3ec] bg-[linear-gradient(180deg,#f8fbff_0%,#f2f6fb_100%)] px-4 py-3">
        <div className="text-sm font-semibold text-[#101828]">{props.label || '항목명 미정'}</div>
      </div>
      <div className="grid gap-3 p-4 xl:grid-cols-2">
        {props.updates.map((entry) => (
          <div key={entry.email} className="rounded-2xl border border-[#d9e2ec] bg-white p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#101828]">{entry.name}</div>
                <div className="text-xs text-[#667085]">{entry.email}</div>
              </div>
              <div className="text-right text-[11px] text-[#667085]">
                {entry.updatedAt ? formatDateTime(entry.updatedAt) : '미입력'}
                {entry.updatedByName ? <div>{entry.updatedByName}</div> : null}
              </div>
            </div>
            {props.statusOnly ? (
              <div className="rounded-2xl border border-[#e4e7ec] bg-[#f8fafc] px-3 py-2 text-sm text-[#475467]">
                {entry.updatedAt ? '입력 완료' : '아직 작성 전'}
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                <ContributionPreview label="금주 진행 업무" value={entry.thisWeek} />
                <ContributionPreview label="차주 예정 업무" value={entry.nextWeek} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AggregatePreviewPanel({ title, value }: { title: string; value: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#d6deea] bg-white">
      <div className="border-b border-[#dce6f0] bg-[linear-gradient(180deg,#f7fbff_0%,#edf4fb_100%)] px-4 py-2 text-xs font-semibold text-[#34506b]">
        {title}
      </div>
      <div className="min-h-[156px] whitespace-pre-wrap bg-white px-4 py-3 text-sm leading-6 text-[#344054]">
        {value || '아직 팀원 입력이 없습니다.'}
      </div>
    </div>
  )
}

function ContributionPreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e4e7ec] bg-[#f8fafc] p-3">
      <div className="text-[11px] font-semibold text-[#667085]">{label}</div>
      <div className="mt-2 min-h-[84px] whitespace-pre-wrap text-sm leading-6 text-[#344054]">
        {value || '아직 입력 전'}
      </div>
    </div>
  )
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 border-r border-[#d6deea] px-4 py-3 last:border-r-0">
      <div className="text-[11px] font-semibold text-[#5e7188]">{label}</div>
      <div className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-[#101828]">{value || '-'}</div>
    </div>
  )
}

function SummaryFieldEditor(props: {
  label: string
  value: string
  editable: boolean
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="space-y-1 border-r border-[#d6deea] px-4 py-3 last:border-r-0">
      <div className="text-[11px] font-semibold text-[#5e7188]">{props.label}</div>
      {props.editable ? (
        <InputCell
          editable
          value={props.value}
          onChange={props.onChange}
          placeholder={props.placeholder}
        />
      ) : (
        <div className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-[#101828]">
          {props.value || '-'}
        </div>
      )}
    </div>
  )
}

function getCurrentMemberWorkUpdate(updates: MemberWorkUpdate[] | undefined) {
  const currentUser = useAuthStore.getState().currentUser
  const email = normalizeEmail(currentUser?.email)
  return normalizeMemberWorkUpdates(updates).find((entry) => normalizeEmail(entry.email) === email) ?? null
}

function getCurrentMemberIssueUpdate(updates: IssueRow['memberUpdates']) {
  const currentUser = useAuthStore.getState().currentUser
  const email = normalizeEmail(currentUser?.email)
  return normalizeMemberIssueUpdates(updates).find((entry) => normalizeEmail(entry.email) === email) ?? null
}

function getCurrentMemberMajorUpdate(updates: MajorWorkItem['memberUpdates']) {
  const currentUser = useAuthStore.getState().currentUser
  const email = normalizeEmail(currentUser?.email)
  return normalizeMemberMajorUpdates(updates).find((entry) => normalizeEmail(entry.email) === email) ?? null
}

function aggregateMemberText(
  updates: MemberWorkUpdate[] | undefined,
  key: 'content' | 'note',
) {
  return normalizeMemberWorkUpdates(updates)
    .filter((entry) => (entry[key] || '').trim().length > 0)
    .map((entry) => `[${entry.name}] ${entry[key].trim()}`)
    .join('\n\n')
}

function aggregateIssueText(
  updates: IssueRow['memberUpdates'],
  key: 'issue' | 'action',
) {
  return normalizeMemberIssueUpdates(updates)
    .filter((entry) => (entry[key] || '').trim().length > 0)
    .map((entry) => `[${entry.name}] ${entry[key].trim()}`)
    .join('\n\n')
}

function aggregateMajorText(
  updates: MajorWorkItem['memberUpdates'],
  key: 'thisWeek' | 'nextWeek',
) {
  return normalizeMemberMajorUpdates(updates)
    .filter((entry) => (entry[key] || '').trim().length > 0)
    .map((entry) => `[${entry.name}] ${entry[key].trim()}`)
    .join('\n\n')
}

function ReadOnlyStrategySection({ rows }: { rows: StrategyMeetingRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#d7dde4] bg-white">
      <table className="w-full min-w-[1180px] border-collapse text-sm">
        <thead className="bg-[#edf2f7] text-[#344054]">
          <tr>
            {['조직명', '구분', '내용', '시작일자', '계획일자', '종료일자', '조치계획 및 결과', '상태'].map((column) => (
              <th key={column} className="border-b border-r border-[#d7dde4] px-3 py-2 text-left font-semibold last:border-r-0">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`readonly-strategy-${rowIndex}`} className="align-top odd:bg-white even:bg-[#fcfcfd]">
              <EditableCell><ReadValue value={row.org} empty="-" /></EditableCell>
              <EditableCell><ReadValue value={row.category} empty="-" /></EditableCell>
              <EditableCell><ReadValue value={row.content} empty="입력 예정" multiline /></EditableCell>
              <EditableCell><ReadValue value={row.startDate} empty="-" /></EditableCell>
              <EditableCell><ReadValue value={row.targetDate} empty="-" /></EditableCell>
              <EditableCell><ReadValue value={row.endDate} empty="-" /></EditableCell>
              <EditableCell><ReadValue value={row.action} empty="입력 예정" multiline /></EditableCell>
              <EditableCell><ReadValue value={row.status} empty="-" /></EditableCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReadOnlyIssueSection({ rows }: { rows: IssueRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#d7dde4] bg-white">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead className="bg-[#edf2f7] text-[#344054]">
          <tr>
            {['구분', '이슈 내용', '조치계획 및 결과'].map((column) => (
              <th key={column} className="border-b border-r border-[#d7dde4] px-3 py-2 text-left font-semibold last:border-r-0">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`readonly-issue-${rowIndex}`} className="align-top odd:bg-white even:bg-[#fcfcfd]">
              <EditableCell><ReadValue value={row.category} empty="입력 예정" multiline /></EditableCell>
              <EditableCell><ReadValue value={row.issue} empty="입력 예정" multiline /></EditableCell>
              <EditableCell><ReadValue value={row.action} empty="입력 예정" multiline /></EditableCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReadOnlyWorkReportTable({ title, rows }: { title: string; rows: WorkReportRow[] }) {
  return (
    <SectionCard title={`■ ${title}`}>
      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[1260px] border-collapse text-sm">
          <thead className="bg-white text-[#344054]">
            <tr>
              {['프로젝트명', '구분', '사업 기간', '사업PM', '개발PL', '목표율', '달성율', '내용', '비고'].map((column) => (
                <th key={column} className="border-b border-r border-[#d7dde4] px-3 py-2 text-left font-semibold last:border-r-0">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`readonly-${title}-${rowIndex}`} className="align-top odd:bg-white even:bg-[#fcfcfd]">
                <EditableCell><ReadValue value={row.projectName} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.category} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.period} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.pm} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.pl} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.targetRate} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.actualRate} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.detail} empty="입력 예정" multiline /></EditableCell>
                <EditableCell><ReadValue value={row.note} empty="-" multiline /></EditableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function ReadOnlyPlannedWorkTable({ title, rows }: { title: string; rows: PlannedWorkRow[] }) {
  return (
    <SectionCard title={`■ ${title}`}>
      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[1220px] border-collapse text-sm">
          <thead className="bg-white text-[#344054]">
            <tr>
              {['프로젝트명', '사업유형', '입찰 구분', '사업예산', '사업PM', '수주확률', '사업관리 및 영업 진행 현황', '비고'].map((column) => (
                <th key={column} className="border-b border-r border-[#d7dde4] px-3 py-2 text-left font-semibold last:border-r-0">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`readonly-planned-${title}-${rowIndex}`} className="align-top odd:bg-white even:bg-[#fcfcfd]">
                <EditableCell><ReadValue value={row.projectName} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.category} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.bidType} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.budget} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.pm} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.probability} empty="-" /></EditableCell>
                <EditableCell><ReadValue value={row.detail} empty="입력 예정" multiline /></EditableCell>
                <EditableCell><ReadValue value={row.note} empty="-" multiline /></EditableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function EditableCell({ children }: { children: ReactNode }) {
  return (
    <td className="min-w-[120px] border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467] last:border-r-0">
      {children}
    </td>
  )
}

function InputCell({
  editable,
  value,
  onChange,
  placeholder,
}: {
  editable: boolean
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  if (!editable) return <ReadValue value={value} empty="입력 예정" />
  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-9 rounded-xl border-[#d0d5dd] bg-white text-sm text-[#475467] placeholder:text-[#c5ced8] placeholder:opacity-100"
    />
  )
}

function TextareaCell({
  editable,
  value,
  onChange,
  placeholder,
  minHeightClass = 'min-h-[108px]',
}: {
  editable: boolean
  value: string
  onChange: (value: string) => void
  placeholder: string
  minHeightClass?: string
}) {
  if (!editable) return <ReadValue value={value} empty="입력 예정" multiline />
  return (
    <Textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`${minHeightClass} rounded-2xl border-[#d0d5dd] bg-white text-sm leading-6 text-[#475467] placeholder:text-[#c5ced8] placeholder:opacity-100`}
    />
  )
}

function ReadValue({ value, empty, multiline }: { value: string; empty: string; multiline?: boolean }) {
  if (!value) return <span className="text-[#c5ced8]">{empty}</span>
  return (
    <div className={multiline ? 'whitespace-pre-wrap leading-6 text-[#475467]' : 'text-[#475467]'}>
      {value}
    </div>
  )
}

function SidebarCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="rounded-[22px] border border-[#e4e7ec] bg-[linear-gradient(180deg,#ffffff_0%,#fdfdfd_100%)] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <h3 className="text-base font-semibold tracking-[-0.02em] text-[#101828]">{title}</h3>
      {description ? <p className="mt-1 text-sm text-[#667085]">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  )
}

function CompactSummaryCard({
  title,
  value,
  tone,
}: {
  title: string
  value: string
  tone: 'green' | 'amber' | 'blue' | 'slate'
}) {
  const toneMap = {
    green: 'border-[#dbeadf] bg-[#f7fbf8] text-[#14532d]',
    amber: 'border-[#f0e2bb] bg-[#fffbf0] text-[#9a6700]',
    blue: 'border-[#dbe6f4] bg-[#f7faff] text-[#1d4f91]',
    slate: 'border-[#e4e7ec] bg-[#fbfcfd] text-[#344054]',
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneMap[tone]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em]">{title}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  )
}

function WeeklyReadOnlySummary({ currentMemberEntry }: { currentMemberEntry: MemberEntry | null }) {
  return (
    <div className="rounded-2xl border border-[#d7dde4] bg-[linear-gradient(180deg,#fbfcfe_0%,#f7f9fc_100%)] px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#101828]">주간보고 입력</div>
          <div className="mt-1 text-sm text-[#667085]">윗줄 사업 정보는 참고용이고, 아래 `내용`과 `비고`를 중심으로 입력하면 됩니다.</div>
        </div>
        {currentMemberEntry && (
          <Badge variant="outline" className={`rounded-full px-2.5 text-[11px] ${currentMemberEntry.done ? 'border-[#dbeadf] bg-[#f7fbf8] text-[#14532d]' : 'border-[#f0e2bb] bg-[#fffbf0] text-[#9a6700]'}`}>
            {currentMemberEntry.done ? '내 입력 완료' : '내 입력 작성중'}
          </Badge>
        )}
      </div>
    </div>
  )
}

function ManagerCompletionOverview({
  completedMembers,
  pendingMembers,
}: {
  completedMembers: MemberEntry[]
  pendingMembers: MemberEntry[]
}) {
  return (
    <SidebarCard title="입력 현황" description="">
      <div className="grid gap-4 lg:grid-cols-2">
        <MemberList title="입력 완료자" members={completedMembers} tone="green" />
        <MemberList title="미완료자" members={pendingMembers} tone="amber" />
      </div>
    </SidebarCard>
  )
}

function MemberList({
  title,
  members,
  tone,
}: {
  title: string
  members: Array<MemberEntry>
  tone: 'green' | 'amber'
}) {
  const toneClass = tone === 'green'
    ? 'border-[#dbeadf] bg-[#f7fbf8] text-[#14532d]'
    : 'border-[#f0e2bb] bg-[#fffbf0] text-[#9a6700]'

  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#667085]">{title}</div>
      <div className="space-y-2">
        {members.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#d0d5dd] px-3 py-3 text-sm text-[#667085]">해당 멤버가 없습니다.</div>
        ) : members.map((member) => (
          <div key={member.email} className={`rounded-xl border px-3 py-2 text-sm ${toneClass}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{member.name}</div>
                <div className="text-xs opacity-80">{member.email}</div>
              </div>
              <div className="text-right text-[11px] opacity-80">
                {member.updatedAt ? formatDateTime(member.updatedAt) : '미기록'}
                {member.updatedByName ? <div>{member.updatedByName}</div> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
