import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import type { LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import { supabase } from "@/lib/supabase";
import { CONNECTIONS_KEY } from "@/lib/campaignLiveSync/registry";
import { usePreviewMemberId } from "@/composables/kinship/usePlayerKin";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import type { Connection } from "@/types/connections.types";

/**
 * The character a player is reading as: the one they are seated as, or the one a
 * DM is previewing. Null when neither (a DM outside preview, an unseated player).
 */
export function useViewerMemberId() {
  const auth = useAuthStore();
  const preview = usePreviewMemberId();
  return computed(() => preview.value ?? auth.linkedPartyMemberId);
}

/**
 * The ties of one thing that the viewer's character knows of (`get_player_connections`):
 * the server returns a link only when it was revealed to them and both ends are
 * visible to them, with the line players read in `told` and never the DM's note.
 * Players cannot select `world_links`; the campaign ring on it refreshes this root.
 */
export function usePlayerConnections(kind: MaybeRefOrGetter<LinkKind | null>, id: MaybeRefOrGetter<string | null>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const previewMemberId = usePreviewMemberId();
  return useQuery({
    queryKey: computed(
      () => [CONNECTIONS_KEY, "player", toValue(kind), toValue(id), campaignId.value, previewMemberId.value] as const,
    ),
    queryFn: async ({ queryKey: [, , k, i, cid, previewId] }) => {
      if (!k || !i || cid === null) throw new Error("usePlayerConnections fetched without a subject or campaign");
      const { data, error } = await supabase.rpc("get_player_connections", {
        p_campaign_id: cid,
        p_kind: k,
        p_id: i,
        p_preview_member_id: previewId,
      });
      if (error) throw error;
      return data as Connection[];
    },
    enabled: computed(() => !!toValue(kind) && !!toValue(id) && !!campaignId.value),
  });
}

/** The tie between the thing on screen and the viewer's own character, if they know of one. */
export function findMyConnection(rows: readonly Connection[], memberId: string | null): Connection | null {
  if (!memberId) return null;
  return rows.find((r) => r.other_kind === "party_member" && r.other_id === memberId) ?? null;
}
