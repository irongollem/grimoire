// CartographerPlanOptions (#884 S7b): the Plan layer's options slip.
//
// #878 S2: the "Trace with" switcher (Brush/Pen/Shape) used to be `hidden lg:block`,
// which is why a DM who traced rooms never found Pen or Shape. The slip shows it at
// every width, with no `hidden` class gating it behind a breakpoint, and so with the
// Door hint.
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
    brushRadius: 0.75,
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
    expect(wrapper.text()).toContain("Lasso");

    const traceWith = wrapper.findAll("span").find((s) => s.text() === "Trace with");
    expect(traceWith).toBeTruthy();
    expect(traceWith!.element.parentElement!.className).not.toMatch(/\bhidden\b/);
  });

  it("offers every kind of zone in one place, Room first and the way in or out among them", () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("zone") });
    const kinds = wrapper.findAll("button").map((b) => b.text());
    for (const kind of ["Room", "Terrain", "Hazard", "Light", "Trigger", "Way in or out", "Marker"]) expect(kinds).toContain(kind);
    expect(kinds.indexOf("Room")).toBeLessThan(kinds.indexOf("Terrain"));
  });

  it("picking a kind chip changes the kind the Zone tool makes", async () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("zone") });
    await wrapper.findAll("button").find((b) => b.text() === "Way in or out")?.trigger("click");
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
    const hint = wrapper.findAll("span").find((s) => s.text().includes("Point at a wall"));
    expect(hint).toBeTruthy();
    expect(hint!.classes()).not.toContain("hidden");
  });

  describe("the Door tool's options (#1197)", () => {
    const chip = (wrapper: ReturnType<typeof mount>, label: string) => wrapper.findAll("button").find((b) => b.text() === label);

    it("picks door or arch and 5 ft or 10 ft, each reaching the palette as the value the cut reads", async () => {
      const wrapper = mount(CartographerPlanOptions, { props: makeProps("door") });
      await chip(wrapper, "Arch")?.trigger("click");
      expect(wrapper.emitted("update:doorKind")?.[0]).toEqual(["arch"]);
      // The width is in cells (5 ft each), so 10 ft is 2: the number the tools' stretch maths multiplies by.
      await chip(wrapper, "10 ft")?.trigger("click");
      expect(wrapper.emitted("update:doorWidth")?.[0]).toEqual([2]);
    });

    it("shows the tip for what is under the pointer, and no tip line with nothing there", () => {
      const tipped = mount(CartographerPlanOptions, { props: { ...makeProps("door"), doorTip: "Door here: Nave and Crypt" } });
      expect(tipped.text()).toContain("Door here: Nave and Crypt");
      const bare = mount(CartographerPlanOptions, { props: { ...makeProps("door"), doorTip: null } });
      expect(bare.text()).not.toContain("Door here");
    });

    it("asks which rooms instead of showing the chips and the tip while a door is waiting for its rooms", () => {
      const wrapper = mount(CartographerPlanOptions, {
        props: { ...makeProps("door"), doorPending: true, doorTip: "Door here: Nave and Crypt", rooms: [{ id: "a", name: "Nave" }] },
      });
      expect(wrapper.text()).not.toContain("Door here");
      expect(chip(wrapper, "Arch")).toBeUndefined();
    });
  });

  it("Assign offers the kind chips, so the DM picks what the area becomes without switching tools", async () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("assign") });
    await wrapper.findAll("button").find((b) => b.text() === "Hazard")?.trigger("click");
    expect(wrapper.emitted("update:zoneKind")?.[0]).toEqual(["hazard"]);
    expect(wrapper.text()).not.toContain("Trace with");
  });

  it("Assign's hint names the kind a click will make", () => {
    const room = mount(CartographerPlanOptions, { props: makeProps("assign") });
    expect(room.text()).toContain("That area becomes a room shaped by its walls.");
    const hazard = mount(CartographerPlanOptions, { props: { ...makeProps("assign"), zoneKind: "hazard" as ZoningKind } });
    expect(hazard.text()).toContain("That area becomes a hazard shaped by its walls.");
  });

  it("switching the trace tool to Pen emits update:traceTool", async () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("zone") });
    const penButton = wrapper.findAll("button").find((b) => b.text() === "Pen");
    await penButton?.trigger("click");
    expect(wrapper.emitted("update:traceTool")?.[0]).toEqual(["pen"]);
  });

  it("Lasso says how it works and offers no brush size", () => {
    const wrapper = mount(CartographerPlanOptions, { props: { ...makeProps("zone"), traceTool: "lasso" as TraceTool } });
    expect(wrapper.text()).toContain("Drag round the area. Let go and the outline closes and is smoothed.");
    expect(wrapper.find("#zone-brush-size").exists()).toBe(false);
  });

  it("Brush offers a size that reaches the palette, and says Alt carves", async () => {
    const wrapper = mount(CartographerPlanOptions, { props: makeProps("zone") });
    expect(wrapper.text()).toContain("Alt carves it away");
    expect(wrapper.text()).toContain("7.5 ft across"); // 0.75 cells across both sides, 5 ft a cell
    await wrapper.find("#zone-brush-size").setValue("2");
    expect(wrapper.emitted("update:brushRadius")?.[0]).toEqual([2]);
  });

  it("Pen shows neither the brush size nor the lasso hint", () => {
    const wrapper = mount(CartographerPlanOptions, { props: { ...makeProps("zone"), traceTool: "pen" as TraceTool } });
    expect(wrapper.find("#zone-brush-size").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Drag round the area");
  });
});
