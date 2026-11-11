/*
 * The campaign's entries the book kit offers (#1176 frame 13): the same sources
 * the old Insert panel read, plus items and quests. The DM's own monsters, spells
 * and items only; the shared library is not insertable here, as before.
 */
import { computed } from "vue";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useSpellIndex } from "@/composables/spells/useSpellIndex";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { useQuests } from "@/composables/quests/useQuests";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAllDeities } from "@/composables/deities/useDeities";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useCampaignSpecies } from "@/composables/rules/useSpecies";
import { useCampaignCustomSubclasses } from "@/composables/rules/useCustomSubclasses";
import { spellLevelLabel } from "@/types/spell.types";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { KitCampaignEntry } from "@/scriptorium/lib/kit/campaignEntries";

export function useKitCampaignEntries() {
  const { data: npcs, isPending: npcsLoading } = useNpcs();
  const { data: monsterIndex, isLoading: monstersLoading } = useMonsterIndex();
  const { data: spellIndex, isLoading: spellsLoading } = useSpellIndex();
  const { data: itemIndex, isLoading: itemsLoading } = useItemIndex();
  const { data: quests, isPending: questsLoading } = useQuests();
  const { data: locations, isPending: locationsLoading } = useAllLocations();
  const { data: deities, isPending: deitiesLoading } = useAllDeities();
  const { data: speciesList, isLoading: speciesLoading } = useCampaignSpecies();
  const { data: factions, isPending: factionsLoading } = useAllFactions();
  const { data: subclasses, isLoading: subclassesLoading } = useCampaignCustomSubclasses();

  const entries = computed<KitCampaignEntry[]>(() => [
    ...(npcs.value ?? []).map((n) => ({
      id: n.id,
      type: "npc" as const,
      name: n.name,
      subtitle: [n.race, n.occupation].filter(Boolean).join(" · ") || null,
    })),
    ...(monsterIndex.value ?? [])
      .filter((m) => !m.is_shared)
      .map((m) => ({
        id: m.id,
        type: "monster" as const,
        name: m.name,
        subtitle: `${m.size} ${m.monster_type} · CR ${m.challenge_rating}`,
      })),
    ...(spellIndex.value ?? [])
      .filter((s) => !s.is_shared)
      .map((s) => ({
        id: s.id,
        type: "spell" as const,
        name: s.name,
        subtitle: `${spellLevelLabel(s.level)} ${s.school}`,
      })),
    ...(itemIndex.value ?? [])
      .filter((i) => !i.is_shared)
      .map((i) => ({ id: i.id, type: "item" as const, name: i.name, subtitle: i.item_type })),
    ...(quests.value ?? []).map((q) => ({ id: q.id, type: "quest" as const, name: q.title, subtitle: null })),
    ...(locations.value ?? []).map((l) => ({
      id: l.id,
      type: "location" as const,
      name: l.name,
      subtitle: LOCATION_TYPE_LABELS[l.location_type],
    })),
    ...(deities.value ?? []).map((d) => ({
      id: d.id,
      type: "deity" as const,
      name: d.name,
      subtitle: d.pantheon?.name ?? null,
    })),
    ...speciesList.value.map((sp) => ({ id: sp.id, type: "species" as const, name: sp.name, subtitle: null })),
    ...(factions.value ?? []).map((f) => ({ id: f.id, type: "faction" as const, name: f.name, subtitle: null })),
    ...subclasses.value.map((sc) => ({
      id: sc.id,
      type: "subclass" as const,
      name: sc.subclass_name,
      subtitle: sc.class_name,
    })),
  ]);

  const isLoading = computed(
    () =>
      npcsLoading.value ||
      monstersLoading.value ||
      spellsLoading.value ||
      itemsLoading.value ||
      questsLoading.value ||
      locationsLoading.value ||
      deitiesLoading.value ||
      speciesLoading.value ||
      factionsLoading.value ||
      subclassesLoading.value,
  );

  return { entries, isLoading };
}
