import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, CheckCircle2, CircleAlert, Clock3, Download, FileLock2, FileSpreadsheet, Save, ShieldCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth-store'
import { canManageWeeklyReports, getWeeklyReportAllowedEmails } from '@/lib/weekly-report-access'

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
}

const WEEK_OPTIONS = buildWeekOptions()

const STRATEGY_MEETING_ROWS: StrategyMeetingRow[] = [
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

const ISSUE_ROWS: IssueRow[] = [
  {
    category: '[해경] Deep Blue Eye 실증 - ICD 협의',
    issue: '- 항공단 ICD 협의 및 신호확인 위한 현장실사 필요\n- 카메라 물리적 연동관련 분석 필요',
    action: '- ICD문서(보안) 취합하여 분석 중 (w.LIG)\n- 항공단 협조하에 비행 동승 예정. (업무프로세스 및 실동작환경 확인)',
  },
]

const CARRY_OVER_ROWS: WorkReportRow[] = [
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
  },
]

const IN_PROGRESS_ROWS: WorkReportRow[] = [
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
  },
]

const PLANNED_ROWS: PlannedWorkRow[] = [
  {
    projectName: '[육군] 26년 해안경계통합시스템 유지보수',
    category: '유지보수',
    bidType: '수의 계약',
    budget: '0.54억',
    pm: '신진우(선)',
    probability: '',
    detail: '- 계약 수의시담완료, 계약품의 진행. 차주 내 계약 진행 예정',
    note: '',
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
  },
]

const TBD_ROWS: PlannedWorkRow[] = [
  {
    projectName: '[육군] 육군 5군단 원격사격통제 체계',
    category: '제품',
    bidType: '수의 계약',
    budget: '2억',
    pm: '',
    probability: '',
    detail: '- 5군단 차주 방문 진행\n- 사업 의뢰 담당자 병원 입원으로 인한 사업 추진 일정 재협의 (차주)',
    note: '',
  },
]

const THIS_WEEK_NOTES = {
  title: '금주 진행 업무',
  items: [
    '[항해통신사업부]\n[NIPA] 항공 채증영상 기반 분석 AI Deep Blue Eye WBS, 추정손익 작성 내부보고\n[NIPA] 전략해양,해양환경공단 - 갯끈풀 AI 분석 실증 제출 이후 대기중',
    '[해양경찰청]\nNIPA "Deep Blue Eye" 해경 보유 영상데이터 분석을 위한 오토라벨러 개선 중\nICD를 위한 업무미팅, 신호 연동 관련 현장파악 일정협의',
    '[수협중앙회]\n중단파 1분기 대금 청구',
    '[해양수산부]\nFIS 기능개선관련 견적 내부품의 진행 후 수협 전달',
  ],
}

const NEXT_WEEK_NOTES = {
  title: '차주 예정 업무',
  items: [
    '[항해통신사업부]\n[NIPA] 항공 채증영상 기반 분석 AI Deep Blue Eye 착수보고 자료 작성\n[NIPA] AI 바우처 지원 사업 제안발표 준비',
    '[해양경찰청]\n[해경] 항공 채증영상 기반 분석 AI Deep Blue Eye 실증 사업 - 사업자간 업무 R&R 정리 완료, 내부 개발 진행',
    '[수협중앙회]\n- FIS 미수신알람분석 포팅\n- 중단파 FBB_LC 테이블 오션인포 연계 및 대시보드 기능 정상화',
    '[해양수산부]\nFIS 고도화 사업 과업범위 조절 및 예산관련 업무 진행',
  ],
}

