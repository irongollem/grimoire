import { describe, expect, it } from "vitest";
import {
  DOLL_IMAGE_MODEL,
  DOLL_SHEET_SIZE,
  armourPrompt,
  burdenPrompt,
  characterGarbPrompt,
  speciesGarbPrompt,
  templateGarbPrompt,
} from "./prompts.ts";

describe("constants", () => {
  it("pins the model and sheet size", () => {
    expect(DOLL_IMAGE_MODEL).toBe("gpt-image-2.5-sunburst");
    expect(DOLL_SHEET_SIZE).toBe("1536x1024");
  });
});

describe("template garb", () => {
  it("carries the size body", () => {
    expect(templateGarbPrompt("medium")).toContain("adult human of medium build");
    expect(templateGarbPrompt("small")).toContain("adult halfling");
  });

  it("asks for three outfits with footwear and a bare head", () => {
    const text = templateGarbPrompt("medium");
    expect(text).toContain("underclothes");
    expect(text).toContain("boots");
    expect(text).toContain("sandals");
    expect(text).toContain("barefoot");
    expect(text).toContain("Bare head");
  });

  it("leaves 60 px of headroom", () => {
    expect(templateGarbPrompt("medium")).toContain("60 px below the top edge");
  });
});

describe("margin rule", () => {
  it("keeps a 40 px empty margin per cell, in every sheet prompt", () => {
    const prompts = [
      templateGarbPrompt("medium"),
      characterGarbPrompt(),
      speciesGarbPrompt({ name: "Gnome", description: null, size: "small" }),
      armourPrompt({ withTemplate: true }),
      armourPrompt({ withTemplate: false }),
      burdenPrompt(),
    ];
    for (const text of prompts) {
      expect(text).toContain("margin of at least 40 px");
      expect(text).toContain("three equal vertical cells");
    }
  });
});

describe("characterGarbPrompt", () => {
  it("keeps the portrait's likeness, not the template's", () => {
    const text = characterGarbPrompt();
    expect(text).toContain("Image 1 is a character portrait");
    expect(text).toContain("Keep the character's likeness from image 1, not image 2's figure");
    expect(text).toContain("face, skin, ears, hair, ancestry and build");
  });
});

describe("speciesGarbPrompt", () => {
  it("names the species and includes a short description", () => {
    const text = speciesGarbPrompt({ name: "Tiefling", description: "Horned folk.", size: "medium" });
    expect(text).toContain("typical adult Tiefling");
    expect(text).toContain("About the Tiefling: Horned folk.");
  });

  it("trims whitespace and cuts a long description at 600 characters", () => {
    const long = speciesGarbPrompt({ name: "Tiefling", description: "  " + "x".repeat(2000) + "  ", size: "medium" });
    expect(long).toContain("x".repeat(600) + "...");
    expect(long).not.toContain("x".repeat(601));
    const short = speciesGarbPrompt({ name: "Tiefling", description: "  Horned.  ", size: "medium" });
    expect(short).toContain("About the Tiefling: Horned. ");
  });

  it("works without a description and honours size", () => {
    const text = speciesGarbPrompt({ name: "Gnome", description: null, size: "small" });
    expect(text).not.toContain("About the Gnome");
    expect(text).toContain("adult halfling");
  });
});

describe("armourPrompt", () => {
  it("with a template, wears the template's outfits in the character's colours", () => {
    const text = armourPrompt({ withTemplate: true });
    expect(text).toContain("Image 2 is a template of three armour outfits");
    expect(text).toContain("in the character's own colours");
    expect(text).toContain("full plate");
  });

  it("without a template, redraws the same figure and mentions no image 2", () => {
    const text = armourPrompt({ withTemplate: false });
    expect(text).toContain("Draw the SAME figure");
    expect(text).not.toContain("Image 2");
    expect(text).toContain("sabatons");
  });
});

describe("burdenPrompt", () => {
  it("describes the three loads in order", () => {
    const text = burdenPrompt();
    const pack = text.indexOf("full travelling pack");
    const laden = text.indexOf("heavily laden");
    const stagger = text.indexOf("staggering");
    expect(pack).toBeGreaterThan(-1);
    expect(laden).toBeGreaterThan(pack);
    expect(stagger).toBeGreaterThan(laden);
  });

  it("keeps the same character and a bare head", () => {
    const text = burdenPrompt();
    expect(text).toContain("Draw the SAME character");
    expect(text).toContain("Bare head");
  });
});

describe("body features", () => {
  it("keeps wings, tails, horns and antennae for characters and species alike", () => {
    for (const prompt of [characterGarbPrompt(), speciesGarbPrompt({ name: "Marrow", description: null, size: "small" })]) {
      expect(prompt).toContain("wings, a tail, horns or antennae");
      expect(prompt).toContain("not clothing or props");
      expect(prompt).toContain("folded close behind the body");
    }
  });
});
