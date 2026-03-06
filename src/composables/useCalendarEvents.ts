import { computed } from 'vue'
import { type MaybeRef, unref } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { CalendarEvent, CalendarEventInsert, CalendarEventUpdate } from '@/types/calendar.types'

const QUERY_KEY = 'calendar-events'

async function fetchEventsByYear(year: number): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('harptos_year', year)
    .order('harptos_month', { ascending: true, nullsFirst: true })
    .order('harptos_day', { ascending: true, nullsFirst: true })
  if (error) throw error
  return data as CalendarEvent[]
}

async function fetchEventsByRange(startYear: number, endYear: number): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .gte('harptos_year', startYear)
    .lte('harptos_year', endYear)
    .order('harptos_year', { ascending: true })
    .order('harptos_month', { ascending: true, nullsFirst: true })
    .order('harptos_day', { ascending: true, nullsFirst: true })
  if (error) throw error
  return data as CalendarEvent[]
}

async function createCalendarEvent(event: CalendarEventInsert): Promise<CalendarEvent> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({ ...event, user_id: user!.id })
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

export function useCalendarEvents(year: MaybeRef<number>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, unref(year)]),
    queryFn: () => fetchEventsByYear(unref(year)),
  })
}

export function useCalendarEventsRange(startYear: MaybeRef<number>, endYear: MaybeRef<number>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, 'range', unref(startYear), unref(endYear)]),
    queryFn: () => fetchEventsByRange(unref(startYear), unref(endYear)),
  })
}

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createCalendarEvent,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, variables.harptos_year] })
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, 'range'] })
    },
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
