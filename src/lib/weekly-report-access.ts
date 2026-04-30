import type { User } from '@/stores/auth-store'

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
