import { describe, expect, it } from "vitest";
import { buildMapStylePrompt } from "./mapStylePrompt";

describe("buildMapStylePrompt", () => {
  it("opens with keeping the drawn layout", () => {
    const prompt = buildMapStylePrompt("playable", "The Workshop", "Four floors.", null);
    expect(prompt.startsWith("Repaint this top-down map image")).toBe(true);
    expect(prompt).toMatch(/do not add a title/i);
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

  it("never names a publisher's book as the style", () => {
    for (const preset of ["playable", "explorer", "isometric", "tactical", "tome", "woodcut"]) {
      expect(buildMapStylePrompt(preset, "X", null, null)).not.toMatch(/D&D|Player's Handbook|OneDnD|5e/);
    }
  });
});
