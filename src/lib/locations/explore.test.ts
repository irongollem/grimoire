import { describe, expect, it } from "vitest";
import type { ExploreParty } from "@/types/campaign.types";
import type { RunCombatant } from "@/types/encounter.types";
import type { GridCalibration } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { CellKey } from "@/types/dungeonMap.types";
import {
  afterFightRoute,
  cellsCentre,
  entranceBattleCells,
  exploreToken,
  exploreTokens,
  memberSize,
  partyTokenId,
  positionsOnSite,
  roomBattleCells,
  roomBeingEntered,
  roomCellIndex,
  roomsUnder,
  roomUnder,
  seatFromExploring,
  seatInFormation,
  seedPartyAtCentre,
  seedPartyAtEntrance,
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

describe("roomsUnder", () => {
  const index = roomCellIndex([hall, crypt], calibration);
  it("marks a room when any square of a big token's footprint is in it, and ignores unplaced tokens", () => {
    // A Large token at 3,0 covers 3..4: its 4,0 square is the crypt's.
    expect([...roomsUnder([{ size: "large", position: { x: 3, y: 0 } }, { position: null }], index)]).toEqual(["crypt"]);
  });
  it("floors a Tiny token's half-square position onto its own square", () => {
    expect([...roomsUnder([{ footprint: 0.5, position: { x: 4.5, y: 0.5 } }], index)]).toEqual(["crypt"]);
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

describe("cellsCentre", () => {
  it("puts a room's name at the middle of its cells", () => {
    expect(cellsCentre(["0,0", "1,0"])).toEqual({ x: 1, y: 0.5 });
    expect(cellsCentre([])).toBeNull();
  });
});

describe("character sizes on the exploring map", () => {
  const species = (size: "tiny" | "small" | "medium" | "large" | null, subraces: { name: string; size?: "tiny" | "small" | "medium" | "large" }[] | null = null) => ({
    size, speed: null, languages: null, subraces: subraces as never,
  });

  // PHB 2024 "Creature Size": a Large creature takes a 10-foot space, so 2 by 2 squares (#1125 decision 13).
  it("gives a Large character a 2 by 2 token and a Small one a single square", () => {
    expect(exploreToken(member("a"), null, "large").footprint).toBe(2);
    expect(exploreToken(member("a"), null, "small").footprint).toBe(1);
  });

  it("draws a character with no known size as Medium", () => {
    const t = exploreToken(member("a"), null);
    expect([t.size, t.footprint]).toEqual(["medium", 1]);
  });

  it("takes the size from the subrace when it replaces the species'", () => {
    expect(memberSize(species("medium", [{ name: "Stout", size: "small" }]), "Stout")).toBe("small");
    expect(memberSize(species("medium", [{ name: "Stout", size: "small" }]), null)).toBe("medium");
  });

  it("knows no size while the species has not loaded", () => {
    expect(memberSize(undefined, null)).toBeNull();
  });

  it("stands each character on their own square and sizes each by the resolver", () => {
    const tokens = exploreTokens([member("a"), member("b")], { site_id: "s1", positions: { a: { x: 3, y: 4 } } }, "s1", (id) => (id === "b" ? "large" : null));
    expect(tokens.map((t) => [t.position, t.footprint])).toEqual([[{ x: 3, y: 4 }, 1], [undefined, 2]]);
  });

  it("leaves everyone off the map when the saved squares are for another site", () => {
    const tokens = exploreTokens([member("a")], { site_id: "other", positions: { a: { x: 3, y: 4 } } }, "s1");
    expect(tokens[0].position).toBeUndefined();
  });
});

describe("seating on a frame with no room to stand in", () => {
  // app convention: the middle of a 30 by 20 picture is square (15, 10); three Medium characters pack into a block around it.
  it("stands the party in formation around the middle of the picture", () => {
    const seated = seedPartyAtCentre([member("a"), member("b"), member("c")], { across: 30, down: 20 });
    const squares = Object.values(seated);
    expect(squares).toHaveLength(3);
    for (const p of squares) {
      expect(Math.abs(p.x - 15)).toBeLessThanOrEqual(2);
      expect(Math.abs(p.y - 10)).toBeLessThanOrEqual(2);
    }
    expect(new Set(squares.map((p) => `${p.x},${p.y}`)).size).toBe(3);
  });

  // PHB 2024 "Creature Size": a Large creature takes 2 by 2 squares, so the formation leaves it four.
  it("gives a Large character a clear 2 by 2 and still seats everyone else", () => {
    const seated = seatInFormation([member("a"), member("b"), member("c")], { x: 5, y: 5 }, (id) => (id === "a" ? "large" : null));
    expect(Object.keys(seated)).toHaveLength(3);
    const a = seated.a;
    for (const other of [seated.b, seated.c]) {
      const overlaps = other.x >= a.x && other.x < a.x + 2 && other.y >= a.y && other.y < a.y + 2;
      expect(overlaps).toBe(false);
    }
  });

  it("starts the formation at the square it was given", () => {
    expect(seatInFormation([member("a")], { x: 7, y: 9 }).a).toEqual({ x: 7, y: 9 });
  });
});

describe("the Entrance zone", () => {
  const zone = (kind: "entrance" | "marker", cells: CellKey[]) => ({ region_role: "zone", zone_kind: kind, cells }) as LocationMapRegion;

  // Region cells are in the Cartographer's space; tokens stand in image cells, offset by the calibration origin (10, 20).
  it("reads an entrance zone's squares in battle cells and ignores other zone kinds and rooms", () => {
    const cells = entranceBattleCells([zone("entrance", ["10,20", "11,20"]), zone("marker", ["30,30"]), hall], calibration);
    expect(cells.sort()).toEqual(["0,0", "1,0"]);
  });

  it("counts a square two entrance zones share once", () => {
    expect(entranceBattleCells([zone("entrance", ["10,20"]), zone("entrance", ["10,20", "11,20"])], calibration)).toHaveLength(2);
  });

  it("finds no entrance cells on a site without one", () => {
    expect(entranceBattleCells([hall], calibration)).toEqual([]);
  });

  it("stands the party on the entrance squares", () => {
    const seated = seedPartyAtEntrance([member("a"), member("b")], ["4,4", "5,4", "4,5", "5,5"]);
    expect(Object.values(seated).every((p) => p.x >= 4 && p.x <= 5 && p.y >= 4 && p.y <= 5)).toBe(true);
    expect(new Set(Object.values(seated).map((p) => `${p.x},${p.y}`)).size).toBe(2);
  });

  // PHB 2024 "Creature Size": Large covers 2 by 2, so it does not fit a doorway one square wide.
  it("leaves a Large character out of an entrance one square wide, and seats the rest", () => {
    const seated = seedPartyAtEntrance([member("big"), member("a")], ["4,4", "4,5", "4,6"], (id) => (id === "big" ? "large" : null));
    expect(seated.big).toBeUndefined();
    expect(seated.a).toEqual({ x: 4, y: 4 });
  });

  it("seats nobody for an empty entrance", () => {
    expect(seedPartyAtEntrance([member("a")], [])).toEqual({});
  });
});
