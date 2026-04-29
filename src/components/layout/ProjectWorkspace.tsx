import { useEffect } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, ClipboardList, Home, Network } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { GanttView } from '@/components/gantt/GanttView'
import { ProgressDashboard } from '@/components/progress/ProgressDashboard'
import { CalendarManager } from '@/components/calendar/CalendarManager'
import { ProjectSettings } from '@/components/settings/ProjectSettings'
import { ResourceManager } from '@/components/settings/ResourceManager'
import { ActivityTimeline } from '@/components/activity/ActivityTimeline'
import { MyTasksDashboard } from '@/components/mytasks/MyTasksDashboard'
import { MemberTasksView } from '@/components/member-tasks/MemberTasksView'
import { WorkspaceView } from '@/components/workspace/WorkspaceView'
import { IssueTrackerView } from '@/components/issue-tracker/IssueTrackerView'
import { useProjectStore } from '@/stores/project-store'
import { useTaskStore } from '@/stores/task-store'
import { useResourceStore } from '@/stores/resource-store'
import { useUIStore } from '@/stores/ui-store'
import { useUndoStore } from '@/stores/undo-store'
import { useAuthStore } from '@/stores/auth-store'
import { useActivityStore } from '@/stores/activity-store'
import { useCalendarStore } from '@/stores/calendar-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useIssueStore } from '@/stores/issue-store'
import { SAMPLE_PROJECT, SAMPLE_TASKS, SAMPLE_DEPENDENCIES } from '@/lib/sample-data'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { MobileShell } from '@/components/mobile/MobileShell'
import { MobileContent } from '@/components/mobile/MobileContent'
import { Button } from '@/components/ui/button'

type WorkspaceMode = 'home' | 'wbs' | 'issues'

function MainContent() {
  const activeView = useUIStore((s) => s.activeView)

  switch (activeView) {
    case 'gantt':
      return <GanttView />
    case 'progress':
      return <ProgressDashboard />
    case 'analysis':
      return <ProgressDashboard />
    case 'workload':
      return <ProgressDashboard />
    case 'calendar':
      return <CalendarManager />
    case 'resources':
      return <ResourceManager />
    case 'settings':
      return <ProjectSettings />
    case 'activity':
      return <ActivityTimeline />
    case 'mytasks':
      return <MyTasksDashboard />
    case 'memberTasks':
      return <MemberTasksView />
    case 'workspace':
      return <WorkspaceView />
    default:
      return <GanttView />
  }
}

function ProjectEntry({ canAccessIssues }: { canAccessIssues: boolean }) {
  const navigate = useNavigate()
  const project = useProjectStore((s) => s.currentProject)

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-sm text-slate-500">
        프로젝트 정보를 불러오는 중입니다.
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <button
            onClick={() => navigate('/projects')}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <img src="/logo.png" alt="GMT" className="h-7 w-7 object-contain" />
            프로젝트 목록
          </button>
          <Button variant="outline" size="sm" onClick={() => navigate('/projects')}>
            <Home className="h-4 w-4" />
            목록으로
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold text-slate-500">프로젝트 작업 선택</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{project.name}</h1>
          {project.description && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{project.description}</p>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            onClick={() => navigate(`/projects/${project.id}/wbs`)}
            className="group flex min-h-48 flex-col justify-between rounded-lg border border-slate-300 bg-white p-6 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/40"
          >
            <div>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                <Network className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-950">WBS</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                일정, 작업, 담당자, 진척률을 관리하는 외부 협업 중심 화면입니다.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-blue-700">
              WBS로 들어가기
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>

          {canAccessIssues && (
            <button
              onClick={() => navigate(`/projects/${project.id}/issues`)}
              className="group flex min-h-48 flex-col justify-between rounded-lg border border-slate-300 bg-white p-6 text-left shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
            >
              <div>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold text-slate-950">이슈 트래커</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                  내부 처리 이력, 요청 구분, 공수 로그를 관리하는 별도 업무 화면입니다.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                이슈로 들어가기
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          )}
        </div>
      </section>
    </main>
  )
}

