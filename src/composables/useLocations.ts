import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { Location, LocationInsert, LocationUpdate } from "@/types/location.types";
import { SETTING_LOCATIONS } from "@/data/settingLocations";

const QUERY_KEY = "locations";

async function fetchLocations(campaignId: string, parentId: string | null): Promise<Location[]> {
  let query = supabase
    .from("locations")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });

  if (parentId === null) {
    query = query.is("parent_id", null);
  } else {
    query = query.eq("parent_id", parentId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Location[];
}

async function fetchAllLocations(campaignId: string): Promise<Location[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Location[];
}

async function fetchLocation(id: string): Promise<Location> {
  const { data, error } = await supabase.from("locations").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Location;
}

async function createLocation(loc: LocationInsert): Promise<Location> {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from("locations")
    .insert({ ...loc, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Location;
}

async function updateLocation(id: string, update: LocationUpdate): Promise<Location> {
  const { data, error } = await supabase
    .from("locations")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Location;
}

async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) throw error;
}

// ── Public composables ─────────────────────────────────────────────────────────

/** List root locations (parent_id IS NULL) or children of a specific parent. */
export function useLocations(parentId: string | null = null) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value, parentId]),
    queryFn: () => fetchLocations(campaignId.value!, parentId),
    enabled: () => !!campaignId.value,
  });
}

/** All locations in the campaign (flat list, for insert panel / search). */
export function useAllLocations() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value, "all"]),
    queryFn: () => fetchAllLocations(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useLocation(id: string | Ref<string>) {
  const idRef = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value]),
    queryFn: () => fetchLocation(idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (loc: Omit<LocationInsert, "campaign_id">) =>
      createLocation({ ...loc, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: LocationUpdate }) =>
      updateLocation(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLocation,
    onSuccess: (_data, id) => {
      // Remove the specific location query first so the still-mounted detail
      // view doesn't trigger a refetch (which would return 406 and retry-loop).
      queryClient.removeQueries({ queryKey: [QUERY_KEY, id] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Bulk-insert preset locations for the active campaign's setting. Returns inserted count.
 *  Two-pass: inserts all new locations first, then resolves parent_id links by name. */
export function usePopulateLocations() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign");

      const { data: campaignRow, error: campaignError } = await supabase
        .from("campaigns")
        .select("calendar_id")
        .eq("id", campaignId)
        .single();
      if (campaignError) throw campaignError;

      const calendarId: string = campaignRow?.calendar_id ?? "faerun";
      const presets = SETTING_LOCATIONS[calendarId] ?? SETTING_LOCATIONS["faerun"] ?? [];
      if (!presets.length) return 0;

      const user = await getCurrentUser();

      // Fetch existing locations (id + name) for dedup and parent resolution
      const { data: existing, error: fetchError } = await supabase
        .from("locations")
        .select("id, name")
        .eq("campaign_id", campaignId);
      if (fetchError) throw fetchError;

      const existingNameToId = new Map(
        (existing ?? []).map((l: { id: string; name: string }) => [l.name.toLowerCase(), l.id]),
      );

      // Pass 1 — insert all new locations (parent_id null for now)
      const toInsert = presets
        .filter((p) => !existingNameToId.has(p.name.toLowerCase()))
        .map(({ parent: _parent, ...p }) => ({
          ...p,
          campaign_id: campaignId,
          user_id: user!.id,
          parent_id: null as string | null,
          description: null,
          image_url: null,
        }));

      if (!toInsert.length) return 0;

      const { data: inserted, error: insertError } = await supabase
        .from("locations")
        .insert(toInsert)
        .select("id, name");
      if (insertError) throw insertError;

      // Pass 2 — resolve parent_id links by name
      // Build full name→id map: existing rows + just-inserted rows
      const nameToId = new Map(existingNameToId);
      for (const loc of inserted ?? []) {
        nameToId.set(loc.name.toLowerCase(), loc.id);
      }

      // Only patch parent_id for newly inserted rows that declare a parent
      const insertedNameToId = new Map(
        (inserted ?? []).map((l: { id: string; name: string }) => [l.name.toLowerCase(), l.id]),
      );
      const parentUpdates = presets
        .filter((p) => p.parent && insertedNameToId.has(p.name.toLowerCase()))
        .map((p) => ({
          id: insertedNameToId.get(p.name.toLowerCase())!,
          parent_id: nameToId.get(p.parent!.toLowerCase()),
        }))
        .filter((u): u is { id: string; parent_id: string } => !!(u.id && u.parent_id));

      if (parentUpdates.length) {
        await Promise.all(
          parentUpdates.map((u) =>
            supabase.from("locations").update({ parent_id: u.parent_id }).eq("id", u.id),
          ),
        );
      }

      return (inserted ?? []).length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
