import { describe, expect, it } from "vitest";
import { bundlePreselection } from "./bundlePreselection";

describe("bundlePreselection", () => {
  it("maps each linked entity type to its bundle category and adds the document", () => {
    expect(
      bundlePreselection(
        [
          { type: "npc", id: "n1" },
          { type: "monster", id: "m1" },
          { type: "spell", id: "s1" },
          { type: "item", id: "i1" },
          { type: "location", id: "l1" },
          { type: "quest", id: "q1" },
          { type: "npc", id: "n2" },
        ],
        "doc-1",
      ),
    ).toEqual({
      npcs: ["n1", "n2"],
      monsters: ["m1"],
      spells: ["s1"],
      items: ["i1"],
      locations: ["l1"],
      quests: ["q1"],
      scriptorium_documents: ["doc-1"],
    });
  });

  it("maps deities, species, factions and subclasses to their categories", () => {
    expect(
      bundlePreselection(
        [
          { type: "deity", id: "d1" },
          { type: "species", id: "sp1" },
          { type: "faction", id: "f1" },
          { type: "subclass", id: "sc1" },
        ],
        null,
      ),
    ).toEqual({ deities: ["d1"], species: ["sp1"], factions: ["f1"], custom_subclasses: ["sc1"] });
  });

  it("deduplicates repeated refs", () => {
    expect(
      bundlePreselection([{ type: "npc", id: "n1" }, { type: "npc", id: "n1" }], null),
    ).toEqual({ npcs: ["n1"] });
  });

  it("is empty for a book with no links and no id", () => {
    expect(bundlePreselection([], null)).toEqual({});
  });
});
