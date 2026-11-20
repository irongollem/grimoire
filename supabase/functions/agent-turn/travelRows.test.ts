import { describe, expect, it } from "vitest";
import { foodEdition, travelMapFrom } from "./travelRows.ts";

const base = { places: [], roads: [], placed: [], rations: null, gameSystem: "dnd5e-2024" as string | null };
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
