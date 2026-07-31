/**
 * Pure, data-in/data-out logic extracted from the encounterRun store: initiative
 * rolling, turn-order stepping, event-trigger evaluation, and spawned-combatant
 * construction. Kept separate so this math can be unit-tested without Pinia and
 * so the store itself stays under the project's soft file-size cap — the store
 * keeps state mutation, persistence, and realtime orchestration and delegates
 * the actual computation here.
 */
import { rollDie } from "@/lib/dice/dice";
import { initiativeModifier } from "@/rules/combatantSort";
import { hitPointsToMax } from "@/lib/dice/dice";
import { sizeToFootprint } from "@/lib/battlemap/tokenFootprint";
import type { RunCombatant, EventTrigger } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";

type InitiativeInputs = Pick<RunCombatant, "dex_mod" | "initiative_bonus">;
type TurnCombatant = Pick<RunCombatant, "instance_id" | "hp" | "type">;
type AliveCombatant = Pick<RunCombatant, "hp" | "type">;

// ── Initiative rolling ──────────────────────────────────────────────────────

/** Automatic d20 + modifier. `rollD20` is injectable so tests can pin the
 *  result; production callers rely on the default, which rolls via
 *  `rollDie(20)` from @/lib/dice. */
export function rollInitiativeValue(c: InitiativeInputs, rollD20: () => number = () => rollDie(20)): number {
  return rollD20() + initiativeModifier(c);
}

/** Re-rolls every combatant's initiative and returns a Map of instance_id →
 *  new value. Pure — does not mutate `combatants`; the caller applies the
 *  results (used for the "Random Initiative Each Round" optional rule). */
export function rollAllInitiativeValues(
  combatants: readonly (InitiativeInputs & { instance_id: string })[],
  rollD20: () => number = () => rollDie(20),
): Map<string, number> {
  const results = new Map<string, number>();
  for (const c of combatants) results.set(c.instance_id, rollInitiativeValue(c, rollD20));
  return results;
}

// ── Turn order ───────────────────────────────────────────────────────────────

/** Index (into a sorted list) of the first combatant able to act this round —
 *  alive monsters, or any player (down players still get a turn for death saves). */
export function findFirstActiveIndex(sorted: readonly AliveCombatant[]): number {
  const firstAlive = sorted.findIndex((c) => c.hp > 0 || c.type === "player");
  return firstAlive >= 0 ? firstAlive : 0;
}

/** Steps the active-turn cursor forward/backward through the alive subset of a
 *  sorted combatant list, wrapping around. Returns the new index into `sorted`
 *  (not into the alive subset) plus whether the step crossed a round boundary
 *  (wrapped past the end going forward, or past the start going backward).
 *  Null when nobody is alive to act. */
export function stepTurnIndex(
  sorted: readonly TurnCombatant[],
  currentIndex: number,
  direction: 1 | -1,
): { sortedIndex: number; wrapped: boolean } | null {
  const aliveSorted = sorted.filter((c) => c.hp > 0 || c.type === "player");
  if (!aliveSorted.length) return null;

  const currentId = sorted[currentIndex]?.instance_id;
  const currentPosInAlive = aliveSorted.findIndex((c) => c.instance_id === currentId);
  const nextInAlive = (((currentPosInAlive + direction) % aliveSorted.length) + aliveSorted.length) % aliveSorted.length;
  const wrapped = direction === 1 ? nextInAlive === 0 : currentPosInAlive === 0;
  const targetId = aliveSorted[nextInAlive].instance_id;
  const sortedIndex = sorted.findIndex((c) => c.instance_id === targetId);
  return { sortedIndex, wrapped };
}

// ── Event triggers ───────────────────────────────────────────────────────────

/** Whether an event's trigger condition currently holds. Pure given the
 *  trigger and a read-only snapshot of round/combatants. */
