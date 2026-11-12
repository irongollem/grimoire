// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EmbedPanelSection from "./EmbedPanelSection.vue";

const stubs = { EmbedRevealControl: true };

describe("EmbedPanelSection (#1176 frame 06)", () => {
  // Fails on: the size options keeping the old toolbar's names when the design names them One column and Full width.
  it("names the sizes as the design does and writes them", async () => {
    const w = mount(EmbedPanelSection, { props: { attrs: { entityType: "monster" } }, global: { stubs } });
    const labels = w.findAll("button").map((b) => b.text());
    for (const label of ["Auto", "One column", "Full width"]) expect(labels, label).toContain(label);
    await w.findAll("button").find((b) => b.text() === "Full width")!.trigger("click");
    expect(w.emitted("update")).toEqual([[{ size: "wide" }]]);
  });
});