export function WeeklyReportsPage() {
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.currentUser)
  const canManage = canManageWeeklyReports(currentUser)
  const [selectedWeek, setSelectedWeek] = useState(WEEK_OPTIONS[0]?.value ?? '')

  const teamMembers = useMemo(
    () => [
      { email: 'waterer@gmtc.kr', name: '황준호', done: true },
      { email: 'sjw@gmtc.kr', name: '신진우', done: false },
      { email: 'jack@gmtc.kr', name: '노재원', done: false },
      { email: 'erichan@gmtc.kr', name: '한규혁', done: true },
      { email: 'juchen131@gmtc.kr', name: '김주영', done: true },
      { email: 'leejh@gmtc.kr', name: '이준혁', done: false },
    ],
    []
  )

  const completedMembers = teamMembers.filter((member) => member.done)
  const pendingMembers = teamMembers.filter((member) => !member.done)
  const weeklyStatus: WeeklyStatus = pendingMembers.length === 0 ? '취합중' : '입력중'
  const completionRate = Math.round((completedMembers.length / teamMembers.length) * 100)

  return (
    <div className="std-page">
      <header className="std-page-header">
        <div className="std-page-header-inner">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => navigate('/projects')}>
              <ArrowLeft className="h-3.5 w-3.5" />
              프로젝트 목록
            </Button>
            <div className="hidden md:flex items-center gap-2 rounded-full border border-[#d7dde4] bg-[#f8fafc] px-3 py-1 text-[11px] text-[#425466]">
              <FileLock2 className="h-3 w-3" />
              항해통신1팀 전용
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#425466]">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{canManage ? '팀장 편집 권한' : '팀원 입력 권한'}</span>
          </div>
        </div>
      </header>

      <main className="std-page-main space-y-6">
        <section className="overflow-hidden rounded-[22px] border border-[#d7dde4] bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <div className="border-b border-[#e4e7ec] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-5 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="h-6 rounded-full border-[#d7dde4] bg-white px-2.5 text-[11px] text-[#344054]">
                    <Users className="h-3 w-3" />
                    항해통신1팀
                  </Badge>
                  <Badge variant="outline" className="h-6 rounded-full border-[#d7dde4] bg-[#f8fafc] px-2.5 text-[11px] text-[#344054]">
                    <FileLock2 className="h-3 w-3" />
                    비공개 작업공간
                  </Badge>
                  <StatusBadge status={weeklyStatus} />
                </div>
                <div>
                  <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-[#101828]">주간업무보고</h1>
                  <p className="mt-1 text-sm leading-6 text-[#475467]">팀원은 자기 담당 내용을 입력하고, 팀장은 전체 흐름을 정리해 최종본을 만드는 주차형 보고 화면입니다.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-[#667085]">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4" />
                    <span>{selectedWeek}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#157347]" />
                    <span>완료 {completedMembers.length}명</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CircleAlert className="h-4 w-4 text-[#b54708]" />
                    <span>미완료 {pendingMembers.length}명</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="상태" value={weeklyStatus} accent={weeklyStatus === '입력중' ? 'amber' : 'blue'} />
                <MetricCard label="입력 완료" value={`${completedMembers.length}명`} accent="green" />
                <MetricCard label="미완료" value={`${pendingMembers.length}명`} accent="red" />
                <MetricCard label="권한 대상" value={`${getWeeklyReportAllowedEmails().length}명`} accent="slate" />
              </div>
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
                  <select
                    value={selectedWeek}
                    onChange={(event) => setSelectedWeek(event.target.value)}
                    className="h-10 min-w-[240px] rounded-xl border border-[#d0d5dd] bg-white px-3 text-sm text-[#101828] outline-none focus:border-[#98a2b3] focus:ring-2 focus:ring-[#dce7f5]"
                  >
                    {WEEK_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-[#667085]">지난 주차 조회와 이번 주차 입력 준비</div>
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
                <Button variant="outline" size="sm" className="h-9 text-xs">
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  저장
                </Button>
                <Button variant="outline" size="sm" className="h-9 text-xs">
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  내 입력 완료
                </Button>
                <Button size="sm" className="h-9 text-xs" disabled={!canManage}>
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  최종 저장
                </Button>
                <Button variant="outline" size="sm" className="h-9 text-xs" disabled>
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                  엑셀 출력
                </Button>
              </div>
              <div className="mt-3 text-xs leading-6 text-[#667085]">
                팀원은 자기 항목 입력과 완료 체크만, 팀장은 전체 문안 정리와 최종 저장을 담당합니다.
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.95fr)_380px]">
          <div className="rounded-[22px] border border-[#d7dde4] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
            <SectionHeader
              title={`${selectedWeek} 주간보고`}
              description="기본 틀은 팀장이 관리하고, 팀원은 자기 담당 내용만 넣는 구조로 이어집니다."
            />
            <div className="space-y-6 p-5">
              <WeeklyTableSection
                index="1."
                title="전략회의"
                columns={['조직명', '구분', '내용', '시작일자', '계획일자', '종료일자', '조치계획 및 결과', '상태']}
                rows={STRATEGY_MEETING_ROWS.map((row) => [row.org, row.category, row.content, row.startDate, row.targetDate, row.endDate, row.action, row.status])}
              />

              <WeeklyTableSection
                index="2."
                title="이슈보고"
                columns={['구분', '이슈 내용', '조치계획 및 결과']}
                rows={ISSUE_ROWS.map((row) => [row.category, row.issue, row.action])}
              />

              <div className="space-y-4">
                <SectionLabel index="3." title="업무보고" />
                <WorkReportTable title="이월 사업" rows={CARRY_OVER_ROWS} />
                <WorkReportTable title="진행 사업" rows={IN_PROGRESS_ROWS} />
                <PlannedWorkTable title="예정 사업" rows={PLANNED_ROWS} />
                <PlannedWorkTable title="미정 사업" rows={TBD_ROWS} />
              </div>

              <div className="space-y-4">
                <SectionLabel index="4." title="기타 주요 업무" />
                <div className="grid gap-4 lg:grid-cols-2">
                  <NarrativePanel title={THIS_WEEK_NOTES.title} items={THIS_WEEK_NOTES.items} />
                  <NarrativePanel title={NEXT_WEEK_NOTES.title} items={NEXT_WEEK_NOTES.items} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <SidebarCard
              title="입력 현황"
              description="승인은 없고, 누가 썼는지와 아직 안 쓴 사람만 빠르게 확인합니다."
            >
              <div className="space-y-3">
                <MemberList title="입력 완료자" members={completedMembers} tone="green" />
                <MemberList title="미완료자" members={pendingMembers} tone="amber" />
              </div>
            </SidebarCard>

            <SidebarCard
              title="운영 규칙"
              description="1차는 비밀 페이지와 주간 템플릿을 안정적으로 여는 데 집중합니다."
            >
              <ul className="space-y-2 text-sm leading-6 text-[#475467]">
                <li>- 팀원은 자기 파트 입력과 완료 체크 중심</li>
                <li>- 팀장은 전체 내용 취합 및 최종 문안 수정</li>
                <li>- 지난 주차는 셀렉트로 조회</li>
                <li>- 엑셀 출력은 2페이즈에서 샘플 양식과 맞춤</li>
              </ul>
            </SidebarCard>

            <SidebarCard
              title="다음 단계"
              description="이 페이지가 자리잡으면 바로 저장 구조와 팀별 입력 분리를 얹을 수 있습니다."
            >
              <ul className="space-y-2 text-sm leading-6 text-[#475467]">
                <li>- 팀장용 주차 생성 / 지난주 복사</li>
                <li>- 담당자별 입력 칸 활성화</li>
                <li>- 작성 로그와 수정 이력 저장</li>
                <li>- 최종본 기준 엑셀 다운로드</li>
              </ul>
            </SidebarCard>
          </div>
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
    const { year, month, weekOfMonth } = getWeekOfMonth(target)
    return {
      value: `${year}-${String(month).padStart(2, '0')}-${weekOfMonth}`,
      label: `${year}년 ${month}월 ${weekOfMonth}주차`,
    }
  })
}

