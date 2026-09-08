import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { DungeonFeature, DungeonFeatureInsert, DungeonFeatureUpdate } from "@/types/dungeonFeature.types";
import { removeStorageImages } from "@/composables/useImageUpload";
import { DUNGEON_FEATURE_TEMPLATES } from "@/data/dungeonFeatureTemplates";
import { allowedCampaignScoped } from "@/lib/campaignContentGating";
import { useCampaignStore } from "@/stores/campaign";
import type { Ref } from "vue";
import { computed, isRef, ref } from "vue";
import { storeToRefs } from "pinia";

// Matches the table name exactly — `useDeleteCampaign` invalidates every
// HOMEBREW_TABLES entry by that literal string (see useCampaigns.ts), so a
// query key that drifts from the table name silently stops being refreshed
// after a promote/delete disposition.
const QUERY_KEY = "dungeon_features";

async function fetchDungeonFeatures(): Promise<DungeonFeature[]> {
  const { data, error } = await supabase
    .from("dungeon_features")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as DungeonFeature[];
}

async function fetchDungeonFeature(id: string): Promise<DungeonFeature | null> {
  const { data, error } = await supabase
    .from("dungeon_features")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as DungeonFeature | null;
}

export interface UseDungeonFeaturesOptions {
  /** When true, return every dungeon feature regardless of campaign scope.
   *  Required by any caller resolving an ALREADY-STORED feature id — e.g. a
   *  puzzle's `dungeon_feature_id` anchor outlives the scoping decision, and
   *  a scoped-away feature must still resolve or it vanishes from a puzzle
   *  it was built around (#800). Default false: scoped to general + active
   *  campaign, for browsing. */
  includeAllScopes?: boolean;
}

async function createDungeonFeature(feature: DungeonFeatureInsert): Promise<DungeonFeature> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("dungeon_features")
    .insert({ ...feature, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as DungeonFeature;
}

async function updateDungeonFeature(id: string, update: DungeonFeatureUpdate): Promise<DungeonFeature> {
  const { data, error } = await supabase
    .from("dungeon_features")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as DungeonFeature;
}

async function deleteDungeonFeature(feature: DungeonFeature): Promise<void> {
  const { error } = await supabase.from("dungeon_features").delete().eq("id", feature.id);
  if (error) throw error;
  await removeStorageImages("asset-images", feature.image_url);
}

/** Null-means-global scoping (#800), same rule as `useMonsters`/`useTraps`:
 *  features with `campaign_id === null` are available everywhere, plus
 *  whatever is scoped to the active campaign. */
export function useDungeonFeatures(getOptions?: () => UseDungeonFeaturesOptions) {
  const query = useQuery({ queryKey: [QUERY_KEY], queryFn: fetchDungeonFeatures });
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const data = computed(() => {
    const features = query.data.value;
    if (!features || getOptions?.().includeAllScopes) return features;
    return allowedCampaignScoped(features, activeCampaignId.value);
  });
  return { ...query, data };
}

export function useDungeonFeature(id: string | Ref<string>) {
  const resolved = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, resolved.value]),
    queryFn: () => fetchDungeonFeature(resolved.value),
    enabled: () => !!resolved.value,
  });
}

export function useCreateDungeonFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDungeonFeature,
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateDungeonFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: DungeonFeatureUpdate }) =>
      updateDungeonFeature(id, update),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteDungeonFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDungeonFeature,
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: [QUERY_KEY, id] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Bulk-insert template features that don't already exist (matched by name). Returns inserted count. */
export function usePopulateDungeonFeatures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");

      const { data: existing, error: fetchError } = await supabase
        .from("dungeon_features")
        .select("name");
      if (fetchError) throw fetchError;

      const existingNames = new Set(
        (existing ?? []).map((f: { name: string }) => f.name.toLowerCase()),
      );

      // Global (null), not the active campaign: these are generic templates,
      // and the not-already-present check above spans the DM's whole
      // collection. Scope them and a second campaign's "Populate" would find
      // the names taken and seed nothing.
      const toInsert = DUNGEON_FEATURE_TEMPLATES
        .filter((f) => !existingNames.has(f.name.toLowerCase()))
        .map((f) => ({ ...f, user_id: user.id, campaign_id: null, image_url: null, image_focal_point: null }));

      if (!toInsert.length) return 0;

      const { error } = await supabase.from("dungeon_features").insert(toInsert);
      if (error) throw error;

      return toInsert.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
