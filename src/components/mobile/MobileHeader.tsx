import { ArrowLeft, Bell, ClipboardList, BarChart3, Clock3, NotebookText, Shield, User, LogOut, FileText, LayoutDashboard, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '@/stores/project-store'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { canAccessWeeklyReports } from '@/lib/weekly-report-access'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function MobileHeader() {
  const navigate = useNavigate()
  const project = useProjectStore((s) => s.currentProject)
  const user = useAuthStore((s) => s.currentUser)
  const logout = useAuthStore((s) => s.logout)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const canSeeWeeklyReports = canAccessWeeklyReports(user)
  const isAdmin = user?.role === 'admin'

  const jumpToProjectView = (view: 'gantt' | 'mytasks' | 'progress' | 'activity' | 'workspace') => {
    setActiveView(view)
  }

  return (
    <div className="flex items-center h-12 px-3 border-b border-border/40 bg-background flex-shrink-0 safe-top">
      <button
        onClick={() => navigate('/projects')}
        className="p-1.5 -ml-1 rounded-lg hover:bg-accent/50 active:bg-accent"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="flex-1 min-w-0 mx-2">
        <h1 className="text-sm font-bold truncate">{project?.name || 'XLGantt'}</h1>
      </div>

      <button className="p-1.5 rounded-lg hover:bg-accent/50 active:bg-accent relative">
        <Bell className="h-5 w-5 text-muted-foreground" />
      </button>

      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-border/60 bg-white pl-1 pr-1.5 py-1 shadow-sm hover:bg-accent/40 active:bg-accent/60">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user.name.charAt(0)}
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="py-2">
              <div className="text-sm font-semibold text-foreground">{user.name}</div>
              <div className="text-[11px] text-muted-foreground">{user.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/projects')} className="text-xs cursor-pointer">
              <LayoutDashboard className="mr-2 h-3.5 w-3.5" />
              프로젝트 목록
            </DropdownMenuItem>
            {project && (
              <>
                <DropdownMenuItem onClick={() => jumpToProjectView('gantt')} className="text-xs cursor-pointer">
                  <FileText className="mr-2 h-3.5 w-3.5" />
                  WBS
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => jumpToProjectView('mytasks')} className="text-xs cursor-pointer">
                  <ClipboardList className="mr-2 h-3.5 w-3.5" />
                  내 업무
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => jumpToProjectView('progress')} className="text-xs cursor-pointer">
                  <BarChart3 className="mr-2 h-3.5 w-3.5" />
                  진척현황
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => jumpToProjectView('activity')} className="text-xs cursor-pointer">
                  <Clock3 className="mr-2 h-3.5 w-3.5" />
                  활동 로그
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => jumpToProjectView('workspace')} className="text-xs cursor-pointer">
                  <NotebookText className="mr-2 h-3.5 w-3.5" />
                  업무노트
                </DropdownMenuItem>
              </>
            )}
            {canSeeWeeklyReports && (
              <DropdownMenuItem onClick={() => navigate('/weekly-reports')} className="text-xs cursor-pointer">
                <FileText className="mr-2 h-3.5 w-3.5" />
                주간업무보고
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')} className="text-xs cursor-pointer">
              <User className="mr-2 h-3.5 w-3.5" />
              내 프로필
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => navigate('/admin')} className="text-xs cursor-pointer">
                <Shield className="mr-2 h-3.5 w-3.5" />
                사용자 관리
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                logout().then(() => navigate('/login'))
              }}
              className="text-xs cursor-pointer text-red-500 focus:text-red-500"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
