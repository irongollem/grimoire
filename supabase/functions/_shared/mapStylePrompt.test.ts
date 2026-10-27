import { describe, expect, it } from "vitest";
import { buildMapStylePrompt } from "./mapStylePrompt";

describe("buildMapStylePrompt", () => {
  it("says to keep the drawn layout before it says anything about the style, since the model weighs the start most", () => {
    const prompt = buildMapStylePrompt("playable", "The Workshop", "Four floors.", null);
    expect(prompt).toMatch(/without changing its layout/);
    expect(prompt).toMatch(/do not add a title/i);
    expect(prompt.indexOf("without changing its layout")).toBeLessThan(prompt.indexOf("Style:"));
  });

  it("leaves out a blank name, description or extra details instead of printing an empty clause", () => {
    const blank = buildMapStylePrompt("playable", "   ", "  ", "  ");
    expect(blank).not.toContain("The place:");
    expect(blank).not.toMatch(/\s{2,}/);
    expect(blank).toBe(buildMapStylePrompt("playable", "", null, undefined));
  });

  it("names the place as the subject, not as bare lettering", () => {
    expect(buildMapStylePrompt("playable", "The Workshop", null, null)).toContain("The place: The Workshop.");
  });

  it("lets the isometric preset re-project the layout", () => {
    expect(buildMapStylePrompt("isometric", "X", null, null)).not.toMatch(/without changing its layout/);
  });

  it("keeps the DM's extra details and falls back to Playable for an unknown preset", () => {
    const prompt = buildMapStylePrompt("nope", "X", null, "Workbenches full of tools.");
    expect(prompt).toContain("contemporary painted fantasy tabletop illustration");
    expect(prompt).toContain("Workbenches full of tools.");
  });

  it("forbids a painted grid in every preset, since the app overlays its own", () => {
    for (const preset of ["playable", "explorer", "isometric", "tactical", "tome", "woodcut"]) {
      const prompt = buildMapStylePrompt(preset, "X", null, null);
      expect(prompt).toMatch(/Do not draw a grid/);
      expect(prompt).not.toMatch(/gridded/);
    }
  });

  it("never names a publisher's book as the style", () => {
    for (const preset of ["playable", "explorer", "isometric", "tactical", "tome", "woodcut"]) {
      expect(buildMapStylePrompt(preset, "X", null, null)).not.toMatch(/D&D|Player's Handbook|OneDnD|5e/);
    }
  });
});
