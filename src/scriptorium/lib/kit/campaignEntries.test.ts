import { describe, expect, it } from "vitest";
import { KIT_ENTRY_LIMIT, KIT_PER_KIND, filterKitEntries, monsterDot, npcDot, npcSubtitle, spellDot, type KitCampaignEntry } from "./campaignEntries";
import type { NpcStatus } from "@/types/npc.types";
import { entityTypeLabel } from "./kitItem";

const entry = (type: KitCampaignEntry["type"], name: string): KitCampaignEntry => ({ id: `${type}-${name}`, type, name, subtitle: null, dot: null });

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

describe("entry dots", () => {
  // Fails on: a school or type the app has no colour for painting `var(--school-homebrew)`, an invisible dot.
  it("gives no dot to a school or creature type with no colour", () => {
    expect(spellDot("evocation")).toBe("var(--school-evocation)");
    expect(spellDot("chronomancy")).toBeNull();
    expect(monsterDot("undead")).toBe("var(--monstertype-undead)");
    expect(monsterDot("swarm")).toBeNull();
  });

  // Fails on: a status the map lacks (old data) leaving the dot uncoloured instead of the muted "unknown".
  it("an NPC status outside the four reads as unknown", () => {
    expect(npcDot("dead")).toBe("var(--tone-danger)");
    expect(npcDot("petrified" as NpcStatus)).toBe("var(--muted-foreground)");
  });

  // Fails on: the kit no longer saying who is dead, which the old Insert panel's chip did.
  it("names a dead or missing NPC's status, and not an ordinary one", () => {
    expect(npcSubtitle({ race: "Human", occupation: "Smith", status: "dead" })).toBe("Human · Smith · dead");
    expect(npcSubtitle({ race: "Human", occupation: null, status: "alive" })).toBe("Human");
    expect(npcSubtitle({ race: null, occupation: null, status: "unknown" })).toBeNull();
  });
});
