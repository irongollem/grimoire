import { describe, it, expect } from "vitest";
import { rankSearchHits, FAMILY_CAP, type CampaignSearchHit, type CampaignSearchKind } from "./campaignSearch";

function hit(kind: CampaignSearchKind, name: string, distance: number, id = `${kind}-${name}`): CampaignSearchHit {
  return { kind, id, name, descriptor: null, distance };
}

describe("rankSearchHits", () => {
  it("returns nothing for no input", () => {
    expect(rankSearchHits([])).toEqual([]);
  });

  it("drops everything past the absolute ceiling (an unrelated query)", () => {
    expect(rankSearchHits([hit("npc", "A", 0.74), hit("note", "B", 0.77)])).toEqual([]);
  });

  it("drops hits more than 0.08 behind the best across all kinds", () => {
    const out = rankSearchHits([hit("npc", "Near", 0.53), hit("note", "Edge", 0.61), hit("quest", "Far", 0.62)]);
    expect(out.map((h) => h.name)).toEqual(["Near", "Edge"]);
  });

  it("caps the cut at 0.72 even when best + 0.08 would be higher", () => {
    const out = rankSearchHits([hit("npc", "A", 0.68), hit("note", "B", 0.73)]);
    expect(out.map((h) => h.name)).toEqual(["A"]);
  });

  it("sorts nearest first", () => {
    const out = rankSearchHits([hit("note", "B", 0.6), hit("npc", "A", 0.55), hit("quest", "C", 0.58)]);
    expect(out.map((h) => h.name)).toEqual(["A", "C", "B"]);
  });

  it("dedupes an item family by name, case-insensitively, the DM's own row winning", () => {
    const out = rankSearchHits([
      hit("library_item", "Flame Tongue", 0.54),
      hit("item", "flame tongue", 0.58),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("item");
  });

  it("dedupes the monster family the same way", () => {
    const out = rankSearchHits([
      hit("library_monster", "Griffon", 0.55),
      hit("monster", "GRIFFON", 0.6),
      hit("library_monster", "Owlbear", 0.56),
    ]);
    expect(out.map((h) => `${h.kind}:${h.name}`)).toEqual(["library_monster:Owlbear", "monster:GRIFFON"]);
  });

  it("does not dedupe across families or for non-item kinds", () => {
    const out = rankSearchHits([hit("npc", "Bram", 0.55), hit("note", "Bram", 0.56, "n1"), hit("note", "Bram", 0.57, "n2")]);
    expect(out).toHaveLength(3);
  });

  it("caps each family at five, an item and a library item sharing one", () => {
    const items = Array.from({ length: 4 }, (_, i) => hit("item", `I${i}`, 0.5 + i * 0.001));
    const lib = Array.from({ length: 4 }, (_, i) => hit("library_item", `L${i}`, 0.51 + i * 0.001));
    const npcs = Array.from({ length: 7 }, (_, i) => hit("npc", `N${i}`, 0.52 + i * 0.001));
    const out = rankSearchHits([...items, ...lib, ...npcs]);
    expect(out.filter((h) => h.kind === "item" || h.kind === "library_item")).toHaveLength(FAMILY_CAP);
    expect(out.filter((h) => h.kind === "npc")).toHaveLength(FAMILY_CAP);
  });
});
