import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { CalendarEvent, CalendarEventInsert, CalendarEventUpdate } from '@/types/calendar.types'

const QUERY_KEY = 'calendar-events'

async function fetchEventsByYear(year: number): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('harptos_year', year)
    .order('harptos_month', { ascending: true })
  if (error) throw error
  return data as CalendarEvent[]
}

async function createCalendarEvent(event: CalendarEventInsert): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert(event)
    .select()
    .single()
  if (error) throw error
  return data as CalendarEvent
}

async function updateCalendarEvent(id: string, update: CalendarEventUpdate): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as CalendarEvent
}

async function deleteCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw error
}

export function useCalendarEvents(year: number) {
  return useQuery({
    queryKey: [QUERY_KEY, year],
    queryFn: () => fetchEventsByYear(year),
  })
}

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createCalendarEvent,
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, variables.harptos_year] }),
  })
}

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: CalendarEventUpdate }) =>
      updateCalendarEvent(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteCalendarEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })
}
