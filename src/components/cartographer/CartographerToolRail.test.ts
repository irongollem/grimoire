// The rail draws families (#1125 decision 3, canvas frame 07). What can go wrong here is
// the memory: a family button must re-arm the tool you last used in it, however you got there.
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import CartographerToolRail, { type RailFamily } from "./CartographerToolRail.vue";

const icon = () => h("svg");
const FAMILIES: RailFamily[] = [
  { id: "select", label: "Select", icon, tools: [{ id: "select", label: "Select", icon, shortcut: "v" }, { id: "pan", label: "Pan", icon, shortcut: "h" }] },
  { id: "draw", label: "Draw", icon, tools: [{ id: "brush", label: "Brush", icon, shortcut: "b" }, { id: "rect", label: "Rectangle", icon, shortcut: "r" }] },
  { id: "erase", label: "Erase", icon, tools: [{ id: "eraser", label: "Eraser", icon, shortcut: "e" }], dividerBefore: true },
];

function rail(activeTool: string, families = FAMILIES) {
  return mount(CartographerToolRail, { props: { families, activeTool } });
}
const family = (w: ReturnType<typeof rail>, label: string) => w.find(`[aria-label="${label}"]`);

describe("family buttons", () => {
  it("highlights the family that holds the armed tool, not a family of its own named after it", () => {
    const w = rail("rect");
    expect(family(w, "Draw").attributes("aria-pressed")).toBe("true");
    expect(family(w, "Select").attributes("aria-pressed")).toBe("false");
  });

  it("shows the family's first tool's key in its corner", () => {
    const w = rail("select");
    expect(family(w, "Draw").find("kbd").text()).toBe("B");
    expect(family(w, "Erase").find("kbd").text()).toBe("E");
  });

  it("arms the family's first tool the first time it is clicked", async () => {
    const w = rail("select");
    await family(w, "Draw").trigger("click");
    expect(w.emitted("update:activeTool")?.[0]).toEqual(["brush"]);
  });

  it("re-arms the tool last used in the family, even when a key or the slip chose it", async () => {
    const w = rail("brush");
    await w.setProps({ activeTool: "rect" }); // chosen from outside the rail
    await w.setProps({ activeTool: "pan" });
    await family(w, "Draw").trigger("click");
    expect(w.emitted("update:activeTool")?.[0]).toEqual(["rect"]);
  });

  it("ignores a remembered tool the family no longer holds (the Plan's Erase reuses the id)", async () => {
    const w = rail("eraser");
    const planFamilies: RailFamily[] = [
      { id: "erase", label: "Erase", icon, tools: [{ id: "erase", label: "Erase", icon }] },
    ];
    await w.setProps({ families: planFamilies, activeTool: "space" });
    await family(w, "Erase").trigger("click");
    expect(w.emitted("update:activeTool")?.[0]).toEqual(["erase"]);
  });

  it("skips a disabled first tool", async () => {
    const families: RailFamily[] = [
      { id: "x", label: "X", icon, tools: [{ id: "a", label: "A", icon, disabled: true }, { id: "b", label: "B", icon }] },
    ];
    const w = rail("nothing", families);
    await family(w, "X").trigger("click");
    expect(w.emitted("update:activeTool")?.[0]).toEqual(["b"]);
  });
});
