import * as XLSX from 'xlsx'
import type { CalendarType, Task } from './types'

export interface WbsExcelRow {
  row_no: number
  wbs: string
  task_name: string
  is_group: boolean
  is_milestone: boolean
  planned_start?: string
  planned_end?: string
  total_workload?: number
  calendar_type: CalendarType
  remarks?: string
  deliverables?: string
  planned_progress_override?: number
  actual_progress_override?: number
}

export interface WbsExcelValidationResult {
  rows: WbsExcelRow[]
  errors: string[]
}

const LEVEL_HEADERS = ['WBS Lv1 *', 'WBS Lv2', 'WBS Lv3', 'WBS Lv4', 'WBS Lv5', 'WBS Lv6', 'WBS Lv7'] as const

const TEMPLATE_HEADERS = [
  ...LEVEL_HEADERS,
  '마일스톤(Y/N)',
  '계획시작일(YYYY-MM-DD)',
  '계획완료일(YYYY-MM-DD)',
  '작업량(M/D)',
  '달력(STD/UD1/UD2)',
  '비고',
  '산출물',
  '계획진척률(%)',
  '실적진척률(%)',
] as const

const TEMPLATE_SAMPLE = [
  ['주간보고', '', '', '', '', '', '', 'N', '2026-04-01', '2026-04-30', 5, 'STD', '상위 그룹', '주간보고 취합', '', ''],
  ['', '1주차', '', '', '', '', '', 'Y', '2026-04-03', '2026-04-03', 1, 'STD', '', '보고서', '', ''],
  ['', '2주차', '', '', '', '', '', 'Y', '2026-04-10', '2026-04-10', 1, 'STD', '', '보고서', '', ''],
  ['', '3주차', '', '', '', '', '', 'N', '2026-04-17', '2026-04-17', 1, 'STD', '', '', '', ''],
  ['', '', '임시', '', '', '', '', 'N', '2026-04-17', '2026-04-17', 0.5, 'STD', '', '', '', ''],
  ['', '', '완료', '', '', '', '', 'N', '2026-04-17', '2026-04-17', 0.5, 'STD', '', '', '', ''],
] as const

function normalizeString(value: unknown): string {
  return String(value ?? '').trim()
}

function parseYesNo(value: unknown): boolean {
  const normalized = normalizeString(value).toLowerCase()
  return ['y', 'yes', 'true', '1', '예'].includes(normalized)
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseOptionalProgress(value: unknown): number | undefined {
  const parsed = parseOptionalNumber(value)
  if (parsed == null) return undefined
  return parsed / 100
}

function getOutlineLevelAndName(raw: Record<string, unknown>): { level: number; taskName: string; outlineUsed: boolean; errors: string[] } {
  const filledLevels = LEVEL_HEADERS
    .map((header, index) => ({ index, value: normalizeString(raw[header]) }))
    .filter((item) => item.value)

  if (filledLevels.length === 0) {
    return { level: 0, taskName: '', outlineUsed: false, errors: [] }
  }

  if (filledLevels.length > 1) {
    return {
      level: 0,
      taskName: '',
      outlineUsed: true,
      errors: ['한 행에는 하나의 WBS 레벨 칸만 입력할 수 있습니다.'],
    }
  }

  return {
    level: filledLevels[0].index + 1,
    taskName: filledLevels[0].value,
    outlineUsed: true,
    errors: [],
  }
}

function isIsoDate(value?: string): boolean {
  if (!value) return true
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function compareWbs(a: string, b: string): number {
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)
  const maxLength = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < maxLength; i += 1) {
    const aValue = aParts[i] ?? -1
    const bValue = bParts[i] ?? -1
    if (aValue !== bValue) return aValue - bValue
  }
  return 0
}

