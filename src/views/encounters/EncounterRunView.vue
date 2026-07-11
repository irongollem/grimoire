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
import { sizeToFootprint } from "@/lib/tokenFootprint";
import { useParty } from "@/composables/useParty";
import { useCompanions } from "@/composables/useCompanions";
import { useNpcs } from "@/composables/useNpcs";
import { useTraps } from "@/composables/useTraps";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useEncounterLive } from "@/composables/useEncounterLive";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { RunCombatant, Encounter } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import type { Npc } from "@/types/npc.types";
import type { Trap } from "@/types/trap.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EncounterRunner from "@/components/encounters/EncounterRunner.vue";

const route = useRoute();
const id = computed(() => route.params.id as string);

const { data: encounter } = useEncounter(id);
const { data: monsters } = useAllMonsters();
const { data: party } = useParty();
const { data: companions } = useCompanions();
const { data: npcs } = useNpcs();
const { data: allTraps } = useTraps();
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

  const combatants: RunCombatant[] = [];

  // Party members
  for (const memberId of enc.party_member_ids) {
    const member = par.find((m) => m.id === memberId);
    if (!member) continue;
    combatants.push({
      instance_id: `p-${member.id}`,
      type: "player",
      name: member.name,
      faction_id: enc.party_member_factions?.[member.id] ?? "players",
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
      portrait_url: member.portrait_url ?? null,
      portrait_focal_point: null, // party members don't store focal_point yet
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
      faction_id: enc.party_member_factions?.[comp.id] ?? "players",
      initiative: null,
      hp: comp.current_hp,
      max_hp: comp.max_hp,
      ac: String(comp.ac),
      conditions: [...comp.conditions],
      curses: [],
      death_saves: { successes: 0, failures: 0 },
      dex_mod: 0,
      portrait_url: comp.portrait_url ?? null,
      portrait_focal_point: comp.portrait_focal_point ?? null,
      companion_id: comp.id,
    });
  }

  // Monsters and NPCs
  for (const entry of enc.combatants) {
    if (entry.monster_id) {
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
          def_id: entry.id,
          dex_mod: dexMod,
          reveal_state: "hidden",
          portrait_url: monster.image_url ?? null,
          portrait_focal_point: monster.portrait_focal_point ?? null,
          position: entry.starting_positions?.[i] ?? null,
          footprint: sizeToFootprint(monster.size),
        });
      }
    } else if (entry.npc_id) {
      const npc = npcList.find((n) => n.id === entry.npc_id);
      if (!npc) continue;
      const sb = npc.stat_block;
      const maxHp = parseInt(String(sb?.hit_points ?? "10").split(" ")[0], 10) || 10;
      const dex = Number(sb?.dex ?? 10);
      const dexMod = Math.floor((dex - 10) / 2);
      const ac = String(sb?.armor_class ?? 10);
      for (let i = 0; i < entry.count; i++) {
        const displayName =
          entry.count > 1
            ? `${entry.custom_name || npc.name} ${i + 1}`
            : entry.custom_name || npc.name;
        combatants.push({
          instance_id: `n-${entry.id}-${i}`,
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
          npc_id: npc.id,
          def_id: entry.id,
          dex_mod: dexMod,
          reveal_state: "hidden",
          portrait_url: npc.portrait_url ?? null,
          portrait_focal_point: npc.portrait_focal_point ?? null,
          position: entry.starting_positions?.[i] ?? null,
          footprint: 1,
        });
      }
    }
  }

  store.combatants = combatants;
  store.availableMonsters = mons;
  store.availableNpcs = npcList;
  store.events = enc.events ?? [];
  store.eventsFired = [];
  store.traps = traps;

  // Boss mechanics: prime legendary action caps on any monster whose stat
  // block declares legendary_actions. Default cap is 3 per 5e RAW. If a
  // stat block declares `legendary_action_uses` in future, we'd read that
  // — for now the hard default keeps things simple.
  const legendaryCaps: Record<string, number> = {};
  for (const c of combatants) {
    if (!c.monster_id) continue;
    const monster = mons.find((m) => m.id === c.monster_id);
    if (monster?.stat_block?.legendary_actions?.length) {
      legendaryCaps[c.instance_id] = 3;
    }
  }
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
