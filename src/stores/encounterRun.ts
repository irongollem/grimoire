import { ref, computed } from "vue";
import { defineStore } from "pinia";
import type { RunCombatant, FactionDef, RevealState, EncounterEvent, EventTrigger, SpawnDef, WildshapeState } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";
import type { Trap } from "@/types/trap.types";
import type { PartyMemberUpdate } from "@/types/party.types";
import { sizeToFootprint } from "@/lib/tokenFootprint";
import { sortCombatantsByInitiative, initiativeModifier } from "@/lib/combatantSort";
import { hitPointsToMax } from "@/lib/dice";
import { applyDamage, applyHealing, betterTempHp, type HpPools } from "@/lib/hitPoints";

/** Persists a player-combatant change to party_members and invalidates the
 *  party query cache. The store stays UI-only — the actual DB write + cache
 *  invalidation is owned by a TanStack Query mutation registered by the
 *  encounter runner via `setPersistHandler`. */
export type PersistPlayerHandler = (partyMemberId: string, patch: PartyMemberUpdate) => void;

/** Rolls one combatant's initiative. Registered by the encounter runner so the
 *  DM's dice-mode preference is honoured — in "physical" mode this resolves via
 *  the manual-entry prompt instead of Math.random(). Returns null when the DM
 *  cancels the prompt. Without a registered roller the store falls back to an
 *  automatic d20 (used by tests and by any non-UI caller). */
export type InitiativeRoller = (combatant: RunCombatant) => Promise<number | null>;

