import { ref, computed } from "vue";
import { defineStore } from "pinia";
import type { RunCombatant, FactionDef, RevealState, EncounterEvent, EventTrigger, SpawnDef, WildshapeState } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";
import type { Trap } from "@/types/trap.types";

export const useEncounterRunStore = defineStore("encounterRun", () => {
  const encounterId = ref<string | null>(null);
  const encounterName = ref("");
  const round = ref(1);
  const activeIndex = ref(0); // index into sortedCombatants
  const combatants = ref<RunCombatant[]>([]);
  const factions = ref<FactionDef[]>([]);
  const started = ref(false); // true = initiative locked + sorted
  const events = ref<EncounterEvent[]>([]);
  const eventsFired = ref<string[]>([]);
  const traps = ref<Trap[]>([]);
  const availableMonsters = ref<Monster[]>([]);
  const availableNpcs = ref<Npc[]>([]);
  const pendingBroadcasts = ref<string[]>([]);

  // Boss-fight mechanics state
  const lairEnabled = ref(false);
  /** instance_id of the combatant whose stat_block.lair_actions should fire at init 20. */
  const lairOwnerInstanceId = ref<string | null>(null);
  /** Rounds in which a lair action has already been used. Keyed by round number. */
  const lairFiredRounds = ref<Set<number>>(new Set());

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
  }

  function startCombat() {
    if (!started.value) rollAllInitiatives();
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

    // Clear surprise on the combatant whose turn is ending — surprised creatures
    // can't act on their first turn, but the flag lifts at its end per 5e RAW.
    const endingCombatant = sorted[activeIndex.value];
    if (endingCombatant?.surprised) endingCombatant.surprised = false;

    // Find current active in sorted list
    const currentId = endingCombatant?.instance_id;
    const currentPosInAlive = aliveSorted.findIndex((c) => c.instance_id === currentId);
    const nextInAlive = (currentPosInAlive + 1) % aliveSorted.length;
    const nextId = aliveSorted[nextInAlive].instance_id;
    const nextIndexInSorted = sorted.findIndex((c) => c.instance_id === nextId);

    if (nextInAlive === 0) round.value++;
    activeIndex.value = nextIndexInSorted;

    // Refresh legendary action pool at the start of that creature's turn.
    const nextCombatant = sorted[nextIndexInSorted];
    if (nextCombatant && typeof nextCombatant.legendary_action_cap === "number") {
      nextCombatant.legendary_actions_remaining = nextCombatant.legendary_action_cap;
    }
    checkEvents();
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

  function enterWildshape(instanceId: string, beast: { id: string; name: string; max_hp: number; ac: string }) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.wildshape = {
      monster_id: beast.id,
      beast_name: beast.name,
      original_hp: c.hp,
      original_max_hp: c.max_hp,
      original_ac: c.ac,
    } satisfies WildshapeState;
    c.hp = beast.max_hp;
    c.max_hp = beast.max_hp;
    c.ac = beast.ac;
  }

  function revertWildshape(instanceId: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c?.wildshape) return;
    c.hp = c.wildshape.original_hp;
    c.max_hp = c.wildshape.original_max_hp;
    c.ac = c.wildshape.original_ac;
    c.wildshape = undefined;
  }

  function adjustHp(instanceId: string, delta: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    if (delta < 0 && c.temp_hp) {
      const absorbed = Math.min(c.temp_hp, -delta);
      c.temp_hp = c.temp_hp - absorbed;
      delta = delta + absorbed;
      if (c.temp_hp === 0) c.temp_hp = undefined;
    }
    c.hp = Math.min(c.max_hp, Math.max(0, c.hp + delta));
    if (c.hp === 0 && c.wildshape) revertWildshape(instanceId);
    checkEvents();
  }

  function setTempHp(instanceId: string, value: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    // Temp HP doesn't stack — take the higher value
    c.temp_hp = Math.max(c.temp_hp ?? 0, value) || undefined;
  }

  function setHp(instanceId: string, value: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.hp = Math.min(c.max_hp, Math.max(0, value));
    if (c.hp === 0 && c.wildshape) revertWildshape(instanceId);
    checkEvents();
  }

  function toggleCondition(instanceId: string, condition: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    const idx = c.conditions.indexOf(condition);
    if (idx >= 0) c.conditions.splice(idx, 1);
    else c.conditions.push(condition);
  }

  /** Replace a combatant's full conditions array — used when several
   *  entries change at once (e.g. exhaustion replacement). */
  function setConditions(instanceId: string, conditions: string[]) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.conditions = conditions;
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

  function setRevealState(instanceId: string, state: RevealState) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (c) c.reveal_state = state;
  }

  function cycleRevealState(instanceId: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    const order: RevealState[] = ["hidden", "unseen", "revealed"];
    const idx = order.indexOf(c.reveal_state ?? "hidden");
    c.reveal_state = order[(idx + 1) % order.length];
  }

  function shouldTrigger(trigger: EventTrigger): boolean {
    if (trigger.type === "round_start") return round.value >= trigger.round;
    if (trigger.type === "combatant_hp_pct") {
      return combatants.value
        .filter((c) => c.def_id === trigger.combatant_def_id)
        .some((c) => c.max_hp > 0 && (c.hp / c.max_hp) * 100 <= trigger.pct);
    }
    if (trigger.type === "combatant_dies") {
      return combatants.value
        .filter((c) => c.def_id === trigger.combatant_def_id)
        .some((c) => c.hp <= 0);
    }
    return false;
  }

  function addMonster(monsterId: string, factionId: string, count: number, customName?: string) {
    const monster = availableMonsters.value.find((m) => m.id === monsterId);
    if (!monster) return;
    const sb = monster.stat_block;
    const maxHp = parseInt(String(sb?.hit_points ?? "1").split(" ")[0], 10) || 1;
    const dex = Number(sb?.dex ?? 10);
    const dexMod = Math.floor((dex - 10) / 2);
    const ac = String(sb?.armor_class ?? 10);
    const spawnKey = `spawn-${monsterId}-${Date.now()}`;
    for (let i = 0; i < count; i++) {
      const displayName = count > 1 ? `${customName || monster.name} ${i + 1}` : customName || monster.name;
      combatants.value.push({
        instance_id: `${spawnKey}-${i}`,
        type: "monster",
        name: displayName,
        faction_id: factionId,
        initiative: started.value ? Math.floor(Math.random() * 20) + 1 + dexMod : null,
        hp: maxHp,
        max_hp: maxHp,
        ac,
        conditions: [],
        curses: [],
        death_saves: { successes: 0, failures: 0 },
        monster_id: monster.id,
        dex_mod: dexMod,
        reveal_state: "hidden",
        portrait_url: monster.image_url ?? null,
        portrait_focal_point: monster.portrait_focal_point ?? null,
      });
    }
  }

  function addNpc(npcId: string, factionId: string, count: number, customName?: string) {
    const npc = availableNpcs.value.find((n) => n.id === npcId);
    if (!npc) return;
    const sb = npc.stat_block;
    const maxHp = parseInt(String(sb?.hit_points ?? "10").split(" ")[0], 10) || 10;
    const dex = Number(sb?.dex ?? 10);
    const dexMod = Math.floor((dex - 10) / 2);
    const ac = String(sb?.armor_class ?? 10);
    const spawnKey = `spawn-npc-${npcId}-${Date.now()}`;
    for (let i = 0; i < count; i++) {
      const displayName = count > 1 ? `${customName || npc.name} ${i + 1}` : customName || npc.name;
      combatants.value.push({
        instance_id: `${spawnKey}-${i}`,
        type: "monster",
        name: displayName,
        faction_id: factionId,
        initiative: started.value ? Math.floor(Math.random() * 20) + 1 + dexMod : null,
        hp: maxHp,
        max_hp: maxHp,
        ac,
        conditions: [],
        curses: [],
        death_saves: { successes: 0, failures: 0 },
        npc_id: npc.id,
        dex_mod: dexMod,
        reveal_state: "hidden",
        portrait_url: npc.portrait_url ?? null,
        portrait_focal_point: npc.portrait_focal_point ?? null,
      });
    }
  }

  function spawnFromDef(spawn: SpawnDef) {
    const monster = availableMonsters.value.find((m) => m.id === spawn.monster_id);
    if (!monster) return;
    const sb = monster.stat_block;
    const maxHp = parseInt(String(sb?.hit_points ?? "1").split(" ")[0], 10) || 1;
    const dex = Number(sb?.dex ?? 10);
    const dexMod = Math.floor((dex - 10) / 2);
    const ac = String(sb?.armor_class ?? 10);
    const spawnKey = `spawn-${spawn.monster_id}-${Date.now()}`;
    for (let i = 0; i < spawn.count; i++) {
      const displayName =
        spawn.count > 1 ? `${spawn.custom_name || monster.name} ${i + 1}` : spawn.custom_name || monster.name;
      combatants.value.push({
        instance_id: `${spawnKey}-${i}`,
        type: "monster",
        name: displayName,
        faction_id: spawn.faction_id,
        initiative: started.value ? Math.floor(Math.random() * 20) + 1 + dexMod : null,
        hp: maxHp,
        max_hp: maxHp,
        ac,
        conditions: [],
        curses: [],
        death_saves: { successes: 0, failures: 0 },
        monster_id: monster.id,
        dex_mod: dexMod,
        reveal_state: "hidden",
        portrait_url: monster.image_url ?? null,
        portrait_focal_point: monster.portrait_focal_point ?? null,
      });
    }
  }

  function executeEvent(event: EncounterEvent) {
    if (!eventsFired.value.includes(event.id)) eventsFired.value.push(event.id);
    for (const action of event.actions) {
      if (action.type === "spawn_combatants") {
        for (const spawn of action.spawns) spawnFromDef(spawn);
      } else if (action.type === "broadcast_message") {
        pendingBroadcasts.value.push(action.message);
      }
    }
  }

  function fireEvent(eventId: string) {
    const event = events.value.find((e) => e.id === eventId);
    if (!event) return;
    executeEvent(event);
  }

  function checkEvents() {
    if (!started.value) return;
    for (const event of events.value) {
      if (event.fire_once && eventsFired.value.includes(event.id)) continue;
      if (event.trigger.type !== "manual" && shouldTrigger(event.trigger)) {
        executeEvent(event);
      }
    }
  }

  function clearPendingBroadcast(message: string) {
    const idx = pendingBroadcasts.value.indexOf(message);
    if (idx >= 0) pendingBroadcasts.value.splice(idx, 1);
  }

  function reset() {
    encounterId.value = null;
    encounterName.value = "";
    round.value = 0;
    activeIndex.value = 0;
    combatants.value = [];
    factions.value = [];
    started.value = false;
    events.value = [];
    eventsFired.value = [];
    traps.value = [];
    availableMonsters.value = [];
    availableNpcs.value = [];
    pendingBroadcasts.value = [];
    lairEnabled.value = false;
    lairOwnerInstanceId.value = null;
    lairFiredRounds.value = new Set();
  }

  // ── Boss mechanics ───────────────────────────────────────────────────────────

  function setBossMechanics(opts: { lairEnabled: boolean; lairOwnerInstanceId: string | null }) {
    lairEnabled.value = opts.lairEnabled;
    lairOwnerInstanceId.value = opts.lairOwnerInstanceId;
  }

  function toggleSurprised(instanceId: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.surprised = !c.surprised;
  }

  /** Seed legendary-action state on every combatant whose monster has a
   *  non-empty `legendary_actions` array. Called once at combat start after
   *  monsters are loaded so the runner knows who gets a pool. */
  function primeLegendaryActions(caps: Record<string, number>) {
    // caps: instance_id → cap (typically 3). Missing entries get no pool.
    for (const c of combatants.value) {
      const cap = caps[c.instance_id];
      if (cap && cap > 0) {
        c.legendary_action_cap = cap;
        c.legendary_actions_remaining = cap;
      }
    }
  }

  /** Spend N legendary actions from `instanceId` — clamped at zero. Returns
   *  the actual amount spent (0 if there weren't enough). */
  function spendLegendaryActions(instanceId: string, cost: number): number {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c || typeof c.legendary_actions_remaining !== "number") return 0;
    const available = c.legendary_actions_remaining;
    const spent = Math.min(available, cost);
    c.legendary_actions_remaining = available - spent;
    return spent;
  }

  const lairCanFireThisRound = computed(() =>
    lairEnabled.value
      && lairOwnerInstanceId.value !== null
      && !lairFiredRounds.value.has(round.value)
      && (combatants.value.find((c) => c.instance_id === lairOwnerInstanceId.value)?.hp ?? 0) > 0,
  );

  function markLairFired() {
    lairFiredRounds.value = new Set([...lairFiredRounds.value, round.value]);
  }

  function hydrateFromLive(state: {
    encounter_id: string;
    encounter_name: string;
    factions: FactionDef[];
    current_round: number;
    active_combatant_index: number;
    combatants_live: RunCombatant[];
    events?: EncounterEvent[];
    events_fired?: string[];
    traps?: Trap[];
  }) {
    encounterId.value = state.encounter_id;
    encounterName.value = state.encounter_name;
    factions.value = state.factions;
    combatants.value = state.combatants_live;
    round.value = state.current_round;
    activeIndex.value = state.active_combatant_index;
    started.value = state.current_round > 0;
    if (state.events) events.value = state.events;
    if (state.events_fired) eventsFired.value = state.events_fired;
    if (state.traps) traps.value = state.traps;
  }

  return {
    encounterId,
    encounterName,
    round,
    activeIndex,
    combatants,
    factions,
    started,
    events,
    eventsFired,
    traps,
    availableMonsters,
    availableNpcs,
    pendingBroadcasts,
    // Boss mechanics state
    lairEnabled,
    lairOwnerInstanceId,
    lairCanFireThisRound,
    sortedCombatants,
    activeCombatant,
    rollInitiative,
    rollAllInitiatives,
    startCombat,
    setInitiative,
    nextTurn,
    prevTurn,
    adjustHp,
    setHp,
    setTempHp,
    toggleCondition,
    setConditions,
    addCurse,
    removeCurse,
    setRevealState,
    cycleRevealState,
    enterWildshape,
    revertWildshape,
    addMonster,
    addNpc,
    fireEvent,
    checkEvents,
    clearPendingBroadcast,
    reset,
    hydrateFromLive,
    // Boss mechanics helpers
    setBossMechanics,
    toggleSurprised,
    primeLegendaryActions,
    spendLegendaryActions,
    markLairFired,
  };
});
