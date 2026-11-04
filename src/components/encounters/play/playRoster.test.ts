import { describe, expect, it } from "vitest";
import type { RunCombatant } from "@/types/encounter.types";
import { adjacentFoes, cellOnMap, dropCell, placedCombatants, unplacedCombatants } from "./playRoster";

function c(id: string, position?: { x: number; y: number } | null): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: "f", initiative: 10, hp: 1, max_hp: 1, ac: "10",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position,
  };
}

describe("unplacedCombatants", () => {
  // A creature standing on the corner square (0,0) has a position; falsy-checking x and y would send it back to the tray.
  it("counts a creature at 0,0 as placed, and both a missing and a null position as unplaced", () => {
    const all = [c("corner", { x: 0, y: 0 }), c("missing"), c("nulled", null)];
    expect(unplacedCombatants(all).map((x) => x.instance_id)).toEqual(["missing", "nulled"]);
    expect(placedCombatants(all).map((x) => x.instance_id)).toEqual(["corner"]);
  });
});

describe("dropCell", () => {
  it("seats a dropped portrait in the square the pointer is over, never the next one", () => {
    expect(dropCell({ x: 3.9, y: 0.1 })).toEqual({ x: 3, y: 0 });
    expect(dropCell({ x: -0.2, y: 2 })).toEqual({ x: -1, y: 2 });
  });
});

describe("cellOnMap", () => {
  it("accepts the corners of the picture and refuses a square past any edge", () => {
    expect(cellOnMap({ x: 0, y: 0 }, 10, 8)).toBe(true);
    expect(cellOnMap({ x: 9, y: 7 }, 10, 8)).toBe(true);
    expect(cellOnMap({ x: 10, y: 0 }, 10, 8)).toBe(false);
    expect(cellOnMap({ x: 0, y: 8 }, 10, 8)).toBe(false);
    expect(cellOnMap({ x: -1, y: 0 }, 10, 8)).toBe(false);
    expect(cellOnMap({ x: 0, y: -1 }, 10, 8)).toBe(false);
  });
});

describe("who is next to the active token", () => {
  const factions = [
    { id: "players", hostile_to: ["enemy"] },
    { id: "enemy", hostile_to: ["players"] },
    { id: "ally", hostile_to: ["enemy"] },
  ];
  const at = (id: string, faction: string, x: number, y: number, over: Partial<RunCombatant> = {}): RunCombatant =>
    ({
      instance_id: id, type: "monster", name: id, faction_id: faction, initiative: 1, hp: 5, max_hp: 5, ac: "10",
      conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x, y }, ...over,
    }) as RunCombatant;

  it("a foe on the diagonal is next to you, one two squares off is not", () => {
    const me = at("me", "players", 3, 3);
    const near = at("goblin-3", "enemy", 4, 4);
    const far = at("goblin-1", "enemy", 5, 3);
    expect(adjacentFoes(me, [me, near, far], factions, []).map((c) => c.instance_id)).toEqual(["goblin-3"]);
  });

  it("a friend beside you is not a foe", () => {
    const me = at("me", "players", 3, 3);
    expect(adjacentFoes(me, [me, at("friend", "ally", 4, 3)], factions, [])).toEqual([]);
  });

  it("a fallen foe is not counted", () => {
    const me = at("me", "players", 3, 3);
    expect(adjacentFoes(me, [me, at("dead", "enemy", 4, 3, { hp: 0 })], factions, [])).toEqual([]);
  });

  it("a Large foe's far corner touches you: its whole space counts, not its anchor", () => {
    const me = at("me", "players", 5, 3);
    const ogre = at("ogre", "enemy", 3, 3, { size: "large" });
    expect(adjacentFoes(me, [me, ogre], factions, []).map((c) => c.instance_id)).toEqual(["ogre"]);
  });

  it("someone with no square is next to nobody", () => {
    const me = at("me", "players", 0, 0, { position: null });
    expect(adjacentFoes(me, [me, at("g", "enemy", 0, 0)], factions, [])).toEqual([]);
  });
});