export function ProjectWorkspace({ mode = 'home' }: { mode?: WorkspaceMode }) {
  const { projectId } = useParams<{ projectId: string }>()
  const { switchProject, currentProject, setProject, loadProjectMembers, loadProjects } = useProjectStore()
  const projects = useProjectStore((s) => s.projects)
  const { setTasks, setDependencies, loadTasks, loadDependencies } = useTaskStore()
  const { loadResources } = useResourceStore()
  const fetchAllUsers = useAuthStore((s) => s.fetchAllUsers)
  const loadActivityLogs = useActivityStore((s) => s.loadLogs)
  const loadCalendars = useCalendarStore((s) => s.loadCalendars)
  const loadWorkspaceItems = useWorkspaceStore((s) => s.loadItems)
  const loadIssues = useIssueStore((s) => s.loadIssues)
  const loadIssueMembers = useIssueStore((s) => s.loadIssueMembers)
  const issueMembersLoadedProjectId = useIssueStore((s) => s.issueMembersLoadedProjectId)
  const currentUserId = useAuthStore((s) => s.currentUser?.id)
  const canAccessIssues = useIssueStore((s) => projectId ? s.canAccessIssues(projectId, currentUserId) : false)
  const clearUndo = useUndoStore((s) => s.clear)

  useEffect(() => {
    if (projectId && projects.length === 0) {
      void loadProjects()
    }
  }, [loadProjects, projectId, projects.length])

  useEffect(() => {
    if (projectId && projects.length > 0 && currentProject?.id !== projectId) {
      switchProject(projectId)
    }
  }, [currentProject?.id, projectId, projects.length, switchProject])

  useEffect(() => {
    if (!projectId) return

    // 프로젝트 전환 시 undo 스택 초기화
    clearUndo()
    switchProject(projectId)

    // Supabase에서 데이터 로드 시도
    const loadFromServer = async () => {
      try {
        await Promise.all([
          loadTasks(projectId),
          loadDependencies(projectId),
          loadResources(projectId),
          loadProjectMembers(projectId),
          loadIssueMembers(projectId),
          loadCalendars(projectId),
          loadWorkspaceItems(projectId),
          mode === 'issues' ? loadIssues(projectId) : Promise.resolve(),
          fetchAllUsers(),
          // 활동로그도 DB에서 로드 (현재 사용자 기준, 첫 페이지)
          loadActivityLogs(projectId, { userId: currentUserId, offset: 0, limit: 50 }),
        ])
        // 서버에서 작업 데이터가 비어있고, 샘플 프로젝트인 경우 폴백
        const { tasks } = useTaskStore.getState()
        if (tasks.length === 0 && projectId === SAMPLE_PROJECT.id) {
          if (!currentProject || currentProject.id !== SAMPLE_PROJECT.id) {
            setProject(SAMPLE_PROJECT)
          }
          setTasks(SAMPLE_TASKS)
          setDependencies(SAMPLE_DEPENDENCIES)
        }
      } catch (err) {
        console.error('서버 데이터 로드 실패, 폴백 사용:', err)
        // 폴백: 샘플 프로젝트인 경우 샘플 데이터 사용
        if (projectId === SAMPLE_PROJECT.id) {
          if (!currentProject || currentProject.id !== SAMPLE_PROJECT.id) {
            setProject(SAMPLE_PROJECT)
          }
          setTasks(SAMPLE_TASKS)
          setDependencies(SAMPLE_DEPENDENCIES)
        } else {
          setTasks([])
          setDependencies([])
        }
      }
    }
    loadFromServer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, mode])

  const isMobile = useIsMobile()

  if (projectId && mode === 'issues' && issueMembersLoadedProjectId === projectId && !canAccessIssues) {
    return <Navigate to={`/projects/${projectId}`} replace />
  }

  if (mode === 'home') {
    return <ProjectEntry canAccessIssues={canAccessIssues} />
  }

  if (mode === 'issues') {
    return <IssueTrackerView />
  }

  if (isMobile) {
    return (
      <MobileShell>
        <MobileContent />
      </MobileShell>
    )
  }

  return (
    <AppShell>
      <MainContent />
    </AppShell>
  )
}
