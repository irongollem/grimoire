import { describe, expect, it } from "vitest";
import type { Road } from "@/lib/travel/roads";
import { roadTies } from "./roadTies";
import { asConnection, groupTies, isEditableTie, isLine, tieFamily, tieSaysFrom } from "./ties";
import { nodeKey } from "./kinds";

const road: Road = { id: "r1", from_location_id: "a", to_location_id: "b", distance: 40, unit: "mi", name: "the coast road", going: "road" };
const places = new Map([
  ["a", { name: "Brightwater", image: null }],
  ["b", { name: "Saltmarsh", image: "b.png" }],
]);

describe("roadTies", () => {
  // Bug caught: a road drawn from the wrong ends, or without the distance the line is there to show.
  it("is a tie between the road's two places that says how far and by what", () => {
    expect(roadTies([road], places)).toEqual([
      expect.objectContaining({
        source: "road", row_id: "r1", from_kind: "location", from_id: "a", from_name: "Brightwater",
        to_kind: "location", to_id: "b", to_name: "Saltmarsh", to_image: "b.png", told: "40 mi by the coast road",
      }),
    ]);
  });

  // Bug caught: a road to a place the reader cannot see drawn to a node with no name.
  it("draws no road whose other place is not known", () => {
    expect(roadTies([{ ...road, to_location_id: "gone" }], places)).toEqual([]);
  });
});

describe("a road among the web's ties", () => {
  const [tie] = roadTies([road], places);

  // Bug caught: a road falling into the catalogue of links, which has no such type, and reading as its raw type.
  it("reads the same from both of its ends", () => {
    const fromA = groupTies([tie], nodeKey("location", "a"));
    const fromB = groupTies([tie], nodeKey("location", "b"));
    expect(fromA).toEqual([{ word: "road to", items: [expect.objectContaining({ name: "Saltmarsh" })] }]);
    expect(fromB).toEqual([{ word: "road to", items: [expect.objectContaining({ name: "Brightwater" })] }]);
  });

  // Bug caught: every road's line saying only "road to", so the web shows that two towns are joined and not how far.
  it("says how far it is on its line, from either end", () => {
    expect(tieSaysFrom(tie, nodeKey("location", "a"))).toBe("40 mi by the coast road");
    expect(tieSaysFrom(tie, nodeKey("location", "b"))).toBe("40 mi by the coast road");
  });

  it("is a line at rest, filtered with the places", () => {
    expect(isLine(tie)).toBe(true);
    expect(tieFamily(tie)).toBe("place");
  });

  // Bug caught: the web offering to retype or remove a road through the connection writes, which know no such row.
  it("is not changed from the web", () => {
    expect(isEditableTie(tie)).toBe(false);
    expect(() => asConnection(tie, nodeKey("location", "a"))).toThrow();
  });
});
