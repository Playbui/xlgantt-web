import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { CalendarType } from '@/lib/types'
import { DEFAULT_KOREAN_HOLIDAYS } from '@/lib/calendar-calc'

export interface Holiday {
  id: string
  date: string
  name: string
}

export interface CalendarMeta {
  id?: string
  name: string
}

export type CalendarHolidays = Record<CalendarType, Holiday[]>
export type CalendarWorkingDays = Record<CalendarType, number[]>
export type CalendarMetaMap = Record<CalendarType, CalendarMeta>

interface CalendarState {
  holidays: CalendarHolidays
  workingDays: CalendarWorkingDays
  calendarMeta: CalendarMetaMap
  activeCalendarTab: CalendarType
  loadedProjectId: string | null
  isLoaded: boolean

  setActiveCalendarTab: (tab: CalendarType) => void
  loadCalendars: (projectId: string) => Promise<void>
  addHoliday: (calType: CalendarType, holiday: Omit<Holiday, 'id'>) => Promise<void>
  removeHoliday: (calType: CalendarType, id: string) => Promise<void>
  setWorkingDays: (calType: CalendarType, days: number[]) => Promise<void>
  setCalendarName: (calType: CalendarType, name: string) => Promise<void>
  setHolidays: (calType: CalendarType, holidays: Holiday[]) => Promise<void>
  migrateFromFlat: (flatHolidays: Array<{ date: string; name: string }>) => Promise<void>
  getHolidaySet: (calType: CalendarType) => Set<string>
  getWorkingDaysFor: (calType: CalendarType) => number[]
  getCalendarLabel: (calType: CalendarType) => string
}

const CALENDAR_TYPES: CalendarType[] = ['STD', 'UD1', 'UD2']
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]

function buildDefaultStdHolidayRows(): Holiday[] {
  return DEFAULT_KOREAN_HOLIDAYS.map((holiday) => ({
    id: crypto.randomUUID(),
    date: holiday.date,
    name: holiday.name,
  }))
}

function getDefaultMeta(): CalendarMetaMap {
  return {
    STD: { name: '표준' },
    UD1: { name: '사용자1' },
    UD2: { name: '사용자2' },
  }
}

function getDefaultHolidays(): CalendarHolidays {
  return {
    STD: buildDefaultStdHolidayRows(),
    UD1: [],
    UD2: [],
  }
}

function getDefaultWorkingDays(): CalendarWorkingDays {
  return {
    STD: [...DEFAULT_WORK_DAYS],
    UD1: [...DEFAULT_WORK_DAYS],
    UD2: [...DEFAULT_WORK_DAYS],
  }
}

type CalendarRow = {
  id: string
  calendar_type: CalendarType
  name: string
  working_days: number[] | null
}

type HolidayRow = {
  id: string
  calendar_id: string
  holiday_date: string
  name: string | null
  is_working: boolean
}

