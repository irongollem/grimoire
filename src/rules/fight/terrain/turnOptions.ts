// The whole-turn options of one creature (#1202 story 3b): a short list of legal, described things it could do with
// its turn, each with an id. An AI DM picks one by id; it never produces a coordinate. This file offers options and
// does not rank them: which is best for a creature is tactics (#1203).
//
// Pure and edge-importable (relative `.ts` imports only). It stands on the terrain facts: `reachable` (where can it
// end), `attackFrom` and `coverBetween` (what can it attack from there, under what cover) and `opportunityAttacks`
// (what a path provokes).
//
// The rules below are app conventions over the PHB 2014 ch. 9 actions (the 2024 SRD 5.2 says the same of each). Every
// one is a named, commented block; the docs list them in `context/features/combat-encounters.md`.
//
// Not modelled: darkness and invisibility (so Hide only asks for total cover), standing up from Prone, a player's
// weapon reach (a player's is `DEFAULT_REACH_FEET`), any ranking of the options.

import { combatantFootprint, combatantSize } from "../../../lib/battlemap/tokenFootprint.ts";
import type { Cell } from "../../../lib/battlemap/movement.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { MonsterSize } from "../../../types/monster.types.ts";
import type { RulesetKey } from "../../../types/ruleset.types.ts";
import type { AttackStructure, MultiattackStep, StatBlockEntry } from "../../../types/statBlock.types.ts";
import type { StatBlockListKey } from "../../statBlock/parseAction.ts";
import { concentrationBreaksOn } from "../../combat/concentration.ts";
import { reachTerrainOf, type FightMap } from "./battleMap.ts";
import { isHostileTo, reachable, type ReachCell, type ReachResult } from "./reach.ts";
import {
  attackFrom,
  coverBetween,
  distanceFeet,
  opportunityAttacks,
  DEFAULT_REACH_FEET,
  type Box,
  type Cover,
  type OpportunityEnemy,
  type ProvokedAttack,
} from "./sight.ts";

/** The most options a creature is offered. Dodge, Disengage, Hide and Flee always keep their place; the rest is attacks and approaches against the nearest targets first (rule 9). */
export const MAX_TURN_OPTIONS = 12;

/**
 * `flee` (rule 10) is a Dash away. `surrender` is never produced here: the tactics gate (`gateOptions`, #1203) puts it
 * in place of the whole list when a creature that yields has broken.
 */
export type TurnOptionKind = "attack" | "dash" | "move" | "disengage" | "dodge" | "hide" | "flee" | "surrender";

/** What an attack option does, with the facts of the square it is made from. Null facts mean there is no map to measure on. */
export interface TurnOptionAttack {
  list: StatBlockListKey;
  /** The entry's printed name: what a resolving command names the action by. */
  action: string;
  /** The steps of a Multiattack, in printed order; null for a single attack. */
  steps: MultiattackStep[] | null;
  /** Feet from the square it is made from to the target. */
  distanceFeet: number | null;
  /** The cover the target has against the attacker. */
  cover: Cover | null;
  longRange: boolean | null;
  closeCombat: boolean | null;
  /** Chance one attack hits, 0 to 1 (a Multiattack: the mean over its attacks). Null until `withNumbers` fills it. */
  hitChance: number | null;
  /** Expected damage of the whole option against the target's armor. Null until `withNumbers` fills it. */
  expectedDamage: number | null;
}

export interface TurnOptionExposure {
  enemyId: string;
  /** The cover THE MOVER has against this enemy at the destination; "total" means the enemy has no line at all. */
  cover: Cover;
}

