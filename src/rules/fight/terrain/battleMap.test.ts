import { describe, expect, it } from "vitest";
import type { CellKey } from "../../../types/dungeonMap.types.ts";
import type { GridCalibration } from "../../../types/location.types.ts";
import type { MapLive, MapLiveDoorState } from "../../../types/mapLive.types.ts";
import { fightMapOf, reachTerrainOf, type FightMapInput } from "./battleMap.ts";

// A dungeon site, "site", drawn with a calibrated Drawing. Its published snapshot has one wall along the line x = 4
// (between image cells column 3 and column 4, from y = 0 to y = 2), one door on the line y = 3 (x from 0 to 1), and
// one solid rock cell at 9,9. The calibration's origin cell is (2,0): map cell (5,1) is image cell (3,1).
const calibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 2, origin_cell_y: 0 } as GridCalibration;

const live: MapLive = {
  version: 3,
  darkness: "daylight",
  groups: [],
  lights: [],
  sprites: [],
  walls: [{ id: "w1", a: [4, 0], b: [4, 2] }],
  doors: [{ id: "d1", a: [0, 3], b: [1, 3], open: false, leaf: null }],
  solid: ["9,9"],
};

type Place = NonNullable<FightMapInput["encounterLocation"]>;

function place(over: Partial<Place> & Pick<Place, "id" | "location_type">): Place {
  return {
    map_url: null,
    grid_calibration: null,
    map_layer_url: null,
    map_layer_stand_url: null,
    map_layer_stand_live_url: null,
    map_layer_calibration: null,
    plan_size: null,
    map_live: null,
    ...over,
  };
}

const site = place({ id: "site", location_type: "dungeon", map_layer_url: "site.png", map_layer_calibration: calibration, map_live: live });
const mapless = (id: string) => place({ id, location_type: "room" });
const zone = (cells: CellKey[], cost: number | undefined) => ({ region_role: "zone" as const, space_location_id: null, cells, zone_payload: { movement_cost: cost } });
const roomRegion = (roomId: string, cells: CellKey[]) => ({ region_role: "space" as const, space_location_id: roomId, cells, zone_payload: {} });
const noDoors: readonly MapLiveDoorState[] = [];

describe("a fight's battle map", () => {
  it("a room with no map of its own fights on its parent site's map, not on nothing", () => {
    // Bug it fails on: reading only the encounter's own place, so every room fight on a site's plan had no walls.
    const map = fightMapOf({ encounterLocation: mapless("r1"), parent: site, regions: [], doorStates: noDoors });
    expect(map?.mapLocationId).toBe("site");
    expect(map?.occluders.segments.map((s) => s.id)).toEqual(["w1", "d1"]);
  });

  it("a place with its own calibrated map uses it even when it is a room with a parent", () => {
    // Bug it fails on: always preferring the parent, so a scanned room map was replaced by the site's plan.
    const own = place({ id: "r2", location_type: "room", map_layer_url: "r2.png", map_layer_calibration: calibration, map_live: { ...live, walls: [], doors: [], solid: [] } });
    const map = fightMapOf({ encounterLocation: own, parent: site, regions: [], doorStates: noDoors });
    expect(map?.mapLocationId).toBe("r2");
    expect(map?.occluders.segments).toEqual([]);
  });

  it("no map when nothing is calibrated, and no map when the snapshot is of an older version", () => {
    // Bug it fails on: treating a version-1 snapshot as "no walls", which would let creatures walk through every
    // wall of a site that merely has not been re-published.
    expect(fightMapOf({ encounterLocation: mapless("r1"), parent: mapless("p"), regions: [], doorStates: noDoors })).toBeNull();
    const old = JSON.parse(JSON.stringify({ ...live, version: 1 })) as MapLive;
    expect(fightMapOf({ encounterLocation: { ...site, map_live: old }, parent: null, regions: [], doorStates: noDoors })).toBeNull();
    expect(fightMapOf({ encounterLocation: null, parent: null, regions: [], doorStates: noDoors })).toBeNull();
  });

  it("a picture with a grid and nothing published over it is a map of open ground, not no map", () => {
    // Bug it fails on: reading "no snapshot" as "no map", which leaves every fight on a picture-only map (the
    // commonest kind) with no positions the rules can use.
    const map = fightMapOf({ encounterLocation: { ...site, map_live: null }, parent: null, regions: [], doorStates: noDoors });
    expect(map?.mapLocationId).toBe(site.id);
    expect(map?.occluders.segments).toEqual([]);
    expect(map?.solid.size).toBe(0);
  });

  it("a closed door blocks, and the DM's open override stops it blocking", () => {
    // Bug it fails on: ignoring map_memory.door_states, so a door the DM opened still stopped every creature.
    const closed = fightMapOf({ encounterLocation: site, parent: null, regions: [], doorStates: noDoors });
    expect(closed?.occluders.segments.map((s) => s.id)).toContain("d1");
    const opened = fightMapOf({ encounterLocation: site, parent: null, regions: [], doorStates: [{ id: "d1", open: true }] });
    expect(opened?.occluders.segments.map((s) => s.id)).toEqual(["w1"]);
  });

  it("difficult squares are the costly zones' cells shifted by the calibration origin, and ordinary ground is not difficult", () => {
    // Bug it fails on: forgetting the origin shift (map cell 5,1 would stay 5,1), or counting cost 1 as difficult.
    // Map cells 5,1 and 6,1 with origin (2,0) are image cells 3,1 and 4,1. The cost-1 zone at 8,8 is ordinary.
    const map = fightMapOf({ encounterLocation: site, parent: null, regions: [zone(["5,1", "6,1"], 2), zone(["8,8"], 1)], doorStates: noDoors });
    expect([...(map?.difficult ?? [])].sort()).toEqual(["3,1", "4,1"]);
  });

  it("a room fight prices only the zones that touch the room", () => {
    // Bug it fails on: pricing every zone of the site for a fight in one room. Room r1 owns map cell 5,1 (image 3,1);
    // the zone at map cell 12,12 is far away.
    const regions = [roomRegion("r1", ["5,1"]), zone(["5,1"], 2), zone(["12,12"], 2)];
    const map = fightMapOf({ encounterLocation: mapless("r1"), parent: site, regions, doorStates: noDoors });
    expect([...(map?.difficult ?? [])]).toEqual(["3,1"]);
  });

  it("solid rock and the calibration come from the map place", () => {
    const map = fightMapOf({ encounterLocation: site, parent: null, regions: [], doorStates: noDoors });
    expect([...(map?.solid ?? [])]).toEqual(["9,9"]);
    expect(map?.calibration).toBe(calibration);
  });

  it("the reach terrain carries the closed doors and walls, the rock and the difficult squares", () => {
    // Bug it fails on: handing the walker the drawn doors instead of the doors as the DM left them.
    const map = fightMapOf({ encounterLocation: site, parent: null, regions: [zone(["5,1"], 2)], doorStates: [{ id: "d1", open: true }] });
    if (map === null) throw new Error("expected a map");
    const terrain = reachTerrainOf(map);
    expect(terrain.blocking.map((s) => s.id)).toEqual(["w1"]);
    expect([...terrain.solid]).toEqual(["9,9"]);
    expect([...terrain.difficult]).toEqual(["3,1"]);
  });
});
