import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { LibraryTrap, Trap, TrapEntry, TrapInsert, TrapUpdate } from "@/types/trap.types";
import { deleteUnreferencedByPublicUrl } from "@/lib/storage";
import type { MaybeRefOrGetter, Ref } from "vue";
import { computed, isRef, ref, toValue } from "vue";
import { storeToRefs } from "pinia";
import { allowedCampaignScoped } from "@/lib/campaignContentGating";
import { useCampaignStore } from "@/stores/campaign";
import { isLibraryId, shadowByName } from "@/lib/dungeon-features/library";
import { libraryTrapToInsert } from "@/lib/dungeon-features/libraryCopy";

const QUERY_KEY = "traps";

async function fetchTraps(): Promise<Trap[]> {
  const { data, error } = await supabase
    .from("traps")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Trap[];
}

async function fetchTrap(id: string): Promise<Trap | null> {
  const { data, error } = await supabase.from("traps").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Trap | null;
}

async function createTrap(trap: TrapInsert): Promise<Trap> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("traps")
    .insert({ ...trap, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Trap;
}

async function updateTrap(id: string, update: TrapUpdate): Promise<Trap> {
  const { data, error } = await supabase.from("traps").update(update).eq("id", id).select().single();
  if (error) throw error;
  return data as Trap;
}

async function deleteTrap(trap: Trap): Promise<void> {
  const { error } = await supabase.from("traps").delete().eq("id", trap.id);
  if (error) throw error;
  // #917: a same-account campaign copy can point at this same image_url —
  // only remove the file if nothing else still references it.
  await deleteUnreferencedByPublicUrl({ urls: [trap.image_url] });
}

export interface UseTrapsOptions {
  /** When true, return every trap regardless of campaign scope. Required by
   *  any caller resolving an ALREADY-STORED trap id — `encounters.trap_ids`
   *  outlives the scoping decision, and a scoped-away trap must still resolve
   *  or it vanishes from an encounter that was built around it (#597).
   *  Default false: scoped to general + active campaign, for browsing. */
  includeAllScopes?: boolean;
}

export function useTraps(getOptions?: () => UseTrapsOptions) {
  const query = useQuery({ queryKey: [QUERY_KEY], queryFn: fetchTraps });
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const data = computed(() => {
    const traps = query.data.value;
    if (!traps || getOptions?.().includeAllScopes) return traps;
    return allowedCampaignScoped(traps, activeCampaignId.value);
  });
  return { ...query, data };
}

export function useTrap(id: string | Ref<string>) {
  const resolved = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, resolved.value] as const),
    queryFn: ({ queryKey: [, tid] }) => fetchTrap(tid),
    enabled: () => !!resolved.value,
  });
}

export function useCreateTrap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTrap,
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateTrap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: TrapUpdate }) => updateTrap(id, update),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteTrap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTrap,
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: [QUERY_KEY, id] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

// ── Library (#1060) ─────────────────────────────────────────────────────────

const LIBRARY_KEY = "library-traps";
// Library rows change only by migration, so one fetch per hour is plenty.
const LIBRARY_STALE_MS = 60 * 60 * 1000;

async function fetchLibraryTraps(): Promise<LibraryTrap[]> {
  const { data, error } = await supabase.from("library_traps").select("*").order("name", { ascending: true });
  if (error) throw error;
  return data as LibraryTrap[];
}

async function fetchLibraryTrap(id: string): Promise<LibraryTrap | null> {
  const { data, error } = await supabase.from("library_traps").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as LibraryTrap | null;
}

export function useLibraryTraps() {
  return useQuery({ queryKey: [LIBRARY_KEY], queryFn: fetchLibraryTraps, staleTime: LIBRARY_STALE_MS });
}

/** One library trap; held until `id` is a library id (a uuid is the DM's own). */
export function useLibraryTrap(id: MaybeRefOrGetter<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => [LIBRARY_KEY, toValue(id) ?? null] as const),
    queryFn: ({ queryKey: [, tid] }) => fetchLibraryTrap(tid!),
    enabled: () => {
      const v = toValue(id);
      return !!v && isLibraryId(v);
    },
    staleTime: LIBRARY_STALE_MS,
  });
}

/** Every trap a DM can pick (`data`): the library's, minus any the DM has an own copy
 *  of by name (see lib/dungeon-features/library.ts), plus all own traps. */
export function useTrapIndex(getOptions?: () => UseTrapsOptions) {
  const own = useTraps(getOptions);
  const library = useLibraryTraps();
  const data = computed<TrapEntry[] | undefined>(() => {
    if (!own.data.value || !library.data.value) return undefined;
    return shadowByName(library.data.value, own.data.value);
  });
  // Resolving a STORED id must not shadow: an encounter or a room that cites the
  // library row still means that row when the DM also owns one of the same
  // name. So `data` is the pick list and `byId` resolves every id either way.
  const byId = computed(() => {
    const map = new Map<string, TrapEntry>();
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

/** Customize: copy a library trap into the DM's own traps, scoped to the active
 *  campaign. Returns the new Trap. */
export function useCloneLibraryTrap() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  return useMutation({
    mutationFn: (trap: LibraryTrap): Promise<Trap> =>
      createTrap(libraryTrapToInsert(trap, activeCampaignId.value)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
