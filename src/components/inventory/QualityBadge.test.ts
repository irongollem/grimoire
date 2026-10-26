import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QualityBadge from "./QualityBadge.vue";

describe("QualityBadge", () => {
  it("renders nothing for standard", () => {
    expect(mount(QualityBadge, { props: { quality: "standard" } }).text()).toBe("");
  });
  it.each([
    ["ruined", "Ruined"],
    ["poor", "Poor"],
    ["fine", "Fine"],
    ["masterwork", "Masterwork"],
  ] as const)("labels %s in text", (quality, label) => {
    const w = mount(QualityBadge, { props: { quality } });
    expect(w.text()).toBe(label);
    expect(w.attributes("data-quality")).toBe(quality);
  });
});