export interface TurnOption {
  /** Stable: the same input always yields the same ids. `attack:<list>:<action>:<targetId>`, `dash:<targetId>`, `move:<targetId>`, `disengage`, `dodge`, `hide`, `flee`, `surrender`. */
  id: string;
  kind: TurnOptionKind;
  targetId: string | null;
  /** Anchor cell the creature ends on; null when the option has no movement or there is no map. */
  destination: Cell | null;
  /** Anchor cells from where it stands (included) to the destination (included); null like `destination`. */
  path: Cell[] | null;
  /** Feet spent moving; null like `destination`. */
  feet: number | null;
  attack: TurnOptionAttack | null;
  /** Dash and move: feet left to the target from the destination. */
  distanceFeet: number | null;
  /** The opportunity attacks the path provokes (empty for Disengage, and when there is no movement). */
  provokes: ProvokedAttack[];
  /** For each living hostile on the map, the mover's cover against it at the destination. Empty when there is no map. */
  exposure: TurnOptionExposure[];
  /** One plain-English line built from the facts above. */
  summary: string;
}

/** One attack the creature may make this turn: an entry of its Actions or Bonus Actions that the caller found available. */
export interface UsableAttack {
  list: StatBlockListKey;
  entry: StatBlockEntry;
}

export interface TurnOptionsInput {
  combatants: readonly RunCombatant[];
  moverId: string;
  /** The fight's map, or null when it has none the rules can use. */
  map: FightMap | null;
  /** Feet of movement left this turn (`movementBudgetFeet`), or null when nothing says what the speed is. */
  budgetFeet: number | null;
  /** The mover's usable Actions and Bonus Actions entries; Multiattack steps are looked up among them by name. */
  attacks: readonly UsableAttack[];
  /** A creature's melee reach in feet, for the opportunity attacks it could take. */
  reachOf: (c: RunCombatant) => number;
  ruleset: RulesetKey;
}

// ── who is on the board ─────────────────────────────────────────────────────────

/**
 * Incapacitated for this purpose: the Incapacitated condition and every condition that includes it (the SRD's own
 * list, which `concentrationBreaksOn` already holds: Unconscious, Paralyzed, Petrified, Stunned).
 */
function isIncapacitated(c: RunCombatant): boolean {
  return concentrationBreaksOn(c.conditions);
}

/** Alive: above 0 hit points. A player at 0 is dying and is neither a target nor an enemy here (app convention). */
const isLiving = (c: RunCombatant): boolean => c.hp > 0;

/** Takes up a square: placed, and alive, or a player down at 0 (who lies where they fell). A monster at 0 is dead. */
export const isOnBoard = (c: RunCombatant): boolean => c.position !== null && c.position !== undefined && (c.hp > 0 || c.type === "player");

/** A creature's size for the movement rules. A creature with none baked is Medium, as `sizeToFootprint` does. */
function sizeOf(c: RunCombatant): MonsterSize {
  const size = combatantSize(c);
  return size === null ? "medium" : size;
}

function boxOf(c: RunCombatant): Box {
  if (!c.position) throw new Error(`${c.name} has no place on the map`);
  return { anchor: c.position, footprint: combatantFootprint(c) };
}

// ── facts about one square ──────────────────────────────────────────────────────

const COVER_RANK: Record<Cover, number> = { none: 0, half: 1, three_quarters: 2, total: 3 };
const cellKey = (c: Cell) => `${c.x},${c.y}`;
/** Last tie-break everywhere: top row first, then leftmost, so the same input always gives the same square. */
const byPlace = (a: Cell, b: Cell) => a.y - b.y || a.x - b.x;

/** Compares two exposure lists: the one that is better covered at its worst enemy wins, then the next worst. Negative when `a` is better covered. */
export function compareExposure(a: readonly TurnOptionExposure[], b: readonly TurnOptionExposure[]): number {
  const ranks = (e: readonly TurnOptionExposure[]) => e.map((x) => COVER_RANK[x.cover]).sort((x, y) => x - y);
  const ra = ranks(a);
  const rb = ranks(b);
  for (let i = 0; i < Math.min(ra.length, rb.length); i++) if (ra[i] !== rb[i]) return rb[i] - ra[i];
  return 0;
}

