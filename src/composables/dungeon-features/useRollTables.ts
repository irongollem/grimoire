import { computed, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { RollTable, RollTableInsert, RollTableUpdate } from "@/types/rollTable.types";
import { ROLL_TABLE_SEEDS } from "@/data/rollTableSeeds";

const QUERY_KEY = "roll_tables";

async function fetchRollTables(campaignId: string | null): Promise<RollTable[]> {
  let q = supabase.from("roll_tables").select("*").order("name", { ascending: true });
  if (campaignId) q = q.or(`campaign_id.eq.${campaignId},campaign_id.is.null`);
  else q = q.is("campaign_id", null);
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
    queryKey: computed(() => [QUERY_KEY, campaignId.value]),
    queryFn: () => fetchRollTables(campaignId.value),
    staleTime: 30_000,
  });
}

export function useRollTable(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchRollTable(id.value),
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

/**
 * Idempotent seed of example tables — skips by `name` so re-running just adds
 * what's missing. Tables are inserted with `campaign_id = activeCampaignId`
 * so they only show up in the campaign the DM ran the populate from.
 */
export function usePopulateRollTables() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign");
      const user = getCurrentUser();

      const { data: existing, error: fetchErr } = await supabase
        .from("roll_tables")
        .select("name")
        .eq("user_id", user!.id);
      if (fetchErr) throw fetchErr;
      const haveNames = new Set((existing ?? []).map((r: { name: string }) => r.name.toLowerCase()));

      const toInsert = ROLL_TABLE_SEEDS
        .filter((s) => !haveNames.has(s.name.toLowerCase()))
        .map((s) => ({
          ...s,
          user_id: user!.id,
          campaign_id: campaignId,
        }));
      if (!toInsert.length) return 0;

      const { error: insertErr } = await supabase.from("roll_tables").insert(toInsert);
      if (insertErr) throw insertErr;
      return toInsert.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
