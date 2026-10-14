import { computed, toValue, type MaybeRefOrGetter, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { campaignScopeFilter } from "@/composables/campaign/campaignLibraryScope";
import type { LibraryRollTable, RollTable, RollTableInsert, RollTableUpdate } from "@/types/rollTable.types";
import { isLibraryId } from "@/lib/dungeon-features/library";
import { libraryRollTableToInsert } from "@/lib/dungeon-features/libraryCopy";

const QUERY_KEY = "roll_tables";

async function fetchRollTables(campaignId: string | null, ownerId: string | null): Promise<RollTable[]> {
  let q = supabase.from("roll_tables").select("*").order("name", { ascending: true });
  const user = getCurrentUser();
  if (!user) throw new Error("roll tables read without a signed-in user");
  q = q.or(campaignScopeFilter(campaignId, user.id, ownerId));
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RollTable[];
}

async function fetchRollTable(id: string): Promise<RollTable> {
  const { data, error } = await supabase.from("roll_tables").select("*").eq("id", id).single();
  if (error) throw error;
  return data as RollTable;
}

async function createRollTable(table: RollTableInsert): Promise<RollTable> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("roll_tables")
    .insert({ ...table, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as RollTable;
}

async function updateRollTable(id: string, update: RollTableUpdate): Promise<RollTable> {
  const { data, error } = await supabase
    .from("roll_tables")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as RollTable;
}

async function deleteRollTable(id: string): Promise<void> {
  const { error } = await supabase.from("roll_tables").delete().eq("id", id);
  if (error) throw error;
}

// ── Composables ─────────────────────────────────────────────────────────────

/** All roll tables visible in the active campaign (campaign-scoped + global). */
export function useRollTables() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value, campaign.activeCampaign?.user_id ?? null] as const),
    queryFn: ({ queryKey: [, cid, ownerId] }) => fetchRollTables(cid, ownerId),
    staleTime: 30_000,
  });
}

export function useRollTable(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value] as const),
    queryFn: ({ queryKey: [, tid] }) => fetchRollTable(tid),
    enabled: () => !!id.value,
  });
}

export function useCreateRollTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRollTable,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateRollTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: RollTableUpdate }) => updateRollTable(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteRollTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRollTable,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/**
 * Set of encounter IDs cited in any roll table the current user has access to.
 *
 * Used by `EncounterList` to widen the "Unassigned" filter — an encounter is
 * considered assigned if it's linked to at least one quest *or* one roll
 * table. The set is computed in JS rather than via a SQL query because
 * encounter IDs live inside the JSONB `entries` array.
 */
export function useEncountersInRollTables() {
  const tablesQuery = useRollTables();
  return computed<Set<string>>(() => {
    const ids = new Set<string>();
    for (const t of tablesQuery.data.value ?? []) {
      for (const e of t.entries) {
        if (e.encounter_id) ids.add(e.encounter_id);
      }
    }
    return ids;
  });
}

// ── Library (#1060) ─────────────────────────────────────────────────────────
// Roll tables are copied on use, so there is no merged index.

const LIBRARY_KEY = "library-roll-tables";
const LIBRARY_STALE_MS = 60 * 60 * 1000;

async function fetchLibraryRollTables(): Promise<LibraryRollTable[]> {
  const { data, error } = await supabase.from("library_roll_tables").select("*").order("name", { ascending: true });
  if (error) throw error;
  return data as LibraryRollTable[];
}

async function fetchLibraryRollTable(id: string): Promise<LibraryRollTable | null> {
  const { data, error } = await supabase.from("library_roll_tables").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as LibraryRollTable | null;
}

export function useLibraryRollTables() {
  return useQuery({ queryKey: [LIBRARY_KEY], queryFn: fetchLibraryRollTables, staleTime: LIBRARY_STALE_MS });
}

export function useLibraryRollTable(id: MaybeRefOrGetter<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => [LIBRARY_KEY, toValue(id) ?? null] as const),
    queryFn: ({ queryKey: [, rid] }) => fetchLibraryRollTable(rid!),
    enabled: () => {
      const v = toValue(id);
      return !!v && isLibraryId(v);
    },
    staleTime: LIBRARY_STALE_MS,
  });
}

/** "Use in campaign": copy a library roll table into the active campaign as the DM's own. */
export function useCopyLibraryRollTableToCampaign() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (table: LibraryRollTable): Promise<RollTable> => {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("Pick a campaign to use this roll table in.");
      return createRollTable(libraryRollTableToInsert(table, campaignId));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