/** The farthest an attack reaches: its reach when it is a melee attack, its longest range when it is ranged. */
function farthestFeet(attack: AttackStructure): number {
  const reach = attack.delivery === "ranged" ? 0 : attack.reach === undefined ? DEFAULT_REACH_FEET : attack.reach;
  const range = attack.range === undefined ? 0 : attack.range.long === undefined ? attack.range.normal : attack.range.long;
  return Math.max(reach, range);
}

/** An attack entry resolved to what a position needs: the structure its first (or only) attack has. */
interface Planned {
  list: StatBlockListKey;
  entry: StatBlockEntry;
  steps: MultiattackStep[] | null;
  /** The attack that governs where the creature may stand. */
  attack: AttackStructure;
}

/**
 * Rule 8: the attacks as the stored structure lets us tie them. A single attack stands as it is. A Multiattack stands
 * only when every step names another usable entry of the stat block that is itself an attack (the structure keeps
 * `{ action, count }`, so the steps are tied by name and nothing is parsed from prose); its first step's attack governs
 * where the creature may stand. A Multiattack with no steps, a step naming nothing, or a first step that is not an
 * attack is left out. Option lists ("one of the following breath weapons") are left out: an option has no entry name
 * of its own for a resolving command to name.
 */
function plannedAttacks(attacks: readonly UsableAttack[]): Planned[] {
  const out: Planned[] = [];
  for (const { list, entry } of attacks) {
    const s = entry.structured;
    if (s.kind === "attack" && s.attack) {
      out.push({ list, entry, steps: null, attack: s.attack });
    } else if (s.kind === "multiattack" && s.multiattack && s.multiattack.length > 0) {
      const named = s.multiattack.map((step) => attacks.find((a) => a.entry.name === step.action));
      if (named.some((n) => n === undefined)) continue;
      const first = (named[0] as UsableAttack).entry.structured;
      if (!first.attack) continue;
      out.push({ list, entry, steps: s.multiattack, attack: first.attack });
    }
  }
  return out;
}

// ── the composer ────────────────────────────────────────────────────────────────

interface Scene {
  mover: RunCombatant;
  moverFootprint: number;
  map: FightMap;
  reach: ReachResult;
  /** Everyone else on the board. */
  others: RunCombatant[];
  /** Living creatures hostile to the mover that are on the board. */
  hostiles: RunCombatant[];
  enemies: OpportunityEnemy[];
  ruleset: RulesetKey;
  exposureMemo: Map<string, TurnOptionExposure[]>;
}

function exposureAt(scene: Scene, cell: Cell): TurnOptionExposure[] {
  const key = cellKey(cell);
  const known = scene.exposureMemo.get(key);
  if (known) return known;
  const target: Box = { anchor: cell, footprint: scene.moverFootprint };
  const out = scene.hostiles.map((h) => ({
    enemyId: h.instance_id,
    cover: coverBetween(
      boxOf(h),
      target,
      scene.map.occluders,
      scene.others.filter((o) => o.instance_id !== h.instance_id).map(boxOf),
    ),
  }));
  scene.exposureMemo.set(key, out);
  return out;
}

const provokesOf = (scene: Scene, rc: ReachCell): ProvokedAttack[] =>
  opportunityAttacks({ path: rc.path, moverFootprint: scene.moverFootprint, enemies: scene.enemies, occluders: scene.map.occluders });

function movementPart(feet: number | null): string {
  return feet === null || feet === 0 ? "" : `Move ${feet} ft to `;
}

const COVER_WORDS: Record<Cover, string> = { none: "no cover", half: "half cover", three_quarters: "three-quarters cover", total: "total cover" };

function provokesPhrase(names: Map<string, string>, provokes: readonly ProvokedAttack[]): string {
  if (provokes.length === 0) return "";
  const who = provokes.map((p) => names.get(p.enemyId)).join(" and ");
  return `; provokes ${provokes.length === 1 ? "an opportunity attack" : "opportunity attacks"} from ${who}`;
}

