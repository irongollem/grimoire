import { computed } from "vue";
import { useLocationVisibility } from "@/composables/openBook/useOpenBookShare";
import { useParty } from "@/composables/party/useParty";
import { npcBookBlock, npcSharingPlaceIds, type NpcBookBlock, type NpcSharing } from "@/lib/openBook/eligibility";
import { useCampaignStore } from "@/stores/campaign";

/** The caption for a hidden name; null leaves the control's own whole-party caption in place. */
export function npcBlockedCaption(block: NpcBookBlock): string | null {
  return block === "name" ? "Share their name first: the book names everyone in it." : null;
}

/**
 * The Open Book's NPC rule, with the campaign's facts it needs (the party and which places share their residents).
 * One cached read of the places serves every card in a list. Only the campaign owner sees the book, so only the
 * owner reads them.
 */
export function useNpcBookRule() {
  const campaign = useCampaignStore();
  const { data: partyData } = useParty();
  const { data: places } = useLocationVisibility(() => (campaign.isOwner ? campaign.activeCampaignId : null));
  const partyIds = computed(() => (partyData.value ?? []).map((m) => m.id));
  const sharedPlaceIds = computed(() => npcSharingPlaceIds(places.value ?? [], partyIds.value));
  const blockFor = (npc: NpcSharing): NpcBookBlock => npcBookBlock(npc, partyIds.value, sharedPlaceIds.value);
  return { partyIds, sharedPlaceIds, blockFor };
}
