import { describe, expect, it } from "vitest";
import { cellKey, type CellKey } from "@/types/dungeonMap.types";
import type { RunCombatant } from "@/types/encounter.types";
import { scatterInRoom } from "./scatter";

function who(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: "f", initiative: 10, hp: 10, max_hp: 10, ac: "12",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, ...over,
  };
}
function room(w: number, h: number, x0 = 0, y0 = 0): CellKey[] {
  const out: CellKey[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push(cellKey(x0 + x, y0 + y));
  return out;
}
const sized = (map: Record<string, number>) => (c: RunCombatant) => map[c.instance_id] ?? 1;

describe("scatterInRoom", () => {
  // Epic #1125 decision 11: the party is seated by its own flow.
  it("never places a player, even one with no square", () => {
    const out = scatterInRoom([who("pc", { type: "player" }), who("orc")], room(4, 4));
    expect(out.has("pc")).toBe(false);
    expect(out.has("orc")).toBe(true);
  });

  it("leaves a creature that already has a square alone", () => {
    const out = scatterInRoom([who("orc", { position: { x: 0, y: 0 } })], room(4, 4));
    expect(out.size).toBe(0);
  });

  it("does not land on a placed token, a player's included", () => {
    // 2x1 room, the player holds the left square: the only free spot is the right one.
    const out = scatterInRoom([who("pc", { type: "player", position: { x: 0, y: 0 } }), who("orc")], room(2, 1));
    expect(out.get("orc")).toEqual({ x: 1, y: 0 });
  });

  it("does not stack two scattered creatures on one square", () => {
    const out = scatterInRoom([who("a"), who("b"), who("c")], room(3, 1));
    const spots = [...out.values()].map((p) => `${p.x},${p.y}`);
    expect(new Set(spots).size).toBe(3);
  });

  it("leaves the creature in the tray when the room is full", () => {
    const out = scatterInRoom([who("a"), who("b"), who("c")], room(2, 1));
    expect(out.size).toBe(2);
  });

  it("a Large creature takes a 2x2 that lies wholly inside the room", () => {
    // L-shaped room: cells (0,0) (1,0) (0,1) only. No 2x2 fits, so the ogre stays unplaced.
    const l: CellKey[] = [cellKey(0, 0), cellKey(1, 0), cellKey(0, 1)];
    expect(scatterInRoom([who("ogre")], l, { footprintOf: sized({ ogre: 2 }) }).size).toBe(0);
    const fitted = scatterInRoom([who("ogre")], room(3, 3, 5, 5), { footprintOf: sized({ ogre: 2 }) });
    const p = fitted.get("ogre")!;
    expect(p.x).toBeGreaterThanOrEqual(5);
    expect(p.x + 2).toBeLessThanOrEqual(8);
    expect(p.y + 2).toBeLessThanOrEqual(8);
  });

  it("a Large creature does not overlap a token already in the room", () => {
    const out = scatterInRoom(
      [who("pc", { type: "player", position: { x: 1, y: 1 } }), who("ogre")],
      room(3, 3),
      { footprintOf: sized({ ogre: 2 }) },
    );
    // Every 2x2 in a 3x3 covers the middle square (1,1), which the player holds.
    expect(out.size).toBe(0);
  });

  it("puts four Tiny creatures on the quarters of one square", () => {
    const out = scatterInRoom([who("a"), who("b"), who("c"), who("d"), who("e")], room(1, 1), { footprintOf: () => 0.5 });
    expect(out.size).toBe(4);
    expect(new Set([...out.values()].map((p) => `${p.x},${p.y}`)).size).toBe(4);
  });

  it("spreads: two foes in a big empty room do not end up adjacent", () => {
    const out = scatterInRoom([who("a"), who("b")], room(10, 10));
    const [a, b] = [out.get("a")!, out.get("b")!];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(5);
  });

  it("keeps its distance from the party", () => {
    const out = scatterInRoom([who("pc", { type: "player", position: { x: 0, y: 0 } }), who("orc")], room(10, 1));
    expect(out.get("orc")).toEqual({ x: 9, y: 0 });
  });

  it("does nothing for a room with no cells", () => {
    expect(scatterInRoom([who("a")], []).size).toBe(0);
  });
});
