import { describe, expect, it } from "vitest";
import type { ExploreParty } from "@/types/campaign.types";
import type { RunCombatant } from "@/types/encounter.types";
import type { GridCalibration } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { CellKey } from "@/types/dungeonMap.types";
import {
  afterFightRoute,
  cellOutline,
  cellsCentre,
  exploreToken,
  partyTokenId,
  positionsOnSite,
  roomBattleCells,
  roomBeingEntered,
  roomCellIndex,
  roomUnder,
  seatFromExploring,
  seedPartyPositions,
} from "./explore";

// A calibration whose map-cell origin is (10, 20): region cells are offset from the battle map's image cells by it.
const calibration = { cells_per_image_width: 30, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 10, origin_cell_y: 20 } as GridCalibration;

function region(roomId: string, cells: CellKey[]): LocationMapRegion {
  return { region_role: "space", space_location_id: roomId, cells } as LocationMapRegion;
}
const hall = region("hall", ["10,20", "11,20", "12,20", "10,21", "11,21", "12,21"]);
const crypt = region("crypt", ["14,20", "15,20"]);

const member = (id: string) => ({ id, name: id, current_hp: 5, max_hp: 10, portrait_url: null, portrait_focal_point: null });

describe("room cells", () => {
  // Region cells live in the Cartographer's space; tokens live in image cells, offset by the calibration's origin.
  it("puts a room's cells into the battle map's image cells", () => {
    const cells = roomBattleCells([hall, crypt], calibration);
    expect(cells.get("hall")).toContain("0,0");
    expect(cells.get("crypt")).toEqual(["4,0", "5,0"]);
  });

  it("finds the room under a token by its middle, not its corner", () => {
    const index = roomCellIndex([hall, crypt], calibration);
    // A Large (2x2) token's middle is one square in from its corner: anchored at 3,0 that is 4,1 (no room there), at 3,-1 it is 4,0 (the crypt).
    expect(roomUnder({ x: 2, y: 0 }, 1, index)).toBe("hall");
    expect(roomUnder({ x: 3, y: 0 }, 2, index)).toBeNull();
    expect(roomUnder({ x: 3, y: -1 }, 2, index)).toBe("crypt");
  });
});

describe("roomBeingEntered", () => {
  const index = roomCellIndex([hall, crypt], calibration);

  it("is the room the lead stands in when the party is somewhere else", () => {
    expect(roomBeingEntered({ position: { x: 4, y: 0 }, footprint: 1 }, index, "hall")).toBe("crypt");
  });

  it("is nothing while the lead stays in the room the party is in", () => {
    expect(roomBeingEntered({ position: { x: 1, y: 0 }, footprint: 1 }, index, "hall")).toBeNull();
  });

  it("is nothing in a corridor, between rooms", () => {
    expect(roomBeingEntered({ position: { x: 3, y: 0 }, footprint: 1 }, index, "hall")).toBeNull();
  });

  it("is nothing with no lead token", () => {
    expect(roomBeingEntered(null, index, "hall")).toBeNull();
  });
});

describe("positionsOnSite", () => {
  const explore: ExploreParty = { site_id: "s1", positions: { a: { x: 1, y: 2 } } };

  // One site at a time: walking into another site replaces it, so a stale one must read as nobody standing anywhere.
  it("reads the positions of this site and none from another", () => {
    expect(positionsOnSite(explore, "s1")).toEqual({ a: { x: 1, y: 2 } });
    expect(positionsOnSite(explore, "s2")).toEqual({});
    expect(positionsOnSite(null, "s1")).toEqual({});
  });
});

describe("seedPartyPositions", () => {
  const cells = roomBattleCells([hall, crypt], calibration);

  it("seats the party in the room it is in, packed row by row, no two on a square", () => {
    const seated = seedPartyPositions([member("a"), member("b")], cells, ["crypt", "hall"], "hall");
    expect(seated).toEqual({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
  });

  it("falls back to the first room when the party is in none of this site's", () => {
    const seated = seedPartyPositions([member("a")], cells, ["crypt", "hall"], null);
    expect(seated.a).toEqual({ x: 4, y: 0 });
  });

  it("seats nobody when the site has no traced room", () => {
    expect(seedPartyPositions([member("a")], new Map(), [], null)).toEqual({});
  });
});

describe("seatFromExploring", () => {
  const hero = (memberId: string, position?: { x: number; y: number }): RunCombatant => ({
    ...exploreToken(member(memberId), position ?? null),
    instance_id: partyTokenId(memberId),
  });
  const explore: ExploreParty = { site_id: "s1", positions: { a: { x: 6, y: 4 }, b: { x: 30, y: 4 } } };

  it("gives a character with no square the one they walked to", () => {
    const [a] = seatFromExploring([hero("a")], explore, "s1", 30);
    expect(a.position).toEqual({ x: 6, y: 4 });
  });

  it("keeps a square a combatant already has", () => {
    const [a] = seatFromExploring([hero("a", { x: 1, y: 1 })], explore, "s1", 30);
    expect(a.position).toEqual({ x: 1, y: 1 });
  });

  it("leaves a square off the picture's right edge to the room's seating", () => {
    const [b] = seatFromExploring([hero("b")], explore, "s1", 30);
    expect(b.position).toBeUndefined();
  });

  it("does not seat a monster, which has no party member", () => {
    const monster: RunCombatant = { ...hero("a"), party_member_id: undefined, type: "monster" };
    expect(seatFromExploring([monster], explore, "s1", 30)[0].position).toBeUndefined();
  });
});

describe("afterFightRoute", () => {
  // #1125 decision 9: a fight fought in a site hands the table back to that site.
  it("returns to the site's Play screen when the fight was in one, else to the encounter", () => {
    expect(afterFightRoute("e1", { id: "s1", name: "Crypt" })).toBe("/locations/s1/explore");
    expect(afterFightRoute("e1", null)).toBe("/encounters/e1");
  });
});

describe("cellOutline and cellsCentre", () => {
  it("outlines an L-shape by its perimeter, not its bounding box", () => {
    const edges = cellOutline(["0,0", "1,0", "0,1"]);
    // The L has 8 unit sides; a bounding box of 2x2 would have 8 too, but the missing corner square leaves a notch.
    expect(edges).toHaveLength(8);
    expect(edges).toContainEqual({ x1: 1, y1: 1, x2: 2, y2: 1 });
    expect(edges).not.toContainEqual({ x1: 2, y1: 2, x2: 2, y2: 1 });
  });

  it("puts a room's name at the middle of its cells", () => {
    expect(cellsCentre(["0,0", "1,0"])).toEqual({ x: 1, y: 0.5 });
    expect(cellsCentre([])).toBeNull();
  });
});
