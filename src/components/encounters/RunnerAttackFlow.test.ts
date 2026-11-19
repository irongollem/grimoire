// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunnerAttackFlow from "./RunnerAttackFlow.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";
import type { AttackStructure, StatBlockEntry } from "@/types/statBlock.types";

vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2014") }) }));

function creature(id: string, extra: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: "enemy", initiative: 10, hp: 30, max_hp: 30, ac: "12",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, ...extra,
  };
}

const bow: AttackStructure = { delivery: "ranged", bonus: 4, range: { normal: 80, long: 320 }, hit: [{ dice: "1d6+2", type: "piercing" }] };
const entry: StatBlockEntry = { name: "Shortbow", description: "", structured: { kind: "attack", source: "manual", attack: bow } };

function mountFlow(attack: AttackStructure = bow, dmMode: "normal" | "advantage" = "normal") {
  const store = useEncounterRunStore();
  const resolution = { armorClassFor: () => 12, resolveAttack: vi.fn().mockResolvedValue(null) };
  const wrapper = mount(RunnerAttackFlow, {
    props: { attacker: store.combatants[0], entry: { ...entry, structured: { ...entry.structured, attack } }, attack, resolution: resolution as never, dmMode, silent: false },
    global: { stubs: { RunnerResolveTargets: true, RunnerAttackOutcome: true, RunnerSaveFlow: true, RunnerDamageAmounts: true, RunnerAppliedLine: true } },
  });
  return { wrapper, resolution };
}

describe("RunnerAttackFlow: the ranged-attack rules", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const store = useEncounterRunStore();
    store.combatants = [
      creature("archer", { position: { x: 0, y: 0 }, initiative: 15 }),
      creature("hero", { faction_id: "players", type: "player", position: { x: 4, y: 0 } }),
    ];
  });

  it("says before the roll that a foe within 5 feet of the archer gives disadvantage", () => {
    // PHB 2014 ch. 9 "Ranged Attacks in Close Combat". Bug caught: the DM only learning of it from the roll, or never.
    const store = useEncounterRunStore();
    store.combatants.push(creature("guard", { faction_id: "players", position: { x: 1, y: 0 } }));
    const { wrapper } = mountFlow();
    expect(wrapper.get("[data-testid='attack-mode']").text()).toContain("Disadvantage");
    expect(wrapper.get("[data-testid='attack-mode']").text()).toContain("enemy within 5 ft of the attacker");
  });

  it("says before the roll that a target beyond the normal range gives disadvantage", () => {
    // PHB 2014 ch. 9 "Long Range": 80 ft normal, the target is 100 ft off. Bug caught: long range never shown.
    useEncounterRunStore().combatants[1].position = { x: 20, y: 0 };
    const { wrapper } = mountFlow();
    expect(wrapper.get("[data-testid='attack-mode']").text()).toContain("long range");
  });

  it("shows nothing inside the normal range with nobody beside the archer", () => {
    // Bug caught: disadvantage on every ranged attack.
    const { wrapper } = mountFlow();
    expect(wrapper.find("[data-testid='attack-mode']").exists()).toBe(false);
  });

  it("cancels the DM's advantage against the computed disadvantage and still shows nothing odd", () => {
    // PHB 2014 ch. 9 "Advantage and Disadvantage": one of each cancels. Bug caught: the DM's advantage winning outright.
    useEncounterRunStore().combatants[1].position = { x: 20, y: 0 };
    const { wrapper } = mountFlow(bow, "advantage");
    expect(wrapper.find("[data-testid='attack-mode']").exists()).toBe(false);
  });

  it("hands the facts to the roll itself", async () => {
    // Bug caught: the panel showing disadvantage while the roll was made without it.
    useEncounterRunStore().combatants[1].position = { x: 20, y: 0 };
    const { wrapper, resolution } = mountFlow();
    await wrapper.get("[data-testid='roll-attack']").trigger("click");
    expect(resolution.resolveAttack).toHaveBeenCalledWith(expect.objectContaining({ longRange: true, hostileWithinFiveFeetOfAttacker: false }));
  });

  it("applies nothing to a melee attack", () => {
    // Bug caught: a claw rolled with disadvantage because a foe stands beside it.
    const store = useEncounterRunStore();
    store.combatants.push(creature("guard", { faction_id: "players", position: { x: 1, y: 0 } }));
    const claw: AttackStructure = { delivery: "melee", bonus: 4, reach: 5, hit: [{ dice: "1d6", type: "slashing" }] };
    const { wrapper } = mountFlow(claw);
    expect(wrapper.find("[data-testid='attack-mode']").exists()).toBe(false);
  });
});