/** What the mover gains by ending there: the cover it has from each enemy that has any. Without it a move that only
 *  buys cover reads as a longer walk for nothing, and whoever picks the turn cannot weigh it. */
function exposurePhrase(names: Map<string, string>, exposure: readonly TurnOptionExposure[]): string {
  const covered = exposure.filter((e) => e.cover !== "none");
  if (covered.length === 0) return "";
  return `; ends with ${covered.map((e) => `${COVER_WORDS[e.cover]} from ${names.get(e.enemyId)}`).join(" and ")}`;
}

const stepsPhrase = (steps: readonly MultiattackStep[]) => steps.map((s) => (s.count === 1 ? s.action : `${s.action} x${s.count}`)).join(", ");

function emptyMovement(): Pick<TurnOption, "destination" | "path" | "feet" | "distanceFeet" | "provokes" | "exposure"> {
  return { destination: null, path: null, feet: null, distanceFeet: null, provokes: [], exposure: [] };
}

/** Rule 4 (the option itself): Dodge is always there, standing where it stands. */
function dodgeOption(scene: Scene | null): TurnOption {
  const start = scene === null ? null : scene.reach.start;
  return {
    id: "dodge",
    kind: "dodge",
    targetId: null,
    attack: null,
    summary: "Dodge: stay put and take the Dodge action",
    ...(scene && start
      ? { destination: start, path: [start], feet: 0, distanceFeet: null, provokes: [], exposure: exposureAt(scene, start) }
      : emptyMovement()),
  };
}

/** The reachable squares of a search, in a fixed order. */
const cellsOf = (reach: ReachResult): ReachCell[] => [...reach.cells.values()].sort((a, b) => byPlace(a.cell, b.cell));

/**
 * Rule 1's choice of square for one (attack, target): among the squares the creature can end on that make the attack
 * possible, the one with, in order, fewest opportunity attacks provoked; not long range; not close combat; least cover
 * for the target; most cover for the mover; fewest feet; then top-left first. Null when no square makes it possible.
 */
function bestAttackSquare(scene: Scene, planned: Planned, target: RunCombatant): { rc: ReachCell; facts: ReturnType<typeof attackFrom>; provokes: ProvokedAttack[] } | null {
  const targetBox = boxOf(target);
  const limit = farthestFeet(planned.attack);
  const blockers = scene.others.filter((o) => o.instance_id !== target.instance_id).map(boxOf);
  const hostileBoxes = scene.hostiles.map((h) => ({ box: boxOf(h), incapacitated: isIncapacitated(h) }));
  let best: { rc: ReachCell; facts: ReturnType<typeof attackFrom>; provokes: ProvokedAttack[] } | null = null;
  const better = (a: NonNullable<typeof best>, b: NonNullable<typeof best>): boolean => {
    const keys: [number, number][] = [
      [a.provokes.length, b.provokes.length],
      [Number(a.facts.longRange), Number(b.facts.longRange)],
      [Number(a.facts.closeCombat), Number(b.facts.closeCombat)],
      [COVER_RANK[a.facts.cover], COVER_RANK[b.facts.cover]],
    ];
    for (const [x, y] of keys) if (x !== y) return x < y;
    const exposure = compareExposure(exposureAt(scene, a.rc.cell), exposureAt(scene, b.rc.cell));
    if (exposure !== 0) return exposure < 0;
    return a.rc.feet !== b.rc.feet ? a.rc.feet < b.rc.feet : byPlace(a.rc.cell, b.rc.cell) < 0;
  };
  for (const rc of cellsOf(scene.reach)) {
    const attacker: Box = { anchor: rc.cell, footprint: scene.moverFootprint };
    if (distanceFeet(attacker, targetBox) > limit) continue;
    const facts = attackFrom({ attacker, attack: planned.attack, target: targetBox, occluders: scene.map.occluders, others: blockers, hostiles: hostileBoxes });
    if (!facts.possible) continue;
    const found = { rc, facts, provokes: provokesOf(scene, rc) };
    if (best === null || better(found, best)) best = found;
  }
  return best;
}

