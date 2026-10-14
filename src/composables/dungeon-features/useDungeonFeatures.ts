import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { DungeonFeature, DungeonFeatureEntry, DungeonFeatureInsert, DungeonFeatureUpdate, LibraryDungeonFeature } from "@/types/dungeonFeature.types";
import { deleteUnreferencedByPublicUrl } from "@/lib/storage";
import { allowedCampaignScoped } from "@/lib/campaignContentGating";
import { useCampaignStore } from "@/stores/campaign";
import { isLibraryId, shadowByName } from "@/lib/dungeon-features/library";
import { libraryFeatureToInsert } from "@/lib/dungeon-features/libraryCopy";
import type { MaybeRefOrGetter, Ref } from "vue";
import { computed, isRef, ref, toValue } from "vue";
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
  /** When false, hold the read. A picker that only shows in some states
   *  (Ways out's feature picker shows in Build) passes this so browsing a place
   *  does not fetch every feature in the campaign (#972). Default true. */
  enabled?: boolean;
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
  await deleteUnreferencedByPublicUrl({ urls: [feature.image_url] });
}

/** Null-means-global scoping (#800), same rule as `useMonsters`/`useTraps`:
 *  features with `campaign_id === null` are available everywhere, plus
 *  whatever is scoped to the active campaign. */
export function useDungeonFeatures(getOptions?: () => UseDungeonFeaturesOptions) {
  const query = useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchDungeonFeatures,
    enabled: () => getOptions?.().enabled ?? true,
  });
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
    queryKey: computed(() => [QUERY_KEY, resolved.value] as const),
    queryFn: ({ queryKey: [, fid] }) => fetchDungeonFeature(fid),
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

// ── Library (#1060) ─────────────────────────────────────────────────────────

const LIBRARY_KEY = "library-dungeon-features";
// Library rows change only by migration, so one fetch per hour is plenty.
const LIBRARY_STALE_MS = 60 * 60 * 1000;

async function fetchLibraryDungeonFeatures(): Promise<LibraryDungeonFeature[]> {
  const { data, error } = await supabase
    .from("library_dungeon_features")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as LibraryDungeonFeature[];
}

async function fetchLibraryDungeonFeature(id: string): Promise<LibraryDungeonFeature | null> {
  const { data, error } = await supabase.from("library_dungeon_features").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as LibraryDungeonFeature | null;
}

export function useLibraryDungeonFeatures(getOptions?: () => { enabled?: boolean }) {
  return useQuery({
    queryKey: [LIBRARY_KEY],
    queryFn: fetchLibraryDungeonFeatures,
    staleTime: LIBRARY_STALE_MS,
    enabled: () => getOptions?.().enabled ?? true,
  });
}

/** One library feature; held until `id` is a library id (a uuid is the DM's own). */
export function useLibraryDungeonFeature(id: MaybeRefOrGetter<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => [LIBRARY_KEY, toValue(id) ?? null] as const),
    queryFn: ({ queryKey: [, fid] }) => fetchLibraryDungeonFeature(fid!),
    enabled: () => {
      const v = toValue(id);
      return !!v && isLibraryId(v);
    },
    staleTime: LIBRARY_STALE_MS,
  });
}

/** Every feature a DM can pick: the library's, minus any the DM has an own
 *  copy of by name, plus all own features. The #972 `enabled` option holds both reads. */
export function useDungeonFeatureIndex(getOptions?: () => UseDungeonFeaturesOptions) {
  const own = useDungeonFeatures(getOptions);
  const library = useLibraryDungeonFeatures(getOptions);
  const data = computed<DungeonFeatureEntry[] | undefined>(() => {
    if (!own.data.value || !library.data.value) return undefined;
    return shadowByName(library.data.value, own.data.value);
  });
  // Resolving a STORED id must not shadow: an encounter or a room that cites the
  // library row still means that row when the DM also owns one of the same
  // name. So `data` is the pick list and `byId` resolves every id either way.
  const byId = computed(() => {
    const map = new Map<string, DungeonFeatureEntry>();
    for (const row of library.data.value ?? []) map.set(row.id, row);
    for (const row of own.data.value ?? []) map.set(row.id, row);
    return map;
  });
  return {
    data,
    byId,
    isLoading: computed(() => own.isLoading.value || library.isLoading.value),
    error: computed(() => own.error.value ?? library.error.value),
  };
}

/** Customize: copy a library feature into the DM's own features, scoped to the
 *  active campaign. Returns the new DungeonFeature. */
export function useCloneLibraryDungeonFeature() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  return useMutation({
    mutationFn: (feature: LibraryDungeonFeature): Promise<DungeonFeature> =>
      createDungeonFeature(libraryFeatureToInsert(feature, activeCampaignId.value)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
