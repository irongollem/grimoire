import { ref, computed } from "vue";
import { defineStore } from "pinia";
import type { RunCombatant, FactionDef } from "@/types/encounter.types";

export const useEncounterRunStore = defineStore("encounterRun", () => {
  const encounterId = ref<string | null>(null);
  const encounterName = ref("");
  const round = ref(1);
  const activeIndex = ref(0); // index into sortedCombatants
  const combatants = ref<RunCombatant[]>([]);
  const factions = ref<FactionDef[]>([]);
  const started = ref(false); // true = initiative locked + sorted

  // Sorted by initiative desc, dex_mod desc (tiebreaker: players first)
  const sortedCombatants = computed(() =>
    [...combatants.value].sort((a, b) => {
      const ia = a.initiative ?? -999;
      const ib = b.initiative ?? -999;
      if (ib !== ia) return ib - ia;
      if (a.type !== b.type) return a.type === "player" ? -1 : 1;
      return b.dex_mod - a.dex_mod;
    }),
  );

  const activeCombatant = computed(() => sortedCombatants.value[activeIndex.value] ?? null);

  function rollInitiative(instanceId: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.initiative = Math.floor(Math.random() * 20) + 1 + c.dex_mod;
  }

  function rollAllInitiatives() {
    for (const c of combatants.value) {
      if (c.type === "player" && c.initiative !== null) continue; // keep player-set initiatives
      c.initiative = Math.floor(Math.random() * 20) + 1 + c.dex_mod;
    }
    started.value = true;
    activeIndex.value = 0;
    round.value = 1;
  }

  function setInitiative(instanceId: string, value: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (c) c.initiative = value;
  }

  function nextTurn() {
    const sorted = sortedCombatants.value;
    const aliveSorted = sorted.filter((c) => c.hp > 0 || c.type === "player");
    if (!aliveSorted.length) return;

    // Find current active in sorted list
    const currentId = sorted[activeIndex.value]?.instance_id;
    const currentPosInAlive = aliveSorted.findIndex((c) => c.instance_id === currentId);
    const nextInAlive = (currentPosInAlive + 1) % aliveSorted.length;
    const nextId = aliveSorted[nextInAlive].instance_id;
    const nextIndexInSorted = sorted.findIndex((c) => c.instance_id === nextId);

    if (nextInAlive === 0) round.value++;
    activeIndex.value = nextIndexInSorted;
  }

  function prevTurn() {
    const sorted = sortedCombatants.value;
    const aliveSorted = sorted.filter((c) => c.hp > 0 || c.type === "player");
    if (!aliveSorted.length) return;

    const currentId = sorted[activeIndex.value]?.instance_id;
    const currentPosInAlive = aliveSorted.findIndex((c) => c.instance_id === currentId);
    const prevInAlive = (currentPosInAlive - 1 + aliveSorted.length) % aliveSorted.length;
    const prevId = aliveSorted[prevInAlive].instance_id;
    const prevIndexInSorted = sorted.findIndex((c) => c.instance_id === prevId);

    if (currentPosInAlive === 0 && round.value > 1) round.value--;
    activeIndex.value = prevIndexInSorted;
  }

  function adjustHp(instanceId: string, delta: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.hp = Math.min(c.max_hp, Math.max(0, c.hp + delta));
  }

  function setHp(instanceId: string, value: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.hp = Math.min(c.max_hp, Math.max(0, value));
  }

  function toggleCondition(instanceId: string, condition: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    const idx = c.conditions.indexOf(condition);
    if (idx >= 0) c.conditions.splice(idx, 1);
    else c.conditions.push(condition);
  }

  function addCurse(instanceId: string, curse: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c || !curse.trim() || c.curses.includes(curse.trim())) return;
    c.curses.push(curse.trim());
  }

  function removeCurse(instanceId: string, curse: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.curses = c.curses.filter((cu) => cu !== curse);
  }

  function reset() {
    encounterId.value = null;
    encounterName.value = "";
    round.value = 1;
    activeIndex.value = 0;
    combatants.value = [];
    factions.value = [];
    started.value = false;
  }

  function hydrateFromLive(state: {
    encounter_id: string;
    encounter_name: string;
    factions: FactionDef[];
    current_round: number;
    active_combatant_index: number;
    combatants_live: RunCombatant[];
  }) {
    encounterId.value = state.encounter_id;
    encounterName.value = state.encounter_name;
    factions.value = state.factions;
    combatants.value = state.combatants_live;
    round.value = state.current_round;
    activeIndex.value = state.active_combatant_index;
    started.value = true;
  }

  return {
    encounterId,
    encounterName,
    round,
    activeIndex,
    combatants,
    factions,
    started,
    sortedCombatants,
    activeCombatant,
    rollInitiative,
    rollAllInitiatives,
    setInitiative,
    nextTurn,
    prevTurn,
    adjustHp,
    setHp,
    toggleCondition,
    addCurse,
    removeCurse,
    reset,
    hydrateFromLive,
  };
});