function attackOption(scene: Scene, names: Map<string, string>, planned: Planned, target: RunCombatant, square: NonNullable<ReturnType<typeof bestAttackSquare>>): TurnOption {
  const { rc, facts, provokes } = square;
  const targetName = names.get(target.instance_id);
  const withWhat = planned.steps === null ? planned.entry.name : `${planned.entry.name} (${stepsPhrase(planned.steps)})`;
  const notes = [
    facts.cover === "none" ? null : `${targetName} has ${COVER_WORDS[facts.cover]}`,
    facts.longRange ? "at long range" : null,
    facts.closeCombat ? "with an enemy within 5 ft" : null,
  ].filter((n): n is string => n !== null);
  const feet = rc.feet;
  const stays = feet === 0 ? ` from where ${scene.mover.name} stands` : "";
  const exposure = exposureAt(scene, rc.cell);
  return {
    id: `attack:${planned.list}:${planned.entry.name}:${target.instance_id}`,
    kind: "attack",
    targetId: target.instance_id,
    destination: rc.cell,
    path: rc.path,
    feet,
    attack: { list: planned.list, action: planned.entry.name, steps: planned.steps, distanceFeet: facts.distanceFeet, cover: facts.cover, longRange: facts.longRange, closeCombat: facts.closeCombat, hitChance: null, expectedDamage: null },
    distanceFeet: null,
    provokes,
    exposure,
    summary: `${movementPart(feet)}${feet === 0 ? "A" : "a"}ttack ${targetName} with ${withWhat}${stays}${notes.map((n) => `; ${n}`).join("")}${exposurePhrase(names, exposure)}${provokesPhrase(names, provokes)}`,
  };
}

/**
 * Rules 2 and the Move option: the square nearest a target, searched with the given reach. Fewest opportunity attacks
 * and fewest feet break a tie in distance. Null when the best square is where the creature already stands (nothing to
 * offer).
 */
function nearestSquare(scene: Scene, reach: ReachResult, target: RunCombatant): { rc: ReachCell; distance: number; provokes: ProvokedAttack[] } | null {
  const targetBox = boxOf(target);
  let best: { rc: ReachCell; distance: number; provokes: ProvokedAttack[] } | null = null;
  for (const rc of cellsOf(reach)) {
    const distance = distanceFeet({ anchor: rc.cell, footprint: scene.moverFootprint }, targetBox);
    const found = { rc, distance, provokes: provokesOf(scene, rc) };
    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance &&
        (found.provokes.length < best.provokes.length ||
          (found.provokes.length === best.provokes.length && found.rc.feet < best.rc.feet)))
    ) {
      best = found;
    }
  }
  if (best === null || reach.start === null || cellKey(best.rc.cell) === cellKey(reach.start)) return null;
  return best;
}

/** One approach option (Dash with the doubled search, Move with the normal one) toward a hostile. */
function approachOption(kind: "dash" | "move", scene: Scene, names: Map<string, string>, target: RunCombatant, reach: ReachResult): TurnOption | null {
  const found = nearestSquare(scene, reach, target);
  if (found === null) return null;
  const targetName = names.get(target.instance_id);
  const verb = kind === "dash" ? "Dash" : "Move";
  const exposure = exposureAt(scene, found.rc.cell);
  return {
    id: `${kind}:${target.instance_id}`,
    kind,
    targetId: target.instance_id,
    destination: found.rc.cell,
    path: found.rc.path,
    feet: found.rc.feet,
    attack: null,
    distanceFeet: found.distance,
    provokes: found.provokes,
    exposure,
    summary: `${verb} ${found.rc.feet} ft toward ${targetName}, ending ${found.distance} ft away${exposurePhrase(names, exposure)}${provokesPhrase(names, found.provokes)}`,
  };
}