function getWeekOfMonth(date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const firstDay = new Date(year, date.getMonth(), 1)
  const offset = firstDay.getDay()
  const weekOfMonth = Math.ceil((date.getDate() + offset) / 7)
  return { year, month, weekOfMonth }
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: 'green' | 'red' | 'amber' | 'blue' | 'slate' }) {
  const accentMap = {
    green: 'border-[#cce7d5] bg-[#f3fbf6] text-[#14532d]',
    red: 'border-[#f0c7c7] bg-[#fff5f5] text-[#991b1b]',
    amber: 'border-[#ead4a3] bg-[#fff9ec] text-[#9a6700]',
    blue: 'border-[#cfe0f5] bg-[#f5f9ff] text-[#1d4f91]',
    slate: 'border-[#d7dde4] bg-[#f8fafc] text-[#344054]',
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
    ? 'border-[#ead4a3] bg-[#fff9ec] text-[#9a6700]'
    : status === '취합중'
      ? 'border-[#cfe0f5] bg-[#f5f9ff] text-[#1d4f91]'
      : 'border-[#cce7d5] bg-[#f3fbf6] text-[#14532d]'

  return (
    <Badge variant="outline" className={`h-6 rounded-full px-2.5 text-[11px] ${tone}`}>
      {status}
    </Badge>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-[#e4e7ec] bg-[linear-gradient(180deg,#f8fafc_0%,#f2f6fb_100%)] px-5 py-4">
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#101828]">{title}</h2>
      <p className="mt-1 text-sm text-[#667085]">{description}</p>
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

function WeeklyTableSection({ index, title, columns, rows }: { index: string; title: string; columns: string[]; rows: string[][] }) {
  return (
    <div className="space-y-3">
      <SectionLabel index={index} title={title} />
      <div className="overflow-hidden rounded-2xl border border-[#d7dde4] bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[#edf2f7] text-[#344054]">
            <tr>
              {columns.map((column) => (
                <th key={column} className="border-b border-r border-[#d7dde4] px-3 py-2 text-left font-semibold last:border-r-0">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${title}-${rowIndex}`} className="bg-white odd:bg-white even:bg-[#fcfcfd]">
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-${rowIndex}-${cellIndex}`} className="min-w-[120px] whitespace-pre-wrap border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467] last:border-r-0">
                    {cell || <span className="text-[#98a2b3]">입력 예정</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WorkReportTable({ title, rows }: { title: string; rows: WorkReportRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#d7dde4]">
      <div className="border-b border-[#d7dde4] bg-[linear-gradient(180deg,#edf2f7_0%,#e6edf5_100%)] px-4 py-2 text-sm font-semibold text-[#101828]">■ {title}</div>
      <table className="w-full border-collapse text-sm">
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
            <tr key={`${title}-${rowIndex}`} className="bg-white odd:bg-white even:bg-[#fcfcfd]">
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#101828]">{row.projectName}</td>
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.category}</td>
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.period}</td>
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.pm}</td>
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.pl || '-'}</td>
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.targetRate}</td>
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.actualRate}</td>
              <td className="whitespace-pre-wrap border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.detail}</td>
              <td className="border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.note || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlannedWorkTable({ title, rows }: { title: string; rows: PlannedWorkRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#d7dde4]">
      <div className="border-b border-[#d7dde4] bg-[linear-gradient(180deg,#edf2f7_0%,#e6edf5_100%)] px-4 py-2 text-sm font-semibold text-[#101828]">■ {title}</div>
      <table className="w-full border-collapse text-sm">
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
            <tr key={`${title}-${rowIndex}`} className="bg-white odd:bg-white even:bg-[#fcfcfd]">
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#101828]">{row.projectName}</td>
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.category}</td>
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.bidType}</td>
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.budget}</td>
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.pm || '-'}</td>
              <td className="border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.probability || '-'}</td>
              <td className="whitespace-pre-wrap border-r border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.detail}</td>
              <td className="border-t border-[#e4e7ec] px-3 py-3 align-top text-[#475467]">{row.note || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NarrativePanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#d7dde4] bg-white">
      <div className="border-b border-[#d7dde4] bg-[linear-gradient(180deg,#edf2f7_0%,#e6edf5_100%)] px-4 py-2 text-sm font-semibold text-[#101828]">{title}</div>
      <div className="space-y-0">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="whitespace-pre-wrap border-t border-[#e4e7ec] px-4 py-4 text-sm leading-7 text-[#475467] first:border-t-0">
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function SidebarCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-[#d7dde4] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <h3 className="text-base font-semibold tracking-[-0.02em] text-[#101828]">{title}</h3>
      <p className="mt-1 text-sm text-[#667085]">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function MemberList({ title, members, tone }: { title: string; members: Array<{ email: string; name: string }>; tone: 'green' | 'amber' }) {
  const toneClass = tone === 'green'
    ? 'border-[#cce7d5] bg-[#f3fbf6] text-[#14532d]'
    : 'border-[#ead4a3] bg-[#fff9ec] text-[#9a6700]'

  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#667085]">{title}</div>
      <div className="space-y-2">
        {members.map((member) => (
          <div key={member.email} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${toneClass}`}>
            <span className="font-medium">{member.name}</span>
            <span className="text-xs opacity-80">{member.email}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
