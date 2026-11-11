import { describe, expect, it } from "vitest";
import {
  COLOUR_PRESETS,
  colourPresetOf,
  edgeSidesOf,
  edgeSliderValue,
  edgeStyleOf,
  emptySettings,
  setColourPreset,
  setEdgeSlider,
  setEdgeStyle,
  setGradeValue,
  setVignetteStrength,
  toggleEdgeSide,
  vignetteStrength,
  gradeValue,
} from "./recipeEdits";
import { hasSteps, parseSettings } from "./treatment";

const blank = emptySettings(7);

describe("edge style", () => {
  // Fails on: choosing Torn paper writing a classic step, so the panel and the workbench disagree on what the picture holds.
  it("writes a paper step for Torn paper and a classic one for Torn (classic)", () => {
    expect(edgeStyleOf(setEdgeStyle(blank, "paper"))).toBe("paper");
    expect(edgeStyleOf(setEdgeStyle(blank, "classic"))).toBe("classic");
  });

  // Fails on: Faded and Torn (classic) being the same chip, so choosing Faded leaves the strokes in.
  it("reads a smooth classic edge as Faded and a stroked one as Torn (classic)", () => {
    const faded = setEdgeStyle(blank, "faded");
    expect(edgeStyleOf(faded)).toBe("faded");
    expect(edgeStyleOf(setEdgeStyle(faded, "classic"))).toBe("classic");
  });

  it("starts with all four sides and keeps the sides already torn when the style changes", () => {
    expect(edgeSidesOf(setEdgeStyle(blank, "paper"))).toEqual({ top: true, right: true, bottom: true, left: true });
    const two = toggleEdgeSide(toggleEdgeSide(setEdgeStyle(blank, "paper"), "left"), "right");
    expect(edgeSidesOf(setEdgeStyle(two, "faded"))).toEqual({ top: true, right: false, bottom: true, left: false });
  });

  it("is no edges step at all for Straight", () => {
    expect(hasSteps(setEdgeStyle(setEdgeStyle(blank, "paper"), "straight"))).toBe(false);
  });

  // Fails on: the last torn side being switched off leaving an edges step that bakes to an identical picture.
  it("drops the step when the last torn side is kept", () => {
    let s = setEdgeStyle(blank, "paper");
    for (const side of ["top", "right", "bottom", "left"] as const) s = toggleEdgeSide(s, side);
    expect(s.steps).toEqual([]);
  });

  it("tears a single side of a straight picture as torn paper", () => {
    const s = toggleEdgeSide(blank, "top");
    expect(edgeStyleOf(s)).toBe("paper");
    expect(edgeSidesOf(s)).toEqual({ top: true, right: false, bottom: false, left: false });
  });
});

describe("edge sliders", () => {
  // Fails on: Depth writing `depth` on a classic step, which has no such key (its field is tearDepth), so the slider does nothing.
  it("moves the field each style really has", () => {
    const paper = setEdgeSlider(setEdgeStyle(blank, "paper"), "depth", 0.9);
    expect(edgeSliderValue(paper, "depth")).toBe(0.9);
    const classic = setEdgeSlider(setEdgeStyle(blank, "classic"), "depth", 0.2);
    expect(edgeSliderValue(classic, "depth")).toBe(0.2);
    const step = classic.steps[0];
    expect(step.type === "edges" && step.style === "classic" && step.top.tearDepth).toBe(0.2);
    const faded = setEdgeSlider(setEdgeStyle(blank, "faded"), "depth", 0.8);
    const f = faded.steps[0];
    expect(f.type === "edges" && f.style === "classic" && f.top.fadeWidth).toBe(0.8);
  });

  // Fails on: a slider write waking a side the author kept straight.
  it("changes only the sides that are torn", () => {
    const s = setEdgeSlider(toggleEdgeSide(setEdgeStyle(blank, "paper"), "left"), "roughness", 0.1);
    const step = s.steps[0];
    if (step.type !== "edges" || step.style !== "paper") throw new Error("expected a paper step");
    expect(step.top.roughness).toBe(0.1);
    expect(step.left.roughness).not.toBe(0.1);
    expect(step.left.enabled).toBe(false);
  });
});

describe("colour", () => {
  it("offers As painted first, then each preset", () => {
    expect(COLOUR_PRESETS.map((p) => p.label)).toEqual(["As painted", "Sepia", "Moonlit", "Vivid", "Ink sketch"]);
  });

  it("names the preset a grade came from, and none for a picture with no grade", () => {
    expect(colourPresetOf(blank)).toBe("none");
    expect(colourPresetOf(setColourPreset(blank, "Moonlit"))).toBe("Moonlit");
  });

  // Fails on: Warmth or Contrast moving making the chip go out, so a nudge reads as leaving the preset.
  it("stays on its preset when Warmth or Contrast moves", () => {
    const moved = setGradeValue(setGradeValue(setColourPreset(blank, "Sepia"), "temperature", 0.9), "contrast", 0.4);
    expect(colourPresetOf(moved)).toBe("Sepia");
    expect(gradeValue(moved, "temperature")).toBe(0.9);
  });

  it("is As painted again when the grade is neutral", () => {
    expect(hasSteps(setColourPreset(setColourPreset(blank, "Vivid"), "none"))).toBe(false);
    expect(hasSteps(setGradeValue(setGradeValue(blank, "contrast", 0.3), "contrast", 0))).toBe(false);
  });
});

describe("vignette", () => {
  it("is a step with the strength set, and none at zero", () => {
    const v = setVignetteStrength(blank, 0.25);
    expect(vignetteStrength(v)).toBe(0.25);
    expect(hasSteps(setVignetteStrength(v, 0))).toBe(false);
  });
});

describe("recipes written here", () => {
  // Fails on: an edit that produces a recipe the document cannot read back (a dropped step on reload).
  it("survive a round trip through parseSettings unchanged", () => {
    let s = setEdgeStyle(blank, "paper");
    s = setColourPreset(s, "Ink sketch");
    s = setVignetteStrength(s, 0.4);
    expect(parseSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