/**
 * Rule 3: Disengage, only when an enemy that could take an opportunity attack has the creature in reach. It ends on
 * the square (normal budget) farthest from its nearest hostile; ties go to the most cover, then fewest feet. Its path
 * provokes nothing. Not offered when no square is farther from the nearest hostile than where it already stands.
 */
function disengageOption(scene: Scene): TurnOption | null {
  const here: Box = { anchor: scene.reach.start as Cell, footprint: scene.moverFootprint };
  const nearest = (box: Box) => Math.min(...scene.hostiles.map((h) => distanceFeet(box, boxOf(h))));
  const threatened = scene.enemies.some((e) => !e.reactionUsed && !e.incapacitated && distanceFeet(here, e.box) <= e.reachFeet);
  if (!threatened) return null;
  let best: { rc: ReachCell; away: number } | null = null;
  for (const rc of cellsOf(scene.reach)) {
    const away = nearest({ anchor: rc.cell, footprint: scene.moverFootprint });
    if (best === null || away > best.away) {
      best = { rc, away };
    } else if (away === best.away) {
      const exposure = compareExposure(exposureAt(scene, rc.cell), exposureAt(scene, best.rc.cell));
      if (exposure < 0 || (exposure === 0 && rc.feet < best.rc.feet)) best = { rc, away };
    }
  }
  if (best === null || best.away <= nearest(here)) return null;
  return {
    id: "disengage",
    kind: "disengage",
    targetId: null,
    destination: best.rc.cell,
    path: best.rc.path,
    feet: best.rc.feet,
    attack: null,
    distanceFeet: null,
    provokes: [],
    exposure: exposureAt(scene, best.rc.cell),
    summary: `Disengage: move ${best.rc.feet} ft to a square ${best.away} ft from the nearest enemy, with no opportunity attacks`,
  };
}

/**
 * Rule 10: Flee, a Dash away (PHB 2014 ch. 9 "Dash"). With twice the budget it ends on the reachable square farthest
 * from its nearest living hostile; ties go to the most cover, then fewest opportunity attacks provoked, then fewest feet,
 * then top-left first. Only offered when there is a hostile and some square is farther from it than where the creature
 * stands (with no hostile the nearest distance is infinite everywhere, so nothing is farther). The path may provoke: unlike Disengage, this is a Dash.
 */
function fleeOption(scene: Scene, names: Map<string, string>, dashReach: ReachResult): TurnOption | null {
  if (dashReach.start === null) return null;
  const nearest = (box: Box) => Math.min(...scene.hostiles.map((h) => distanceFeet(box, boxOf(h))));
  const hereAway = nearest({ anchor: dashReach.start, footprint: scene.moverFootprint });
  let best: { rc: ReachCell; away: number; provokes: ProvokedAttack[] } | null = null;
  for (const rc of cellsOf(dashReach)) {
    const away = nearest({ anchor: rc.cell, footprint: scene.moverFootprint });
    const found = { rc, away, provokes: provokesOf(scene, rc) };
    if (best === null || away > best.away) {
      best = found;
    } else if (away === best.away) {
      const exposure = compareExposure(exposureAt(scene, rc.cell), exposureAt(scene, best.rc.cell));
      if (exposure < 0 || (exposure === 0 && (found.provokes.length < best.provokes.length || (found.provokes.length === best.provokes.length && rc.feet < best.rc.feet)))) best = found;
    }
  }
  if (best === null || best.away <= hereAway) return null;
  const exposure = exposureAt(scene, best.rc.cell);
  return {
    id: "flee",
    kind: "flee",
    targetId: null,
    destination: best.rc.cell,
    path: best.rc.path,
    feet: best.rc.feet,
    attack: null,
    distanceFeet: null,
    provokes: best.provokes,
    exposure,
    summary: `Flee: dash ${best.rc.feet} ft away, ending ${best.away} ft from the nearest enemy${exposurePhrase(names, exposure)}${provokesPhrase(names, best.provokes)}`,
  };
}

