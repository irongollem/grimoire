// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { TOOL_KEYS } from "@/scriptorium/illuminator/toolKeys";
import IlluminateToolRail from "./IlluminateToolRail.vue";

const colour = { r: 43, g: 32, b: 25 };
const background = { r: 255, g: 255, b: 255 };

describe("the tool rail", () => {
  const rail = () => mount(IlluminateToolRail, { props: { tool: "edges", colour, background, editing: "foreground" } });

  // Fails if the Paint group is not first, or still offers a Colour tool (it is Grade now, so "colour" means paint).
  it("opens with the Paint group, then the Picture group, and Grade replaces Colour", () => {
    const w = rail();
    const ids = w.findAll("[data-testid^='tool-']").map((b) => b.attributes("data-testid"));
    expect(ids).toEqual(["tool-brush", "tool-smudge", "tool-eraser", "tool-picker", "tool-crop", "tool-edges", "tool-grade", "tool-vignette", "tool-texture", "tool-wash", "tool-focus"]);
    expect(w.find("[data-testid='tool-colour']").exists()).toBe(false);
    const text = w.text();
    expect(text.indexOf("Paint")).toBeLessThan(text.indexOf("Picture"));
    expect(text.indexOf("Picture")).toBeLessThan(text.indexOf("Later"));
    expect(w.find("[data-testid='rail-paint-group']").element.querySelector("[data-testid='tool-crop']")).toBeNull();
  });

  // Fails if the rail still promises Draw or Layers, which now exist, or drops the one that does not (Text).
  it("keeps only Text as coming later", () => {
    const w = rail();
    const later = w.text().split("Later")[1] ?? "";
    expect(w.get("[aria-label='Text, coming later']").attributes("disabled")).toBeDefined();
    expect(later).not.toContain("Draw");
    expect(later).not.toContain("Layers");
  });

  // Fails if choosing a tool, or the swatch, does not reach the workbench.
  it("emits the tool picked, and opens the Colour panel from the swatch", async () => {
    const w = rail();
    await w.get("[data-testid='tool-eraser']").trigger("click");
    expect(w.emitted("update:tool")?.[0]).toEqual(["eraser"]);
    await w.get("[data-testid='swatch-foreground']").trigger("click");
    await w.get("[data-testid='swatch-background']").trigger("click");
    expect(w.emitted("open-colour")).toEqual([["foreground"], ["background"]]);
  });

  // Fails on: a corner or a tooltip printing a key other than the one the workbench binds (both come from TOOL_KEYS).
  it("prints each tool's key in its corner and its tooltip", () => {
    const w = rail();
    for (const [tool, key] of Object.entries(TOOL_KEYS)) {
      const button = w.get(`[data-testid='tool-${tool}']`);
      expect(w.get(`[data-testid='key-${tool}']`).text()).toBe(key.toUpperCase());
      expect(button.attributes("title")).toMatch(new RegExp(`\\(${key.toUpperCase()}\\)$`));
      expect(button.attributes("aria-label")).not.toBe("");
    }
  });

  // Fails on: the rail going back to a word under each icon, which is what overflowed a small screen.
  it("shows no word under the tools", () => {
    expect(rail().get("[data-testid='tool-brush']").text()).toBe("B");
  });

  // Fails on: the swap and reset controls not reaching the workbench.
  it("asks to swap and to reset the colours", async () => {
    const w = rail();
    await w.get("[data-testid='swap-colours']").trigger("click");
    await w.get("[data-testid='reset-colours']").trigger("click");
    expect(w.emitted("swap-colours")).toHaveLength(1);
    expect(w.emitted("reset-colours")).toHaveLength(1);
  });
});
