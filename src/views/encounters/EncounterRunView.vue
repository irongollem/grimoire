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
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useEncounterLive } from "@/composables/useEncounterLive";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { RunCombatant, Encounter } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EncounterRunner from "@/components/encounters/EncounterRunner.vue";

const route = useRoute();
const id = computed(() => route.params.id as string);

const { data: encounter } = useEncounter(id);
const { data: monsters } = useAllMonsters();
const { data: party } = useParty();
const { data: companions } = useCompanions();
const store = useEncounterRunStore();
const { liveState } = useEncounterLive(id.value);

const isReady = computed(
  () => !!encounter.value && !!monsters.value && !!party.value && !!companions.value,
);

watch(
  [encounter, monsters, party, companions],
  ([enc, mons, par, comps]) => {
    if (!enc || !mons || !par || !comps) return;
    if (store.encounterId === enc.id && store.started) return;

    // If live state exists in DB, hydrate from it (handles page refresh / navigate-away-and-back)
    const live = liveState.value;
    if (live?.encounter_id === enc.id && live?.is_running) {
      store.hydrateFromLive({
        encounter_id: enc.id,
        encounter_name: enc.name,
        factions: enc.factions.length ? enc.factions : [...DEFAULT_FACTIONS],
        current_round: live.current_round,
        active_combatant_index: live.active_combatant_index,
        combatants_live: live.combatants_live,
      });
      return;
    }

    initStore(enc, mons, par);
  },
  { immediate: true },
);

function initStore(enc: Encounter, mons: Monster[], par: PartyMember[]) {
  store.reset();
  store.encounterId = enc.id;
  store.encounterName = enc.name;
  store.factions = enc.factions.length ? enc.factions : [...DEFAULT_FACTIONS];

  const combatants: RunCombatant[] = [];

  // Party members
  for (const memberId of enc.party_member_ids) {
    const member = par.find((m) => m.id === memberId);
    if (!member) continue;
    combatants.push({
      instance_id: `p-${member.id}`,
      type: "player",
      name: member.name,
      faction_id: "players",
      initiative: member.current_initiative ?? null,
      hp: member.current_hp,
      max_hp: member.max_hp,
      ac: String(member.ac),
      conditions: [...(member.conditions ?? [])],
      curses: [...(member.curses ?? [])],
      death_saves: {
        successes: member.death_save_successes ?? 0,
        failures: member.death_save_failures ?? 0,
      },
      party_member_id: member.id,
      dex_mod: Math.floor(((member.dex ?? 10) - 10) / 2),
    });
  }

  // Companions
  for (const compId of enc.companion_ids ?? []) {
    const comp = (companions.value ?? []).find((c) => c.id === compId);
    if (!comp) continue;
    combatants.push({
      instance_id: `c-${comp.id}`,
      type: "player",
      name: comp.name,
      faction_id: "players",
      initiative: null,
      hp: comp.current_hp,
      max_hp: comp.max_hp,
      ac: String(comp.ac),
      conditions: [...comp.conditions],
      curses: [],
      death_saves: { successes: 0, failures: 0 },
      dex_mod: 0,
    });
  }

  // Monsters
  for (const entry of enc.combatants) {
    const monster = mons.find((m) => m.id === entry.monster_id);
    if (!monster) continue;
    const sb = monster.stat_block;
    const maxHp = parseInt(String(sb?.hit_points ?? "1").split(" ")[0], 10) || 1;
    const dex = Number(sb?.dex ?? 10);
    const dexMod = Math.floor((dex - 10) / 2);
    const ac = String(sb?.armor_class ?? 10);
    for (let i = 0; i < entry.count; i++) {
      const displayName =
        entry.count > 1
          ? `${entry.custom_name || monster.name} ${i + 1}`
          : entry.custom_name || monster.name;
      combatants.push({
        instance_id: `m-${entry.id}-${i}`,
        type: "monster",
        name: displayName,
        faction_id: entry.faction_id,
        initiative: null,
        hp: maxHp,
        max_hp: maxHp,
        ac,
        conditions: [],
        curses: [],
        death_saves: { successes: 0, failures: 0 },
        monster_id: monster.id,
        dex_mod: dexMod,
      });
    }
  }

  store.combatants = combatants;
}
</script>
