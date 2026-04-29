import { computed } from "vue";
import { useParty } from "@/composables/useParty";
import { useNpcs } from "@/composables/useNpcs";
import { useAllMonsters } from "@/composables/useMonsters";
import { useAllLocations } from "@/composables/useLocations";
import type { EntityMentionItem } from "@/lib/tiptap/EntityMention";

export function useEntityMentionItems() {
  const { data: partyMembers } = useParty();
  const { data: npcs }         = useNpcs();
  const { data: monsters }     = useAllMonsters();
  const { data: locations }    = useAllLocations();

  const mentionItems = computed<EntityMentionItem[]>(() => [
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
  ]);

  return { mentionItems, partyMembers, npcs, monsters };
}
