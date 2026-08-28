<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="!isReady" class="flex justify-center py-16"><LoadingSpinner /></div>
    <EncounterRunner v-else />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useEncounter } from "@/composables/encounters/useEncounters";
import { useAllMonsters } from "@/composables/monsters/useMonsters";
import { useParty } from "@/composables/party/useParty";
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
import type { Npc } from "@/types/npc.types";
import type { Trap } from "@/types/trap.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EncounterRunner from "@/components/encounters/EncounterRunner.vue";

const props = defineProps<{ encounterId: string }>();
const id = computed(() => props.encounterId);
const { data: encounter } = useEncounter(id);
const { data: monsters } = useAllMonsters(() => ({ includeAllScopes: true }));
const { data: party } = useParty();
const { data: companions } = useCompanions();
const { data: npcs } = useNpcs();
const { data: allTraps } = useTraps(() => ({ includeAllScopes: true }));
const store = useEncounterRunStore();
const { liveState, liveStateLoaded } = useEncounterLive(id);

const isReady = computed(() => !!encounter.value && !!monsters.value && !!party.value && !!companions.value && !!npcs.value && !!allTraps.value);

watch(
  [encounter, monsters, party, companions, npcs, allTraps, liveState, liveStateLoaded],
  ([enc, mons, par, _comps, npcList, traps]) => {
    if (!enc || !mons || !par || !npcList || !traps || !liveStateLoaded.value) return;
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
      store.availableNpcs = npcList as Npc[];
      const lairOwnerInstanceId = enc.lair_enabled && enc.lair_owner_def_id
        ? live.combatants_live.find((combatant) => combatant.def_id === enc.lair_owner_def_id)?.instance_id ?? null
        : null;
      store.setBossMechanics({ lairEnabled: enc.lair_enabled, lairOwnerInstanceId });
      return;
    }
    initStore(enc, mons, par, npcList as Npc[], filterEncounterTraps(enc.trap_ids, traps));
  },
  { immediate: true },
);

function filterEncounterTraps(trapIds: string[], all: Trap[]): Trap[] {
  const ids = new Set(trapIds);
  return all.filter((trap) => ids.has(trap.id));
}

function initStore(enc: Encounter, mons: Monster[], par: PartyMember[], npcList: Npc[], traps: Trap[]) {
  store.reset();
  store.encounterId = enc.id;
  store.encounterName = enc.name;
  store.factions = enc.factions.length ? enc.factions : [...DEFAULT_FACTIONS];
  const combatants = buildRunCombatants({ encounter: enc, party: par, companions: companions.value ?? [], monsters: mons, npcs: npcList });
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
