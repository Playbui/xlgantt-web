import { useEffect } from 'react'
import { Navigate, useParams } from 'react-router-dom'
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

export function ProjectWorkspace({ mode = 'wbs', redirectTo }: { mode?: 'wbs' | 'issues'; redirectTo?: 'wbs' | 'issues' }) {
  const { projectId } = useParams<{ projectId: string }>()
  const { switchProject, currentProject, setProject, loadProjectMembers } = useProjectStore()
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

  if (projectId && redirectTo) {
    return <Navigate to={`/projects/${projectId}/${redirectTo}`} replace />
  }

  if (projectId && mode === 'issues' && issueMembersLoadedProjectId === projectId && !canAccessIssues) {
    return <Navigate to={`/projects/${projectId}/wbs`} replace />
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
      {mode === 'issues' ? <IssueTrackerView /> : <MainContent />}
    </AppShell>
  )
}
