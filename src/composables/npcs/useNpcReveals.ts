import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { earliestRevealPerNpc } from "@/lib/npcs/peopleLedger";
import { PLAYER_NPCS_KEY } from "@/composables/npcs/useNpcs";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";

const QUERY_KEY = "npc-reveals";

/**
 * When each character first met an NPC (`npc_reveals`), keyed by party member.
 * The DM may read every row of their campaign. The rows are written by DB
 * triggers alongside `npcs` / `locations` updates, so `campaignRealtimeWorld`
 * invalidates this root on those events rather than this query polling.
 */
export function useNpcReveals(npcId: Ref<string> | string) {
  const idRef = isRef(npcId) ? npcId : ref(npcId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value] as const),
    queryFn: async ({ queryKey: [, id] }) => {
      const { data, error } = await supabase
        .from("npc_reveals")
        .select("party_member_id,revealed_at")
        .eq("npc_id", id);
      if (error) throw error;
      return new Map(data.map((r) => [r.party_member_id, r.revealed_at] as const));
    },
    enabled: () => !!idRef.value,
  });
}

/**
 * When the viewing character first met each NPC: the previewed member in DM
 * preview, the player's own linked member otherwise. Only the People page reads
 * this, so it is its own query rather than a second request on every
 * `useSharedNpcs` fetch. RLS bounds `npc_reveals` but does not filter it, hence
 * the explicit campaign and member scope.
 *
 * The key sits under `PLAYER_NPCS_KEY`, so the `npcs_player` and
 * `locations_player` doorbells (and the DM-preview realtime path, which matches
 * `[root, campaignId, ...]`) refresh it with the projection: no polling.
 */
export function useMyNpcRevealMoments() {
  const campaign = useCampaignStore();
  const ui = useUiStore();
  const auth = useAuthStore();
  const memberId = computed(() => (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId));
  return useQuery({
    queryKey: computed(() => [PLAYER_NPCS_KEY, campaign.activeCampaignId, "reveals", memberId.value] as const),
    queryFn: async ({ queryKey: [, cid, , member] }) => {
      if (!cid || !member) throw new Error("useMyNpcRevealMoments fetched without a campaign and member");
      const { data, error } = await supabase
        .from("npc_reveals")
        .select("npc_id,revealed_at")
        .eq("campaign_id", cid)
        .eq("party_member_id", member);
      if (error) throw error;
      return earliestRevealPerNpc(data);
    },
    enabled: () => !!campaign.activeCampaignId && !!memberId.value,
  });
}
