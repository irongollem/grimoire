// Builders for the tactics evaluation set (#1203 story 3): invented creatures, invented adventurers, a tiny map, and
// `prepare`, which runs one scenario through the same steps the server takes (options, gate, numbers) and stops there.
// Nothing here picks a turn: a picker is only ever run on a prepared scenario, after its labels are written.
//
// Every name below is made up. Nothing here comes from a real campaign, because the Jev requests carry this text to a
// third party.

import { NO_OCCLUDERS, occluders } from "../../src/lib/battlemap/occlusion.ts";
import type { WallSegment } from "../../src/lib/battlemap/walls.ts";
import { walkingSpeed } from "../../src/lib/movement.ts";
import { gateOptions } from "../../src/rules/fight/tactics/pick.ts";
import { withNumbers } from "../../src/rules/fight/tactics/numbers.ts";
import { tacticalProfile, type TacticalProfile } from "../../src/rules/fight/tactics/profile.ts";
import type { FightMap } from "../../src/rules/fight/terrain/battleMap.ts";
import { turnOptions, type TurnOption, type UsableAttack } from "../../src/rules/fight/terrain/turnOptions.ts";
import type { AppliedCondition } from "../../src/types/condition.types.ts";
import type { DamageType } from "../../src/types/damage.types.ts";
import type { RunCombatant } from "../../src/types/encounter.types.ts";
import type { GridCalibration } from "../../src/types/location.types.ts";
import type { MonsterStatBlock, MonsterTactics, MonsterType } from "../../src/types/monster.types.ts";
import { emptyDefenses, type ActionStructure, type StatBlockEntry } from "../../src/types/statBlock.types.ts";

// ── stat blocks ─────────────────────────────────────────────────────────────────

const entry = (name: string, structured: Omit<ActionStructure, "source">): StatBlockEntry => ({ name, description: "", structured: { source: "manual", ...structured } });

export const melee = (name: string, bonus: number, dice: string, type: DamageType, reach?: number): StatBlockEntry =>
  entry(name, { kind: "attack", attack: { delivery: "melee", bonus, hit: [{ dice, type }], ...(reach === undefined ? {} : { reach }) } });

export const ranged = (name: string, bonus: number, dice: string, type: DamageType, normal: number, long: number): StatBlockEntry =>
  entry(name, { kind: "attack", attack: { delivery: "ranged", bonus, hit: [{ dice, type }], range: { normal, long } } });

export const multiattack = (name: string, steps: { action: string; count: number }[]): StatBlockEntry => entry(name, { kind: "multiattack", multiattack: steps });

/** A save action with no attack roll: it makes the creature a controller, and is not something a turn option offers. */
export const saveAction = (name: string): StatBlockEntry =>
  entry(name, { kind: "save", save: { ability: "wis", dc: 13, fail: [{ dice: "2d6", type: "psychic" }], success: "half", conditions: [] } });

export interface CreatureSpec {
  name: string;
  /** The monster row's type; null for an NPC. */
  type: MonsterType | null;
  int: number;
  speed: number;
  actions: StatBlockEntry[];
  skills?: Record<string, string>;
  tactics?: MonsterTactics;
}

export interface Creature {
  name: string;
  type: MonsterType | null;
  block: MonsterStatBlock;
}

export function creature(spec: CreatureSpec): Creature {
  return {
    name: spec.name,
    type: spec.type,
    block: {
      armor_class: 13,
      hit_points: "4d8",
      speed: `${spec.speed} ft.`,
      str: 14,
      dex: 12,
      con: 12,
      int: spec.int,
      wis: 10,
      cha: 8,
      challenge_rating: "1",
      defenses: emptyDefenses(),
      actions: spec.actions,
      ...(spec.skills ? { skills: spec.skills } : {}),
      ...(spec.tactics ? { tactics: spec.tactics } : {}),
    },
  };
}

// ── people on the board ─────────────────────────────────────────────────────────

export const MOVER_ID = "mover";

export interface PlaceOver {
  hp?: number;
  max?: number;
  ac?: number;
  conditions?: AppliedCondition[];
  concentrating?: boolean;
  size?: RunCombatant["size"];
}

function body(id: string, name: string, type: RunCombatant["type"], faction: string, x: number, y: number, over: PlaceOver): RunCombatant {
  const max = over.max === undefined ? 20 : over.max;
  return {
    instance_id: id,
    type,
    name,
    faction_id: faction,
    initiative: null,
    hp: over.hp === undefined ? max : over.hp,
    max_hp: max,
    ac: String(over.ac === undefined ? 12 : over.ac),
    conditions: over.conditions === undefined ? [] : over.conditions,
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    position: { x, y },
    size: over.size === undefined ? "medium" : over.size,
    ...(over.concentrating ? { concentration: { spellId: null, spellName: "Held spell", castAtLevel: 2, startedRound: 1, appliedEffectIds: [] } } : {}),
  };
}