/**
 * Rule 5: Hide, only when some reachable square has total cover against every living hostile on the map; the nearest
 * such square (fewest feet). Darkness and invisibility are not modelled, only walls, closed doors and rock.
 */
function hideOption(scene: Scene, names: Map<string, string>): TurnOption | null {
  if (scene.hostiles.length === 0) return null;
  let best: ReachCell | null = null;
  for (const rc of cellsOf(scene.reach)) {
    if (!exposureAt(scene, rc.cell).every((e) => e.cover === "total")) continue;
    if (best === null || rc.feet < best.feet) best = rc;
  }
  if (best === null) return null;
  return {
    id: "hide",
    kind: "hide",
    targetId: null,
    destination: best.cell,
    path: best.path,
    feet: best.feet,
    attack: null,
    distanceFeet: null,
    provokes: provokesOf(scene, best),
    exposure: exposureAt(scene, best.cell),
    summary: `Hide: ${best.feet === 0 ? "stay put, where" : `move ${best.feet} ft to a square where`} no enemy has a line, then take the Hide action${provokesPhrase(names, provokesOf(scene, best))}`,
  };
}

/** Rule 6: the shape when nothing can be measured. No movement, no facts, and a summary that says so. */
function unmeasuredAttack(planned: Planned, target: RunCombatant): TurnOption {
  const withWhat = planned.steps === null ? planned.entry.name : `${planned.entry.name} (${stepsPhrase(planned.steps)})`;
  return {
    id: `attack:${planned.list}:${planned.entry.name}:${target.instance_id}`,
    kind: "attack",
    targetId: target.instance_id,
    ...emptyMovement(),
    attack: { list: planned.list, action: planned.entry.name, steps: planned.steps, distanceFeet: null, cover: null, longRange: null, closeCombat: null, hitChance: null, expectedDamage: null },
    summary: `Attack ${target.name} with ${withWhat}; the distance is not known, so no movement is offered`,
  };
}

/** Whether an attack of this list can still be made: the Action is spent by `action_used`, the Bonus Action by `bonus_used`. */
function listIsOpen(mover: RunCombatant, list: StatBlockListKey): boolean {
  if (list === "actions") return mover.action_used !== true;
  if (list === "bonus_actions") return mover.bonus_used !== true;
  return false;
}

/**
 * The options of the creature whose id is `moverId`. Rules, in the order they are listed in the docs:
 * 1 Attack, 2 Dash, 3 Disengage, 4 Dodge, 5 Hide, 6 nothing measurable, 7 who gets nothing, 8 Multiattack, 9 the cap, 10 Flee.
 *
 * Rule 7: a creature at 0 hit points, or Incapacitated, gets an empty list. A creature whose Action is spent
 * (`action_used`) gets only what needs no Action: Bonus Action attacks (unless `bonus_used`) and a plain `move`
 * toward each hostile, since Dash, Disengage, Dodge and Hide are Actions and a spent Action's attacks are gone.
 */
