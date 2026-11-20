import { describe, expect, it } from "vitest";
import { foodEdition, travelMapFrom } from "./travelRows.ts";

const base = { places: [], roads: [], placed: [], rations: null, terrains: [], ways: [], companions: [], gameSystem: "dnd5e-2024" as string | null };
const table = { id: "t", name: "Wolves", dice: "1d6", entries: [] };

describe("foodEdition", () => {
  it("is the edition of a 5e system and nothing for another", () => {
    expect([foodEdition("dnd5e-2014"), foodEdition("dnd5e-2024"), foodEdition("pf2e"), foodEdition(null)]).toEqual(["2014", "2024", null, null]);
  });
});

describe("travelMapFrom", () => {
  it("counts food only when the rations rule is switched on", () => {
    expect(travelMapFrom({ ...base, rations: { enabled: true } }).food).toBe("2024");
    expect(travelMapFrom({ ...base, rations: { enabled: false } }).food).toBeNull();
    expect(travelMapFrom(base).food).toBeNull();
  });

  it("a road whose distance is not a number is not a road to travel by; a numeric string is", () => {
    const { roads } = travelMapFrom({ ...base, roads: [{ id: "a", distance: "12" }, { id: "b", distance: "far" }, { id: "c", distance: 3 }] });
    expect(roads.map((r) => [r.id, r.distance])).toEqual([["a", 12], ["c", 3]]);
  });

  // Bug caught: a snowbound road read as plain road because the terrain did not survive the row's shaping.
  it("a road keeps the terrain its row names", () => {
    const { roads } = travelMapFrom({ ...base, roads: [{ id: "a", distance: 1, terrain: "snow" }, { id: "b", distance: 1, terrain: "road" }] });
    expect(roads.map((r) => r.terrain)).toEqual(["snow", "road"]);
  });

  // Bug caught: the campaign's own terrain or way ignored, so a table that wrote "snow is x1/2" is told the preset's 1/3;
  // or a companion's speed lost, so a way it pulls cannot move.
  it("lays the campaign's terrains and ways over the presets and reads a companion's speed", () => {
    const out = travelMapFrom({
      ...base,
      terrains: [{ key: "snow", name: "Packed snow", factor: 0.5, sink: 1 }],
      ways: [{ key: "beak_sled", name: "Dogsled (axe beak)", kind: "vehicle", speed_feet: null, mph: null, companion_id: "c1", at_home: ["snow"], sink: {}, through_the_night: false }],
      companions: [{ id: "c1", speed: 50 }],
    });
    expect(out.terrains.find((t) => t.key === "snow")?.factor).toBe(0.5);
    expect(out.ways.map((w) => w.key)).toContain("beak_sled");
    expect([out.companionSpeed("c1"), out.companionSpeed("gone")]).toEqual([50, null]);
  });

  it("keeps a road's own table apart from the road row, whether the join gave an object or a one-element array", () => {
    const out = travelMapFrom({ ...base, roads: [{ id: "a", distance: 1, roll_table: table }, { id: "b", distance: 1, roll_table: [table] }, { id: "c", distance: 1, roll_table: null }] });
    expect(out.roadTables.map((r) => r.roadId)).toEqual(["a", "b"]);
    expect(out.roads[0]).not.toHaveProperty("roll_table");
  });

  it("a table placed on a place is tied to that place; a placement with no table is dropped", () => {
    const out = travelMapFrom({ ...base, placed: [{ location_id: "L", roll_table: [table] }, { location_id: "M", roll_table: null }] });
    expect(out.tables.map((t) => [t.id, t.placeId])).toEqual([["t", "L"]]);
  });
});