/** The monster whose turn it is. */
export const mover = (x: number, y: number, over: PlaceOver = {}): RunCombatant => body(MOVER_ID, "Mover", "monster", "m", x, y, over);
/** A friend of the mover. */
export const ally = (id: string, name: string, x: number, y: number, over: PlaceOver = {}): RunCombatant => body(id, name, "monster", "m", x, y, over);
/** An adventurer, hostile to the mover. */
export const hero = (id: string, name: string, x: number, y: number, over: PlaceOver = {}): RunCombatant => body(id, name, "player", "p", x, y, over);

export const asleep: AppliedCondition = { name: "Unconscious" };

// ── the map ─────────────────────────────────────────────────────────────────────

const CALIBRATION = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 0, origin_cell_y: 0 } as GridCalibration;
const FAR_EDGES = { minX: -50, minY: -50, maxX: 50, maxY: 50 };

export type Wall = [[number, number], [number, number]];

export interface Terrain {
  /** Wall segments in cell units (a pillar is a short one). */
  walls?: Wall[];
  /** Closed doors: they block like a wall until opened. */
  doors?: Wall[];
  /** Difficult ground, `"x,y"` cells. */
  difficult?: string[];
}

export function mapOf(t: Terrain = {}): FightMap {
  const walls = (t.walls ?? []).map(([a, b], i): WallSegment => ({ id: `w${i}`, a, b }));
  const doors = (t.doors ?? []).map(([a, b], i) => ({ id: `d${i}`, a, b, open: false }));
  const occ = walls.length === 0 && doors.length === 0 ? NO_OCCLUDERS : occluders({ walls, doors, solid: [] });
  return { mapLocationId: "evaluation", occluders: occ, difficult: new Set(t.difficult ?? []), solid: occ.solid, calibration: CALIBRATION, bounds: FAR_EDGES, rowsKnown: true, exits: [] };
}

// ── preparing a scenario ────────────────────────────────────────────────────────

export interface Fight {
  creature: Creature;
  /** The mover first, then everyone else. */
  combatants: RunCombatant[];
  terrain?: Terrain;
}

export interface Prepared {
  profile: TacticalProfile;
  mover: RunCombatant;
  combatants: RunCombatant[];
  /** Every option the turn composer offered, before the gate. */
  offered: TurnOption[];
  /** The options after the gate, with numbers: what any picker is given. */
  options: TurnOption[];
  armorClassOf: (c: RunCombatant) => number | null;
}

const armorClassOf = (c: RunCombatant): number | null => {
  const n = Number(c.ac);
  return Number.isFinite(n) ? n : null;
};

/** The longest melee reach among a creature's attacks, else 5 ft. */
function reachOfBlock(block: MonsterStatBlock): number {
  const reaches = (block.actions ?? []).flatMap((e) => {
    const a = e.structured.attack;
    return a && a.delivery !== "ranged" ? [a.reach === undefined ? 5 : a.reach] : [];
  });
  return reaches.length === 0 ? 5 : Math.max(...reaches);
}

export function prepare(fight: Fight): Prepared {
  const moverBody = fight.combatants.find((c) => c.instance_id === MOVER_ID);
  if (!moverBody) throw new Error("a scenario needs a combatant with id mover");
  const named: RunCombatant[] = fight.combatants.map((c) => (c.instance_id === MOVER_ID ? { ...c, name: fight.creature.name } : c));
  const self = named.find((c) => c.instance_id === MOVER_ID) as RunCombatant;
  const attacks: UsableAttack[] = (fight.creature.block.actions ?? []).map((entryOf) => ({ list: "actions", entry: entryOf }));
  const mine = reachOfBlock(fight.creature.block);
  const speed = walkingSpeed(fight.creature.block.speed);
  const offered = turnOptions({
    combatants: named,
    moverId: MOVER_ID,
    map: mapOf(fight.terrain),
    budgetFeet: speed,
    attacks,
    reachOf: (c) => (c.instance_id === MOVER_ID ? mine : 5),
    ruleset: "2014",
  });
  const profile = tacticalProfile(fight.creature.block, fight.creature.type);
  const options = withNumbers(gateOptions(offered, profile, self), { attacks, combatants: named, moverId: MOVER_ID, armorClassOf, ruleset: "2014" });
  return { profile, mover: self, combatants: named, offered, options, armorClassOf };
}
