// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NoticeBoardSurface from "./NoticeBoardSurface.vue";

describe("NoticeBoardSurface", () => {
  it("renders its slot on a board marked with the surface", () => {
    const w = mount(NoticeBoardSurface, { props: { surface: "cork" }, slots: { default: "<p>LOST: one goat</p>" } });
    expect(w.attributes("data-board")).toBeDefined();
    expect(w.attributes("data-surface")).toBe("cork");
    expect(w.find(".nb-pins").text()).toBe("LOST: one goat");
  });

  it("hangs cork in the oak frame and planks in the pine one, with the manifest's slices", () => {
    const cork = mount(NoticeBoardSurface, { props: { surface: "cork" } }).find(".nb-stage").attributes("style") ?? "";
    expect(cork).toContain("frame-oak");
    expect(cork).toContain("surface-cork");
    expect(cork).toContain("--nb-slice: 114 114 114 114");
    const planks = mount(NoticeBoardSurface, { props: { surface: "planks" } }).find(".nb-stage").attributes("style") ?? "";
    expect(planks).toContain("frame-pine");
    expect(planks).toContain("surface-planks");
    expect(planks).toContain("--nb-slice: 104 88 104 88");
  });

  it("draws the frame at 55% of its slice in board units, never in pixels", () => {
    const style = mount(NoticeBoardSurface, { props: { surface: "cork" } }).find(".nb-stage").attributes("style") ?? "";
    expect(style).toContain("--nb-rail-t: calc(var(--u) * 62.7)");
    expect(style).not.toMatch(/\d+px/);
  });
});
