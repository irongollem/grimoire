import type { CalendarAdapter } from '@/types/calendar.types'
import { faerunAdapter } from './faerun'

// Registry — add new adapters here. The key must match CalendarAdapter.id.
// Future: import { greyhawkAdapter } from './greyhawk'
// Future: import { dragonlanceAdapter } from './dragonlance'
export const CALENDAR_REGISTRY: Record<string, CalendarAdapter> = {
  faerun: faerunAdapter,
}

export function getCalendarAdapter(id: string): CalendarAdapter {
  return CALENDAR_REGISTRY[id] ?? faerunAdapter
}

export function listCalendarAdapters(): CalendarAdapter[] {
  return Object.values(CALENDAR_REGISTRY)
}

export { faerunAdapter }
