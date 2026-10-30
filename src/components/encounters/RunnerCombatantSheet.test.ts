// @vitest-environment jsdom
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import RunnerCombatantSheet from "./RunnerCombatantSheet.vue";
import type { RunCombatant } from "@/types/encounter.types";

const beastArt = vi.hoisted(() => ({ byId: new Map<string, { image_url: string | null }>() }));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({
  useMonstersByIds: () => ({ data: { value: beastArt.byId } }),
}));

const mocks = vi.hoisted(() => ({
  store: { started: false, round: 0, toggleSurprised: vi.fn() },
  quickDamage: vi.fn(),
  quickHeal: vi.fn(),
  quickTemp: vi.fn(),
  cycleReveal: vi.fn(),
  quickAmount: undefined as unknown as { value: number | null },
}));

vi.mock("@/stores/encounterRun", () => ({ useEncounterRunStore: () => mocks.store }));
vi.mock("@/composables/encounters/useRunnerCombatant", async () => {
  const { ref: r, computed } = await import("vue");
  return {
    useRunnerCombatant: () => ({
      wildshape: r(undefined),
      displayHp: r(10),
      displayMaxHp: r(20),
      displayTempHp: r(0),
      displayAc: r("14"),
      handleAdjustHp: vi.fn(),
      handleSetHp: vi.fn(),
      handleSetMaxHp: vi.fn(),
      quickAmount: mocks.quickAmount,
      quickCritical: r(false),
      canCrit: computed(() => false),
      quickDamage: mocks.quickDamage,
      quickHeal: mocks.quickHeal,
      quickTemp: mocks.quickTemp,
      handleCycleReveal: mocks.cycleReveal,
    }),
  };
});

enableAutoUnmount(afterEach);

const goblin = {
  instance_id: "m1",
  type: "monster",
  name: "Goblin",
  reveal_state: "unseen",
  surprised: false,
} as unknown as RunCombatant;

const stubs = {
  MobileSheet: { props: ["open", "title"], template: "<div><slot /><slot name='footer' /></div>" },
  RunnerConditionBadges: true,
  RunnerInitiativeField: true,
  FocalImage: true,
};

function mountSheet(combatant: RunCombatant = goblin) {
  return mount(RunnerCombatantSheet, { props: { open: true, combatant }, global: { stubs } });
}
const button = (w: ReturnType<typeof mountSheet>, label: string) =>
  w.findAll("button").find((b) => b.text() === label || b.attributes("aria-label") === label)!;
const closed = (w: ReturnType<typeof mountSheet>) => w.emitted("update:open")?.at(-1)?.[0] === false;

describe("RunnerCombatantSheet", () => {
  beforeEach(() => {
    mocks.store.started = false;
    mocks.store.round = 0;
    mocks.quickAmount = ref<number | null>(7);
    mocks.quickDamage.mockReset().mockResolvedValue(undefined);
    mocks.quickHeal.mockReset();
    mocks.quickTemp.mockReset();
    mocks.cycleReveal.mockReset();
    mocks.store.toggleSurprised.mockReset();
  });

  it("closes only once an async damage has resolved, so a concentration save is not cut off", async () => {
    let finish!: () => void;
    mocks.quickDamage.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const w = mountSheet();
    await button(w, "Damage").trigger("click");
    expect(mocks.quickDamage).toHaveBeenCalledOnce();
    expect(closed(w)).toBe(false);
    finish();
    await vi.waitFor(() => expect(closed(w)).toBe(true));
  });

  it("does nothing, and stays open, when Damage is tapped with no amount", async () => {
    mocks.quickAmount = ref<number | null>(null);
    const w = mountSheet();
    await button(w, "Damage").trigger("click");
    expect(mocks.quickDamage).not.toHaveBeenCalled();
    expect(closed(w)).toBe(false);
  });

  it("treats Enter in the amount field as Damage", async () => {
    const w = mountSheet();
    await w.find("input[aria-label=Amount]").trigger("keydown.enter");
    expect(mocks.quickDamage).toHaveBeenCalledOnce();
  });

  it("Heal and +Temp close the sheet after applying", async () => {
    const heal = mountSheet();
    await button(heal, "Heal").trigger("click");
    expect(mocks.quickHeal).toHaveBeenCalledOnce();
    expect(closed(heal)).toBe(true);
    const temp = mountSheet();
    await button(temp, "+Temp").trigger("click");
    expect(mocks.quickTemp).toHaveBeenCalledOnce();
    expect(closed(temp)).toBe(true);
  });

  it("'Stat block & actions' hands over this combatant's id and closes", async () => {
    const w = mountSheet();
    await button(w, "Stat block & actions").trigger("click");
    expect(w.emitted("open-detail")).toEqual([["m1"]]);
    expect(closed(w)).toBe(true);
  });

  describe("surprise", () => {
    it.each([
      ["the lobby", false, 0, true],
      ["round 1", true, 1, true],
      ["round 2", true, 2, false],
    ])("is offered in %s: %s", (_name, started, round, offered) => {
      mocks.store.started = started;
      mocks.store.round = round;
      const w = mountSheet();
      expect(w.text().includes("surprised")).toBe(offered);
    });

    it("toggles the store for this combatant", async () => {
      const w = mountSheet();
      await button(w, "Mark as surprised").trigger("click");
      expect(mocks.store.toggleSurprised).toHaveBeenCalledWith("m1");
    });
  });

  describe("reveal control", () => {
    it.each([
      ["hidden", "Hidden from players"],
      ["unseen", "Unseen"],
      ["revealed", "Revealed"],
    ])("reads %s as '%s' and cycles on tap", async (state, label) => {
      const w = mountSheet({ ...goblin, reveal_state: state } as RunCombatant);
      await button(w, label).trigger("click");
      expect(mocks.cycleReveal).toHaveBeenCalledOnce();
    });

    it("is not offered for a player character", () => {
      const w = mountSheet({ ...goblin, type: "player" } as RunCombatant);
      expect(w.text()).not.toContain("Unseen");
    });
  });
});
