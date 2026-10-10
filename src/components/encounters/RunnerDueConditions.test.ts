// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { RunCombatant } from "@/types/encounter.types";
import type { AppliedCondition } from "@/types/condition.types";

const rollConditionSave = vi.fn();
const rollConcentration = vi.fn();
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2024") }) }));
vi.mock("@/composables/encounters/useCompanions", () => ({ useCompanions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([]) }) }));
vi.mock("@/composables/party/useConcentration", () => ({
  useConcentration: () => ({ rollConcentrationSave: vi.fn(), endConcentration: vi.fn() }),
}));
vi.mock("@/composables/encounters/useActionResolution", () => ({
  useActionResolution: () => ({
    // A stat block for the goblin only: the hero is a party member.
    saveBonusFor: (c: RunCombatant) => (c.type === "monster" ? 0 : null),
    rollConditionSave,
    rollDamage: vi.fn(),
    applyDamage: vi.fn(),
    defensesFor: vi.fn(),
    rollConcentration,
  }),
}));

import RunnerDueConditions from "./RunnerDueConditions.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";

function combatant(id: string, name: string, type: "monster" | "player", conditions: AppliedCondition[]): RunCombatant {
  return {
    instance_id: id, type, name, faction_id: "f", initiative: 10, hp: 10, max_hp: 10, ac: "12",
    conditions, curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0,
  };
}

const held: AppliedCondition = {
  name: "Paralyzed",
  ends: { kind: "save", ability: "wis", dc: 14, at: "end" },
  due: { save: true },
};

describe("RunnerDueConditions", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    rollConditionSave.mockReset();
    rollConcentration.mockReset();
  });

  it("renders nothing while nothing is owed", () => {
    const w = mount(RunnerDueConditions);
    expect(w.find("[data-testid=due-conditions]").exists()).toBe(false);
  });

  it("lists a save owed, offers Roll only to a stat-block combatant, and Passed settles it", async () => {
    const store = useEncounterRunStore();
    store.combatants = [{ ...combatant("g", "Goblin", "monster", [held]), initiative: 15 }, combatant("h", "Hero", "player", [held])];
    const w = mount(RunnerDueConditions);
    const lines = w.findAll("[data-testid=due-save]");
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text()).toContain("Goblin");
    expect(lines[0]!.text()).toContain("Paralyzed");
    expect(lines[0]!.text()).toContain("WIS 14");
    expect(lines[0]!.text()).toContain("Roll");
    expect(lines[1]!.text()).not.toContain("Roll");

    const passed = lines[1]!.findAll("button").find((b) => b.text() === "Passed")!;
    await passed.trigger("click");
    await flushPromises();
    expect(store.combatants.find((c) => c.instance_id === "h")!.conditions).toEqual([]);
    expect(store.dueConditions.map((d) => d.instanceId)).toEqual(["g"]);
  });

  it("rolls for a monster, shows the total and resolves the save from the result", async () => {
    const store = useEncounterRunStore();
    store.combatants = [combatant("g", "Goblin", "monster", [held])];
    rollConditionSave.mockResolvedValue({ total: 9, success: false });
    const w = mount(RunnerDueConditions);
    await w.findAll("button").find((b) => b.text() === "Roll")!.trigger("click");
    await flushPromises();
    expect(rollConditionSave).toHaveBeenCalledWith(expect.objectContaining({ ability: "wis", dc: 14 }));
    expect(w.find("[data-testid=due-note]").text()).toContain("9");
    expect(store.dueConditions).toHaveLength(0);
  });

  describe("concentration checks", () => {
    const hold: AppliedCondition = { name: "Paralyzed", source: { id: "mage", spell: "Hold Person", concentration: true } };

    function setup() {
      const store = useEncounterRunStore();
      store.combatants = [combatant("mage", "Mage", "monster", []), combatant("g", "Goblin", "monster", [hold])];
      store.adjustHp("mage", -4);
      return store;
    }

    it("lists the check with its spells and DC, and Lost ends what the holder holds", async () => {
      const store = setup();
      const w = mount(RunnerDueConditions);
      const line = w.find("[data-testid=due-concentration]");
      expect(line.text()).toContain("Mage");
      expect(line.text()).toContain("Hold Person");
      expect(line.text()).toContain("DC 10");
      await line.findAll("button").find((b) => b.text() === "Lost")!.trigger("click");
      expect(store.concentrationChecks).toEqual([]);
      expect(store.combatants.find((c) => c.instance_id === "g")!.conditions).toEqual([]);
    });

    it("rolls, writes the note and keeps the conditions on a kept check", async () => {
      const store = setup();
      rollConcentration.mockResolvedValue({ dc: 10, total: 17, maintained: true });
      const w = mount(RunnerDueConditions);
      await w.find("[data-testid=due-concentration]").findAll("button").find((b) => b.text() === "Roll")!.trigger("click");
      await flushPromises();
      expect(rollConcentration).toHaveBeenCalledWith(expect.objectContaining({ damage: 4 }));
      expect(w.find("[data-testid=due-note]").text()).toBe("Mage rolls 17 against DC 10: concentration kept.");
      expect(store.concentrationChecks).toEqual([]);
      expect(store.combatants.find((c) => c.instance_id === "g")!.conditions).toEqual([hold]);
    });
  });
});
