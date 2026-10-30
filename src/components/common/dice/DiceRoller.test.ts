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