export const useEncounterRunStore = defineStore("encounterRun", () => {
  /** Registered by the encounter runner; routes persistence through the
   *  `useUpdatePartyMember` mutation so the party cache is invalidated. */
  let persistHandler: PersistPlayerHandler | null = null;

  function setPersistHandler(handler: PersistPlayerHandler | null) {
    persistHandler = handler;
  }

  /** Registered by the encounter runner; routes initiative rolls through
   *  `usePromptedRoll` so physical-dice mode prompts the DM for each result. */
  let initiativeRoller: InitiativeRoller | null = null;

  function setInitiativeRoller(roller: InitiativeRoller | null) {
    initiativeRoller = roller;
  }

  /** The store is the immediate source of truth for DM display; this call
   *  persists the change so the player's sheet and future sessions see it too. */
  function persistPlayer(c: RunCombatant, patch: PartyMemberUpdate) {
    if (c.type !== "player" || !c.party_member_id) return;
    persistHandler?.(c.party_member_id, patch);
  }

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

  // Sorted by initiative desc, players-first on tie, dex_mod desc (shared comparator)
  const sortedCombatants = computed(() => sortCombatantsByInitiative(combatants.value));

  const activeCombatant = computed(() => sortedCombatants.value[activeIndex.value] ?? null);

  /** Automatic d20 + modifier — the fallback when no roller is registered, and
   *  what mid-combat spawns use (a modal per spawned goblin would stall the turn). */
  function autoRollInitiative(c: Pick<RunCombatant, "dex_mod" | "initiative_bonus">): number {
    return Math.floor(Math.random() * 20) + 1 + initiativeModifier(c);
  }

  function rollOneInitiative(c: RunCombatant): Promise<number | null> {
    return initiativeRoller ? initiativeRoller(c) : Promise.resolve(autoRollInitiative(c));
  }

  /** When true, every combatant's initiative is re-rolled and the order
   *  re-sorted at the start of each new round (the "Random Initiative Each
   *  Round" optional rule). Set by the runner from the campaign rule toggle. */
  const randomizeInitiativeEachRound = ref(false);

  function setRandomizeInitiativeEachRound(value: boolean) {
    randomizeInitiativeEachRound.value = value;
  }

  /** Refill the per-turn pools a combatant regains at the start of its turn
   *  (5e RAW: reaction resets, legendary actions refill). */
  function refreshTurnStart(c: RunCombatant | undefined) {
    if (!c) return;
    c.reactionUsed = false;
    if (typeof c.legendary_action_cap === "number") {
      c.legendary_actions_remaining = c.legendary_action_cap;
    }
  }

  /** Re-roll everyone's initiative silently (auto d20 — never a physical-dice
   *  prompt, since this fires once per round) and hand the turn to the top of
   *  the freshly-sorted order. */
  function reshuffleInitiative() {
    for (const c of combatants.value) {
      c.initiative = autoRollInitiative(c);
    }
    const sorted = sortedCombatants.value;
    const firstAlive = sorted.findIndex((c) => c.hp > 0 || c.type === "player");
    activeIndex.value = firstAlive >= 0 ? firstAlive : 0;
    refreshTurnStart(sorted[activeIndex.value]);
  }

  /** True while a roll is in flight. In physical-dice mode that means a
   *  manual-entry prompt is open, so every roll control (top bar + per-combatant)
   *  disables until it's answered — the prompt is a single global slot. */
  const rollingInitiative = ref(false);

  /** Rolls (or re-rolls) one combatant — the per-row button. Unlike
   *  `rollAllInitiatives` this is an explicit request, so it does replace an
   *  existing value. */
  async function rollInitiative(instanceId: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c || rollingInitiative.value) return;
    rollingInitiative.value = true;
    try {
      const rolled = await rollOneInitiative(c);
      if (rolled !== null) c.initiative = rolled;
    } finally {
      rollingInitiative.value = false;
    }
  }

  /** Fills in everyone who doesn't have an initiative yet. Never overwrites a
   *  value that's already there — a player's own roll, a monster the DM rolled
   *  or typed by hand. Rolls sequentially because physical-dice mode prompts the
   *  DM once per combatant; cancelling stops the run and leaves the rest blank
   *  so the button can be pressed again to pick up where it left off. */
  async function rollAllInitiatives() {
    if (rollingInitiative.value) return;
    rollingInitiative.value = true;
    try {
      for (const c of combatants.value) {
        if (c.initiative !== null) continue;
        const rolled = await rollOneInitiative(c);
        if (rolled === null) return;
        c.initiative = rolled;
      }
      started.value = true;
    } finally {
      rollingInitiative.value = false;
    }
  }

  async function startCombat() {
    if (!started.value) await rollAllInitiatives();
    // Combat starts even if the DM cancelled a manual-entry prompt — anyone left
    // without a value sorts to the end of the order and can be typed in there.
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

    if (nextInAlive === 0) {
      round.value++;
      // New round: with random initiative on, re-roll and re-sort, then start
      // from the top of the new order (which also refreshes that combatant's
      // per-turn pools). Nothing below applies since the order just changed.
      if (randomizeInitiativeEachRound.value) {
        reshuffleInitiative();
        checkEvents();
        return;
      }
    }
    activeIndex.value = nextIndexInSorted;

    // At the start of each combatant's turn: refresh their reaction and
    // legendary action pool (5e RAW: reactions reset at start of YOUR turn).
    refreshTurnStart(sorted[nextIndexInSorted]);
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

  function enterWildshape(instanceId: string, beast: { id: string; name: string; image_url: string | null; max_hp: number; ac: string }, wildshapesUsed: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    // Player's real hp/max_hp/ac are NEVER modified — beast form is a self-contained overlay.
    // Reverting is simply clearing this field; nothing needs restoring.
    c.wildshape = {
      monster_id: beast.id,
      beast_name: beast.name,
      beast_image_url: beast.image_url,
      beast_hp: beast.max_hp,
      beast_max_hp: beast.max_hp,
      beast_ac: beast.ac,
    } satisfies WildshapeState;
    persistPlayer(c, { wildshape_state: c.wildshape, wildshapes_used: wildshapesUsed });
  }

  function revertWildshape(instanceId: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c?.wildshape) return;
    // Real stats were never touched — just remove the overlay.
    c.wildshape = undefined;
    persistPlayer(c, { wildshape_state: null });
  }

  function adjustHp(instanceId: string, delta: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    const pools: HpPools = {
      current_hp: c.hp,
      max_hp: c.max_hp,
      temp_hp: c.temp_hp ?? 0,
      beast: c.wildshape ? { hp: c.wildshape.beast_hp, max_hp: c.wildshape.beast_max_hp } : null,
    };
    if (delta < 0) {
      // Temp HP absorbs first, then the beast form, then real HP (5e RAW).
      const out = applyDamage(pools, -delta);
      c.temp_hp = out.temp_hp || undefined;
      c.hp = out.current_hp;
      if (out.reverted) revertWildshape(instanceId); // clears c.wildshape
      else if (c.wildshape && out.beast_hp !== null) c.wildshape.beast_hp = out.beast_hp;
    } else {
      const out = applyHealing(pools, delta);
      c.hp = out.current_hp;
      if (c.wildshape && out.beast_hp !== null) c.wildshape.beast_hp = out.beast_hp;
    }
    if (c.type === "player") {
      persistPlayer(c, { current_hp: c.hp, temp_hp: c.temp_hp ?? 0, wildshape_state: c.wildshape ?? null });
    }
    checkEvents();
  }

  function setTempHp(instanceId: string, value: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    // Temp HP doesn't stack — take the higher value
    c.temp_hp = betterTempHp(c.temp_hp ?? 0, value) || undefined;
    persistPlayer(c, { temp_hp: c.temp_hp ?? 0 });
  }

  /** Adopt a temp-HP value that came FROM party_members (the player changed it on
   *  their own sheet). Assigns verbatim — no max(), no persist — because the DB row
   *  is the authority here and writing back would echo our own realtime event. */
  function ingestTempHp(instanceId: string, value: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.temp_hp = value > 0 ? value : undefined;
  }

  function setHp(instanceId: string, value: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    if (c.wildshape) {
      c.wildshape.beast_hp = Math.min(c.wildshape.beast_max_hp, Math.max(0, value));
      if (c.wildshape.beast_hp === 0) revertWildshape(instanceId);
    } else {
      c.hp = Math.min(c.max_hp, Math.max(0, value));
    }
    persistPlayer(c, { current_hp: c.hp, wildshape_state: c.wildshape ?? null });
    checkEvents();
  }

  // DM edits a combatant's max HP on the fly (e.g. a monster that spawned with the
  // wrong HP, or scaling a fight live). Edits the beast overlay when wildshaped,
  // real max otherwise. A combatant that was at full stays full at the new max so
  // bumping a 2/2 monster to 11 gives it 11/11, not 2/11.
  function setMaxHp(instanceId: string, value: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    const max = Math.max(1, Math.floor(value));
    if (c.wildshape) {
      const wasFull = c.wildshape.beast_hp >= c.wildshape.beast_max_hp;
      c.wildshape.beast_max_hp = max;
      c.wildshape.beast_hp = wasFull ? max : Math.min(c.wildshape.beast_hp, max);
      persistPlayer(c, { wildshape_state: c.wildshape });
    } else {
      const wasFull = c.hp >= c.max_hp;
      c.max_hp = max;
      c.hp = wasFull ? max : Math.min(c.hp, max);
      persistPlayer(c, { current_hp: c.hp, max_hp: max });
    }
    checkEvents();
  }

  function toggleCondition(instanceId: string, condition: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    const idx = c.conditions.indexOf(condition);
    if (idx >= 0) c.conditions.splice(idx, 1);
    else c.conditions.push(condition);
    persistPlayer(c, { conditions: c.conditions });
  }

  /** Replace a combatant's full conditions array — used when several
   *  entries change at once (e.g. exhaustion replacement). */
  function setConditions(instanceId: string, conditions: string[]) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.conditions = conditions;
    persistPlayer(c, { conditions: c.conditions });
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
    const maxHp = hitPointsToMax(sb?.hit_points, 1);
    const dex = Number(sb?.dex ?? 10);
    const dexMod = Math.floor((dex - 10) / 2);
    const initiativeBonus = sb?.initiative_bonus ?? null;
    const ac = String(sb?.armor_class ?? 10);
    const spawnKey = `spawn-${monsterId}-${Date.now()}`;
    const legendaryCap = sb?.legendary_actions?.length ? 3 : undefined;
    for (let i = 0; i < count; i++) {
      const displayName = count > 1 ? `${customName || monster.name} ${i + 1}` : customName || monster.name;
      combatants.value.push({
        instance_id: `${spawnKey}-${i}`,
        type: "monster",
        name: displayName,
        faction_id: factionId,
        initiative: started.value ? autoRollInitiative({ dex_mod: dexMod, initiative_bonus: initiativeBonus }) : null,
        hp: maxHp,
        max_hp: maxHp,
        ac,
        conditions: [],
        curses: [],
        death_saves: { successes: 0, failures: 0 },
        monster_id: monster.id,
        dex_mod: dexMod,
        initiative_bonus: initiativeBonus,
        reveal_state: "hidden",
        portrait_url: monster.image_url ?? null,
        portrait_focal_point: monster.portrait_focal_point ?? null,
        footprint: sizeToFootprint(monster.size),
        ...(legendaryCap !== undefined && {
          legendary_action_cap: legendaryCap,
          legendary_actions_remaining: legendaryCap,
        }),
      });
    }
  }

  function addNpc(npcId: string, factionId: string, count: number, customName?: string) {
    const npc = availableNpcs.value.find((n) => n.id === npcId);
    if (!npc) return;
    const sb = npc.stat_block;
    const maxHp = hitPointsToMax(sb?.hit_points, 10);
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
        initiative: started.value ? autoRollInitiative({ dex_mod: dexMod, initiative_bonus: null }) : null,
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
        footprint: 1,
      });
    }
  }

  function spawnFromDef(spawn: SpawnDef) {
    const monster = availableMonsters.value.find((m) => m.id === spawn.monster_id);
    if (!monster) return;
    const sb = monster.stat_block;
    const maxHp = hitPointsToMax(sb?.hit_points, 1);
    const dex = Number(sb?.dex ?? 10);
    const dexMod = Math.floor((dex - 10) / 2);
    const initiativeBonus = sb?.initiative_bonus ?? null;
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
        initiative: started.value ? autoRollInitiative({ dex_mod: dexMod, initiative_bonus: initiativeBonus }) : null,
        hp: maxHp,
        max_hp: maxHp,
        ac,
        conditions: [],
        curses: [],
        death_saves: { successes: 0, failures: 0 },
        monster_id: monster.id,
        dex_mod: dexMod,
        initiative_bonus: initiativeBonus,
        reveal_state: "hidden",
        portrait_url: monster.image_url ?? null,
        portrait_focal_point: monster.portrait_focal_point ?? null,
        footprint: sizeToFootprint(monster.size),
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
    rollingInitiative.value = false;
    randomizeInitiativeEachRound.value = false;
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

  function toggleReaction(instanceId: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.reactionUsed = !c.reactionUsed;
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
    rollingInitiative,
    randomizeInitiativeEachRound,
    setRandomizeInitiativeEachRound,
    reshuffleInitiative,
    rollInitiative,
    rollAllInitiatives,
    setInitiativeRoller,
    startCombat,
    setInitiative,
    nextTurn,
    prevTurn,
    adjustHp,
    setHp,
    setMaxHp,
    setTempHp,
    ingestTempHp,
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
    setPersistHandler,
    hydrateFromLive,
    // Boss mechanics helpers
    setBossMechanics,
    toggleSurprised,
    toggleReaction,
    primeLegendaryActions,
    spendLegendaryActions,
    markLairFired,
  };
});
