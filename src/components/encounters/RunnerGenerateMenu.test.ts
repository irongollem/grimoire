// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RunnerGenerateMenu from "./RunnerGenerateMenu.vue";

const item = (label: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>("[role=menu] button")].find((b) => b.textContent?.includes(label));

describe("RunnerGenerateMenu", () => {
  // Swapping the two would open the reinforcement prompt from Complication.
  it("asks for the mode of the entry picked and closes", async () => {
    const w = mount(RunnerGenerateMenu, { attachTo: document.body });
    await w.find("[aria-haspopup=menu]").trigger("click");
    item("Reinforcements")!.click();
    await w.vm.$nextTick();
    expect(document.body.querySelector("[role=menu]")).toBeNull();
    await w.find("[aria-haspopup=menu]").trigger("click");
    item("Complication")!.click();
    expect(w.emitted("generate")).toEqual([["reinforcements"], ["complication"]]);
    w.unmount();
  });
});
