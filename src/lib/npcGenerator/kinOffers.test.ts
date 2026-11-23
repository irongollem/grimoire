import { describe, expect, it } from "vitest";
import { kinOfferKey, kinOffers } from "./kinOffers";

type Row = { kind: "parent" | "sibling" | "spouse"; from_npc_id: string | null; from_party_member_id: string | null; to_npc_id: string | null; to_party_member_id: string | null };
const link = (kind: Row["kind"], from: string, to: string): Row => ({
  kind, from_npc_id: from, from_party_member_id: null, to_npc_id: to, to_party_member_id: null,
});

// Odo is the father of Tam and Nella; Tam and Pip are linked as siblings; Tam is married to Ila, with a child Wren.
const family = [
  link("parent", "odo", "tam"),
  link("parent", "odo", "nella"),
  link("sibling", "pip", "tam"),
  link("spouse", "tam", "ila"),
  link("parent", "tam", "wren"),
];

describe("kinOffers", () => {
  it("offers a new parent the relative's other children, by a shared parent and by a sibling link", () => {
    expect(kinOffers(family, "npc:tam", "parent")).toEqual([
      { key: "npc:pip", relation: "parent" },
      { key: "npc:nella", relation: "parent" },
    ]);
  });

  it("never offers the relative themself, though they are a child of their own parent", () => {
    expect(kinOffers(family, "npc:tam", "parent").map((o) => o.key)).not.toContain("npc:tam");
  });

  it("offers a new sibling as a child of the relative's parents, and a sibling of their linked siblings", () => {
    expect(kinOffers(family, "npc:tam", "sibling")).toEqual([
      { key: "npc:odo", relation: "child" },
      { key: "npc:pip", relation: "sibling" },
    ]);
  });

  it("offers a new spouse as a parent of the relative's children", () => {
    expect(kinOffers(family, "npc:tam", "spouse")).toEqual([{ key: "npc:wren", relation: "parent" }]);
  });

  it("offers a new child nothing: its other parent has a field of its own", () => {
    expect(kinOffers(family, "npc:tam", "child")).toEqual([]);
  });

  it("leaves out a person the DM already chose elsewhere, and offers each person once", () => {
    const twice = [...family, link("sibling", "nella", "tam")];
    expect(kinOffers(twice, "npc:tam", "parent", ["npc:pip"])).toEqual([{ key: "npc:nella", relation: "parent" }]);
  });

  it("keys an offer by relation and person, so one person under two relations is two answers", () => {
    expect(kinOfferKey({ key: "npc:pip", relation: "parent" })).not.toBe(kinOfferKey({ key: "npc:pip", relation: "sibling" }));
  });
});
