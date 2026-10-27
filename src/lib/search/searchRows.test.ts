import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { routes } from "@/router/routes";
import { SEARCH_KINDS, deityHit, mergeAllGroups, npcDetail, npcHit, partyHit, searchRoute, TIES_GROUP } from "@/lib/search/searchRows";
import { mergeSearchGroups, type SearchGroup } from "@/lib/search/mergeSearchHits";
import type { CampaignSearchHit } from "@edge-shared/campaignSearch.ts";

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

describe("where a row opens", () => {
  const router = createRouter({ history: createMemoryHistory(), routes });
  const opensAPage = (path: string) => router.resolve(path).name !== "not-found";

  it.each(SEARCH_KINDS)("sends a %s row to a page the app has", (kind) => {
    expect(opensAPage(searchRoute(kind, "abc"))).toBe(true);
  });

  it("sends every kind of meaning hit to a page the app has", () => {
    const kinds: CampaignSearchHit["kind"][] = ["npc", "location", "faction", "note", "quest", "item", "library_item", "monster", "library_monster"];
    const out = mergeSearchGroups([], kinds.map((kind, i) => ({ kind, id: `id-${i}`, name: kind, descriptor: null, distance: i / 10 })));
    const found = out.flatMap((g) => g.items.map((item) => item.route));
    expect(found).toHaveLength(kinds.length);
    expect(found.filter((path) => !opensAPage(path))).toEqual([]);
  });
});

describe("row details", () => {
  it("leaves out the parts a row does not have", () => {
    expect(partyHit({ id: "p", name: "Brenna", class: "Rogue", level: null }).detail).toBe("Rogue");
    expect(npcDetail({ occupation: "  ", location: { name: "Inn" } })).toBe("Inn");
    expect(deityHit({ id: "d", name: "Maera", titles: null, domains: [] }).detail).toBeNull();
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
