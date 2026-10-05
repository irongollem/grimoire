import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Background, BackgroundInsert, BackgroundUpdate } from "@/types/background.types";
import { deleteUnreferencedByPublicUrl } from "@/lib/storage";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useLibrarySourceSlugs } from "@/composables/library/useEnabledSources";
import { isUuid } from "@/lib/library/contentIdentity";
// The split is by id shape, not by species: a uuid is a custom row, a slug is a library row.
import { indexById, splitSpeciesIds as splitIdsByStore } from "@/lib/library/speciesLookup";
import { mergeLibraryWithCustom } from "@/lib/library/libraryShadow";
import type { RulesetKey } from "@/types/ruleset.types";

const QUERY_KEY = "backgrounds";
const BY_IDS_KEY = "backgrounds-by-ids";
const LIBRARY_QUERY_KEY = "library-backgrounds";

/**
 * `party_members.background_id` is text and holds either a custom background uuid
 * or a shared `library_backgrounds` slug (epic #973). Library rows are read-only
 * everywhere: they are written only by an admin, through the seed script.
 */
export function isLibraryBackground(background: Pick<Background, "id">): boolean {
  return !isUuid(background.id);
}

/** A `library_backgrounds` row in the shape the custom table's rows have. It has no owner. */
export function backgroundFromLibraryRow(row: Omit<Background, "user_id">): Background {
  return { ...row, user_id: "" };
}

async function fetchCustomBackgrounds(ruleset: RulesetKey): Promise<Background[]> {
  const { data, error } = await supabase
    .from("backgrounds")
    .select("*")
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Background[];
}

async function fetchLibraryBackgrounds(enabledSlugs: string[], ruleset: RulesetKey): Promise<Background[]> {
  if (enabledSlugs.length === 0) return [];
  const { data, error } = await supabase
    .from("library_backgrounds")
    .select("*")
    .in("source", enabledSlugs)
    .eq("ruleset", ruleset)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => backgroundFromLibraryRow(row as Omit<Background, "user_id">));
}

async function fetchBackground(id: string): Promise<Background> {
  if (isUuid(id)) {
    const { data, error } = await supabase.from("backgrounds").select("*").eq("id", id).single();
    if (error) throw error;
    return data as Background;
  }
  const { data, error } = await supabase.from("library_backgrounds").select("*").eq("id", id).single();
  if (error) throw error;
  return backgroundFromLibraryRow(data as Omit<Background, "user_id">);
}

async function createBackground(bg: BackgroundInsert): Promise<Background> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("backgrounds")
    .insert({ ...bg, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Background;
}

async function updateBackground(id: string, update: BackgroundUpdate): Promise<Background> {
  const { data, error } = await supabase
    .from("backgrounds")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Background;
}

async function deleteBackground(bg: Background): Promise<void> {
  const { error } = await supabase.from("backgrounds").delete().eq("id", bg.id);
  if (error) throw error;
  // By URL rather than by bucket: older art sits in asset-images, newer in
  // background-images (#978). And only when nothing else still points at it.
  await deleteUnreferencedByPublicUrl({ urls: [bg.image_url] });
}

/**
 * The backgrounds on offer: the library's entries from the books this scope reads
 * (in the scope's edition), plus the user's own. A custom row with the same book
 * identity as a library row shadows it, so a customised copy shows once.
 */
export function useBackgrounds() {
  const { ruleset } = useRuleset();
  const customQuery = useQuery({
    queryKey: computed(() => [QUERY_KEY, ruleset.value] as const),
    queryFn: ({ queryKey: [, rs] }) => fetchCustomBackgrounds(rs),
    staleTime: Infinity,
  });
  const { slugs: enabledSlugs, isLoading: sourcesLoading } = useLibrarySourceSlugs();
  const libraryQuery = useQuery({
    queryKey: computed(() => [LIBRARY_QUERY_KEY, enabledSlugs.value, ruleset.value] as const),
    queryFn: ({ queryKey: [, slugs, rs] }) => {
      if (slugs === null) throw new Error("useBackgrounds fetched without enabled sources");
      return fetchLibraryBackgrounds(slugs, rs);
    },
    enabled: () => enabledSlugs.value !== null,
    staleTime: Infinity,
  });

  const data = computed<Background[]>(() =>
    mergeLibraryWithCustom(libraryQuery.data.value ?? [], customQuery.data.value ?? []),
  );
  const isLoading = computed(
    () => customQuery.isLoading.value || sourcesLoading.value || libraryQuery.isLoading.value,
  );
  return { data, isLoading };
}

/** Background rows by id from both stores, whatever edition they belong to. */
async function fetchBackgroundsByIds(libraryIds: string[], customIds: string[]): Promise<Background[]> {
  const [library, custom] = await Promise.all([
    libraryIds.length === 0
      ? Promise.resolve<Background[]>([])
      : supabase
          .from("library_backgrounds")
          .select("*")
          .in("id", libraryIds)
          .then(({ data, error }) => {
            if (error) throw error;
            return (data ?? []).map((row) => backgroundFromLibraryRow(row as Omit<Background, "user_id">));
          }),
    customIds.length === 0
      ? Promise.resolve<Background[]>([])
      : supabase
          .from("backgrounds")
          .select("*")
          .in("id", customIds)
          .then(({ data, error }) => {
            if (error) throw error;
            return (data ?? []) as Background[];
          }),
  ]);
  return [...library, ...custom];
}

/**
 * The backgrounds these characters actually have, resolved by id and NOT filtered
 * by edition. `useBackgrounds` lists what is offered in the scope's edition, so a
 * lookup of what a character already has must not go through it (epic #943).
 */
export function useBackgroundsByIds(ids: MaybeRefOrGetter<readonly (string | null | undefined)[]>) {
  const split = computed(() => splitIdsByStore(toValue(ids)));
  const query = useQuery({
    queryKey: computed(() => [BY_IDS_KEY, split.value.libraryIds, split.value.customIds] as const),
    queryFn: ({ queryKey: [, libraryIds, customIds] }) => fetchBackgroundsByIds(libraryIds, customIds),
    enabled: () => split.value.libraryIds.length + split.value.customIds.length > 0,
    staleTime: Infinity,
  });
  const data = computed(() => indexById(query.data.value ?? []));
  return { data, isLoading: query.isLoading };
}

/** Returns a Map<background_id, background_name> for the given characters' backgrounds. */
export function useBackgroundNameMap(ids: MaybeRefOrGetter<readonly (string | null | undefined)[]>) {
  const { data } = useBackgroundsByIds(ids);
  return computed(() => {
    const m = new Map<string, string>();
    for (const [id, bg] of data.value) m.set(id, bg.name);
    return m;
  });
}

/** Resolves against BOTH stores: the id may be a custom background uuid or a library slug. */
export function useBackground(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value] as const),
    queryFn: ({ queryKey: [, bgId] }) => fetchBackground(bgId),
    enabled: () => !!id.value,
  });
}

export function useCreateBackground() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBackground,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateBackground() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: BackgroundUpdate }) =>
      updateBackground(id, update),
    onSuccess: (_d, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
      queryClient.invalidateQueries({ queryKey: [BY_IDS_KEY] });
    },
  });
}

export function useDeleteBackground() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBackground,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [BY_IDS_KEY] });
    },
  });
}
