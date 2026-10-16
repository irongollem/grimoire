// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NoticeBoardSurfaceChoice from "./NoticeBoardSurfaceChoice.vue";

describe("NoticeBoardSurfaceChoice", () => {
  it("names both boards and marks the chosen one", () => {
    const w = mount(NoticeBoardSurfaceChoice, { props: { modelValue: "cork" } });
    expect(w.text()).toContain("Tavern cork, oak frame");
    expect(w.text()).toContain("Frontier planks, pine frame");
    const radios = w.findAll('[role="radio"]');
    expect(radios.map((r) => r.attributes("aria-checked"))).toEqual(["true", "false"]);
  });

  it("emits the surface that was picked", async () => {
    const w = mount(NoticeBoardSurfaceChoice, { props: { modelValue: "cork" } });
    await w.get('[data-surface="planks"]').trigger("click");
    expect(w.emitted("update:modelValue")?.[0]).toEqual(["planks"]);
  });
});
