// CartographerPlanPalette (#884 S7b) — the Plan layer's own tool palette.
//
// #878 S2: the "Trace with" switcher (Brush/Pen/Shape) used to be
// `hidden lg:block`, which is the reason a DM who traced rooms never found
// the Pen or Shape gestures — Pen and Shape existed in the codebase but had
// no reachable control below Tailwind's `lg` breakpoint (1024px), and there
// was no fallback affordance. These tests assert the switcher (and its
// siblings — the plan-tool labels, the Door/Claim hints) render unconditionally,
// with no `hidden` class gating them behind a breakpoint.
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CartographerPlanPalette from "./CartographerPlanPalette.vue";
import type { PlanTool } from "@/composables/cartographer/usePlanPalette";
import type { TemplateShape, TraceTool } from "@/lib/locations/polygon";
import type { ZoneKind } from "@/types/locationMapRegion.types";

function makeProps(overrides: { planTool?: PlanTool } = {}) {
  return {
    planTool: overrides.planTool ?? ("space" as PlanTool),
    traceTool: "paint" as TraceTool,
    templateShape: "circle" as TemplateShape,
    zoneKind: "terrain" as ZoneKind,
    zoneLabel: "",
  };
}

describe("CartographerPlanPalette", () => {
  it("renders the Trace with switcher (Brush/Pen/Shape) with no `hidden` class, so it is reachable below lg", () => {
    const wrapper = mount(CartographerPlanPalette, { props: makeProps({ planTool: "space" }) });

    expect(wrapper.text()).toContain("Trace with");
    expect(wrapper.text()).toContain("Brush");
    expect(wrapper.text()).toContain("Pen");
    expect(wrapper.text()).toContain("Shape");

    // The switcher's own container must not be gated behind `lg`, unlike
    // before this story (`hidden lg:block`).
    const traceWithLabel = wrapper.findAll("label").find((l) => l.text() === "Trace with");
    expect(traceWithLabel).toBeTruthy();
    const container = traceWithLabel!.element.parentElement!;
    expect(container.className).not.toMatch(/\bhidden\b/);
  });

  it("also exposes the switcher for the Zone tool, not only Space", () => {
    const wrapper = mount(CartographerPlanPalette, { props: makeProps({ planTool: "zone" }) });
    expect(wrapper.text()).toContain("Trace with");
  });

  it("shows every plan-tool label (Space/Zone/Door/Claim) unconditionally, not only at lg", () => {
    const wrapper = mount(CartographerPlanPalette, { props: makeProps() });
    const labelSpans = wrapper.findAll("button span");
    const labelTexts = labelSpans.map((s) => s.text());
    expect(labelTexts).toEqual(expect.arrayContaining(["Space", "Zone", "Door", "Claim"]));
    // None of the tool buttons' own label spans may be hidden-gated.
    for (const span of labelSpans) {
      expect(span.classes()).not.toContain("hidden");
    }
  });

  it("shows the Door hint with no `hidden` class when Door is active", () => {
    const wrapper = mount(CartographerPlanPalette, { props: makeProps({ planTool: "door" }) });
    const hint = wrapper.findAll("p").find((p) => p.text().includes("Click a cell edge"));
    expect(hint).toBeTruthy();
    expect(hint!.classes()).not.toContain("hidden");
  });

  it("shows the Claim hint with no `hidden` class when Claim is active", () => {
    const wrapper = mount(CartographerPlanPalette, { props: makeProps({ planTool: "claim" }) });
    const hint = wrapper.findAll("p").find((p) => p.text().includes("Click a painted floor region"));
    expect(hint).toBeTruthy();
    expect(hint!.classes()).not.toContain("hidden");
  });

  it("switching the trace tool to Pen emits update:traceTool", async () => {
    const wrapper = mount(CartographerPlanPalette, { props: makeProps({ planTool: "space" }) });
    const penButton = wrapper.findAll("button").find((b) => b.text() === "Pen");
    await penButton?.trigger("click");
    expect(wrapper.emitted("update:traceTool")?.[0]).toEqual(["pen"]);
  });
});