function sortHolidayRows(rows: Holiday[]): Holiday[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

function mergeHolidayRows(primary: Holiday[], fallback: Holiday[]): Holiday[] {
  const merged = new Map<string, Holiday>()

  for (const holiday of fallback) {
    merged.set(holiday.date, holiday)
  }

  for (const holiday of primary) {
    merged.set(holiday.date, holiday)
  }

  return sortHolidayRows([...merged.values()])
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  holidays: getDefaultHolidays(),
  workingDays: getDefaultWorkingDays(),
  calendarMeta: getDefaultMeta(),
  activeCalendarTab: 'STD',
  loadedProjectId: null,
  isLoaded: false,

  setActiveCalendarTab: (tab) => set({ activeCalendarTab: tab }),

  loadCalendars: async (projectId) => {
    if (!projectId) {
      set({
        holidays: getDefaultHolidays(),
        workingDays: getDefaultWorkingDays(),
        calendarMeta: getDefaultMeta(),
        loadedProjectId: null,
        isLoaded: true,
      })
      return
    }

    const { data: calendarRows, error: calendarError } = await supabase
      .from('calendars')
      .select('id, calendar_type, name, working_days')
      .eq('project_id', projectId)

    if (calendarError) {
      console.error('달력 로드 실패:', calendarError.message)
      set({
        holidays: getDefaultHolidays(),
        workingDays: getDefaultWorkingDays(),
        calendarMeta: getDefaultMeta(),
        loadedProjectId: projectId,
        isLoaded: true,
      })
      return
    }

    let resolvedCalendarRows = (calendarRows || []) as CalendarRow[]
    const calendarMap = new Map<CalendarType, CalendarRow>()
    for (const row of resolvedCalendarRows) {
      calendarMap.set(row.calendar_type, row)
    }

    if (calendarMap.size < CALENDAR_TYPES.length) {
      const defaultMeta = getDefaultMeta()
      const missingRows = CALENDAR_TYPES
        .filter((type) => !calendarMap.has(type))
        .map((type) => ({
          project_id: projectId,
          calendar_type: type,
          name: defaultMeta[type].name,
          working_days: [...DEFAULT_WORK_DAYS],
        }))

      if (missingRows.length > 0) {
        const { data: insertedRows, error: insertError } = await supabase
          .from('calendars')
          .upsert(missingRows, { onConflict: 'project_id,calendar_type' })
          .select('id, calendar_type, name, working_days')

        if (insertError) {
          console.error('기본 달력 생성 실패:', insertError.message)
        } else {
          resolvedCalendarRows = [
            ...resolvedCalendarRows.filter((row) => !missingRows.some((missing) => missing.calendar_type === row.calendar_type)),
            ...((insertedRows || []) as CalendarRow[]),
          ]
          calendarMap.clear()
          for (const row of resolvedCalendarRows) {
            calendarMap.set(row.calendar_type, row)
          }
        }
      }
    }

    const calendarIds = [...calendarMap.values()].map((row) => row.id)
    let holidayRows: HolidayRow[] = []

    if (calendarIds.length > 0) {
      const { data, error } = await supabase
        .from('holidays')
        .select('id, calendar_id, holiday_date, name, is_working')
        .in('calendar_id', calendarIds)

      if (error) {
        console.error('공휴일 로드 실패:', error.message)
      } else {
        holidayRows = (data || []) as HolidayRow[]
      }
    }

    const stdCalendarId = calendarMap.get('STD')?.id
    if (stdCalendarId) {
      const existingStdDates = new Set(
        holidayRows
          .filter((row) => row.calendar_id === stdCalendarId && !row.is_working)
          .map((row) => row.holiday_date)
      )

      const missingStdDefaults = DEFAULT_KOREAN_HOLIDAYS.filter((holiday) => !existingStdDates.has(holiday.date))

      if (missingStdDefaults.length > 0) {
        const { data: seededRows, error: seedError } = await supabase
          .from('holidays')
          .upsert(
            missingStdDefaults.map((holiday) => ({
              calendar_id: stdCalendarId,
              holiday_date: holiday.date,
              name: holiday.name,
              is_working: false,
            })),
            { onConflict: 'calendar_id,holiday_date' }
          )
          .select('id, calendar_id, holiday_date, name, is_working')

        if (seedError) {
          console.error('기본 공휴일 시드 실패:', seedError.message)
        } else {
          holidayRows = [
            ...holidayRows,
            ...((seededRows || []) as HolidayRow[]),
          ]
        }
      }
    }

    const defaultMeta = getDefaultMeta()
    const nextMeta = getDefaultMeta()
    const nextWorkingDays = getDefaultWorkingDays()
    const nextHolidays: CalendarHolidays = { STD: [], UD1: [], UD2: [] }

    for (const calType of CALENDAR_TYPES) {
      const row = calendarMap.get(calType)
      if (row) {
        nextMeta[calType] = {
          id: row.id,
          name: row.name?.trim() || defaultMeta[calType].name,
        }
        nextWorkingDays[calType] = Array.isArray(row.working_days) && row.working_days.length > 0
          ? [...row.working_days].sort((a, b) => a - b)
          : [...DEFAULT_WORK_DAYS]
      }
    }

    for (const row of holidayRows) {
      if (row.is_working) continue
      const calendarType = CALENDAR_TYPES.find((type) => nextMeta[type].id === row.calendar_id)
      if (!calendarType) continue
      nextHolidays[calendarType].push({
        id: row.id,
        date: row.holiday_date,
        name: row.name || '공휴일',
      })
    }

    nextHolidays.STD = mergeHolidayRows(nextHolidays.STD, buildDefaultStdHolidayRows())

    set({
      holidays: {
        STD: sortHolidayRows(nextHolidays.STD),
        UD1: sortHolidayRows(nextHolidays.UD1),
        UD2: sortHolidayRows(nextHolidays.UD2),
      },
      workingDays: nextWorkingDays,
      calendarMeta: nextMeta,
      loadedProjectId: projectId,
      isLoaded: true,
    })
  },

  addHoliday: async (calType, holiday) => {
    const projectId = get().loadedProjectId
    const calendarId = get().calendarMeta[calType].id
    if (!projectId || !calendarId) return

    const optimistic: Holiday = {
      id: crypto.randomUUID(),
      date: holiday.date,
      name: holiday.name,
    }

    set((state) => ({
      holidays: {
        ...state.holidays,
        [calType]: sortHolidayRows([...state.holidays[calType], optimistic]),
      },
    }))

    const { data, error } = await supabase
      .from('holidays')
      .upsert({
        calendar_id: calendarId,
        holiday_date: holiday.date,
        name: holiday.name,
        is_working: false,
      }, { onConflict: 'calendar_id,holiday_date' })
      .select('id, holiday_date, name, calendar_id, is_working')
      .single()

    if (error) {
      console.error('공휴일 저장 실패:', error.message)
      await get().loadCalendars(projectId)
      return
    }

    const saved = data as HolidayRow
    set((state) => ({
      holidays: {
        ...state.holidays,
        [calType]: sortHolidayRows(
          state.holidays[calType].map((item) =>
            item.id === optimistic.id
              ? { id: saved.id, date: saved.holiday_date, name: saved.name || holiday.name }
              : item
          )
        ),
      },
    }))
  },

  removeHoliday: async (calType, id) => {
    const projectId = get().loadedProjectId
    const before = get().holidays[calType]
    set((state) => ({
      holidays: {
        ...state.holidays,
        [calType]: state.holidays[calType].filter((holiday) => holiday.id !== id),
      },
    }))

    const { error } = await supabase.from('holidays').delete().eq('id', id)
    if (error) {
      console.error('공휴일 삭제 실패:', error.message)
      if (projectId) {
        await get().loadCalendars(projectId)
      } else {
        set((state) => ({
          holidays: {
            ...state.holidays,
            [calType]: before,
          },
        }))
      }
    }
  },

  setWorkingDays: async (calType, days) => {
    const projectId = get().loadedProjectId
    const calendarId = get().calendarMeta[calType].id
    const nextDays = [...days].sort((a, b) => a - b)

    set((state) => ({
      workingDays: {
        ...state.workingDays,
        [calType]: nextDays,
      },
    }))

    if (!projectId || !calendarId) return

    const { error } = await supabase
      .from('calendars')
      .update({ working_days: nextDays })
      .eq('id', calendarId)

    if (error) {
      console.error('근무요일 저장 실패:', error.message)
      await get().loadCalendars(projectId)
    }
  },

  setCalendarName: async (calType, name) => {
    const projectId = get().loadedProjectId
    const calendarId = get().calendarMeta[calType].id
    const trimmedName = name.trim()
    if (!trimmedName) return

    set((state) => ({
      calendarMeta: {
        ...state.calendarMeta,
        [calType]: {
          ...state.calendarMeta[calType],
          name: trimmedName,
        },
      },
    }))

    if (!projectId || !calendarId) return

    const { error } = await supabase
      .from('calendars')
      .update({ name: trimmedName })
      .eq('id', calendarId)

    if (error) {
      console.error('달력 이름 저장 실패:', error.message)
      await get().loadCalendars(projectId)
    }
  },

  setHolidays: async (calType, holidays) => {
    set((state) => ({
      holidays: {
        ...state.holidays,
        [calType]: sortHolidayRows(holidays),
      },
    }))
  },

  migrateFromFlat: async (flatHolidays) => {
    await get().setHolidays('STD', flatHolidays.map((item) => ({
      id: crypto.randomUUID(),
      date: item.date,
      name: item.name,
    })))
  },

  getHolidaySet: (calType) => new Set(get().holidays[calType].map((holiday) => holiday.date)),
  getWorkingDaysFor: (calType) => get().workingDays[calType],
  getCalendarLabel: (calType) => get().calendarMeta[calType].name || calType,
}))
