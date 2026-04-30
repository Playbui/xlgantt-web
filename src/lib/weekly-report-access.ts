import type { User } from '@/stores/auth-store'

export const WEEKLY_REPORT_TEAM_KEY = 'nav-comm-1'
export const WEEKLY_REPORT_TEAM_NAME = '항해통신1팀'

export interface WeeklyReportMember {
  email: string
  name: string
  role: 'manager' | 'member'
}

const WEEKLY_REPORT_ALLOWED_EMAILS = [
  'admin@gmtc.kr',
  'waterer@gmtc.kr',
  'sjw@gmtc.kr',
  'jack@gmtc.kr',
  'erichan@gmtc.kr',
  'juchen131@gmtc.kr',
  'leejh@gmtc.kr',
]

const WEEKLY_REPORT_MANAGER_EMAILS = [
  'admin@gmtc.kr',
  'waterer@gmtc.kr',
]

const WEEKLY_REPORT_MEMBERS: WeeklyReportMember[] = [
  { email: 'admin@gmtc.kr', name: '관리자', role: 'manager' },
  { email: 'waterer@gmtc.kr', name: '황준호', role: 'manager' },
  { email: 'sjw@gmtc.kr', name: '신진우', role: 'member' },
  { email: 'jack@gmtc.kr', name: '노재원', role: 'member' },
  { email: 'erichan@gmtc.kr', name: '한규혁', role: 'member' },
  { email: 'juchen131@gmtc.kr', name: '김주영', role: 'member' },
  { email: 'leejh@gmtc.kr', name: '이준혁', role: 'member' },
]

function normalizeEmail(email?: string | null) {
  return (email || '').trim().toLowerCase()
}

export function canAccessWeeklyReports(user: User | null | undefined) {
  if (!user) return false
  if (user.role === 'admin') return true
  return WEEKLY_REPORT_ALLOWED_EMAILS.includes(normalizeEmail(user.email))
}

export function canManageWeeklyReports(user: User | null | undefined) {
  if (!user) return false
  if (user.role === 'admin') return true
  return WEEKLY_REPORT_MANAGER_EMAILS.includes(normalizeEmail(user.email))
}

export function getWeeklyReportAllowedEmails() {
  return [...WEEKLY_REPORT_ALLOWED_EMAILS]
}

export function getWeeklyReportMembers() {
  return WEEKLY_REPORT_MEMBERS.map((member) => ({ ...member }))
}

export function getWeeklyReportMember(email?: string | null) {
  const normalized = normalizeEmail(email)
  return WEEKLY_REPORT_MEMBERS.find((member) => normalizeEmail(member.email) === normalized)
}
