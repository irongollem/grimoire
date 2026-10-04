import { computed } from "vue";
import { useParty } from "@/composables/party/useParty";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAllMonsters } from "@/composables/monsters/useMonsters";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useCampaignStore } from "@/stores/campaign";
import type { EntityMentionItem } from "@/lib/tiptap/EntityMention";

export const PARTY_MENTION_ID = "party-group";

/** `monsterRows` also reads the full bestiary and returns it as `monsters`. Only
 *  the callers that put a monster's description in front of the AI need that
 *  (`parseSceneEntities`); an @mention list needs just id and name, which the
 *  slim index carries. */
export function useEntityMentionItems(opts?: { monsterRows?: boolean }) {
  const { data: partyMembers } = useParty();
  const { data: npcs }         = useNpcs();
  const { data: monsterIndex } = useMonsterIndex();
  const { data: monsters }     = useAllMonsters(() => ({ enabled: opts?.monsterRows === true }));
  const { data: locations }    = useAllLocations();
  const { data: factions }     = useAllFactions();
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
    );

    return items;
  });

  return { mentionItems, partyMembers, npcs, monsters, locations, factions };
}