export function evaluateTrigger(
  trigger: EventTrigger,
  combatants: readonly Pick<RunCombatant, "def_id" | "max_hp" | "hp">[],
  round: number,
): boolean {
  if (trigger.type === "round_start") return round >= trigger.round;
  if (trigger.type === "combatant_hp_pct") {
    return combatants
      .filter((c) => c.def_id === trigger.combatant_def_id)
      .some((c) => c.max_hp > 0 && (c.hp / c.max_hp) * 100 <= trigger.pct);
  }
  if (trigger.type === "combatant_dies") {
    return combatants
      .filter((c) => c.def_id === trigger.combatant_def_id)
      .some((c) => c.hp <= 0);
  }
  return false;
}

// ── Spawned-combatant construction ──────────────────────────────────────────

export interface MonsterSpawnOptions {
  factionId: string;
  count: number;
  customName?: string;
  /** Rolls initiative immediately when true (combat already running); leaves
   *  it null otherwise, same as an unrolled roster entry. */
  started: boolean;
  /** Only the "add monster to a faction" flow seeds a legendary-action pool —
   *  mid-combat event spawns intentionally don't, matching prior behavior. */
  includeLegendaryActions?: boolean;
  rollD20?: () => number;
}

/** Builds the RunCombatant entries for `count` copies of a monster. Pure
 *  aside from `Date.now()` in the instance-id prefix (uniqueness only, not
 *  behavior); the caller pushes the result onto `combatants`. */
export function buildMonsterCombatants(monster: Monster, opts: MonsterSpawnOptions): RunCombatant[] {
  const sb = monster.stat_block;
  const maxHp = hitPointsToMax(sb?.hit_points, 1);
  const dex = Number(sb?.dex ?? 10);
  const dexMod = Math.floor((dex - 10) / 2);
  const initiativeBonus = sb?.initiative_bonus ?? null;
  const ac = String(sb?.armor_class ?? 10);
  const spawnKey = `spawn-${monster.id}-${Date.now()}`;
  const legendaryCap = opts.includeLegendaryActions && sb?.legendary_actions?.length ? 3 : undefined;

  const out: RunCombatant[] = [];
  for (let i = 0; i < opts.count; i++) {
    const displayName = opts.count > 1 ? `${opts.customName || monster.name} ${i + 1}` : opts.customName || monster.name;
    out.push({
      instance_id: `${spawnKey}-${i}`,
      type: "monster",
      name: displayName,
      faction_id: opts.factionId,
      initiative: opts.started ? rollInitiativeValue({ dex_mod: dexMod, initiative_bonus: initiativeBonus }, opts.rollD20) : null,
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
  return out;
}

export interface NpcSpawnOptions {
  factionId: string;
  count: number;
  customName?: string;
  started: boolean;
  rollD20?: () => number;
}

/** Builds the RunCombatant entries for `count` copies of an NPC. Same shape
 *  as `buildMonsterCombatants` minus legendary actions and 2024
 *  `initiative_bonus` support — NPCs have never used either. */
export function buildNpcCombatants(npc: Npc, opts: NpcSpawnOptions): RunCombatant[] {
  const sb = npc.stat_block;
  const maxHp = hitPointsToMax(sb?.hit_points, 10);
  const dex = Number(sb?.dex ?? 10);
  const dexMod = Math.floor((dex - 10) / 2);
  const ac = String(sb?.armor_class ?? 10);
  const spawnKey = `spawn-npc-${npc.id}-${Date.now()}`;

  const out: RunCombatant[] = [];
  for (let i = 0; i < opts.count; i++) {
    const displayName = opts.count > 1 ? `${opts.customName || npc.name} ${i + 1}` : opts.customName || npc.name;
    out.push({
      instance_id: `${spawnKey}-${i}`,
      type: "monster",
      name: displayName,
      faction_id: opts.factionId,
      initiative: opts.started ? rollInitiativeValue({ dex_mod: dexMod, initiative_bonus: null }, opts.rollD20) : null,
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
  return out;
}
