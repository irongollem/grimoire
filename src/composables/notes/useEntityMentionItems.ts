import { computed } from "vue";
import { useParty } from "@/composables/party/useParty";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAllMonsters } from "@/composables/monsters/useMonsters";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useCampaignStore } from "@/stores/campaign";
import type { EntityMentionItem } from "@/lib/tiptap/EntityMention";

export const PARTY_MENTION_ID = "party-group";

export function useEntityMentionItems() {
  const { data: partyMembers } = useParty();
  const { data: npcs }         = useNpcs();
  const { data: monsters }     = useAllMonsters();
  const { data: locations }    = useAllLocations();
  const campaignStore          = useCampaignStore();

  const mentionItems = computed<EntityMentionItem[]>(() => {
    const items: EntityMentionItem[] = [];

    if (campaignStore.activeCampaign?.group_portrait_url) {
      items.push({ id: PARTY_MENTION_ID, entityType: "party", label: "Party" });
    }

    items.push(
      ...(partyMembers.value ?? []).map((m) => ({
        id: m.id,
        entityType: "player" as const,
        label: m.name,
      })),
      ...(npcs.value ?? []).map((n) => ({
        id: n.id,
        entityType: "npc" as const,
        label: n.name,
      })),
      ...(monsters.value ?? []).map((m) => ({
        id: m.id,
        entityType: "monster" as const,
        label: m.name,
      })),
      ...(locations.value ?? []).map((l) => ({
        id: l.id,
        entityType: "location" as const,
        label: l.name,
      })),
    );

    return items;
  });

  return { mentionItems, partyMembers, npcs, monsters };
}
