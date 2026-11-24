import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useMyMemberId } from "@/composables/canon/useMyStory";
import type { CanonWonder } from "@/types/canon.types";

/**
 * What the players wonder about the world (#1258 item 24). A player writes a question (`canon_wonders`, 1 to 300
 * characters) and reads only their own; the DM reads every one and either takes it up as an open question or lets it
 * be. Both sit under the canon root, so the doorbell's `canon_wonders` ring refreshes them.
 */

/** The longest wonder the table accepts. */
export const WONDER_MAX = 300;

/** A wonder the DM has not yet taken up or let be. */
export const isOpenWonder = (w: Pick<CanonWonder, "adopted_entry_id" | "dismissed_at">) => w.adopted_entry_id === null && w.dismissed_at === null;

/** The wonders the signed-in player wrote in this campaign, newest first. Scoped to the caller in the query: RLS only bounds who may read. */
export function usePlayerWonders() {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => [CANON_KEY, "wonders", "mine", campaign.activeCampaignId] as const),
    queryFn: async ({ queryKey: [, , , cid] }): Promise<CanonWonder[]> => {
      if (!cid) throw new Error("usePlayerWonders fetched without a campaign");
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("canon_wonders")
        .select("*")
        .eq("campaign_id", cid)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CanonWonder[];
    },
    enabled: () => !!campaign.activeCampaignId,
  });
}

/** Every wonder in the campaign, for the DM, oldest first (the order they were asked in). */
export function useCampaignWonders() {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => [CANON_KEY, "wonders", "all", campaign.activeCampaignId] as const),
    queryFn: async ({ queryKey: [, , , cid] }): Promise<CanonWonder[]> => {
      if (!cid) throw new Error("useCampaignWonders fetched without a campaign");
      const { data, error } = await supabase.from("canon_wonders").select("*").eq("campaign_id", cid).order("created_at", { ascending: true });
      if (error) throw error;
      return data as CanonWonder[];
    },
    enabled: () => !!campaign.activeCampaignId,
  });
}

/** A player asks a question of the world. The words are trimmed; an empty or over-long one is refused before it is sent. */
export function useAddWonder() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  const memberId = useMyMemberId();
  return useMutation({
    mutationFn: async (body: string): Promise<void> => {
      const cid = campaign.activeCampaignId;
      if (!cid) throw new Error("useAddWonder wrote without a campaign");
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");
      const words = body.trim();
      if (words === "" || words.length > WONDER_MAX) throw new Error(`A wonder is one to ${WONDER_MAX} characters.`);
      const { error } = await supabase
        .from("canon_wonders")
        .insert({ campaign_id: cid, user_id: user.id, party_member_id: memberId.value, body: words });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

async function updateWonder(id: string, patch: { adopted_entry_id: string } | { dismissed_at: string }): Promise<void> {
  // RLS answers a write it refuses with no error and no row; asking for the row back is how that is told from a save.
  const { data, error } = await supabase.from("canon_wonders").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That wonder is gone, or you may not change it.");
}

/** The DM's two answers to a wonder: Take it up (an open question made of its words) and Let it be. */
export function useWonderActions() {
  const qc = useQueryClient();
  const { mutateAsync: createEntry } = useCreateCanonEntry();
  const refresh = () => qc.invalidateQueries({ queryKey: [CANON_KEY] });

  const letBe = useMutation({
    mutationFn: (id: string) => updateWonder(id, { dismissed_at: new Date().toISOString() }),
    onSuccess: refresh,
    onError: (e) => toast.error(toast.fromError(e)),
  });

  /** The question is made first, then the wonder points at it. A failed pointer never deletes the question just made. */
  async function takeUp(wonder: Pick<CanonWonder, "id" | "body">, sortOrder: number): Promise<void> {
    let question;
    try {
      question = await createEntry({ part: "question", title: wonder.body, sort_order: sortOrder });
    } catch {
      return; // The mutation has already told the DM (toast).
    }
    try {
      await updateWonder(wonder.id, { adopted_entry_id: question.id });
    } catch {
      toast.error("The question was added, but the wonder could not be marked as taken up.");
    }
    await refresh();
  }

  return { takeUp, letBe: (wonder: Pick<CanonWonder, "id">) => letBe.mutate(wonder.id) };
}
