import { describe, expect, it } from "vitest";
import { MAP_LIVE_VERSION, type MapLive, type MapLiveDoor } from "@/types/mapLive.types";
import { newlySeen, partyVisibleCombatants, shownCells, sightCells, sightScene, tableTokens } from "./partySight";
import type { Viewer } from "./vision";

const eyes = (x: number, y: number, darkvisionFeet = 0): Viewer => ({ x, y, darkvisionFeet, blindsightFeet: 0, truesightFeet: 0, devilsSightFeet: 0 });
const grid = { cols: 12, rows: 3 };
// A wall across the whole strip at x = 6, and a door in the same line.
const wall = { id: "w", a: [6, 0] as [number, number], b: [6, 3] as [number, number] };
const door = (open: boolean): MapLiveDoor => ({ id: "d", open, a: [6, 0], b: [6, 3], leaf: null });
const live = (over: Partial<MapLive>): MapLive => ({
  version: MAP_LIVE_VERSION,
  darkness: "daylight",
  groups: [],
  lights: [],
  sprites: [],
  walls: [],
  doors: [],
  solid: [],
  ...over,
});
const torch = (x: number) => ({ x, y: 1.5, color: "#fff", bright: 10, dim: 10, phase: 0 });

describe("sightCells", () => {
  it("shows nothing when no one is on the map (an empty viewer list must not read as 'no line to test')", () => {
    expect(sightCells(sightScene(null, [], []), [], grid).size).toBe(0);
  });

  it("in daylight, line of sight alone decides: the near side is seen, the far side of a wall is not", () => {
    const seen = sightCells(sightScene(live({ walls: [wall] }), [], []), [eyes(1.5, 1.5)], grid);
    expect(seen.has("5,1")).toBe(true);
    expect(seen.has("6,1")).toBe(false);
    expect(seen.has("11,1")).toBe(false);
  });

  it("a plain picture with no snapshot is daylight with nothing in the way", () => {
    expect(sightCells(sightScene(null, [], []), [eyes(1.5, 1.5)], grid).size).toBe(36);
  });

  it("a lit room behind a closed door stays unseen until the door is opened", () => {
    const l = live({ darkness: "dark", doors: [door(false)], lights: [torch(9.5)] });
    expect(sightCells(sightScene(l, [], []), [eyes(4.5, 1.5)], grid).has("9,1")).toBe(false);
    expect(sightCells(sightScene(l, [{ id: "d", open: true }], []), [eyes(4.5, 1.5)], grid).has("9,1")).toBe(true);
  });

  it("darkness hides a square from a sighted character without darkvision, darkvision sees it within range only", () => {
    const l = live({ darkness: "dark" });
    expect(sightCells(sightScene(l, [], []), [eyes(1.5, 1.5)], grid).size).toBe(0);
    // 30 ft is 6 cells: square 4 is in reach, square 10 is not.
    const seen = sightCells(sightScene(l, [], []), [eyes(1.5, 1.5, 30)], grid);
    expect(seen.has("4,1")).toBe(true);
    expect(seen.has("10,1")).toBe(false);
  });

  it("a light shows the squares it lights, to a viewer who has no darkvision", () => {
    const seen = sightCells(sightScene(live({ darkness: "dark", lights: [torch(3.5)] }), [], []), [eyes(1.5, 1.5)], grid);
    expect(seen.has("3,1")).toBe(true);
    expect(seen.has("11,1")).toBe(false);
  });
});

describe("shownCells and newlySeen", () => {
  it("shows what is remembered and what is seen now", () => {
    expect([...shownCells(new Set(["0,0"]), new Set(["1,0"]))].sort()).toEqual(["0,0", "1,0"]);
  });

  it("writes only what the memory lacks, in a stable numeric order", () => {
    expect(newlySeen(new Set(["2,0"]), new Set(["10,0", "2,0", "9,1", "9,0"]))).toEqual(["9,0", "9,1", "10,0"]);
  });
});

describe("partyVisibleCombatants", () => {
  const tok = (instance_id: string, position: { x: number; y: number } | null, extra: object = {}) => ({ instance_id, position, ...extra });
  const sight = new Set(["3,3"]);

  it("keeps a player's own token wherever it is, and drops an unplaced or unseen other", () => {
    const list = [tok("me", { x: 9, y: 9 }), tok("unplaced", null), tok("hidden", { x: 8, y: 8 }), tok("seen", { x: 3, y: 3 })];
    expect(partyVisibleCombatants(list, sight, "me").map((c) => c.instance_id)).toEqual(["me", "seen"]);
  });

  it("shows a large token when only one corner square of its footprint is seen", () => {
    expect(partyVisibleCombatants([tok("big", { x: 2, y: 2 }, { footprint: 2 })], sight, null)).toHaveLength(1);
  });

  it("a fractional Tiny position is floored onto its own square", () => {
    expect(partyVisibleCombatants([tok("imp", { x: 3.5, y: 3.5 }, { footprint: 0.5 })], sight, null)).toHaveLength(1);
    expect(partyVisibleCombatants([tok("imp", { x: 4.5, y: 3.5 }, { footprint: 0.5 })], sight, null)).toHaveLength(0);
  });
});

describe("tableTokens", () => {
  const tok = (instance_id: string, type: string, position: { x: number; y: number } | null, extra: object = {}) => ({ instance_id, type, position, ...extra });
  const sight = new Set(["3,3"]);

  // The TV is every player's own screen: a character the party cannot currently see (one in a dark corner) still shows.
  it("draws every placed player character wherever they stand, and a monster only where the party sees it", () => {
    const list = [tok("pc", "player", { x: 9, y: 9 }), tok("seen", "monster", { x: 3, y: 3 }), tok("lurking", "monster", { x: 8, y: 8 })];
    expect(tableTokens(list, sight).map((c) => c.instance_id)).toEqual(["pc", "seen"]);
  });

  it("draws no token that has no square, a player included", () => {
    expect(tableTokens([tok("pc", "player", null), tok("m", "monster", null)], sight)).toEqual([]);
  });

  it("shows a large monster when one square of its footprint is seen", () => {
    expect(tableTokens([tok("big", "monster", { x: 2, y: 2 }, { footprint: 2 })], sight)).toHaveLength(1);
  });
});
