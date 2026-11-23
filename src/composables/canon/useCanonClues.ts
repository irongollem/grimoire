import type { AiProvenance } from "@/ai/provenance";
import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignSession } from "@/composables/campaign/useCampaignSession";
import type { CanonClue } from "@/types/canon.types";

/** Where a clue may lie. A clue lies at most at one of these, or nowhere yet. */
export type ClueKind = "location" | "npc" | "quest_beat";
const CLUE_COLUMN: Record<ClueKind, "location_id" | "npc_id" | "quest_beat_id"> = {
  location: "location_id",
  npc: "npc_id",
  quest_beat: "quest_beat_id",
};

/** What a new clue needs. At most one of the three places may be set (the table refuses two, 23514). */
export type NewCanonClue = {
  secret_id: string;
  title: string;
  sort_order?: number;
  /** Set when the clue came from an accepted AI suggestion. */
  ai_provenance?: AiProvenance | null;
  /** The lore passage this clue is (`passageClue`): such a clue lies nowhere of its own. */
  passage_id?: string;
  /** Only for a clue made from a passage that was already told: it is filed found, at that time. */
  found_at?: string;
  found_session_id?: string | null;
} & ({ location_id?: string; npc_id?: never; quest_beat_id?: never } | { npc_id?: string; location_id?: never; quest_beat_id?: never } | { quest_beat_id?: string; location_id?: never; npc_id?: never });

export type CanonCluePatch = Partial<Pick<CanonClue, "title" | "sort_order" | "location_id" | "npc_id" | "quest_beat_id" | "found_at" | "found_session_id">>;

/** Every clue of the campaign, read once: scoped in the query, because RLS only bounds who may read. */
export async function fetchCanonClues(campaignId: string): Promise<CanonClue[]> {
  const { data, error } = await supabase
    .from("canon_clues")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as CanonClue[];
}

export async function createCanonClue(campaignId: string, input: NewCanonClue): Promise<CanonClue> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("canon_clues")
    .insert({ ...input, campaign_id: campaignId, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as CanonClue;
}

export async function updateCanonClue(id: string, patch: CanonCluePatch): Promise<void> {
  // RLS answers a write it refuses with no error and no row; asking for the row back is how that is told from a save.
  const { data, error } = await supabase.from("canon_clues").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That clue is gone, or you may not change it.");
}

export async function deleteCanonClue(id: string): Promise<void> {
  const { error } = await supabase.from("canon_clues").delete().eq("id", id);
  if (error) throw error;
}

/** Every clue of the active campaign. Refreshed by the doorbell (`canon_clues`). */
export function useCanonClues(enabled?: () => boolean) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [CANON_KEY, "clues", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCanonClues fetched without a campaign");
      return fetchCanonClues(cid);
    },
    enabled: () => !!campaignId.value && (enabled?.() ?? true),
  });
}

/** The clues that lie at one place, person or beat. Empty while loading, so a block built on it renders nothing. */
export function cluesAt(clues: readonly CanonClue[], kind: ClueKind, id: string): CanonClue[] {
  const column = CLUE_COLUMN[kind];
  return clues.filter((c) => c[column] === id);
}

export function useCreateCanonClue() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (input: NewCanonClue) => {
      const cid = campaign.activeCampaignId;
      if (cid === null) throw new Error("useCreateCanonClue called without a campaign");
      return createCanonClue(cid, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

export function useUpdateCanonClue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CanonCluePatch }) => updateCanonClue(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

export function useDeleteCanonClue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCanonClue(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

/**
 * The patch a Found tick writes. Ticking stamps the time and the session that is running (none when the DM has not
 * started one); unticking clears both, because a found session with no found time is refused by the table.
 */
export function foundPatch(found: boolean, sessionId: string | null, now: Date = new Date()): CanonCluePatch {
  return found ? { found_at: now.toISOString(), found_session_id: sessionId } : { found_at: null, found_session_id: null };
}

/** The Found tick, shared by the secret's detail and every "Clues here" block. */
export function useSetClueFound() {
  const { session } = useCampaignSession();
  const { mutate } = useUpdateCanonClue();
  return (clue: Pick<CanonClue, "id">, found: boolean) => mutate({ id: clue.id, patch: foundPatch(found, session.value?.id ?? null) });
}
