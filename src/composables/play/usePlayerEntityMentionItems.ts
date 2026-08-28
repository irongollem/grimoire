import { computed } from "vue";
import { useParty } from "@/composables/party/useParty";
import { useSharedNpcs } from "@/composables/npcs/useNpcs";
import { usePlayerVisibleMonsters } from "@/composables/monsters/useMonsters";
import { usePlayerDiscoveries } from "@/composables/encounters/useDiscoveredMonsters";
import { useSharedLocations } from "@/composables/locations/useLocations";
import type { EntityMentionItem } from "@/lib/tiptap/EntityMention";

export function usePlayerEntityMentionItems() {
  const { data: partyMembers }      = useParty();
  const { data: sharedNpcs }        = useSharedNpcs();
  const { data: allMonsters }       = usePlayerVisibleMonsters();
  const { data: playerDiscoveries } = usePlayerDiscoveries();
  const { data: sharedLocations }   = useSharedLocations();

  const mentionItems = computed<EntityMentionItem[]>(() => {
    const discoveredIds = new Set(
      (playerDiscoveries.value ?? []).map((d) => d.library_monster_id ?? d.monster_id),
    );
    const discoveredMonsters = (allMonsters.value ?? []).filter(
      (m) => discoveredIds.has(m.id),
    );

    return [
      ...(partyMembers.value ?? []).map((m) => ({
        id: m.id,
        entityType: "player" as const,
        label: m.name,
      })),
      ...(sharedNpcs.value ?? []).map((n) => ({
        id: n.id,
        entityType: "npc" as const,
        label: n.name ?? "???",
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
    ];
  });

  return { mentionItems };
}
