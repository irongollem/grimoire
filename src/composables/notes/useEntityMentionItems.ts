import { computed } from "vue";
import { useParty } from "@/composables/party/useParty";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useSpeciesNames } from "@/composables/canon/useSpeciesNames";
import { useRoute } from "vue-router";
import { isPlayerArea } from "@/router/lens";
import { useCampaignStore } from "@/stores/campaign";
import type { EntityMentionItem } from "@/lib/tiptap/EntityMention";

export const PARTY_MENTION_ID = "party-group";

/** The monster index it returns is for `useMentionedMonsters`, which reads the
 *  lore and picture of just the monsters a text names. */
export function useEntityMentionItems(enabled?: () => boolean) {
  const { data: partyMembers } = useParty(enabled);
  const { data: npcs }         = useNpcs(enabled);
  const { data: monsterIndex } = useMonsterIndex(enabled ? () => ({ enabled: enabled() }) : undefined);
  const { data: locations }    = useAllLocations(enabled);
  const { data: factions }     = useAllFactions(enabled);
  // The field guide is the DM's: a player's editor never reads it (RLS would return nothing anyway), and only the names
  // are wanted here, not the whole guide.
  const route                  = useRoute();
  const dmArea                 = route === undefined || !isPlayerArea(route.path);
  const { species }            = useSpeciesNames(() => dmArea && (enabled === undefined || enabled()));
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
      ...(monsterIndex.value ?? []).map((m) => ({
        id: m.id,
        entityType: "monster" as const,
        label: m.name,
      })),
      ...(locations.value ?? []).map((l) => ({
        id: l.id,
        entityType: "location" as const,
        label: l.name,
      })),
      ...(factions.value ?? []).map((f) => ({
        id: f.id,
        entityType: "faction" as const,
        label: f.name,
      })),
      ...(species.value ?? []).map((s) => ({
        id: s.id,
        entityType: "species" as const,
        label: s.name,
      })),
    );

    return items;
  });

  return { mentionItems, partyMembers, npcs, monsterIndex, locations, factions };
}
