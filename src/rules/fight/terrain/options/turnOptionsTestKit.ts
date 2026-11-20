/** The shared kit of the turn-option tests: a small map, creatures and the call that composes their options. */
import { NO_OCCLUDERS, occluders } from "../../../../lib/battlemap/occlusion.ts";
import type { WallSegment } from "../../../../lib/battlemap/walls.ts";
import type { RunCombatant } from "../../../../types/encounter.types.ts";
import type { GridCalibration } from "../../../../types/location.types.ts";
import type { ActionStructure, AttackStructure, StatBlockEntry } from "../../../../types/statBlock.types.ts";
import type { FightMap } from "../battleMap.ts";
import { turnOptions } from "./compose.ts";
import type { TurnOption, TurnOptionsInput, UsableAttack } from "./types.ts";

// Every map is drawn in cell units, x to the right, y down; a Medium creature at anchor (x,y) fills the square from
// (x,y) to (x+1,y+1). Speed 30 ft is 6 squares, so the budget below reaches any square within 6 steps (diagonals
// cost 5 ft like any step). The Ogre (faction "m") is the mover; Fresco and Chicory (faction "p") are its enemies.

export const CALIBRATION = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 0, origin_cell_y: 0 } as GridCalibration;

// A map far wider than any fight below, so its edge never matters here (the edge has its own tests in reach.test.ts).
export const FAR_EDGES = { minX: -50, minY: -50, maxX: 50, maxY: 50 };

export function mapOf(walls: [[number, number], [number, number]][] = []): FightMap {
  const occ = walls.length === 0 ? NO_OCCLUDERS : occluders({ walls: walls.map(([a, b], i): WallSegment => ({ id: `w${i}`, a, b })), doors: [], solid: [] });
  return { mapLocationId: "site", occluders: occ, difficult: new Set(), solid: occ.solid, calibration: CALIBRATION, bounds: FAR_EDGES, rowsKnown: true, exits: [] };
}
export const OPEN = mapOf();

export function creature(id: string, name: string, faction: string, x: number, y: number, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id,
    type: "monster",
    name,
    faction_id: faction,
    initiative: null,
    hp: 20,
    max_hp: 20,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    position: { x, y },
    size: "medium",
    ...over,
  };
}
export const ogre = (x = 0, y = 0, over: Partial<RunCombatant> = {}) => creature("ogre", "Ogre", "m", x, y, over);
export const fresco = (x: number, y: number, over: Partial<RunCombatant> = {}) => creature("fresco", "Fresco", "p", x, y, over);
export const chicory = (x: number, y: number, over: Partial<RunCombatant> = {}) => creature("chicory", "Chicory", "p", x, y, over);

export const entry = (name: string, structured: Partial<ActionStructure> & Pick<ActionStructure, "kind">): StatBlockEntry => ({
  name,
  description: "",
  structured: { source: "manual", ...structured },
});
export const attackEntry = (name: string, attack: Partial<AttackStructure>): StatBlockEntry =>
  entry(name, { kind: "attack", attack: { delivery: "melee", bonus: 5, hit: [], ...attack } });
export const CLUB: UsableAttack = { list: "actions", entry: attackEntry("Greatclub", {}) };

export function run(over: Partial<TurnOptionsInput> & Pick<TurnOptionsInput, "combatants">): TurnOption[] {
  return turnOptions({ moverId: "ogre", map: OPEN, budgetFeet: 30, attacks: [CLUB], reachOf: () => 5, ruleset: "2014", ...over });
}
export const find = (options: TurnOption[], id: string) => options.find((o) => o.id === id);
