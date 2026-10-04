import { computed } from "vue";
import { useParty } from "@/composables/party/useParty";
import { useSharedNpcs } from "@/composables/npcs/useNpcs";
import { usePlayerMonstersByIds } from "@/composables/monsters/usePlayerMonstersByIds";
import { usePlayerDiscoveries } from "@/composables/encounters/useDiscoveredMonsters";
import { useSharedLocations } from "@/composables/locations/useLocations";
import { usePlayerVisibleFactions } from "@/composables/factions/useFactions";
import type { EntityMentionItem } from "@/lib/tiptap/EntityMention";

export function usePlayerEntityMentionItems() {
  const { data: partyMembers }      = useParty();
  const { data: sharedNpcs }        = useSharedNpcs();
  const { data: playerDiscoveries } = usePlayerDiscoveries();
  // Only what the player has met can be mentioned, so only those ids are read.
  const { data: discoveredMonsterMap } = usePlayerMonstersByIds(() =>
    (playerDiscoveries.value ?? []).map((d) => d.library_monster_id ?? d.monster_id),
  );
  const { data: sharedLocations }   = useSharedLocations();
  const { data: factions }          = usePlayerVisibleFactions();

  const mentionItems = computed<EntityMentionItem[]>(() => {
    const discoveredMonsters = [...discoveredMonsterMap.value.values()].sort((x, y) => x.name.localeCompare(y.name));

    return [
      ...(partyMembers.value ?? []).map((m) => ({
        id: m.id,
        entityType: "player" as const,
        label: m.name,
      })),
      // A player can only mention what they can name — an NPC whose name
      // isn't player-visible (get_player_visible_npcs returns null) used to
      // become a literal "???" suggestion; now it's simply not offered.
      ...(sharedNpcs.value ?? [])
        .filter((n): n is typeof n & { name: string } => n.name !== null)
        .map((n) => ({
          id: n.id,
          entityType: "npc" as const,
          label: n.name,
        })),
      ...discoveredMonsters.map((m) => ({
        id: m.id,
        entityType: "monster" as const,
        label: m.name,
      })),
      ...(sharedLocations.value ?? []).map((l) => ({
        id: l.id,
        entityType: "location" as const,
        label: l.name,
      })),
      ...(factions.value ?? []).map((f) => ({
        id: f.id,
        entityType: "faction" as const,
        label: f.name,
      })),
    ];
  });

  return { mentionItems };
}
