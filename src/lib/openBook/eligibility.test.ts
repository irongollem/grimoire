import { describe, expect, it } from "vitest";
import { isInBook, npcBookBlock, npcEligible, npcSharingPlaceIds, wholeParty } from "./eligibility";

describe("wholeParty", () => {
  it("is false for an empty party, whatever the entry holds", () => {
    expect(wholeParty(["a"], [])).toBe(false);
    expect(wholeParty(null, [])).toBe(false);
  });
  it("is false when the entry is visible to nobody", () => {
    expect(wholeParty(null, ["a"])).toBe(false);
    expect(wholeParty(undefined, ["a"])).toBe(false);
    expect(wholeParty([], ["a"])).toBe(false);
  });
  it("needs every member, and allows extras", () => {
    expect(wholeParty(["a"], ["a", "b"])).toBe(false);
    expect(wholeParty(["a", "b"], ["a", "b"])).toBe(true);
    expect(wholeParty(["b", "a", "gone"], ["a", "b"])).toBe(true);
  });
});

describe("isInBook", () => {
  it("never takes an ineligible entry", () => {
    expect(isInBook(false, true, true)).toBe(false);
  });
  it("lets the DM's choice beat the default", () => {
    expect(isInBook(true, false, true)).toBe(false);
    expect(isInBook(true, true, false)).toBe(true);
  });
  it("falls back to the default without a choice", () => {
    expect(isInBook(true, undefined, true)).toBe(true);
    expect(isInBook(true, undefined, false)).toBe(false);
  });
});

describe("npc rule", () => {
  const party = ["a", "b"];
  const places = [
    { id: "open", player_visible_to: ["a", "b"], is_npcs_shared: true },
    { id: "open-private-folk", player_visible_to: ["a", "b"], is_npcs_shared: false },
    { id: "half", player_visible_to: ["a"], is_npcs_shared: true },
  ];
  const shared = npcSharingPlaceIds(places, party);
  const npc = (over: Partial<Parameters<typeof npcEligible>[0]>) => ({
    player_visible_to: [] as string[],
    player_visible_fields: ["name"],
    location_id: null as string | null,
    ...over,
  });

  it("collects only places that are whole-party visible and share their residents", () => {
    expect([...shared]).toEqual(["open"]);
    expect(npcSharingPlaceIds(places, []).size).toBe(0);
  });
  it("needs the name shared, even when the whole party sees the NPC", () => {
    const hidden = npc({ player_visible_to: party, player_visible_fields: ["portrait"] });
    expect(npcBookBlock(hidden, party, shared)).toBe("name");
    expect(npcEligible(hidden, party, shared)).toBe(false);
  });
  it("takes an NPC the whole party sees", () => {
    expect(npcEligible(npc({ player_visible_to: party }), party, shared)).toBe(true);
  });
  it("takes an NPC living in a place that shares its residents, with nobody told directly", () => {
    expect(npcEligible(npc({ location_id: "open" }), party, shared)).toBe(true);
  });
  it("does not take an NPC from a place that hides its residents or is only half visible", () => {
    expect(npcBookBlock(npc({ location_id: "open-private-folk" }), party, shared)).toBe("party");
    expect(npcBookBlock(npc({ location_id: "half" }), party, shared)).toBe("party");
    expect(npcBookBlock(npc({ location_id: "gone" }), party, shared)).toBe("party");
  });
  it("is never eligible with an empty party", () => {
    expect(npcEligible(npc({ player_visible_to: ["a"] }), [], new Set(["open"]))).toBe(false);
    // Not even a place that shares its residents rescues an NPC when there is no party to share with.
    expect(npcBookBlock(npc({ location_id: "open" }), [], new Set(["open"]))).toBe("party");
  });
});
