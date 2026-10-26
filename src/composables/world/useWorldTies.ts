import { computed, type ComputedRef } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { CONNECTIONS_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignStore } from "@/stores/campaign";
import { usePreviewMemberId } from "@/composables/kinship/usePlayerKin";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useParty } from "@/composables/party/useParty";
import { nodeKey } from "@/lib/worldWeb/kinds";
import type { WebEntity } from "@/lib/worldWeb/model";
import type { WorldTie } from "@/lib/worldWeb/ties";
import type { NpcListRow } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";

/**
 * Every tie of the campaign, links and records, for the DM's World web
 * (`get_world_ties`, #1084). One read for the whole web; the campaign ring on
 * every table it reads refreshes the `connections` root.
 */
export function useWorldTies() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [CONNECTIONS_KEY, "world", campaignId.value] as const),
    queryFn: async ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useWorldTies fetched without a campaign");
      const { data, error } = await supabase.rpc("get_world_ties", { p_campaign_id: cid });
      if (error) throw error;
      return data as WorldTie[];
    },
    enabled: computed(() => !!campaignId.value),
  });
}

/**
 * The ties one character knows of (`get_player_world_ties`): a link only when it
 * was revealed to them and both ends are visible to them, a record by the rules
 * its sheet already has. Never the DM's note. A DM previewing a player passes the
 * previewed member through the same key the other player reads use.
 */
export function usePlayerWorldTies() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const previewMemberId = usePreviewMemberId();
  return useQuery({
    queryKey: computed(() => [CONNECTIONS_KEY, "world-player", campaignId.value, previewMemberId.value] as const),
    queryFn: async ({ queryKey: [, , cid, previewId] }) => {
      if (cid === null) throw new Error("usePlayerWorldTies fetched without a campaign");
      const { data, error } = await supabase.rpc("get_player_world_ties", {
        p_campaign_id: cid,
        p_preview_member_id: previewId,
      });
      if (error) throw error;
      return data as WorldTie[];
    },
    enabled: computed(() => !!campaignId.value),
  });
}

/** Every NPC and PC as a web entity: people are nodes even with no ties, so the DM can find them. */
export function peopleEntities(npcs: readonly NpcListRow[], party: readonly PartyMember[]): WebEntity[] {
  return [
    ...npcs.map((n): WebEntity => ({
      key: nodeKey("npc", n.id),
      kind: "npc",
      id: n.id,
      name: n.name,
      image: n.portrait_url,
      attitude: n.relationship,
    })),
    ...party.map((p): WebEntity => ({
      key: nodeKey("party_member", p.id),
      kind: "party_member",
      id: p.id,
      name: p.name,
      image: p.portrait_url,
      attitude: null,
    })),
  ];
}

/** The DM's people, from the lists every other page already reads. */
export function useWorldPeople(): { people: ComputedRef<WebEntity[]>; isLoading: ComputedRef<boolean> } {
  const { data: npcs, isLoading: npcsLoading } = useNpcs();
  const { data: party, isLoading: partyLoading } = useParty();
  return {
    people: computed(() => peopleEntities(npcs.value ?? [], party.value ?? [])),
    isLoading: computed(() => npcsLoading.value || partyLoading.value),
  };
}
