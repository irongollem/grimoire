// CartographerPlanOptions (#884 S7b): the Plan layer's options slip.
//
// #878 S2: the "Trace with" switcher (Brush/Pen/Shape) used to be `hidden lg:block`,
// which is why a DM who traced rooms never found Pen or Shape. The slip shows it at
// every width, with no `hidden` class gating it behind a breakpoint, and so with the
// Door and Fill hints.
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CartographerPlanOptions from "./CartographerPlanOptions.vue";
import type { PlanTool } from "@/composables/cartographer/usePlanPalette";
import type { TemplateShape, TraceTool } from "@/lib/locations/polygon";
import type { ZoningKind } from "@/composables/cartographer/usePlanPalette";

function makeProps(planTool: PlanTool = "zone") {
  return {
    title: "Zone",
    listOpen: false,
    planTool,
    traceTool: "paint" as TraceTool,
    templateShape: "circle" as TemplateShape,
    zoneKind: "room" as ZoningKind,
    zoneLabel: "",
  };
}

describe("CartographerPlanOptions", () => {
  it("names the tool in the slip", () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps() });
    expect(wrapper.text()).toContain("Zone");
  });

  it("renders the Trace with switcher (Brush/Pen/Shape) with no `hidden` class, so it is reachable below lg", () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("zone") });

    expect(wrapper.text()).toContain("Trace with");
    expect(wrapper.text()).toContain("Brush");
    expect(wrapper.text()).toContain("Pen");
    expect(wrapper.text()).toContain("Shape");

    const traceWith = wrapper.findAll("span").find((s) => s.text() === "Trace with");
    expect(traceWith).toBeTruthy();
    expect(traceWith!.element.parentElement!.className).not.toMatch(/\bhidden\b/);
  });

  it("offers every kind of zone in one place, Room first and Entrance among them", () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("zone") });
    const kinds = wrapper.findAll("button").map((b) => b.text());
    for (const kind of ["Room", "Terrain", "Hazard", "Light", "Trigger", "Entrance", "Marker"]) expect(kinds).toContain(kind);
    expect(kinds.indexOf("Room")).toBeLessThan(kinds.indexOf("Terrain"));
  });

  it("picking a kind chip changes the kind the Zone tool makes", async () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("zone") });
    await wrapper.findAll("button").find((b) => b.text() === "Entrance")?.trigger("click");
    expect(wrapper.emitted("update:zoneKind")?.[0]).toEqual(["entrance"]);
  });

  it("tells the DM most rooms are already found, and that only a room is a place in the Atlas", () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("zone") });
    expect(wrapper.text()).toContain("Most rooms are already here, found from the walls");
    expect(wrapper.text()).toContain("A room is a place in the Atlas; any other kind only marks the floor.");
  });

  it("brings the zones list back once it has been closed", async () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("zone") });
    await wrapper.findAll("button").find((b) => b.text() === "Show zones list")?.trigger("click");
    expect(wrapper.emitted("toggle-list")).toHaveLength(1);
  });

  it("shows the Door hint with no `hidden` class when Door is active", () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("door") });
    const hint = wrapper.findAll("span").find((s) => s.text().includes("Click a cell edge"));
    expect(hint).toBeTruthy();
    expect(hint!.classes()).not.toContain("hidden");
  });

  it("shows the Fill hint with no `hidden` class when Fill is active", () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("fill") });
    const hint = wrapper.findAll("span").find((s) => s.text().includes("Click a painted floor region"));
    expect(hint).toBeTruthy();
    expect(hint!.classes()).not.toContain("hidden");
  });

  it("switching the trace tool to Pen emits update:traceTool", async () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("zone") });
    const penButton = wrapper.findAll("button").find((b) => b.text() === "Pen");
    await penButton?.trigger("click");
    expect(wrapper.emitted("update:traceTool")?.[0]).toEqual(["pen"]);
  });
});
