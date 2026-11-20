// The facts about the board a turn's options are measured on: who is on it, the cover and exposure of a square, and
// the `Scene` every option builder reads.

import { combatantFootprint, combatantSize } from "../../../../lib/battlemap/tokenFootprint.ts";
import type { Cell } from "../../../../lib/battlemap/movement.ts";
import type { MapExit } from "../../../../lib/battlemap/mapExits.ts";
import type { RunCombatant } from "../../../../types/encounter.types.ts";
import type { MonsterSize } from "../../../../types/monster.types.ts";
import type { RulesetKey } from "../../../../types/ruleset.types.ts";
import { isStanding } from "../../standing.ts";
import type { FightMap } from "../battleMap.ts";
import type { ReachCell, ReachResult } from "../reach.ts";
import { coverBetween, opportunityAttacks, type Box, type Cover, type OpportunityEnemy, type ProvokedAttack } from "../sight.ts";
import type { TurnOption, TurnOptionExposure } from "./types.ts";

// ── who is on the board ─────────────────────────────────────────────────────────

/** Alive: above 0 hit points. A player at 0 is dying and is neither a target nor an enemy here (app convention). */
export const isLiving = (c: RunCombatant): boolean => c.hp > 0;

/** Takes up a square: placed, and alive, or a player down at 0 (who lies where they fell). A monster at 0 is dead. */
export const isOnBoard = (c: RunCombatant): boolean => c.position !== null && c.position !== undefined && isStanding(c);

/** A creature's size for the movement rules. A creature with none baked is Medium, as `sizeToFootprint` does. */
export function sizeOf(c: RunCombatant): MonsterSize {
  const size = combatantSize(c);
  return size === null ? "medium" : size;
}

export function boxOf(c: RunCombatant): Box {
  if (!c.position) throw new Error(`${c.name} has no place on the map`);
  return { anchor: c.position, footprint: combatantFootprint(c) };
}

// ── facts about one square ──────────────────────────────────────────────────────

export const COVER_RANK: Record<Cover, number> = { none: 0, half: 1, three_quarters: 2, total: 3 };
export const cellKey = (c: Cell) => `${c.x},${c.y}`;
/** Last tie-break everywhere: top row first, then leftmost, so the same input always gives the same square. */
export const byPlace = (a: Cell, b: Cell) => a.y - b.y || a.x - b.x;

/** Compares two exposure lists: the one that is better covered at its worst enemy wins, then the next worst. Negative when `a` is better covered. */
export function compareExposure(a: readonly TurnOptionExposure[], b: readonly TurnOptionExposure[]): number {
  const ranks = (e: readonly TurnOptionExposure[]) => e.map((x) => COVER_RANK[x.cover]).sort((x, y) => x - y);
  const ra = ranks(a);
  const rb = ranks(b);
  for (let i = 0; i < Math.min(ra.length, rb.length); i++) if (ra[i] !== rb[i]) return rb[i] - ra[i];
  return 0;
}

export interface Scene {
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
  /** The map's ways off by cell; a square that is both an entrance and an edge says the entrance (it may carry a name). */
  exitsByCell: ReadonlyMap<string, MapExit>;
}

export function exitsByCellOf(exits: readonly MapExit[]): Map<string, MapExit> {
  const byCell = new Map<string, MapExit>();
  for (const e of exits) {
    const known = byCell.get(e.cell);
    if (known === undefined || (known.kind === "edge" && e.kind === "entrance")) byCell.set(e.cell, e);
  }
  return byCell;
}

export function exposureAt(scene: Scene, cell: Cell): TurnOptionExposure[] {
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

export const provokesOf = (scene: Scene, rc: ReachCell): ProvokedAttack[] =>
  opportunityAttacks({ path: rc.path, moverFootprint: scene.moverFootprint, enemies: scene.enemies, occluders: scene.map.occluders });

export function emptyMovement(): Pick<TurnOption, "destination" | "path" | "feet" | "distanceFeet" | "provokes" | "exposure"> {
  return { destination: null, path: null, feet: null, distanceFeet: null, provokes: [], exposure: [] };
}

/** The reachable squares of a search, in a fixed order. */
export const cellsOf = (reach: ReachResult): ReachCell[] => [...reach.cells.values()].sort((a, b) => byPlace(a.cell, b.cell));
