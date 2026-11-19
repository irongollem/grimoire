<template>
  <ul v-if="flags.length" class="space-y-1 border-t border-dashed border-border pt-1.5">
    <li v-for="flag in flags" :key="flag.encounterId" class="flex items-start gap-2 text-caption text-ink-caution">
      <IconWarning class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        <RouterLink :to="`/encounters/${flag.encounterId}`" class="underline-offset-2 hover:underline">{{ flag.name }}</RouterLink>
        is {{ flagText(flag, level) }}
      </span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconWarning } from "@/lib/icons";
import { useEncounters } from "@/composables/encounters/useEncounters";
import { useCompanions } from "@/composables/encounters/useCompanions";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useTrapResolver } from "@/composables/dungeon-features/useTraps";
import { useEncounterQuestLinks } from "@/composables/quests/useQuests";
import { encounterMonsterIds } from "@/lib/encounters/monsterIds";
import { difficultyLookups } from "@/lib/encounters/difficulty";
import { fightFlags, flagText } from "@/lib/quests/levelPlan";

/**
 * The prepared fights of some quests that will be wrong for the party at `level` (#1021 row 27): the Level Plan's
 * warning line. Mounted only where there are quests to check, so the encounter reads happen only then. Rated by the
 * same rule the Encounters list and an encounter's page use (`lib/encounters/difficulty`), every character at `level`.
 */
const { questIds, level, partyIds } = defineProps<{ questIds: string[]; level: number; partyIds: string[] }>();

const { data: links } = useEncounterQuestLinks();
const { data: encounters } = useEncounters();
const { data: companions } = useCompanions();

const wanted = computed(() => {
  const quests = new Set(questIds);
  const ids = new Set((links.value ?? []).filter((l) => quests.has(l.questId)).map((l) => l.encounterId));
  return (encounters.value ?? []).filter((e) => ids.has(e.id) && !e.is_finished);
});
// Only what these fights name: their monsters, NPCs and traps.
const { data: monsters } = useMonstersByIds(() =>
  encounterMonsterIds(
    wanted.value.flatMap((e) => e.combatants),
    (companions.value ?? []).filter((c) => wanted.value.some((e) => e.companion_ids.includes(c.id))),
  ),
);
// An NPC fights as a combatant, or stands behind a companion (its source): either needs the NPC's stat block.
const { data: npcs } = useNpcs(
  () =>
    wanted.value.some((e) => e.combatants.some((c) => c.npc_id)) ||
    (companions.value ?? []).some((c) => c.source_npc_id !== null && wanted.value.some((e) => e.companion_ids.includes(c.id))),
);
const { byId: trapsById } = useTrapResolver(
  () => ({ includeAllScopes: true }),
  () => wanted.value.flatMap((e) => e.library_trap_ids),
);

const flags = computed(() =>
  fightFlags({
    questIds: new Set(questIds),
    links: links.value ?? [],
    encounters: wanted.value,
    partyIds,
    level,
    lookups: difficultyLookups({
      monsters: [...monsters.value.values()],
      npcs: npcs.value ?? [],
      // Every character is taken at `level`, so their own levels and classes are not read.
      party: [],
      characterClasses: [],
      companions: companions.value ?? [],
      traps: [...trapsById.value.values()],
    }),
  }),
);
</script>