export function turnOptions(input: TurnOptionsInput): TurnOption[] {
  const mover = input.combatants.find((c) => c.instance_id === input.moverId);
  if (!mover) throw new Error(`No combatant "${input.moverId}" in this fight`);
  if (!isLiving(mover) || isIncapacitated(mover)) return [];

  const actionFree = mover.action_used !== true;
  const names = new Map(input.combatants.map((c) => [c.instance_id, c.name]));
  const planned = plannedAttacks(input.attacks.filter((a) => listIsOpen(mover, a.list)));
  const hostileTargets = input.combatants.filter((c) => c.instance_id !== mover.instance_id && isLiving(c) && isHostileTo(mover, c));

  const measurable = input.map !== null && input.budgetFeet !== null && isOnBoard(mover);
  const options: { option: TurnOption; nearness: number }[] = [];
  const fixed: TurnOption[] = [];

  if (!measurable) {
    // Rule 6: no map, no position or no known speed. One attack per (attack, hostile), nothing measured, plus Dodge.
    hostileTargets.forEach((t, i) => planned.forEach((p) => options.push({ option: unmeasuredAttack(p, t), nearness: i })));
    if (actionFree) fixed.push(dodgeOption(null));
    return capped(options, fixed);
  }

  const map = input.map as FightMap;
  const budget = input.budgetFeet as number;
  const onBoard = input.combatants.filter((c) => c.instance_id !== mover.instance_id && isOnBoard(c));
  const hostiles = onBoard.filter((c) => isLiving(c) && isHostileTo(mover, c));
  const search = (budgetFeet: number) =>
    reachable({
      mover: { anchor: mover.position ?? null, footprint: combatantFootprint(mover), size: sizeOf(mover) },
      budgetFeet,
      terrain: reachTerrainOf(map, [mover, ...onBoard].map((c) => ({ anchor: boxOf(c).anchor, footprint: combatantFootprint(c) }))),
      others: onBoard.map((o) => ({ anchor: boxOf(o).anchor, footprint: combatantFootprint(o), size: sizeOf(o), hostile: isHostileTo(mover, o), incapacitated: isIncapacitated(o) })),
      ruleset: input.ruleset,
    });
  const scene: Scene = {
    mover,
    moverFootprint: combatantFootprint(mover),
    map,
    reach: search(budget),
    others: onBoard,
    hostiles,
    enemies: hostiles.map((h) => ({ id: h.instance_id, box: boxOf(h), reachFeet: input.reachOf(h), reactionUsed: h.reactionUsed === true, incapacitated: isIncapacitated(h) })),
    ruleset: input.ruleset,
    exposureMemo: new Map(),
  };
  const here = boxOf(mover);
  const nearness = (t: RunCombatant) => distanceFeet(here, boxOf(t));

  // Rule 1: an attack per (usable attack, living hostile) that some reachable square allows.
  const reached = new Set<string>();
  for (const t of hostiles) {
    for (const p of planned) {
      const square = bestAttackSquare(scene, p, t);
      if (square === null) continue;
      reached.add(t.instance_id);
      options.push({ option: attackOption(scene, names, p, t, square), nearness: nearness(t) });
    }
  }

  if (actionFree) {
    // Rule 2: a Dash toward each hostile no attack can reach this turn, searched with twice the budget (PHB 2014 ch. 9 "Dash").
    const dashReach = search(budget * 2);
    for (const t of hostiles) {
      if (reached.has(t.instance_id)) continue;
      const dash = approachOption("dash", scene, names, t, dashReach);
      if (dash) options.push({ option: dash, nearness: nearness(t) });
    }
    // Rule 3, 5, 10, 4: Disengage, Hide, Flee, Dodge keep their place under the cap.
    const disengage = disengageOption(scene);
    if (disengage) fixed.push(disengage);
    const hide = hideOption(scene, names);
    if (hide) fixed.push(hide);
    const flee = fleeOption(scene, names, dashReach);
    if (flee) fixed.push(flee);
    fixed.push(dodgeOption(scene));
  } else {
    // Rule 7: the Action is spent, so only a plain move toward each hostile no attack reaches is left.
    for (const t of hostiles) {
      if (reached.has(t.instance_id)) continue;
      const move = approachOption("move", scene, names, t, scene.reach);
      if (move) options.push({ option: move, nearness: nearness(t) });
    }
  }
  return capped(options, fixed);
}

/** Rule 9: Dodge, Disengage, Hide and Flee stay; attacks, dashes and moves against the nearest targets are kept first, up to `MAX_TURN_OPTIONS`. */
function capped(options: { option: TurnOption; nearness: number }[], fixed: TurnOption[]): TurnOption[] {
  const room = Math.max(0, MAX_TURN_OPTIONS - fixed.length);
  const kept = [...options].sort((a, b) => a.nearness - b.nearness).slice(0, room).map((o) => o.option);
  return [...kept, ...fixed];
}
