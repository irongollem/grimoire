import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { Location, LocationInsert, LocationUpdate } from "@/types/location.types";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
