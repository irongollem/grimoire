// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunnerActionList from "./RunnerActionList.vue";
import { RUNNER_ROLL_CONTEXT } from "./runnerResolve";
import type { RunCombatant } from "@/types/encounter.types";
import type { ActionStructure, StatBlockEntry } from "@/types/statBlock.types";

const mocks = vi.hoisted(() => ({
  restoreAction: vi.fn(),
  useAction: vi.fn(),
  lastRechargeEvents: [] as Array<{ instanceId: string; action: string; roll: number; recharged: boolean }>,
}));

vi.mock("@/stores/encounterRun", () => ({
  useEncounterRunStore: () => ({
    restoreAction: mocks.restoreAction,
    useAction: mocks.useAction,
    get lastRechargeEvents() {
      return mocks.lastRechargeEvents;
    },
  }),
}));

const ResolveStub = {
  name: "RunnerResolvePanel",
  props: ["attacker", "entry", "dmMode", "silent"],
  emits: ["first-roll", "close"],
  template: "<div data-testid='panel'>{{ entry.name }}</div>",
};

function entry(name: string, structured: Partial<ActionStructure>): StatBlockEntry {
  return { name, description: `${name} prose`, structured: { kind: "other", source: "manual", ...structured } };
}

const claw = entry("Claw", {
  kind: "attack",
  attack: { delivery: "melee", bonus: 4, reach: 5, hit: [{ dice: "1d6+2", type: "slashing" }] },
});
const bite = entry("Bite", {
  kind: "attack",
  attack: { delivery: "melee", bonus: 5, reach: 5, hit: [{ dice: "1d8+3", type: "piercing" }] },
});
const multi = entry("Multiattack", { kind: "multiattack", multiattack: [{ action: "Claw", count: 2 }, { action: "Bite", count: 1 }] });
const breath = entry("Fire Breath", {
  kind: "save",
  recharge: { min: 5, max: 6 },
  save: { ability: "dex", dc: 13, fail: [{ dice: "6d6", type: "fire" }], success: "half", conditions: [] },
});
const choice = entry("Breath Weapons", {
  kind: "options",
  options: [
    { name: "Fire", kind: "save", save: { ability: "dex", dc: 14, fail: [{ dice: "8d6", type: "fire" }], success: "half", conditions: [] } },
    { name: "Sleep", kind: "save", save: { ability: "con", dc: 14, fail: [], success: "none", conditions: ["Unconscious"] } },
  ],
});
const trait = entry("Keen Smell", {});

function combatant(extra: Partial<RunCombatant> = {}): RunCombatant {
  return { instance_id: "c1", name: "Drake", conditions: [], ...extra } as unknown as RunCombatant;
}

function mountList(c: RunCombatant, entries: StatBlockEntry[]) {
  return mount(RunnerActionList, {
    props: { combatant: c, sections: [{ label: "Actions", entries }] },
    global: {
      stubs: { RunnerResolvePanel: ResolveStub },
      provide: { [RUNNER_ROLL_CONTEXT as symbol]: { rollMode: ref("normal"), silent: computed(() => false) } },
    },
  });
}

describe("RunnerActionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lastRechargeEvents = [];
  });

  it("offers the control that fits each kind and none for traits", () => {
    const w = mountList(combatant(), [claw, breath, choice, multi, trait]);
    expect(w.find("[data-testid='use-Claw-Attack']").exists()).toBe(true);
    expect(w.find("[data-testid='use-Fire Breath-Force save']").exists()).toBe(true);
    expect(w.find("[data-testid='use-Breath Weapons-Fire']").exists()).toBe(true);
    expect(w.find("[data-testid='use-Breath Weapons-Sleep']").exists()).toBe(true);
    const keen = w.find("[data-testid='action-Keen Smell']");
    expect(keen.find("button").exists()).toBe(false);
    const multiBlock = w.find("[data-testid='action-Multiattack']");
    expect(multiBlock.find("[data-testid='use-Multiattack-Attack']").exists()).toBe(false);
    expect(multiBlock.text()).toContain("2× Claw");
  });

  it("shows the live recharge label and disables a spent action with a Restore", async () => {
    const spent = combatant({ action_uses: { "Fire Breath": { used: 1 } } } as Partial<RunCombatant>);
    const w = mountList(spent, [breath]);
    expect(w.text()).toContain("Recharge 5–6 · spent");
    expect(w.text()).not.toContain("Recharge 5–6 Recharge");
    const use = w.find("[data-testid='use-Fire Breath-Force save']");
    expect(use.attributes("disabled")).toBeDefined();
    await w.find("[data-testid='restore-Fire Breath']").trigger("click");
    expect(mocks.restoreAction).toHaveBeenCalledWith("c1", "Fire Breath");
  });

  it("lets the DM mark a limited ability with nothing to roll as used, so its recharge starts", async () => {
    const vanish = entry("Invisibility", { recharge: { min: 4, max: 6 } });
    const w = mountList(combatant(), [vanish, trait]);
    await w.find("[data-testid='use-Invisibility']").trigger("click");
    expect(mocks.useAction).toHaveBeenCalledWith("c1", "Invisibility", { recharge: { min: 4, max: 6 } });
    expect(w.find("[data-testid='use-Keen Smell']").exists()).toBe(false);
  });

  it("opens the panel under the entry, and a multiattack step opens that entry's panel", async () => {
    const w = mountList(combatant(), [claw, bite, multi]);
    await w.find("[data-testid='step-Bite']").trigger("click");
    const panel = w.findComponent({ name: "RunnerResolvePanel" });
    expect(panel.exists()).toBe(true);
    expect(panel.props("entry")).toMatchObject({ name: "Bite" });
    expect(w.find("[data-testid='action-Bite']").find("[data-testid='panel']").exists()).toBe(true);
  });

  it("resolves an options entry as the chosen option and spends only a limited entry on the first roll", async () => {
    const limited = entry("Frost Breath", {
      ...breath.structured,
      options: undefined,
    });
    const w = mountList(combatant(), [choice, limited]);
    await w.find("[data-testid='use-Breath Weapons-Sleep']").trigger("click");
    const panel = w.findComponent({ name: "RunnerResolvePanel" });
    expect(panel.props("entry")).toMatchObject({
      name: "Breath Weapons: Sleep",
      structured: { kind: "save", save: { ability: "con" } },
    });
    await panel.vm.$emit("first-roll");
    expect(mocks.useAction).not.toHaveBeenCalled();

    await w.find("[data-testid='use-Frost Breath-Force save']").trigger("click");
    await w.findComponent({ name: "RunnerResolvePanel" }).vm.$emit("first-roll");
    expect(mocks.useAction).toHaveBeenCalledWith("c1", "Frost Breath", { recharge: { min: 5, max: 6 } });
  });

  it("reports how this combatant's recharges went at turn start", () => {
    mocks.lastRechargeEvents = [
      { instanceId: "c1", action: "Fire Breath", roll: 6, recharged: true },
      { instanceId: "other", action: "Spit", roll: 1, recharged: false },
    ];
    const w = mountList(combatant(), [breath]);
    const lines = w.findAll("[data-testid='recharge-line']");
    expect(lines).toHaveLength(1);
    expect(lines[0].text()).toBe("Fire Breath recharged · rolled 6");
  });
});
