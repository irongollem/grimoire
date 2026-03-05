import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getCalendarAdapter, listCalendarAdapters } from '@/calendars/index'
import type { CalendarAdapter } from '@/types/calendar.types'

export const useCalendarStore = defineStore('calendar', () => {
  // Which calendar system is active (per campaign, defaults to Faerûn)
  const activeCalendarId = ref<string>('faerun')

  // Current view position
  const currentYear = ref<number>(1495)   // Dale Reckoning default
  const currentMonth = ref<number>(1)

  const adapter = computed<CalendarAdapter>(() =>
    getCalendarAdapter(activeCalendarId.value)
  )

  const availableCalendars = computed(() => listCalendarAdapters())

  function setCalendar(id: string) {
    const cal = getCalendarAdapter(id)
    activeCalendarId.value = cal.id
    currentYear.value = cal.defaultYear
    currentMonth.value = 1
  }

  function prevMonth() {
    if (currentMonth.value === 1) {
      currentMonth.value = adapter.value.months.length
      currentYear.value--
    } else {
      currentMonth.value--
    }
  }

  function nextMonth() {
    if (currentMonth.value === adapter.value.months.length) {
      currentMonth.value = 1
      currentYear.value++
    } else {
      currentMonth.value++
    }
  }

  function goToYear(year: number) {
    currentYear.value = year
  }

  return {
    activeCalendarId,
    currentYear,
    currentMonth,
    adapter,
    availableCalendars,
    setCalendar,
    prevMonth,
    nextMonth,
    goToYear,
  }
})
