import { describe, expect, it } from "vitest";
import { KIT_ENTRY_LIMIT, KIT_PER_KIND, filterKitEntries, type KitCampaignEntry } from "./campaignEntries";
import { entityTypeLabel } from "./kitItem";

const entry = (type: KitCampaignEntry["type"], name: string): KitCampaignEntry => ({ id: `${type}-${name}`, type, name, subtitle: null });

describe("filterKitEntries", () => {
  // Fails on: one long kind (two hundred monsters) filling the list so NPCs, places and quests never show.
  it("shows the first few of each kind before anything is typed", () => {
    const monsters = Array.from({ length: 30 }, (_, i) => entry("monster", `M${String(i).padStart(2, "0")}`));
    const { shown, total } = filterKitEntries([...monsters, entry("npc", "Rosie"), entry("quest", "Heist")], "", entityTypeLabel);
    expect(shown.filter((e) => e.type === "monster")).toHaveLength(KIT_PER_KIND);
    expect(shown.map((e) => e.name)).toEqual(expect.arrayContaining(["Rosie", "Heist"]));
    expect(total).toBe(32);
  });

  // Fails on: a search that only matches names, so "quest" finds no quests.
  it("a search matches the name or the kind", () => {
    const all = [entry("npc", "Rosie"), entry("quest", "Heist"), entry("spell", "Quest Ward")];
    expect(filterKitEntries(all, "ros", entityTypeLabel).shown.map((e) => e.name)).toEqual(["Rosie"]);
    expect(filterKitEntries(all, "quest", entityTypeLabel).shown.map((e) => e.name).sort()).toEqual(["Heist", "Quest Ward"]);
  });

  it("caps a search and says how many matched", () => {
    const many = Array.from({ length: KIT_ENTRY_LIMIT + 7 }, (_, i) => entry("npc", `Guard ${i}`));
    const r = filterKitEntries(many, "guard", entityTypeLabel);
    expect(r.shown).toHaveLength(KIT_ENTRY_LIMIT);
    expect(r.total).toBe(KIT_ENTRY_LIMIT + 7);
  });
});
