import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { RunCombatant } from "@/types/encounter.types";
import TableRibbon from "./TableRibbon.vue";

const one: RunCombatant = {
  instance_id: "m1", type: "monster", name: "Ogre", faction_id: "foes", initiative: 12, hp: 1, max_hp: 1, ac: "",
  conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0,
};

describe("TableRibbon", () => {
  // A fight with no combatants yet used to draw an empty pill across the top of the screen.
  it("draws nothing at all when there is no order, rather than an empty pill", () => {
    const w = mount(TableRibbon, { props: { order: [], factions: [] } });
    expect(w.find("[data-testid='table-ribbon']").exists()).toBe(false);
  });

  it("draws one entry per creature in the order", () => {
    const w = mount(TableRibbon, { props: { order: [one], factions: [], activeInstanceId: "m1" } });
    expect(w.findAll("li")).toHaveLength(1);
    expect(w.find("[data-testid='table-ribbon-current']").exists()).toBe(true);
  });
});
