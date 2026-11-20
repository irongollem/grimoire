import { describe, expect, it } from "vitest";
import type { ExploreParty } from "../../types/exploreParty.types.ts";
import type { GridCalibration } from "../../types/location.types.ts";
import type { CellKey } from "../../types/dungeonMap.types.ts";
import { partyArrival, type RoomRegion } from "./exploreSeating.ts";

// The map-cell origin is (10, 20): a region's cells are offset from the battle map's image cells by it.
const calibration = { cells_per_image_width: 30, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 10, origin_cell_y: 20 } as GridCalibration;
const room = (id: string, cells: CellKey[]): RoomRegion => ({ region_role: "space", space_location_id: id, cells });
const hall = room("hall", ["10,20", "11,20", "10,21", "11,21"]);
const crypt = room("crypt", ["14,20", "15,20"]);

describe("the party arrives in a room", () => {
  // Bug: the room is revealed in the Cartographer's cells, so the fog opens on squares offset by the bake padding.
  it("reveals the room's squares in image cells and nothing of the other rooms", () => {
    const { reveal } = partyArrival({ regions: [hall, crypt], calibration, roomId: "crypt", siteId: "site", memberIds: ["a"], explore: null });
    expect(reveal.sort()).toEqual(["4,0", "5,0"]);
  });

  // Bug: a room the story entered but nobody traced throws, or seats the party on a square of some other room.
  it("reveals and seats nothing for a room with no traced square", () => {
    const arrival = partyArrival({ regions: [hall], calibration, roomId: "attic", siteId: "site", memberIds: ["a"], explore: null });
    expect(arrival).toEqual({ reveal: [], party: null });
  });

  // Bug: the party is left off the map, or two characters share a square.
  it("stands the party in the room, one square each, on this site", () => {
    const { party } = partyArrival({ regions: [hall], calibration, roomId: "hall", siteId: "site", memberIds: ["a", "b"], explore: null });
    expect(party).toEqual({ site_id: "site", positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } });
  });

  // Bug: a move inside the same map yanks a character the DM had placed in that room back to its door.
  it("keeps the square of a character already standing in the room and seats the others around it", () => {
    const explore: ExploreParty = { site_id: "site", positions: { a: { x: 1, y: 1 } } };
    const { party } = partyArrival({ regions: [hall], calibration, roomId: "hall", siteId: "site", memberIds: ["a", "b"], explore });
    // a stays on 1,1; b takes the first free square, 0,0 (the hall is 0,0 1,0 0,1 1,1).
    expect(party).toEqual({ site_id: "site", positions: { a: { x: 1, y: 1 }, b: { x: 0, y: 0 } } });
  });

  // Bug: the token is left in the room the party came from, so the map shows the party where it is not.
  it("moves a character who stood in another room of the same map into this one", () => {
    const explore: ExploreParty = { site_id: "site", positions: { a: { x: 4, y: 0 } } };
    const { party } = partyArrival({ regions: [hall, crypt], calibration, roomId: "hall", siteId: "site", memberIds: ["a"], explore });
    expect(party).toEqual({ site_id: "site", positions: { a: { x: 0, y: 0 } } });
  });

  // Bug: a kept character and a newcomer are given the same square.
  it("does not seat anyone on a square a kept character holds", () => {
    const explore: ExploreParty = { site_id: "site", positions: { a: { x: 0, y: 0 } } };
    const { party } = partyArrival({ regions: [hall], calibration, roomId: "hall", siteId: "site", memberIds: ["a", "b"], explore });
    expect(party?.positions.b).toEqual({ x: 1, y: 0 });
  });

  // Bug: squares of another map are carried over to this one, standing the party where this map has no ground.
  it("seats afresh a party that was standing on another map", () => {
    const explore: ExploreParty = { site_id: "elsewhere", positions: { a: { x: 9, y: 9 }, z: { x: 7, y: 7 } } };
    const { party } = partyArrival({ regions: [hall], calibration, roomId: "hall", siteId: "site", memberIds: ["a"], explore });
    expect(party).toEqual({ site_id: "site", positions: { a: { x: 0, y: 0 } } });
  });

  // Bug: a write of the same party again on every move, or an empty one replacing a good one.
  it("has nothing to write when everyone already stands in the room", () => {
    const explore: ExploreParty = { site_id: "site", positions: { a: { x: 1, y: 1 } } };
    const arrival = partyArrival({ regions: [hall], calibration, roomId: "hall", siteId: "site", memberIds: ["a"], explore });
    expect(arrival.party).toBeNull();
    expect(arrival.reveal).toHaveLength(4);
  });
});
