import { describe, expect, it } from "vitest";
import { deityHit, mergeAllGroups, npcDetail, npcHit, partyHit, searchRoute, TIES_GROUP } from "@/lib/search/searchRows";
import type { SearchGroup } from "@/lib/search/mergeSearchHits";

const group = (type: string, ...names: string[]): SearchGroup => ({
  type,
  label: type,
  items: names.map((name) => ({ id: name, name, route: `/${name}`, matchedBy: "name" as const })),
});

describe("row shaping", () => {
  it("says what an NPC does and where, and finds a disguised NPC by both names", () => {
    expect(npcDetail({ occupation: "Toll-man", location: { name: "Thane's Crossing" } })).toBe("Toll-man · Thane's Crossing");
    expect(npcDetail({ occupation: null, location: null })).toBeNull();
    expect(npcHit({ id: "n", name: "Harl", disguise_name: "Old Tom", occupation: null, location: null }).name).toBe("Harl (Old Tom)");
  });

  it("gives a character its class and level, and a deity its titles and domains", () => {
    expect(partyHit({ id: "p", name: "Brenna", class: "Rogue", level: 3 }).detail).toBe("Rogue · level 3");
    expect(deityHit({ id: "d", name: "Maera", titles: "The Drowned Lady", domains: ["Tide", "Grave"] }).detail).toBe("The Drowned Lady · Tide, Grave");
  });

  it("opens each kind where its list opens it", () => {
    expect(searchRoute("location", "l1")).toBe("/locations?at=l1");
    expect(searchRoute("party_member", "p1")).toBe("/party/p1");
  });
});

describe("mergeAllGroups", () => {
  it("leads with ties and seats the party after NPCs and deities before quests", () => {
    const merged = mergeAllGroups(
      [group(TIES_GROUP, "t"), group("npc", "a"), group("party_member", "b"), group("deity", "c"), group("quest", "d")],
      [],
    );
    expect(merged.map((g) => g.type)).toEqual([TIES_GROUP, "npc", "party_member", "deity", "quest"]);
  });
});