export function downloadWbsExcelTemplate() {
  const workbook = XLSX.utils.book_new()

  const templateSheet = XLSX.utils.aoa_to_sheet([
    [...TEMPLATE_HEADERS],
    ...TEMPLATE_SAMPLE.map((row) => [...row]),
  ])

  const guideSheet = XLSX.utils.aoa_to_sheet([
    ['항목', '설명'],
    ['WBS Lv1~Lv7', '필수 입력은 각 행당 1칸입니다. 작업이 속한 레벨 칸에만 작업명을 입력하세요. WBS 번호는 시스템이 자동 계산합니다.'],
    ['마일스톤(Y/N)', '마일스톤이면 Y를 입력합니다.'],
    ['계획시작일/계획완료일', 'YYYY-MM-DD 형식으로 입력합니다.'],
    ['작업량(M/D)', '숫자만 입력합니다.'],
    ['달력(STD/UD1/UD2)', '비우면 STD로 처리됩니다.'],
    ['계획진척률(%)/실적진척률(%)', '0~100 숫자입니다. 입력하면 수동 override로 저장됩니다.'],
    ['주의', '레벨이 1 -> 3처럼 한 번에 점프하면 업로드가 거부됩니다.'],
  ])

  XLSX.utils.book_append_sheet(workbook, templateSheet, 'WBS_양식')
  XLSX.utils.book_append_sheet(workbook, guideSheet, '가이드')

  XLSX.writeFile(workbook, 'WBS_일괄등록_양식.xlsx')
}

export function parseWbsExcelFile(file: File): Promise<WbsExcelValidationResult> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[firstSheetName]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

    const errors: string[] = []
    const rows: WbsExcelRow[] = []
    const seenWbs = new Set<string>()
    const counters = Array<number>(LEVEL_HEADERS.length).fill(0)

    rawRows.forEach((raw, index) => {
      const rowNo = index + 2
      const outline = getOutlineLevelAndName(raw)
      const legacyWbs = normalizeString(raw['WBS'])
      const legacyTaskName = normalizeString(raw['작업명 *'] ?? raw['작업명'])
      const usingLegacy = !!legacyWbs || !!legacyTaskName
      const level = outline.outlineUsed ? outline.level : 0
      const task_name = outline.outlineUsed ? outline.taskName : legacyTaskName
      let wbs = ''
      const planned_start = normalizeString(raw['계획시작일(YYYY-MM-DD)']) || undefined
      const planned_end = normalizeString(raw['계획완료일(YYYY-MM-DD)']) || undefined
      const calendarValue = normalizeString(raw['달력(STD/UD1/UD2)']) || 'STD'
      const total_workload = parseOptionalNumber(raw['작업량(M/D)'])
      const planned_progress_override = parseOptionalProgress(raw['계획진척률(%)'])
      const actual_progress_override = parseOptionalProgress(raw['실적진척률(%)'])

      if (!outline.outlineUsed && !usingLegacy) return

      outline.errors.forEach((message) => errors.push(`${rowNo}행: ${message}`))

      if (outline.outlineUsed) {
        if (!task_name) errors.push(`${rowNo}행: 작업명은 WBS Lv 칸 중 하나에 입력해야 합니다.`)
        if (level > 1 && counters[level - 2] === 0) {
          errors.push(`${rowNo}행: 상위 레벨 없이 Lv${level}를 바로 입력할 수 없습니다.`)
        } else if (level > 0) {
          counters[level - 1] += 1
          for (let i = level; i < counters.length; i += 1) counters[i] = 0
          wbs = counters.slice(0, level).join('.')
        }
      } else {
        wbs = legacyWbs
        if (!wbs) errors.push(`${rowNo}행: WBS는 필수입니다.`)
        if (!task_name) errors.push(`${rowNo}행: 작업명은 필수입니다.`)
        if (wbs && !/^\d+(?:\.\d+)*$/.test(wbs)) errors.push(`${rowNo}행: WBS 형식이 올바르지 않습니다. 예: 1 / 1.2 / 1.2.1`)
      }

      if (wbs && seenWbs.has(wbs)) errors.push(`${rowNo}행: 중복된 WBS '${wbs}'가 있습니다.`)
      if (wbs) seenWbs.add(wbs)

      if (!isIsoDate(planned_start)) errors.push(`${rowNo}행: 계획시작일은 YYYY-MM-DD 형식이어야 합니다.`)
      if (!isIsoDate(planned_end)) errors.push(`${rowNo}행: 계획완료일은 YYYY-MM-DD 형식이어야 합니다.`)
      if (planned_start && planned_end && planned_start > planned_end) errors.push(`${rowNo}행: 계획완료일이 계획시작일보다 빠를 수 없습니다.`)

      if (total_workload != null && total_workload < 0) errors.push(`${rowNo}행: 작업량은 0 이상이어야 합니다.`)
      if (planned_progress_override != null && (planned_progress_override < 0 || planned_progress_override > 1)) errors.push(`${rowNo}행: 계획진척률은 0~100 사이여야 합니다.`)
      if (actual_progress_override != null && (actual_progress_override < 0 || actual_progress_override > 1)) errors.push(`${rowNo}행: 실적진척률은 0~100 사이여야 합니다.`)
      if (!['STD', 'UD1', 'UD2'].includes(calendarValue)) errors.push(`${rowNo}행: 달력은 STD, UD1, UD2 중 하나여야 합니다.`)

      rows.push({
        row_no: rowNo,
        wbs,
        task_name,
        is_group: false,
        is_milestone: parseYesNo(raw['마일스톤(Y/N)']),
        planned_start,
        planned_end,
        total_workload,
        calendar_type: calendarValue as CalendarType,
        remarks: normalizeString(raw['비고']) || undefined,
        deliverables: normalizeString(raw['산출물']) || undefined,
        planned_progress_override,
        actual_progress_override,
      })
    })

    const sorted = [...rows].sort((a, b) => compareWbs(a.wbs, b.wbs))
    const existingCodes = new Set(sorted.map((row) => row.wbs))

    sorted.forEach((row) => {
      const rowNo = row.row_no
      const parts = row.wbs.split('.')
      if (parts.length > 1) {
        const parentWbs = parts.slice(0, -1).join('.')
        if (!existingCodes.has(parentWbs)) {
          errors.push(`${rowNo}행: 부모 WBS '${parentWbs}'가 먼저 정의되어야 합니다.`)
        }
      }
    })

    return { rows: sorted, errors }
  })
}

