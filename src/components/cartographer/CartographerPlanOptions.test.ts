// CartographerPlanOptions (#884 S7b): the Plan layer's options slip.
//
// #878 S2: the "Trace with" switcher (Brush/Pen/Shape) used to be `hidden lg:block`,
// which is why a DM who traced rooms never found Pen or Shape. The slip shows it at
// every width, with no `hidden` class gating it behind a breakpoint, and so with the
// Door and Claim hints.
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CartographerPlanOptions from "./CartographerPlanOptions.vue";
import type { PlanTool } from "@/composables/cartographer/usePlanPalette";
import type { TemplateShape, TraceTool } from "@/lib/locations/polygon";
import type { ZoneKind } from "@/types/locationMapRegion.types";

function makeProps(planTool: PlanTool = "space") {
  return {
    title: "Space",
    planTool,
    traceTool: "paint" as TraceTool,
    templateShape: "circle" as TemplateShape,
    zoneKind: "terrain" as ZoneKind,
    zoneLabel: "",
  };
}

describe("CartographerPlanOptions", () => {
  it("names the tool in the slip", () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps() });
    expect(wrapper.text()).toContain("Space");
  });

  it("renders the Trace with switcher (Brush/Pen/Shape) with no `hidden` class, so it is reachable below lg", () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("space") });

    expect(wrapper.text()).toContain("Trace with");
    expect(wrapper.text()).toContain("Brush");
    expect(wrapper.text()).toContain("Pen");
    expect(wrapper.text()).toContain("Shape");

    const traceWith = wrapper.findAll("span").find((s) => s.text() === "Trace with");
    expect(traceWith).toBeTruthy();
    expect(traceWith!.element.parentElement!.className).not.toMatch(/\bhidden\b/);
  });

  it("also exposes the switcher for the Zone tool, not only Space", () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("zone") });
    expect(wrapper.text()).toContain("Trace with");
  });

  it("shows the Door hint with no `hidden` class when Door is active", () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("door") });
    const hint = wrapper.findAll("span").find((s) => s.text().includes("Click a cell edge"));
    expect(hint).toBeTruthy();
    expect(hint!.classes()).not.toContain("hidden");
  });

  it("shows the Claim hint with no `hidden` class when Claim is active", () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("claim") });
    const hint = wrapper.findAll("span").find((s) => s.text().includes("Click a painted floor region"));
    expect(hint).toBeTruthy();
    expect(hint!.classes()).not.toContain("hidden");
  });

  it("switching the trace tool to Pen emits update:traceTool", async () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("space") });
    const penButton = wrapper.findAll("button").find((b) => b.text() === "Pen");
    await penButton?.trigger("click");
    expect(wrapper.emitted("update:traceTool")?.[0]).toEqual(["pen"]);
  });
});
