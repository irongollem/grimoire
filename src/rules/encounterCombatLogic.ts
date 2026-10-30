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
import { resolveTokenArt } from "@/lib/battlemap/tokenArt";
import type { RunCombatant, EventTrigger } from "@/types/encounter.types";
import type { Monster, MonsterStatBlock } from "@/types/monster.types";
import type { NpcListRow } from "@/types/npc.types";

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

/** Whether a combatant gets turns: alive monsters, or any player (down players
 *  still get a turn for death saves). A downed monster's turns are skipped. */
export function takesTurns(c: AliveCombatant): boolean {
  return c.hp > 0 || c.type === "player";
}

/** Index (into a sorted list) of the first combatant able to act this round (`takesTurns`). */
export function findFirstActiveIndex(sorted: readonly AliveCombatant[]): number {
  const firstAlive = sorted.findIndex(takesTurns);
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
  const aliveSorted = sorted.filter(takesTurns);
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

// ── Combat numbers from a stat block ────────────────────────────────────────

type CombatStats = Pick<RunCombatant, "hp" | "max_hp" | "ac" | "dex_mod" | "initiative_bonus" | "placeholder_stats">;

/**
 * The numbers a monster's or NPC's stat block gives its combatant, for every
 * builder (the encounter roster and a mid-fight spawn alike).
 *
 * A source with no hit points to read (an NPC written without a stat block, a
 * monster whose HP was left blank) still joins the fight, on `fallbackHp` and
 * AC 10, and is marked `placeholder_stats` so the run takes the real numbers
 * once the DM writes them (`adoptStatBlock`).
 */
export function combatStats(sb: MonsterStatBlock | null | undefined, fallbackHp: number): CombatStats {
  const readHp = hitPointsToMax(sb?.hit_points, 0);
  const maxHp = readHp > 0 ? readHp : fallbackHp;
  return {
    hp: maxHp,
    max_hp: maxHp,
    ac: String(sb?.armor_class ?? 10),
    dex_mod: Math.floor((Number(sb?.dex ?? 10) - 10) / 2),
    initiative_bonus: sb?.initiative_bonus ?? null,
    ...(readHp > 0 ? {} : { placeholder_stats: true }),
  };
}

/**
 * A combatant that joined on stand-in numbers, given the stat block its monster
 * or NPC has now. Null when there is nothing to adopt: the combatant has its
 * real numbers already, or the stat block still has no hit points.
 *
 * Damage taken so far carries over (a stand-in at 7 of 10 is 3 down on the real
 * maximum too), and a combatant already down stays down. Initiative is never
 * touched: it was rolled, and re-rolling would reorder the fight.
 */
export function adoptStatBlock(c: RunCombatant, sb: MonsterStatBlock | null | undefined): RunCombatant | null {
  if (!c.placeholder_stats) return null;
  const stats = combatStats(sb, c.max_hp);
  if (stats.placeholder_stats) return null;
  const next: RunCombatant = {
    ...c,
    ...stats,
    hp: c.hp <= 0 ? 0 : Math.max(1, stats.max_hp - (c.max_hp - c.hp)),
  };
  delete next.placeholder_stats;
  if (c.monster_id && c.legendary_action_cap === undefined && sb?.legendary_actions?.length) {
    next.legendary_action_cap = 3;
    next.legendary_actions_remaining = 3;
  }
  return next;
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
  const stats = combatStats(sb, 1);
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
      initiative: opts.started ? rollInitiativeValue(stats, opts.rollD20) : null,
      ...stats,
      conditions: [],
      curses: [],
      death_saves: { successes: 0, failures: 0 },
      monster_id: monster.id,
      reveal_state: "hidden",
      portrait_url: monster.image_url ?? null,
      portrait_focal_point: monster.portrait_focal_point ?? null,
      token_url: resolveTokenArt(monster)?.tokenUrl,
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
 *  as `buildMonsterCombatants` minus legendary actions. A 2024 stat block's
 *  listed Initiative is what the book rolls, for an NPC as for a monster. */
export function buildNpcCombatants(npc: NpcListRow, opts: NpcSpawnOptions): RunCombatant[] {
  const stats = combatStats(npc.stat_block, 10);
  const spawnKey = `spawn-npc-${npc.id}-${Date.now()}`;

  const out: RunCombatant[] = [];
  for (let i = 0; i < opts.count; i++) {
    const displayName = opts.count > 1 ? `${opts.customName || npc.name} ${i + 1}` : opts.customName || npc.name;
    out.push({
      instance_id: `${spawnKey}-${i}`,
      type: "monster",
      name: displayName,
      faction_id: opts.factionId,
      initiative: opts.started ? rollInitiativeValue(stats, opts.rollD20) : null,
      ...stats,
      conditions: [],
      curses: [],
      death_saves: { successes: 0, failures: 0 },
      npc_id: npc.id,
      reveal_state: "hidden",
      portrait_url: npc.portrait_url ?? null,
      portrait_focal_point: npc.portrait_focal_point ?? null,
      token_url: resolveTokenArt(npc)?.tokenUrl,
      footprint: 1,
    });
  }
  return out;
}
