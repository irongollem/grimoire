import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ListLayoutToggle from "./ListLayoutToggle.vue";

describe("ListLayoutToggle", () => {
  it("offers two icon-only options named for screen readers and marks the current one", () => {
    const w = mount(ListLayoutToggle, { props: { modelValue: "grid" } });
    const buttons = w.findAll("button");
    expect(buttons.map(b => b.attributes("aria-label"))).toEqual(["List view", "Grid view"]);
    expect(buttons.map(b => b.text())).toEqual(["", ""]);
    expect(buttons[1].attributes("data-state")).toBe("on");
    expect(w.attributes("aria-label")).toBe("List layout");
  });

  it("emits the chosen layout", async () => {
    const w = mount(ListLayoutToggle, { props: { modelValue: "grid" } });
    await w.findAll("button")[0].trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([["rows"]]);
  });
});
