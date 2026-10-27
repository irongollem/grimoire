import { describe, expect, it } from "vitest";
import {
  armourPrompt,
  burdenPrompt,
  characterGarbPrompt,
  speciesGarbPrompt,
  templateGarbPrompt,
} from "./prompts.ts";

// The wording was tuned against renders, so these tests do not restate it. They
// hold what the callers rely on: every sheet is cut into the same three cells,
// each prompt refers only to the images the generator actually attaches, and
// the text a DM controls (a species' description) is bounded.

const SHEETS: Record<string, string> = {
  template: templateGarbPrompt("medium"),
  character: characterGarbPrompt(),
  species: speciesGarbPrompt({ name: "Gnome", description: null, size: "small" }),
  armourWithTemplate: armourPrompt({ withTemplate: true }),
  armourWithout: armourPrompt({ withTemplate: false }),
  burden: burdenPrompt(),
};

describe("every sheet prompt", () => {
  it.each(Object.entries(SHEETS))("%s asks for three cells with an empty margin, so the sheet can be cut between figures", (_name, text) => {
    expect(text).toContain("three equal vertical cells");
    expect(text).toContain("margin of at least 40 px");
  });

  it.each(Object.entries(SHEETS))("%s keeps the head bare, so headgear stays a separate slot on the doll", (_name, text) => {
    expect(text).toMatch(/bare head/i);
  });
});

describe("which images each prompt refers to", () => {
  // The generator attaches exactly these: the numbering in the text must match.
  it("a text-only template render refers to no image at all", () => {
    expect(SHEETS.template).not.toMatch(/\bImage \d/);
  });

  it("a character sheet is drawn from two images, the portrait and the template", () => {
    expect(SHEETS.character).toMatch(/Image 1/);
    expect(SHEETS.character).toMatch(/Image 2/);
    expect(SHEETS.character).not.toMatch(/Image 3/);
  });

  it("a species sheet and a template-less armour sheet are drawn from one image", () => {
    for (const text of [SHEETS.species, SHEETS.armourWithout, SHEETS.burden]) {
      expect(text).toMatch(/Image 1/);
      expect(text).not.toMatch(/Image 2/);
    }
  });

  it("armour with a template takes its outfits from image 2", () => {
    expect(SHEETS.armourWithTemplate).toMatch(/Image 2/);
  });
});

describe("speciesGarbPrompt", () => {
  const species = (over: Partial<Parameters<typeof speciesGarbPrompt>[0]>) =>
    speciesGarbPrompt({ name: "Tiefling", description: null, size: "medium", ...over });

  it("names the species and carries its description", () => {
    const text = species({ description: "Horned folk." });
    expect(text).toContain("adult Tiefling");
    expect(text).toContain("Horned folk.");
  });

  it("trims the description and cuts a long one at exactly 600 characters", () => {
    const long = species({ description: "  " + "x".repeat(2000) + "  " });
    expect(long).toContain("x".repeat(600) + "...");
    expect(long).not.toContain("x".repeat(601));
    const exact = species({ description: "y".repeat(600) });
    expect(exact).toContain("y".repeat(600));
    expect(exact).not.toContain("y".repeat(600) + "...");
  });

  it("adds no description clause for a blank one", () => {
    expect(species({ description: "   " })).toBe(species({ description: null }));
  });

  it("draws a small species as a grown halfling-sized adult and a medium one as human-sized", () => {
    expect(species({ size: "small" })).not.toBe(species({ size: "medium" }));
    expect(templateGarbPrompt("small")).not.toBe(templateGarbPrompt("medium"));
  });
});

describe("body features", () => {
  it("character and species sheets keep wings, tails and horns as body, not clothing", () => {
    for (const text of [SHEETS.character, SHEETS.species]) expect(text).toMatch(/wings/);
    expect(SHEETS.template).not.toMatch(/wings/);
  });
});

describe("burdenPrompt", () => {
  it("shows the loads from light to crushing, left to right", () => {
    const text = burdenPrompt();
    const left = text.indexOf("Left cell");
    const centre = text.indexOf("Centre cell");
    const right = text.indexOf("Right cell");
    expect(left).toBeGreaterThan(-1);
    expect(centre).toBeGreaterThan(left);
    expect(right).toBeGreaterThan(centre);
  });
});
