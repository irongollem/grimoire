<template>
  <div class="flex flex-col h-full min-h-0">
    <div v-if="!isReady" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <EncounterRunner v-else />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { useEncounter } from "@/composables/useEncounters";
import { useAllMonsters } from "@/composables/useMonsters";
import { useParty } from "@/composables/useParty";
import { useCompanions } from "@/composables/useCompanions";
import { useNpcs } from "@/composables/useNpcs";
import { useTraps } from "@/composables/useTraps";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useEncounterLive } from "@/composables/useEncounterLive";
import { buildRunCombatants, legendaryActionCaps } from "@/lib/encounters/buildRunCombatants";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { Encounter } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import type { Npc } from "@/types/npc.types";
import type { Trap } from "@/types/trap.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EncounterRunner from "@/components/encounters/EncounterRunner.vue";

const route = useRoute();
const id = computed(() => route.params.id as string);

const { data: encounter } = useEncounter(id);
// Unscoped, both of them: this view resolves ids the encounter stored earlier,
// and a monster or trap the DM has since scoped to another campaign must still
// come to the fight it was written into. See buildRunCombatants.
const { data: monsters } = useAllMonsters(() => ({ includeAllScopes: true }));
const { data: party } = useParty();
const { data: companions } = useCompanions();
const { data: npcs } = useNpcs();
const { data: allTraps } = useTraps(() => ({ includeAllScopes: true }));
const store = useEncounterRunStore();
const { liveState, liveStateLoaded } = useEncounterLive(id);

const isReady = computed(
  () => !!encounter.value && !!monsters.value && !!party.value && !!companions.value && !!npcs.value && !!allTraps.value,
);

watch(
  // Include liveState + liveStateLoaded so the watch re-fires once the DB
  // fetch completes. Without this, liveState is null on page refresh and
  // initStore() would fire before we know whether a live state exists.
  [encounter, monsters, party, companions, npcs, allTraps, liveState, liveStateLoaded],
  ([enc, mons, par, _comps, npcList, traps]) => {
    if (!enc || !mons || !par || !npcList || !traps) return;
    // Wait for the DB check to complete before deciding what to do
    if (!liveStateLoaded.value) return;

    // If live state exists in DB, hydrate from it (handles page refresh / navigate-away-and-back)
    const live = liveState.value;
    if (live?.encounter_id === enc.id && live?.is_running) {
      // Only hydrate once — don't re-hydrate on every reactive update
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
      store.availableNpcs = npcList as Npc[];
      // Re-prime boss mechanics from the encounter definition on rehydrate.
      // Legendary pools live on the combatant rows already (persisted in
      // combatants_live) so we don't re-prime them here.
      const lairOwnerInstanceId = enc.lair_enabled && enc.lair_owner_def_id
        ? live.combatants_live.find((c) => c.def_id === enc.lair_owner_def_id)?.instance_id ?? null
        : null;
      store.setBossMechanics({
        lairEnabled: enc.lair_enabled,
        lairOwnerInstanceId,
      });
      return;
    }

    // No live state — always re-init from encounter definition.
    // This ensures monsters/NPCs added in the builder after a previous run are picked up.
    initStore(enc, mons, par, npcList as Npc[], filterEncounterTraps(enc.trap_ids, traps));
  },
  { immediate: true },
);

function filterEncounterTraps(trapIds: string[], allTraps: Trap[]): Trap[] {
  const trapSet = new Set(trapIds);
  return allTraps.filter((t) => trapSet.has(t.id));
}

function initStore(enc: Encounter, mons: Monster[], par: PartyMember[], npcList: Npc[], traps: Trap[] = []) {
  store.reset();
  store.encounterId = enc.id;
  store.encounterName = enc.name;
  store.factions = enc.factions.length ? enc.factions : [...DEFAULT_FACTIONS];

  const combatants = buildRunCombatants({
    encounter: enc,
    party: par,
    companions: companions.value ?? [],
    monsters: mons,
    npcs: npcList,
  });

  store.combatants = combatants;
  store.availableMonsters = mons;
  store.availableNpcs = npcList;
  store.events = enc.events ?? [];
  store.eventsFired = [];
  store.traps = traps;

  const legendaryCaps = legendaryActionCaps(combatants, mons);
  if (Object.keys(legendaryCaps).length > 0) {
    store.primeLegendaryActions(legendaryCaps);
  }

  // Wire lair actions. The encounter references a CombatantDef.id; look up
  // the first live instance with that def_id to get the runtime instance_id.
  const lairOwnerInstanceId = enc.lair_enabled && enc.lair_owner_def_id
    ? combatants.find((c) => c.def_id === enc.lair_owner_def_id)?.instance_id ?? null
    : null;
  store.setBossMechanics({
    lairEnabled: enc.lair_enabled,
    lairOwnerInstanceId,
  });
}
</script>