export function buildTasksFromExcelRows(params: {
  projectId: string
  startSortOrder: number
  rows: WbsExcelRow[]
}): Task[] {
  const { projectId, startSortOrder, rows } = params
  const now = new Date().toISOString()
  const idByWbs = new Map<string, string>()
  const parentWbsSet = new Set<string>()

  rows.forEach((row) => {
    const parts = row.wbs.split('.')
    if (parts.length > 1) {
      parentWbsSet.add(parts.slice(0, -1).join('.'))
    }
  })

  return rows.map((row, index) => {
    const id = crypto.randomUUID()
    idByWbs.set(row.wbs, id)
    const parentWbs = row.wbs.includes('.') ? row.wbs.split('.').slice(0, -1).join('.') : undefined
    const level = row.wbs.split('.').length

    return {
      id,
      project_id: projectId,
      sort_order: startSortOrder + (index * 1000),
      wbs_code: row.wbs,
      wbs_level: level,
      is_group: row.is_group || parentWbsSet.has(row.wbs),
      task_name: row.task_name,
      remarks: row.remarks,
      planned_start: row.planned_start,
      planned_end: row.planned_end,
      total_workload: row.total_workload,
      calendar_type: row.calendar_type,
      deliverables: row.deliverables,
      planned_progress: row.planned_progress_override ?? 0,
      actual_progress: row.actual_progress_override ?? 0,
      planned_progress_override: row.planned_progress_override,
      actual_progress_override: row.actual_progress_override,
      is_milestone: row.is_milestone,
      parent_id: parentWbs ? idByWbs.get(parentWbs) : undefined,
      is_collapsed: false,
      created_at: now,
      updated_at: now,
    }
  })
}
