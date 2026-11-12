// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import IlluminateStage from "./IlluminateStage.vue";

const mountStage = (props: Record<string, unknown> = {}) =>
  mount(IlluminateStage, { props: { size: { width: 100, height: 100 }, comparePos: 50, compare: false, showOriginal: false, ...props } });

describe("the stage's compare", () => {
  // Fails on: the divider being always present again, which is what the Compare button replaced.
  it("shows no divider until Compare is on", () => {
    expect(mountStage().find("[data-testid='workbench-divider']").exists()).toBe(false);
    expect(mountStage({ compare: true }).find("[data-testid='workbench-divider']").exists()).toBe(true);
  });

  // Fails on: the button not asking for the opposite of what is shown.
  it("the Compare button asks to turn it on, then off", async () => {
    const off = mountStage();
    await off.get("[data-testid='compare-toggle']").trigger("click");
    expect(off.emitted("update:compare")?.[0]).toEqual([true]);
    const on = mountStage({ compare: true });
    await on.get("[data-testid='compare-toggle']").trigger("click");
    expect(on.emitted("update:compare")?.[0]).toEqual([false]);
  });

  // Fails on: a split offered where the tool needs the whole picture (Crop, Focus).
  it("is unavailable, with no divider, where the tool shows the whole picture", () => {
    const w = mountStage({ compare: true, compareOff: true });
    expect(w.find("[data-testid='workbench-divider']").exists()).toBe(false);
    expect(w.get("[data-testid='compare-toggle']").attributes("disabled")).toBeDefined();
  });
});
