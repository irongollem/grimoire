import { describe, expect, it } from "vitest";
import type { RunCombatant } from "@/types/encounter.types";
import { cellOnMap, dropCell, placedCombatants, unplacedCombatants } from "./playRoster";

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
