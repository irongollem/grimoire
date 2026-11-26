import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";

/**
 * What people say (#1279 item 15, player side): the cover stories of secrets still open to this character, as plain
 * lines with no source. The database withholds a cover story once the secret has been revealed to the caller, so
 * nothing here filters. A DM previewing a member reads exactly that member's. Under the canon root, so the doorbell
 * refreshes it when a secret is revealed.
 */
export function usePlayerBeliefs() {
  const campaign = useCampaignStore();
  const appUi = useAppUiStore();
  const previewMemberId = computed(() => (appUi.dmPreviewMode ? appUi.dmPreviewPartyMemberId : null));
  const query = useQuery({
    queryKey: computed(() => [CANON_KEY, "player-beliefs", campaign.activeCampaignId, previewMemberId.value] as const),
    queryFn: async ({ queryKey: [, , cid, memberId] }): Promise<string[]> => {
      if (!cid) throw new Error("usePlayerBeliefs fetched without a campaign");
      const { data, error } = await supabase.rpc("get_player_common_beliefs", { p_campaign_id: cid, p_preview_member_id: memberId });
      if (error) throw error;
      return (data as { belief: string }[]).map((row) => row.belief);
    },
    enabled: () => !!campaign.activeCampaignId,
  });
  return { beliefs: computed(() => query.data.value ?? []), isLoading: query.isLoading, error: query.error };
}
