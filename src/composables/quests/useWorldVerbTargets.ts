import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useQuestClocks } from "@/composables/quests/useQuestClocks";

/**
 * What the four verbs added in #1011 (`tick_clock`, `move_npc`, `add_companion`,
 * `shift_faction_standing`) and the "a clock fills" condition need to name
 * their targets: option lists for the pickers and label lookups for rows that
 * already exist. Shared by the quest rules panel and the beat payoff panel.
 *
 * The campaign-wide lists (NPCs, factions, places) are read only while
 * `enabled()` holds, so a permanently mounted panel does not pull all of them
 * until a rule that needs one exists or is being written. Clocks are the
 * quest's own handful and are always read.
 */
export function useWorldVerbTargets(questId: MaybeRefOrGetter<string>, enabled: () => boolean) {
  const { data: clocks } = useQuestClocks(computed(() => toValue(questId)));
  const { data: npcs } = useNpcs(enabled);
  const { data: factions } = useAllFactions(enabled);
  const { locationOptions: locationTreeOptions } = useLocationTree(enabled);

  const clockOptions = computed(() => (clocks.value ?? []).map((clock) => ({ id: clock.id, name: `${clock.label} (${clock.segments} segments)` })));
  const npcOptions = computed(() => (npcs.value ?? []).map((npc) => ({ id: npc.id, name: npc.name })));
  const factionOptions = computed(() => (factions.value ?? []).map((faction) => ({ id: faction.id, name: faction.name })));
  const locationOptions = computed(() => locationTreeOptions.value);

  function clockLabel(id: string | null): string | null {
    if (!id) return null;
    return clocks.value?.find((clock) => clock.id === id)?.label ?? null;
  }
  function npcLabel(id: string | null): string | null {
    if (!id) return null;
    return npcs.value?.find((npc) => npc.id === id)?.name ?? null;
  }
  function factionLabel(id: string | null): string | null {
    if (!id) return null;
    return factions.value?.find((faction) => faction.id === id)?.name ?? null;
  }
  function locationLabel(id: string | null): string | null {
    if (!id) return null;
    return locationTreeOptions.value.find((location) => location.id === id)?.name ?? null;
  }

  return { clockOptions, npcOptions, factionOptions, locationOptions, clockLabel, npcLabel, factionLabel, locationLabel };
}

export type WorldVerbTargets = ReturnType<typeof useWorldVerbTargets>;
