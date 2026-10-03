import { describe, expect, it } from "vitest";
import { WORKSHOP_LIBRARY_EQUIVALENTS } from "./workshopLibraryEquivalents";
import { GEAR } from "./gear";
import { PROVISIONS } from "./provisions";
import { AMMUNITION } from "./ammunition";
import { RULESET_KEYS } from "@/types/ruleset.types";

// The bundled datasets are seeded into library_items beside the SRD rows. An
// item both define, visible in the same edition, is listed twice in that
// campaign and crafts into whichever copy the name lookup meets first (#957).
describe("WORKSHOP_LIBRARY_EQUIVALENTS", () => {
  const bundled = [...GEAR, ...PROVISIONS, ...AMMUNITION];

  it("keeps a bundled copy only in the editions the SRD does not cover", () => {
    const wrong = Object.entries(WORKSHOP_LIBRARY_EQUIVALENTS).flatMap(([name, byEdition]) => {
      const uncovered = RULESET_KEYS.filter((edition) => !byEdition[edition]);
      const copies = bundled.filter((item) => item.name === name);
      if (uncovered.length === 0) return copies.length ? [`${name}: bundled copy of an item the SRD covers in every edition`] : [];
      if (copies.length !== 1) return [`${name}: needs exactly one bundled copy for ${uncovered.join(", ")}, has ${copies.length}`];
      const expected = uncovered.length === RULESET_KEYS.length ? null : uncovered[0];
      return (copies[0].ruleset ?? null) === expected ? [] : [`${name}: bundled copy should be ruleset ${expected}, is ${copies[0].ruleset ?? null}`];
    });
    expect(wrong).toEqual([]);
  });

  it("points at SRD row ids of the edition they are filed under", () => {
    const wrong = Object.entries(WORKSHOP_LIBRARY_EQUIVALENTS).flatMap(([name, byEdition]) =>
      Object.entries(byEdition).flatMap(([edition, id]) => {
        const prefix = edition === "2014" ? /^srd_srd_(?!2024_)/ : /^srd_srd_2024_/;
        return prefix.test(id) ? [] : [`${name} (${edition}) → ${id}`];
      }),
    );
    expect(wrong).toEqual([]);
  });
});
