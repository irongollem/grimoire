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
import { useTrapIndex } from "@/composables/dungeon-features/useTraps";
import { encounterTrapRefs } from "@/lib/dungeon-features/library";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { liveRevision, useEncounterLive } from "@/composables/encounters/useEncounterLive";
import { sameLiveRoster } from "@/lib/encounters/liveRoster";
import { buildRunCombatants, legendaryActionCaps } from "@/lib/encounters/buildRunCombatants";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { Encounter, RunCombatant } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import type { NpcListRow } from "@/types/npc.types";
import type { TrapEntry } from "@/types/trap.types";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import EncounterRunner from "@/components/encounters/EncounterRunner.vue";

const props = defineProps<{ encounterId: string }>();
const id = computed(() => props.encounterId);
const { data: encounter } = useEncounter(id);

const { data: party, isFetching: partyFetching } = useActiveParty();
const { data: companions, isFetching: companionsFetching } = useCompanions();
// A player's AC is snapshotted into the run (and so into combatants_live) when
// the store is built, so that waits for the gear: before it loads, everyone is
// 10 + Dex.
const { acFor, isReady: acReady } = useArmorClass();
const { data: npcs, isFetching: npcsFetching } = useNpcs();
// byId resolves the ids the encounter stored, library and own alike.
const { byId: trapsById, isLoading: trapsLoading } = useTrapIndex(() => ({ includeAllScopes: true }));
const store = useEncounterRunStore();
const { liveState, liveStateLoaded } = useEncounterLive(id, { follow: true });

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
  store.adoptStatBlocks();
});

// The campaign's NPCs, kept current for a run this surface holds: a stat block
// written for an NPC mid-fight reaches the runner's sheet, its spawn picker and
// its combatant's HP and AC. (Only the init watcher below used to set them, once.)
watch(npcs, (list) => {
  if (!list || store.encounterId !== id.value) return;
  store.availableNpcs = list;
  store.adoptStatBlocks();
});

const isReady = computed(() => !!encounter.value && !monstersLoading.value && !!party.value && !!companions.value && !!npcs.value && !trapsLoading.value && acReady.value);

// A run that is not live exists only in the store, so the store decides whether it
// is built. Rebuilding it on every refetch threw the fight away: the HP write a
// damage button makes rings the party back, and the fresh party row reset the run
// to the lobby with every initiative blank. The store outlives this component, so
// a remount (the battle map and back, a quest tool reopening) keeps the run too;
// only End combat and Abandon clear it. Because it is built once, it waits for the
// party, companion and NPC reads to settle: a cached row shown while its refetch is
// in flight would otherwise seed the fight with stale HP and conditions, which End
// combat then writes back. A live run is the one the live state holds, and is
// hydrated from it as before.
const readsSettled = computed(() => !partyFetching.value && !companionsFetching.value && !npcsFetching.value);

watch(
  [encounter, monsterMap, monstersLoading, party, companions, npcs, trapsById, trapsLoading, liveState, liveStateLoaded, acReady, readsSettled],
  ([enc, monsterRows, loadingMonsters, par, comps, npcList, traps, trapsPending]) => {
    if (!enc || loadingMonsters || !par || !comps || !npcList || trapsPending || !liveStateLoaded.value || !acReady.value) return;
    const mons = [...monsterRows.values()];
    const live = liveState.value;
    if (live?.encounter_id === enc.id && live?.is_running) {
      // Hydrate only a store that does not hold this run yet. The store is ahead
      // of the live state, whose push is debounced: re-hydrating a live lobby on
      // a party refetch wrote a player's just-ingested roll back to blank, and
      // the DM saw "Waiting for roll" until a reload. A change made elsewhere
      // reaches a store that holds the run through the watcher below.
      if (store.encounterId === enc.id) return;
      store.hydrateFromLive({
        encounter_id: enc.id,
        encounter_name: enc.name,
        factions: enc.factions.length ? enc.factions : [...DEFAULT_FACTIONS],
        current_round: live.current_round,
        active_combatant_index: live.active_combatant_index,
        combatants_live: live.combatants_live,
        events: enc.events ?? [],
        events_fired: live.events_fired ?? [],
        traps: filterEncounterTraps(enc, traps),
      });
      store.availableMonsters = mons;
      store.availableNpcs = npcList;
      // A stat block written while no runner was open.
      store.adoptStatBlocks();
      const lairOwnerInstanceId = enc.lair_enabled && enc.lair_owner_def_id
        ? live.combatants_live.find((combatant) => combatant.def_id === enc.lair_owner_def_id)?.instance_id ?? null
        : null;
      store.setBossMechanics({ lairEnabled: enc.lair_enabled, lairOwnerInstanceId });
      return;
    }
    if (store.encounterId === enc.id) return;
    if (!readsSettled.value) return;
    initStore(enc, mons, par, npcList, filterEncounterTraps(enc, traps));
  },
  { immediate: true },
);

// A change another device made to the live fight (a second runner on the DM's
// phone, say) arrives as a followed read of the row. Such a read is only ever
// adopted while this tab has no write of its own pending (useEncounterLive), so
// the row is not behind this store, and a roster that differs from the store's
// was changed somewhere else: adopt it. This tab's own pushes come back equal and
// change nothing.
watch(liveRevision, () => {
  const live = liveState.value;
  if (!live?.is_running || live.encounter_id !== store.encounterId || store.encounterId !== id.value) return;
  const roster = { round: store.round, activeIndex: store.activeIndex, combatants: store.combatants, eventsFired: store.eventsFired };
  if (sameLiveRoster(roster, live)) return;
  store.hydrateFromLive({
    encounter_id: live.encounter_id,
    encounter_name: store.encounterName,
    factions: store.factions,
    current_round: live.current_round,
    active_combatant_index: live.active_combatant_index,
    // A copy, so the store's edits do not reach into the row a map is drawing.
    combatants_live: JSON.parse(JSON.stringify(live.combatants_live)) as RunCombatant[],
    events_fired: [...(live.events_fired ?? [])],
  });
});

function filterEncounterTraps(enc: Encounter, all: ReadonlyMap<string, TrapEntry>): TrapEntry[] {
  // A trap listed twice (quantity) is one card in the runner.
  return [...new Set(encounterTrapRefs(enc))]
    .map((id) => all.get(id))
    .filter((trap): trap is TrapEntry => trap !== undefined);
}

function initStore(enc: Encounter, mons: Monster[], par: PartyMember[], npcList: NpcListRow[], traps: TrapEntry[]) {
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
