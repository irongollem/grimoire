import { describe, expect, it } from "vitest";
import type { ExtractedRoad } from "@/types/documentImport.types";
import { cleanRoads, planRoads } from "./importSweepRoads";

const CAMPAIGN = "camp-1";
const PLACES = [
  { id: "loc-a", name: "Phandalin" },
  { id: "loc-b", name: "Brightwater" },
  { id: "loc-c", name: "Leilon" },
];
const road = (over: Partial<ExtractedRoad> = {}): ExtractedRoad => ({
  to_name: "Brightwater",
  distance: 40,
  unit: "mi",
  going: "road",
  terrain: "road",
  ...over,
});

describe("planRoads", () => {
  it("writes a road to the place it names, scoped to the campaign, with the name the page gave it", () => {
    const { writes, unresolved } = planRoads([{ id: "loc-a", links: { roads: [road({ name: "the coast road", terrain: "snow" })] } }], PLACES, CAMPAIGN);
    expect(unresolved).toEqual([]);
    expect(writes).toEqual([
      { campaign_id: CAMPAIGN, from_location_id: "loc-a", to_location_id: "loc-b", distance: 40, unit: "mi", name: "the coast road", going: "road", terrain: "snow" },
    ]);
  });

  it("matches the far end the way world links do, ignoring case and a leading article", () => {
    const { writes } = planRoads([{ id: "loc-a", links: { roads: [road({ to_name: "  brightwater " })] } }], PLACES, CAMPAIGN);
    expect(writes).toHaveLength(1);
  });

  it("writes a road stated from both towns' entries once", () => {
    const { writes } = planRoads(
      [
        { id: "loc-a", links: { roads: [road({ name: "Coast Road" })] } },
        { id: "loc-b", links: { roads: [road({ to_name: "Phandalin", name: "coast road", distance: 41 })] } },
      ],
      PLACES,
      CAMPAIGN,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]!.distance).toBe(40);
  });

  it("keeps two roads between one pair when their names differ, and dedupes two unnamed ones", () => {
    const { writes } = planRoads(
      [{ id: "loc-a", links: { roads: [road({ name: "coast road" }), road({ name: "high road" }), road(), road()] } }],
      PLACES,
      CAMPAIGN,
    );
    expect(writes.map((w) => w.name)).toEqual(["coast road", "high road", ""]);
  });

  it("reports a far end that matched nothing and writes no road for it", () => {
    const { writes, unresolved } = planRoads([{ id: "loc-a", links: { roads: [road({ to_name: "Neverwinter" })] } }], PLACES, CAMPAIGN);
    expect(writes).toEqual([]);
    expect(unresolved).toEqual([{ sourceId: "loc-a", name: "Neverwinter" }]);
  });

  it("skips a road from a place to itself without reporting it", () => {
    const { writes, unresolved } = planRoads([{ id: "loc-a", links: { roads: [road({ to_name: "Phandalin" })] } }], PLACES, CAMPAIGN);
    expect(writes).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it("does nothing for a place that states no roads", () => {
    expect(planRoads([{ id: "loc-a", links: {} }], PLACES, CAMPAIGN)).toEqual({ writes: [], unresolved: [] });
  });
});

describe("cleanRoads", () => {
  const good = { to_name: "Brightwater", distance: 40, unit: "mi", name: null, going: "road", terrain: "road" };

  it("drops a distance the column would refuse: zero, negative, over the ceiling, not a number", () => {
    const kept = cleanRoads([
      { ...good, distance: 0 },
      { ...good, distance: -5 },
      { ...good, distance: 100001 },
      { ...good, distance: Number.NaN },
      { ...good, distance: "40" },
      { ...good, distance: 100000 },
    ]);
    expect(kept.map((r) => r.distance)).toEqual([100000]);
  });

  it("rounds to the hundredths the column stores", () => {
    expect(cleanRoads([{ ...good, distance: 12.3456 }])[0]!.distance).toBe(12.35);
  });

  it("drops a road with no usable far end or an unknown unit", () => {
    expect(cleanRoads([{ ...good, to_name: "  " }, { ...good, to_name: 3 }, { ...good, unit: "leagues" }])).toEqual([]);
  });

  it("trims a name and caps it at the column's 120 characters, and leaves an empty one off", () => {
    const [capped, blank] = cleanRoads([{ ...good, name: `  ${"x".repeat(150)}  ` }, { ...good, name: "   " }]);
    expect(capped!.name).toBe("x".repeat(120));
    expect(blank).not.toHaveProperty("name");
  });

  it("turns a going outside the list into a road, and keeps one inside it", () => {
    const [odd, sea] = cleanRoads([{ ...good, going: "airship" }, { ...good, going: "sea" }]);
    expect(odd!.going).toBe("road");
    expect(sea!.going).toBe("sea");
  });

  // Bug caught: a snowbound track written as a plain road, or a terrain the model invented written to a column the app cannot read.
  it("keeps a terrain of the presets and turns any other into a road", () => {
    const [snow, odd, missing] = cleanRoads([{ ...good, terrain: "snow" }, { ...good, terrain: "lava" }, { ...good, terrain: undefined }]);
    expect([snow!.terrain, odd!.terrain, missing!.terrain]).toEqual(["snow", "road", "road"]);
  });

  it("reads anything that is not an array as no roads", () => {
    expect(cleanRoads(undefined)).toEqual([]);
    expect(cleanRoads("40 miles")).toEqual([]);
  });
});
