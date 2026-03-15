import { computed } from "vue";
import { type MaybeRef, unref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type {
  CalendarEvent,
  CalendarEventInsert,
  CalendarEventUpdate,
  LinkedEntityType,
} from "@/types/calendar.types";

const QUERY_KEY = "calendar-events";

async function fetchEventsByYear(year: number, campaignId: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("harptos_year", year)
    .order("harptos_month", { ascending: true, nullsFirst: true })
    .order("harptos_day", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return data as CalendarEvent[];
}

async function fetchEventsByRange(
  startYear: number,
  endYear: number,
  campaignId: string,
): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("campaign_id", campaignId)
    .gte("harptos_year", startYear)
    .lte("harptos_year", endYear)
    .order("harptos_year", { ascending: true })
    .order("harptos_month", { ascending: true, nullsFirst: true })
    .order("harptos_day", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return data as CalendarEvent[];
}

async function createCalendarEvent(event: CalendarEventInsert): Promise<CalendarEvent> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({ ...event, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as CalendarEvent;
}

async function updateCalendarEvent(
  id: string,
  update: CalendarEventUpdate,
): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from("calendar_events")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CalendarEvent;
}

async function deleteCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) throw error;
}

export function useCalendarEvents(year: MaybeRef<number>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value, unref(year)]),
    queryFn: () => fetchEventsByYear(unref(year), campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useCalendarEventsRange(startYear: MaybeRef<number>, endYear: MaybeRef<number>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "range", campaignId.value, unref(startYear), unref(endYear)]),
    queryFn: () => fetchEventsByRange(unref(startYear), unref(endYear), campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useEntityCalendarEvents(
  entityType: MaybeRef<LinkedEntityType>,
  entityId: MaybeRef<string | null>,
) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "entity", unref(entityType), unref(entityId)]),
    queryFn: async () => {
      const id = unref(entityId);
      const type = unref(entityType);
      const col =
        type === "quest"
          ? "linked_quest_id"
          : type === "encounter"
            ? "linked_encounter_id"
            : "linked_location_id";
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq(col, id!)
        .order("harptos_year", { ascending: true })
        .order("harptos_month", { ascending: true, nullsFirst: true })
        .order("harptos_day", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data as CalendarEvent[];
    },
    enabled: () => !!unref(entityId),
  });
}

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (event: CalendarEventInsert) =>
      createCalendarEvent({ ...event, campaign_id: campaign.activeCampaignId! }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaign.activeCampaignId, variables.harptos_year] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "range"] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "entity"] });
    },
  });
}

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: CalendarEventUpdate }) =>
      updateCalendarEvent(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCalendarEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
