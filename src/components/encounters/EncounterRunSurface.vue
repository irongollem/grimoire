<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="!isReady" class="flex justify-center py-16"><LoadingSpinner /></div>
    <EncounterRunner v-else />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useEncounter } from "@/composables/encounters/useEncounters";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { useCompanions } from "@/composables/encounters/useCompanions";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useTraps } from "@/composables/dungeon-features/useTraps";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useEncounterLive } from "@/composables/encounters/useEncounterLive";
import { buildRunCombatants, legendaryActionCaps } from "@/lib/encounters/buildRunCombatants";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { Encounter } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import type { NpcListRow } from "@/types/npc.types";
import type { Trap } from "@/types/trap.types";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import EncounterRunner from "@/components/encounters/EncounterRunner.vue";

const props = defineProps<{ encounterId: string }>();
const id = computed(() => props.encounterId);
const { data: encounter } = useEncounter(id);

const { data: party } = useActiveParty();
const { data: companions } = useCompanions();
// A player's AC is snapshotted into the run (and so into combatants_live) when
// the store is built, so that waits for the gear: before it loads, everyone is
// 10 + Dex.
const { acFor, isReady: acReady } = useArmorClass();
const { data: npcs } = useNpcs();
const { data: allTraps } = useTraps(() => ({ includeAllScopes: true }));
const store = useEncounterRunStore();
const { liveState, liveStateLoaded } = useEncounterLive(id);

/** Monsters an encounter's events may spawn (an absent `kind` means monster, see SpawnDef). */
function spawnedMonsterIds(events: Encounter["events"] | undefined): string[] {
  const ids: string[] = [];
  for (const event of events ?? []) {
    for (const action of event.actions) {
      if (action.type !== "spawn_combatants") continue;
      for (const spawn of action.spawns) if (spawn.kind !== "npc") ids.push(spawn.monster_id);
    }
  }
  return ids;
}

// The runner needs full rows (stat block, size, art) for exactly the monsters it
// can put on the field: the encounter's combatants, whatever its events spawn, and
// whatever a live run already holds. Read by id with no scope filter, so a monster
// the DM later scoped away still resolves mid-fight (#597).
const { data: monsterMap, isLoading: monstersLoading } = useMonstersByIds(
  () => [
    ...(encounter.value?.combatants ?? []).map((c) => c.monster_id),
    ...spawnedMonsterIds(encounter.value?.events),
    ...(liveState.value?.combatants_live ?? []).map((c) => c.monster_id),
  ],
  { withArt: true },
);

// Monsters that join the field after the run starts (a spawn picked in the panel,
// an event a complication added) are read the same way and merged into what the
// store holds. Merge only: nothing is dropped (a row read again with its art replaces its plain twin), and the init watcher below never
// re-runs for them.
const { data: fieldMonsterMap } = useMonstersByIds(
  () => [
    ...store.combatants.map((c) => c.monster_id),
    ...spawnedMonsterIds(store.events),
  ],
  { withArt: true },
);
watch(fieldMonsterMap, (map) => {
  for (const monster of map.values()) {
    const at = store.availableMonsters.findIndex((m) => m.id === monster.id);
    if (at < 0) store.availableMonsters.push(monster);
    else if (store.availableMonsters[at] !== monster) store.availableMonsters.splice(at, 1, monster);
  }
});

const isReady = computed(() => !!encounter.value && !monstersLoading.value && !!party.value && !!companions.value && !!npcs.value && !!allTraps.value && acReady.value);

watch(
  [encounter, monsterMap, monstersLoading, party, companions, npcs, allTraps, liveState, liveStateLoaded, acReady],
  ([enc, monsterRows, loadingMonsters, par, _comps, npcList, traps]) => {
    if (!enc || loadingMonsters || !par || !npcList || !traps || !liveStateLoaded.value || !acReady.value) return;
    const mons = [...monsterRows.values()];
    const live = liveState.value;
    if (live?.encounter_id === enc.id && live?.is_running) {
      if (store.encounterId === enc.id && store.started) return;
      store.hydrateFromLive({
        encounter_id: enc.id,
        encounter_name: enc.name,
        factions: enc.factions.length ? enc.factions : [...DEFAULT_FACTIONS],
        current_round: live.current_round,
        active_combatant_index: live.active_combatant_index,
        combatants_live: live.combatants_live,
        events: enc.events ?? [],
        events_fired: live.events_fired ?? [],
        traps: filterEncounterTraps(enc.trap_ids, traps),
      });
      store.availableMonsters = mons;
      store.availableNpcs = npcList;
      const lairOwnerInstanceId = enc.lair_enabled && enc.lair_owner_def_id
        ? live.combatants_live.find((combatant) => combatant.def_id === enc.lair_owner_def_id)?.instance_id ?? null
        : null;
      store.setBossMechanics({ lairEnabled: enc.lair_enabled, lairOwnerInstanceId });
      return;
    }
    initStore(enc, mons, par, npcList, filterEncounterTraps(enc.trap_ids, traps));
  },
  { immediate: true },
);

function filterEncounterTraps(trapIds: string[], all: Trap[]): Trap[] {
  const ids = new Set(trapIds);
  return all.filter((trap) => ids.has(trap.id));
}

function initStore(enc: Encounter, mons: Monster[], par: PartyMember[], npcList: NpcListRow[], traps: Trap[]) {
  store.reset();
  store.encounterId = enc.id;
  store.encounterName = enc.name;
  store.factions = enc.factions.length ? enc.factions : [...DEFAULT_FACTIONS];
  const combatants = buildRunCombatants({ encounter: enc, party: par, companions: companions.value ?? [], monsters: mons, npcs: npcList, acFor });
  store.combatants = combatants;
  store.availableMonsters = mons;
  store.availableNpcs = npcList;
  store.events = enc.events ?? [];
  store.eventsFired = [];
  store.traps = traps;
  const legendaryCaps = legendaryActionCaps(combatants, mons);
  if (Object.keys(legendaryCaps).length) store.primeLegendaryActions(legendaryCaps);
  const lairOwnerInstanceId = enc.lair_enabled && enc.lair_owner_def_id
    ? combatants.find((combatant) => combatant.def_id === enc.lair_owner_def_id)?.instance_id ?? null
    : null;
  store.setBossMechanics({ lairEnabled: enc.lair_enabled, lairOwnerInstanceId });
}
</script>
