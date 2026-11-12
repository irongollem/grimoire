// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import IlluminateToolRail from "./IlluminateToolRail.vue";

const colour = { r: 43, g: 32, b: 25 };

describe("the tool rail", () => {
  const rail = () => mount(IlluminateToolRail, { props: { tool: "edges", colour } });

  // Fails if the Paint group is not first, or still offers a Colour tool (it is Grade now, so "colour" means paint).
  it("opens with the Paint group, then the Picture group, and Grade replaces Colour", () => {
    const w = rail();
    const ids = w.findAll("[data-testid^='tool-']").map((b) => b.attributes("data-testid"));
    expect(ids).toEqual(["tool-brush", "tool-smudge", "tool-eraser", "tool-picker", "tool-crop", "tool-edges", "tool-grade", "tool-vignette", "tool-texture", "tool-wash", "tool-focus"]);
    expect(w.find("[data-testid='tool-colour']").exists()).toBe(false);
    const text = w.text();
    expect(text.indexOf("Paint")).toBeLessThan(text.indexOf("Picture"));
    expect(text.indexOf("Picture")).toBeLessThan(text.indexOf("Later"));
  });

  // Fails if the rail still promises Draw or Layers, which now exist, or drops the one that does not (Text).
  it("keeps only Text as coming later", () => {
    const later = rail().text().split("Later")[1] ?? "";
    expect(later).toContain("Text");
    expect(later).not.toContain("Draw");
    expect(later).not.toContain("Layers");
  });

  // Fails if choosing a tool, or the swatch, does not reach the workbench.
  it("emits the tool picked, and opens the Colour panel from the swatch", async () => {
    const w = rail();
    await w.get("[data-testid='tool-eraser']").trigger("click");
    expect(w.emitted("update:tool")?.[0]).toEqual(["eraser"]);
    await w.get("button[title='Colour']").trigger("click");
    expect(w.emitted("open-colour")).toHaveLength(1);
  });
});
