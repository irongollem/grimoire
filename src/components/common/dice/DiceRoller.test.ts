import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import DiceRoller from "./DiceRoller.vue";

vi.mock("@/composables/dice/usePromptedRoll", () => ({
  usePromptedRoll: () => ({ promptRoll: vi.fn() }),
}));
vi.mock("@/lib/dice/diceAudio", () => ({ primeDiceAudio: vi.fn() }));

async function openPanel() {
  const wrapper = mount(DiceRoller, { global: { stubs: { teleport: true } } });
  await wrapper.get('button[aria-label="Dice Roller"]').trigger("click");
  return wrapper;
}

/** A die slot's + button, by grid position (0 d4, 1 d6, 2 d8, 3 d10, …). */
function plusFor(wrapper: Awaited<ReturnType<typeof openPanel>>, index: number) {
  const slot = wrapper.findAll(".die-slot")[index];
  return slot.findAll(".count-btn")[1];
}

describe("DiceRoller pool size", () => {
  // The + button stopped at 9, so a 10d10 could not be built.
  it("builds a pool of ten of one die", async () => {
    const wrapper = await openPanel();
    const plus = plusFor(wrapper, 3);
    for (let i = 0; i < 10; i++) await plus.trigger("click");
    expect(wrapper.findAll(".die-slot")[3].get(".count-val").text()).toBe("10");
  });

  // app convention: the count box holds two digits.
  it("stops at 99 of one die", async () => {
    const wrapper = await openPanel();
    const plus = plusFor(wrapper, 3);
    for (let i = 0; i < 100; i++) await plus.trigger("click");
    expect(wrapper.findAll(".die-slot")[3].get(".count-val").text()).toBe("99");
  });
});

describe("DiceRoller roll options", () => {
  // A system with no roll options must not show an empty option strip.
  it("hides the option control when the active system offers none", async () => {
    vi.resetModules();
    vi.doMock("@/systems/registry", async (orig) => {
      const real = await orig<typeof import("@/systems/registry")>();
      return { ...real, activeDiceRules: () => ({ ...real.activeDiceRules(), options: [] }) };
    });
    const { default: Bare } = await import("./DiceRoller.vue");
    const wrapper = mount(Bare, { global: { stubs: { teleport: true } } });
    await wrapper.get('button[aria-label="Dice Roller"]').trigger("click");
    expect(wrapper.find(".adv-row").exists()).toBe(false);
    vi.doUnmock("@/systems/registry");
  });

  it("shows Disadvantage, Normal, Advantage in that order for 5e", async () => {
    const wrapper = await openPanel();
    expect(wrapper.get(".adv-row").findAll("button").map((b) => b.text())).toEqual(["DIS", "Normal", "ADV"]);
  });
});
