import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { PLAYER_KIN_KEY } from "@/lib/campaignLiveSync/registry";
import type { PlayerVisibleKin } from "@/types/kinship.types";

export { PLAYER_KIN_KEY };

/**
 * The kin a player may see (`get_player_visible_kin`): links between two people they
 * know, without notes, and which of them belong to a House they know. Players cannot
 * select `kin_links`; the `kin_links` ring tells them to re-read this.
 */
export function usePlayerVisibleKin(
  campaignId: MaybeRefOrGetter<string | null>,
  previewMemberId: MaybeRefOrGetter<string | null> = null,
) {
  return useQuery({
    queryKey: computed(() => [PLAYER_KIN_KEY, toValue(campaignId), toValue(previewMemberId)] as const),
    queryFn: async ({ queryKey: [, cid, previewId] }) => {
      if (cid === null) throw new Error("usePlayerVisibleKin fetched without a campaign");
      const { data, error } = await supabase.rpc("get_player_visible_kin", {
        p_campaign_id: cid,
        p_preview_member_id: previewId,
      });
      if (error) throw error;
      return data as PlayerVisibleKin;
    },
    enabled: computed(() => !!toValue(campaignId)),
  });
}
