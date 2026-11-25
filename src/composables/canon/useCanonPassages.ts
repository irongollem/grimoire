import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { toast } from "@/lib/toast";
import { queueCanonEmbedding } from "@/lib/canon/queueCanonEmbedding";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import type { ClueKind } from "@/composables/canon/useCanonClues";
import type { CanonLorePassage } from "@/types/canon.types";
import { createCanonPassage, type NewCanonPassage } from "@/lib/canon/canonPassageWrites";

/**
 * Lore told in passages (#1226 story 5): the passages of every lore entry, read once for the whole campaign. Each is
 * told or not yet, and may come out at a place, a person or a beat (at most one of the three, as a clue does).
 */

/** A passage comes out at a place, a person or a beat; an item or a handout is where a clue lies, never a passage. */
const WHERE_COLUMN: Partial<Record<ClueKind, "location_id" | "npc_id" | "quest_beat_id">> = {
  location: "location_id",
  npc: "npc_id",
  quest_beat: "quest_beat_id",
};

/** Every passage of the campaign, scoped in the query: RLS only bounds who may read, it does not choose the campaign. */
export async function fetchCanonPassages(campaignId: string): Promise<CanonLorePassage[]> {
  const { data, error } = await supabase
    .from("canon_lore_passages")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as CanonLorePassage[];
}

export async function deleteCanonPassage(id: string): Promise<void> {
  // RLS answers a refused delete with no error and no row, so the row is asked for back.
  const { data, error } = await supabase.from("canon_lore_passages").delete().eq("id", id).select("id, entry_id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That passage is gone, or you may not delete it.");
  // The entry's vector folds its passages in, so one less passage changes what it says.
  for (const row of data) queueCanonEmbedding(row.entry_id);
}

/** Every passage of the active campaign. Refreshed by the doorbell (`canon_lore_passages`, under the canon key). */
export function useCanonPassages(enabled?: () => boolean) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [CANON_KEY, "passages", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCanonPassages fetched without a campaign");
      return fetchCanonPassages(cid);
    },
    enabled: () => !!campaignId.value && (enabled?.() ?? true),
  });
}

export function useCreateCanonPassage() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (input: NewCanonPassage) => {
      const cid = campaign.activeCampaignId;
      if (cid === null) throw new Error("useCreateCanonPassage called without a campaign");
      return createCanonPassage(cid, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

export function useDeleteCanonPassage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCanonPassage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

/** One entry's passages, in the order they are told: the DM's order, then the order they were written. */
export function passagesOf(all: readonly CanonLorePassage[], entryId: string): CanonLorePassage[] {
  return all
    .filter((p) => p.entry_id === entryId)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

/** How many of an entry's passages are told. The first counts as told with the entry. */
export function toldTally(passages: readonly CanonLorePassage[]): { told: number; total: number } {
  const first = passages[0];
  const told = passages.filter((p) => p === first || p.told_at !== null).length;
  return { told, total: passages.length };
}

/** The one place a passage comes out, or none. */
export function passageWhere(p: Pick<CanonLorePassage, "location_id" | "npc_id" | "quest_beat_id">): { kind: ClueKind; id: string } | null {
  if (p.location_id) return { kind: "location", id: p.location_id };
  if (p.npc_id) return { kind: "npc", id: p.npc_id };
  if (p.quest_beat_id) return { kind: "quest_beat", id: p.quest_beat_id };
  return null;
}

/**
 * The patch that moves a passage to one place, person or beat, or nowhere. Always names all three columns: a passage
 * moved from a place to a person must clear the place, or the table refuses two.
 */
export function wherePatch(where: { kind: ClueKind; id: string } | null): Pick<CanonLorePassage, "location_id" | "npc_id" | "quest_beat_id"> {
  const patch = { location_id: null, npc_id: null, quest_beat_id: null } as Pick<CanonLorePassage, "location_id" | "npc_id" | "quest_beat_id">;
  if (where !== null) {
    const column = WHERE_COLUMN[where.kind];
    if (column === undefined) throw new Error(`A passage cannot come out at ${where.kind}`);
    patch[column] = where.id;
  }
  return patch;
}
