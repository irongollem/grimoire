<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="openError" class="flex flex-col items-center gap-3 py-16 text-center" role="alert">
      <p class="text-body text-muted-foreground">Couldn't open this fight. {{ openError }}</p>
      <AppButton variant="outline" size="sm" label="Try again" @click="retryOpen" />
    </div>
    <div v-else-if="!opened" class="flex justify-center py-16"><LoadingSpinner /></div>
    <EncounterRunner v-else />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useEncounter } from "@/composables/encounters/useEncounters";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { useCampaignJackOfAllTrades } from "@/composables/party/useJackOfAllTrades";
import { useCompanions } from "@/composables/encounters/useCompanions";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useSpeciesByIds } from "@/composables/rules/useSpecies";
import { useTrapResolver } from "@/composables/dungeon-features/useTraps";
import { encounterTrapRefs } from "@/lib/dungeon-features/library";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useEncounterLive } from "@/composables/encounters/useEncounterLive";
import { useToast } from "@/composables/useToast";
import { buildRunCombatants, legendaryActionCaps } from "@/lib/encounters/buildRunCombatants";
import { confirmedFromAnswer, sendAlone } from "@/lib/encounters/fightWire";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { Encounter } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import type { NpcListRow } from "@/types/npc.types";
import type { TrapEntry } from "@/types/trap.types";
import AppButton from "@/components/common/controls/AppButton.vue";
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
// Jack of All Trades is part of a character's initiative, snapshotted into the combatant, so a
// fight is never built before the class rows load (it would score a Bard short all fight).
const { jackFor, ready: jackReady } = useCampaignJackOfAllTrades();
const { data: npcs, isFetching: npcsFetching } = useNpcs();
// A character's token takes its species' (or subrace's) size, so the species the party has are read by id.
const { data: speciesById, isLoading: speciesLoading } = useSpeciesByIds(() => (party.value ?? []).map((m) => m.species_id));
// byId resolves the ids the encounter stored, library and own alike.
const { byId: trapsById, isLoading: trapsLoading } = useTrapResolver(
  () => ({ includeAllScopes: true }),
  () => encounter.value?.library_trap_ids ?? [],
);
const store = useEncounterRunStore();
const toast = useToast();
// Follows the fight's row for the map and the monsters a fight in progress holds; the runner's transport takes the same reads.
const { liveState } = useEncounterLive(id, { follow: true });

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

// Every run is a saved row (#1201). Opening the run view builds the roster as it always did and asks the
// server to open the fight on it: the answer is the fight, a new one or the one already under way (a reload,
// a second device, a run started on a phone), and the store is built from the answer, never from the roster
// just built. The store outlives this component, so a remount (the battle map and back, a quest tool
// reopening) keeps the run too; only End combat and Abandon clear it. It waits for the party, companion and
// NPC reads to settle, because a cached row shown while its refetch is in flight would seed a new fight with
// stale hit points and conditions, which End combat then writes back.
const readsSettled = computed(() => !partyFetching.value && !companionsFetching.value && !npcsFetching.value);

/** Set when the fight is on screen. Not derived from the store: End combat resets the store while the runner is still leaving. */
const opened = ref(false);
const openError = ref<string | null>(null);
/** The encounter an open was started for, so a refetch while it is in flight, or after End combat, never opens a second fight. */
let openingFor: string | null = null;

watch(id, () => {
  opened.value = false;
  openError.value = null;
  openingFor = null;
});

function tryOpen() {
  const enc = encounter.value;
  const traps = trapsById.value;
  if (!enc || monstersLoading.value || !party.value || !companions.value || !npcs.value || trapsLoading.value || speciesLoading.value || !acReady.value) return;
  if (store.encounterId === enc.id) {
    opened.value = true;
    return;
  }
  if (openingFor === enc.id || !readsSettled.value || !jackReady.value) return;
  openingFor = enc.id;
  void openRun(enc, [...monsterMap.value.values()], party.value, npcs.value, filterEncounterTraps(enc, traps)).catch((error: unknown) => {
    openingFor = null;
    openError.value = toast.fromError(error, "Check your connection.");
  });
}

watch(
  [encounter, monsterMap, monstersLoading, party, companions, npcs, trapsById, trapsLoading, acReady, readsSettled, speciesLoading, jackReady],
  tryOpen,
  { immediate: true },
);

function retryOpen() {
  openError.value = null;
  tryOpen();
}

function filterEncounterTraps(enc: Encounter, all: ReadonlyMap<string, TrapEntry>): TrapEntry[] {
  // A trap listed twice (quantity) is one card in the runner.
  return [...new Set(encounterTrapRefs(enc))]
    .map((id) => all.get(id))
    .filter((trap): trap is TrapEntry => trap !== undefined);
}

async function openRun(enc: Encounter, mons: Monster[], par: PartyMember[], npcList: NpcListRow[], traps: TrapEntry[]) {
  const combatants = buildRunCombatants({ encounter: enc, party: par, companions: companions.value ?? [], monsters: mons, npcs: npcList, species: [...speciesById.value.values()], acFor, jackFor });
  const legendaryCaps = legendaryActionCaps(combatants, mons);
  const { answer } = await sendAlone(enc.id, { type: "open", combatants, ...(Object.keys(legendaryCaps).length ? { legendaryCaps } : {}) });
  if (id.value !== enc.id) return;
  const held = answer.state.combatants_live;
  store.reset();
  store.availableMonsters = mons;
  store.availableNpcs = npcList;
  // The owner is found by the same lookup the server makes when it loads the row, so the two agree on who holds the lair.
  store.setBossMechanics({
    lairEnabled: enc.lair_enabled,
    lairOwnerInstanceId: enc.lair_enabled && enc.lair_owner_def_id ? (held.find((c) => c.def_id === enc.lair_owner_def_id)?.instance_id ?? null) : null,
  });
  store.startFight(
    {
      encounterId: enc.id,
      encounterName: enc.name,
      factions: enc.factions.length ? enc.factions : [...DEFAULT_FACTIONS],
      events: enc.events ?? [],
      traps,
    },
    confirmedFromAnswer(answer),
  );
  // A stat block written while no runner was open.
  store.adoptStatBlocks();
  opened.value = true;
}
</script>
