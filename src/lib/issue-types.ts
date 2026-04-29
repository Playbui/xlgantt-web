export type IssueStatus = '접수' | '검토' | '작업중' | '검수요청' | '완료' | '보류'
export type IssuePriority = 'low' | 'normal' | 'high' | 'urgent'
export type IssueSettlementStatus = '미정산' | '정산대상' | '정산완료' | '제외'

export interface IssueItem {
  id: string
  project_id: string
  related_task_id?: string
  import_sequence?: number
  issue_no: string
  title: string
  description?: string
  system_name?: string
  issue_type?: string
  status: IssueStatus
  legacy_status?: string
  priority: IssuePriority
  requester_name?: string
  request_source?: string
  external_requester?: string
  internal_owner_user_id?: string
  internal_owner_name?: string
  assignee_user_id?: string
  assignee_name?: string
  company_id?: string
  received_at?: string
  due_date?: string
  started_at?: string
  completed_at?: string
  estimated_effort: number
  actual_effort: number
  total_effort: number
  settlement_status: IssueSettlementStatus
  progress: number
  source_url?: string
  legacy_note?: string
  predecessor_issue_no?: string
  created_by?: string
  updated_by?: string
  created_at: string
  updated_at: string
}

export interface IssueComment {
  id: string
  project_id: string
  issue_id: string
  author_user_id?: string
  author_name?: string
  body: string
  commented_at: string
  created_at: string
}

export interface IssueWorkLog {
  id: string
  project_id: string
  issue_id: string
  worker_user_id?: string
  worker_name: string
  company_id?: string
  work_date: string
  hours: number
  body: string
  note?: string
  settlement_month?: string
  settled: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface IssueCategory {
  id: string
  project_id: string
  name: string
  sort_order: number
  created_at: string
}

export type IssueMemberRole = 'manager' | 'editor' | 'viewer'

export interface IssueMember {
  project_id: string
  user_id: string
  role: IssueMemberRole
  created_at: string
}

export interface IssueFilters {
  status?: IssueStatus | 'all'
  priority?: IssuePriority | 'all'
  assigneeUserId?: string | 'all'
  systemName?: string | 'all'
  hideDone?: boolean
  search?: string
}

export const ISSUE_STATUSES: IssueStatus[] = ['접수', '검토', '작업중', '검수요청', '완료', '보류']

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  접수: '접수',
  검토: '검토',
  작업중: '작업중',
  검수요청: '검수요청',
  완료: '완료',
  보류: '보류',
}

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: '낮음',
  normal: '보통',
  high: '높음',
  urgent: '긴급',
}

export function normalizeIssueStatus(value?: string | null): IssueStatus {
  if (!value) return '접수'
  if (value.includes('완료')) return '완료'
  if (value.includes('보류')) return '보류'
  if (value.includes('검수')) return '검수요청'
  if (value.includes('작업') || value.includes('공수정산')) return '작업중'
  if (value.includes('검토')) return '검토'
  return '접수'
}
