// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunnerActionList from "./RunnerActionList.vue";
import { RUNNER_ROLL_CONTEXT } from "./runnerResolve";
import type { RunCombatant } from "@/types/encounter.types";
import type { StatBlockListKey } from "@/rules/statBlock/parseAction";
import type { ActionStructure, StatBlockEntry } from "@/types/statBlock.types";

const mocks = vi.hoisted(() => ({
  restoreAction: vi.fn(),
  useAction: vi.fn(),
  spendLegendaryActions: vi.fn(),
  markLairFired: vi.fn(),
  lairCan: true,
  lastRechargeEvents: [] as Array<{ instanceId: string; action: string; roll: number; recharged: boolean }>,
}));

vi.mock("@/stores/encounterRun", () => ({
  useEncounterRunStore: () => ({
    restoreAction: mocks.restoreAction,
    useAction: mocks.useAction,
    spendLegendaryActions: mocks.spendLegendaryActions,
    markLairFired: mocks.markLairFired,
    get lairCanFireThisRound() {
      return mocks.lairCan;
    },
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

function mountSections(c: RunCombatant, sections: Array<{ label: string; list: StatBlockListKey; entries: StatBlockEntry[] }>) {
  return mount(RunnerActionList, {
    props: { combatant: c, sections },
    global: {
      stubs: { RunnerResolvePanel: ResolveStub },
      provide: { [RUNNER_ROLL_CONTEXT as symbol]: { rollMode: ref("normal"), silent: computed(() => false) } },
    },
  });
}

function mountList(c: RunCombatant, entries: StatBlockEntry[]) {
  return mountSections(c, [{ label: "Actions", list: "actions", entries }]);
}

describe("RunnerActionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lastRechargeEvents = [];
    mocks.lairCan = true;
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
    const spent = combatant({ action_uses: { "actions/Fire Breath": { used: 1 } } } as Partial<RunCombatant>);
    const w = mountList(spent, [breath]);
    expect(w.text()).toContain("Recharge 5–6 · spent");
    expect(w.text()).not.toContain("Recharge 5–6 Recharge");
    const use = w.find("[data-testid='use-Fire Breath-Force save']");
    expect(use.attributes("disabled")).toBeDefined();
    await w.find("[data-testid='restore-Fire Breath']").trigger("click");
    expect(mocks.restoreAction).toHaveBeenCalledWith("c1", "actions/Fire Breath");
  });

  it("lets the DM mark a limited ability with nothing to roll as used, so its recharge starts", async () => {
    const vanish = entry("Invisibility", { recharge: { min: 4, max: 6 } });
    const w = mountList(combatant(), [vanish, trait]);
    await w.find("[data-testid='use-Invisibility']").trigger("click");
    expect(mocks.useAction).toHaveBeenCalledWith("c1", "actions/Invisibility", { recharge: { min: 4, max: 6 } });
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
    expect(mocks.useAction).toHaveBeenCalledWith("c1", "actions/Frost Breath", { recharge: { min: 5, max: 6 } });
  });

  it("reports how this combatant's recharges went at turn start", () => {
    mocks.lastRechargeEvents = [
      { instanceId: "c1", action: "actions/Fire Breath", roll: 6, recharged: true },
      { instanceId: "other", action: "actions/Spit", roll: 1, recharged: false },
    ];
    const w = mountList(combatant(), [breath]);
    const lines = w.findAll("[data-testid='recharge-line']");
    expect(lines).toHaveLength(1);
    expect(lines[0].text()).toBe("Fire Breath recharged · rolled 6");
  });

  it("keeps a recharge Tail Attack in Actions apart from the legendary Tail Attack", async () => {
    const tail = entry("Tail Attack", { ...claw.structured, recharge: { min: 5, max: 6 } });
    const w = mountSections(combatant({ action_uses: { "actions/Tail Attack": { used: 1 } } } as Partial<RunCombatant>), [
      { label: "Actions", list: "actions", entries: [tail] },
      { label: "Legendary Actions", list: "legendary_actions", entries: [tail] },
    ]);
    const heads = w.findAll("[data-testid='action-Tail Attack']");
    expect(heads[0].text()).toContain("spent");
    expect(heads[1].text()).not.toContain("spent");
    await heads[0].find("[data-testid='restore-Tail Attack']").trigger("click");
    expect(mocks.restoreAction).toHaveBeenCalledWith("c1", "actions/Tail Attack");
  });

  it("renders two same-named entries in one list without duplicate keys", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = mountList(combatant(), [claw, claw]);
    expect(w.findAll("[data-testid='action-Claw']")).toHaveLength(2);
    expect(warn.mock.calls.flat().join(" ")).not.toContain("Duplicate keys");
    warn.mockRestore();
  });

  it("spends a legendary entry's cost once, on the first roll, and gates an unaffordable one", async () => {
    const wing = entry("Wing Attack", { ...claw.structured, legendary_cost: 2 });
    const w = mountSections(combatant({ legendary_actions_remaining: 3, legendary_action_cap: 3 } as Partial<RunCombatant>), [
      { label: "Legendary Actions", list: "legendary_actions", entries: [wing] },
    ]);
    await w.find("[data-testid='use-Wing Attack-Attack']").trigger("click");
    const panel = w.findComponent({ name: "RunnerResolvePanel" });
    await panel.vm.$emit("first-roll");
    expect(mocks.spendLegendaryActions).toHaveBeenCalledWith("c1", 2);
    expect(mocks.useAction).not.toHaveBeenCalled();

    const poor = mountSections(combatant({ legendary_actions_remaining: 1, legendary_action_cap: 3 } as Partial<RunCombatant>), [
      { label: "Legendary Actions", list: "legendary_actions", entries: [wing] },
    ]);
    const btn = poor.find("[data-testid='use-Wing Attack-Attack']");
    expect(btn.attributes("disabled")).toBeDefined();
    expect(poor.text()).toContain("Costs 2 \u00b7 1 left");
  });

  it("marks the lair fired from a lair entry and disables it once the lair has fired", async () => {
    const quake = entry("Tremor", { ...claw.structured });
    const sections = [{ label: "Lair Actions", list: "lair_actions" as const, entries: [quake] }];
    const w = mountSections(combatant(), sections);
    await w.find("[data-testid='use-Tremor-Attack']").trigger("click");
    await w.findComponent({ name: "RunnerResolvePanel" }).vm.$emit("first-roll");
    expect(mocks.markLairFired).toHaveBeenCalledTimes(1);

    mocks.lairCan = false;
    const spent = mountSections(combatant(), sections);
    expect(spent.find("[data-testid='use-Tremor-Attack']").attributes("disabled")).toBeDefined();
    expect(spent.text()).toContain("Lair action used this round");
  });
});
