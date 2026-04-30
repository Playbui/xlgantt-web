import { useEffect, useCallback, useRef } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, CalendarDays, ClipboardList, Home, Network, Timer } from 'lucide-react'
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

function ProjectEntry({
  canAccessWbs,
  canAccessIssues,
}: {
  canAccessWbs: boolean
  canAccessIssues: boolean
}) {
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
    <main className="project-entry-shell">
      <header className="project-entry-header">
        <div className="project-entry-inner flex h-14 items-center justify-between">
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

      <section className="project-entry-inner">
        <div className="project-entry-hero">
          <div>
            <p className="project-entry-kicker">Project Workspace</p>
            <h1 className="project-entry-title">{project.name}</h1>
            <p className="project-entry-copy">
              같은 프로젝트 안에서도 외부 협업용 WBS와 내부 처리용 이슈 화면은 성격이 다르다. 필요한 작업면으로 바로 들어갈 수 있게 정리했다.
            </p>
            {project.description && (
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#727780]">{project.description}</p>
            )}
          </div>

          <aside className="project-entry-aside">
            <div className="project-entry-aside-grid">
              <div className="project-entry-stat">
                <p className="project-entry-stat-label">시작일</p>
                <p className="project-entry-stat-value">{project.start_date}</p>
              </div>
              <div className="project-entry-stat">
                <p className="project-entry-stat-label">종료일</p>
                <p className="project-entry-stat-value">{project.end_date}</p>
              </div>
              <div className="project-entry-stat">
                <p className="project-entry-stat-label">기준일</p>
                <p className="project-entry-stat-value">{project.status_date || '미설정'}</p>
              </div>
              <div className="project-entry-stat">
                <p className="project-entry-stat-label">화면 권한</p>
                <p className="project-entry-stat-value">{canAccessWbs && canAccessIssues ? 'WBS + 이슈' : canAccessWbs ? 'WBS' : '이슈'}</p>
              </div>
            </div>
          </aside>
        </div>

        <div className="project-entry-actions">
          {canAccessWbs && (
            <button
              onClick={() => navigate(`/projects/${project.id}/wbs`)}
              className="project-entry-card project-entry-card-muted group"
            >
              <div>
                <div className="project-entry-icon">
                  <Network className="h-5 w-5" />
                </div>
                <h2 className="project-entry-card-title">WBS</h2>
                <p className="project-entry-card-copy">
                  일정, 작업, 담당자, 진척률을 관리하는 외부 협업 중심 화면입니다.
                </p>
                <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-[#41454d]">
                  <span className="project-chip border-[#dddddd] bg-white text-[#41454d]">
                    <CalendarDays className="h-3 w-3" />
                    일정 관리
                  </span>
                  <span className="project-chip border-[#dddddd] bg-white text-[#41454d]">
                    <Timer className="h-3 w-3" />
                    진척 추적
                  </span>
                </div>
              </div>
              <div className="project-entry-cta">
                WBS로 들어가기
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          )}

          {canAccessIssues && (
            <button
              onClick={() => navigate(`/issues?project=${project.id}`)}
              className="project-entry-card project-entry-card-dark group"
            >
              <div>
                <div className="project-entry-icon">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <h2 className="project-entry-card-title">이슈 트래커</h2>
                <p className="project-entry-card-copy">
                  내부 처리 이력, 요청 구분, 공수 로그를 관리하는 별도 업무 화면입니다.
                </p>
                <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-white/75">
                  <span className="project-chip border-white/15 bg-white/10 text-white">
                    처리 이력
                  </span>
                  <span className="project-chip border-white/15 bg-white/10 text-white">
                    공수 정산
                  </span>
                </div>
              </div>
              <div className="project-entry-cta">
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
  const currentUserId = useAuthStore((s) => s.currentUser?.id)
  const currentUserRole = useAuthStore((s) => s.currentUser?.role)
  const projectMembersLoadedProjectIds = useProjectStore((s) => s.projectMembersLoadedProjectIds)
  const canAccessWbs = useProjectStore((s) =>
    projectId ? s.canAccessWbs(projectId, currentUserId, currentUserRole) : false
  )
  const { setTasks, setDependencies, loadTasks, loadDependencies } = useTaskStore()
  const { loadResources } = useResourceStore()
  const fetchAllUsers = useAuthStore((s) => s.fetchAllUsers)
  const loadActivityLogs = useActivityStore((s) => s.loadLogs)
  const loadCalendars = useCalendarStore((s) => s.loadCalendars)
  const loadWorkspaceItems = useWorkspaceStore((s) => s.loadItems)
  const loadIssues = useIssueStore((s) => s.loadIssues)
  const loadIssueMembers = useIssueStore((s) => s.loadIssueMembers)
  const issueMembersLoadedProjectId = useIssueStore((s) => s.issueMembersLoadedProjectId)
  const canAccessIssues = useIssueStore((s) => projectId ? s.canAccessIssues(projectId, currentUserId) : false)
  const clearUndo = useUndoStore((s) => s.clear)
  const lastRefreshAtRef = useRef(0)
  const accessReady = !!projectId
    && projectMembersLoadedProjectIds.includes(projectId)
    && issueMembersLoadedProjectId === projectId

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

  const loadWorkspaceData = useCallback(async () => {
    if (!projectId) return

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
        loadActivityLogs(projectId, { userId: currentUserId, offset: 0, limit: 50 }),
      ])

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
  }, [
    currentProject,
    currentUserId,
    fetchAllUsers,
    loadActivityLogs,
    loadCalendars,
    loadDependencies,
    loadIssues,
    loadIssueMembers,
    loadProjectMembers,
    loadResources,
    loadTasks,
    loadWorkspaceItems,
    mode,
    projectId,
    setDependencies,
    setProject,
    setTasks,
  ])

  useEffect(() => {
    if (!projectId) return

    clearUndo()
    switchProject(projectId)
    void loadWorkspaceData()
  }, [clearUndo, loadWorkspaceData, projectId, switchProject])

  useEffect(() => {
    if (!projectId) return

    const refreshIfStale = () => {
      const now = Date.now()
      if (document.visibilityState === 'hidden') return
      if (now - lastRefreshAtRef.current < 30_000) return
      lastRefreshAtRef.current = now
      void loadWorkspaceData()
    }

    window.addEventListener('focus', refreshIfStale)
    document.addEventListener('visibilitychange', refreshIfStale)

    return () => {
      window.removeEventListener('focus', refreshIfStale)
      document.removeEventListener('visibilitychange', refreshIfStale)
    }
  }, [loadWorkspaceData, projectId])

  const isMobile = useIsMobile()

  if (projectId && mode === 'wbs' && projectMembersLoadedProjectIds.includes(projectId) && !canAccessWbs) {
    return <Navigate to={`/projects/${projectId}`} replace />
  }

  if (projectId && mode === 'issues' && issueMembersLoadedProjectId === projectId && !canAccessIssues) {
    return <Navigate to={`/projects/${projectId}`} replace />
  }

  if (mode === 'home') {
    if (!projectId || !accessReady) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-sm text-slate-500">
          프로젝트 접근 권한을 확인하는 중입니다.
        </div>
      )
    }

    const accessibleModes = [
      canAccessWbs ? 'wbs' : null,
      canAccessIssues ? 'issues' : null,
    ].filter(Boolean)

    if (accessibleModes.length === 1) {
      return (
        <Navigate
          to={accessibleModes[0] === 'issues' ? `/issues?project=${projectId}` : `/projects/${projectId}/wbs`}
          replace
        />
      )
    }

    if (accessibleModes.length === 0) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-700">접근 가능한 화면이 없습니다.</p>
            <p className="mt-2 text-sm text-slate-500">관리자에게 WBS 또는 이슈 접근 권한을 요청하세요.</p>
            <Button className="mt-5" variant="outline" size="sm" onClick={() => window.history.back()}>
              돌아가기
            </Button>
          </div>
        </main>
      )
    }

    return <ProjectEntry canAccessWbs={canAccessWbs} canAccessIssues={canAccessIssues} />
  }

  if (mode === 'issues') {
    return <Navigate to={`/issues?project=${projectId}`} replace />
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
