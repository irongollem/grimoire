import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { isWalkStepId, type WalkStepId } from "@/lib/canon/canonWalk";

/**
 * The sections a DM chose to leave empty in "Design it with me" (#1282, `canon_walk_skips`): one row per campaign and
 * section, DM-only. Under the canon root, so a co-DM's skip reaches this walk through the doorbell.
 */
export function useCanonWalkSkips() {
  const campaign = useCampaignStore();
  const query = useQuery({
    queryKey: computed(() => [CANON_KEY, "walk-skips", campaign.activeCampaignId] as const),
    queryFn: async ({ queryKey: [, , cid] }): Promise<WalkStepId[]> => {
      if (!cid) throw new Error("useCanonWalkSkips fetched without a campaign");
      const { data, error } = await supabase.from("canon_walk_skips").select("section").eq("campaign_id", cid);
      if (error) throw error;
      return (data as { section: string }[]).map((r) => r.section).filter(isWalkStepId);
    },
    enabled: () => !!campaign.activeCampaignId,
  });
  const skipped = computed<ReadonlySet<WalkStepId>>(() => new Set(query.data.value ?? []));
  return { ...query, skipped };
}

/** Skip a section, or bring a skipped one back into the walk. */
export function useCanonWalkSkipActions() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  const refresh = () => qc.invalidateQueries({ queryKey: [CANON_KEY, "walk-skips"] });
  const onError = (e: unknown) => toast.error(toast.fromError(e));

  const skip = useMutation({
    mutationFn: async (section: WalkStepId) => {
      const cid = campaign.activeCampaignId;
      if (cid === null) throw new Error("useCanonWalkSkipActions skipped without a campaign");
      // Skipped twice (two tabs, a co-DM) is still skipped once.
      const { error } = await supabase.from("canon_walk_skips").upsert({ campaign_id: cid, section }, { onConflict: "campaign_id,section", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError,
  });

  const bringBack = useMutation({
    mutationFn: async (section: WalkStepId) => {
      const cid = campaign.activeCampaignId;
      if (cid === null) throw new Error("useCanonWalkSkipActions brought back without a campaign");
      const { error } = await supabase.from("canon_walk_skips").delete().eq("campaign_id", cid).eq("section", section);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError,
  });

  return { skip, bringBack };
}
