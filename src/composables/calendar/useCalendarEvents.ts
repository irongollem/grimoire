import { computed } from "vue";
import { type MaybeRef, unref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
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
    .eq("year", year)
    .order("month", { ascending: true, nullsFirst: true })
    .order("day", { ascending: true, nullsFirst: true });
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
    .gte("year", startYear)
    .lte("year", endYear)
    .order("year", { ascending: true })
    .order("month", { ascending: true, nullsFirst: true })
    .order("day", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return data as CalendarEvent[];
}

async function createCalendarEvent(event: CalendarEventInsert): Promise<CalendarEvent> {
  const user = getCurrentUser();
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
    queryKey: computed(() => [QUERY_KEY, campaignId.value, unref(year)] as const),
    queryFn: ({ queryKey: [, cid, y] }) => {
      if (cid === null) throw new Error("useCalendarEvents fetched without a campaign");
      return fetchEventsByYear(y, cid);
    },
    enabled: () => !!campaignId.value,
  });
}

export function usePlayerCalendarEventsRange(startYear: MaybeRef<number>, endYear: MaybeRef<number>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "player", "range", campaignId.value, unref(startYear), unref(endYear)] as const),
    queryFn: async ({ queryKey: [, , , cid, sy, ey] }) => {
      if (cid === null) throw new Error("usePlayerCalendarEventsRange fetched without a campaign");
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("campaign_id", cid)
        .gte("year", sy)
        .lte("year", ey)
        .or("player_visible.eq.true,event_type.eq.session")
        .order("year", { ascending: true })
        .order("month", { ascending: true, nullsFirst: true })
        .order("day", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data as CalendarEvent[];
    },
    enabled: () => !!campaignId.value,
  });
}

export function useCalendarEventsRange(startYear: MaybeRef<number>, endYear: MaybeRef<number>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "range", campaignId.value, unref(startYear), unref(endYear)] as const),
    queryFn: ({ queryKey: [, , cid, sy, ey] }) => {
      if (cid === null) throw new Error("useCalendarEventsRange fetched without a campaign");
      return fetchEventsByRange(sy, ey, cid);
    },
    enabled: () => !!campaignId.value,
  });
}

export function useEntityCalendarEvents(
  entityType: MaybeRef<LinkedEntityType>,
  entityId: MaybeRef<string | null>,
) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "entity", unref(entityType), unref(entityId)] as const),
    queryFn: async ({ queryKey: [, , type, id] }) => {
      if (id === null) throw new Error("useEntityCalendarEvents fetched without an entity id");
      const col =
        type === "quest"
          ? "linked_quest_id"
          : type === "encounter"
            ? "linked_encounter_id"
            : "linked_location_id";
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq(col, id)
        .order("year", { ascending: true })
        .order("month", { ascending: true, nullsFirst: true })
        .order("day", { ascending: true, nullsFirst: true });
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
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaign.activeCampaignId, variables.year] });
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

/** Fetch a single calendar event by its UUID. Returns null if deleted/not found. */
export function useCalendarEventById(id: MaybeRef<string | null>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-id", unref(id)] as const),
    queryFn: async ({ queryKey: [, , eventId] }) => {
      if (eventId === null) throw new Error("useCalendarEventById fetched without an id");
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data as CalendarEvent | null;
    },
    enabled: () => !!unref(id),
    staleTime: 1000 * 60 * 5,
  });
}
