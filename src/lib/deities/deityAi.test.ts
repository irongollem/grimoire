import { describe, expect, it } from "vitest";
import {
  buildDeityConstraints,
  deityImageContextParts,
  normalizeDeityResult,
} from "./deityAi";

describe("normalizeDeityResult", () => {
  it("keeps a clean deity", () => {
    const r = normalizeDeityResult({
      name: " Solara ",
      titles: "The Dawn Mother",
      alternate_names: ["Sol", "Sol", "Aurea"],
      alignment: "lawful good",
      domains: ["Life", "light"],
      portfolio: "dawn",
      symbol: "A rising sun",
      description: "Lore",
      dm_notes: "Secret",
      tags: ["Sun", "Healing"],
      image_prompt: "Radiant woman",
    });
    expect(r.name).toBe("Solara");
    expect(r.alternate_names).toEqual(["Sol", "Aurea"]);
    expect(r.alignment).toBe("Lawful Good");
    expect(r.domains).toEqual(["Life", "Light"]);
    expect(r.tags).toEqual(["sun", "healing"]);
  });

  it("drops an unknown alignment and unknown or duplicate domains", () => {
    const r = normalizeDeityResult({
      alignment: "Chaotic Awesome",
      domains: ["Fire", "War", "war", "Death", "Life", "Light"],
    });
    expect(r.alignment).toBeNull();
    expect(r.domains).toEqual(["War", "Death", "Life"]);
  });

  it("keeps every edition's full domain list (a god's domains are its portfolio)", () => {
    const r = normalizeDeityResult({ domains: ["Forge", "War"] });
    expect(r.domains).toEqual(["Forge", "War"]);
  });

  it("survives junk input", () => {
    const r = normalizeDeityResult({ name: 4, domains: "War", tags: null, alternate_names: [1, "x"] });
    expect(r.name).toBe("");
    expect(r.domains).toEqual([]);
    expect(r.tags).toEqual([]);
    expect(r.alternate_names).toEqual(["x"]);
    expect(normalizeDeityResult(null).description).toBe("");
  });

  it("caps tags and alternate names", () => {
    const r = normalizeDeityResult({
      tags: ["a", "b", "c", "d", "e", "f"],
      alternate_names: ["a", "b", "c", "d"],
    });
    expect(r.tags).toHaveLength(5);
    expect(r.alternate_names).toHaveLength(3);
  });
});

describe("buildDeityConstraints", () => {
  it("is empty with nothing chosen under 2014", () => {
    expect(buildDeityConstraints({})).toEqual([]);
  });

  it("sends pantheon, its deities, alignment and domain", () => {
    const lines = buildDeityConstraints({
      pantheonName: "Olympians",
      pantheonDeities: [{ name: "Zeus", portfolio: "sky" }, { name: "Hades", portfolio: null }],
      alignment: "True Neutral",
      primaryDomain: "Death",
    });
    expect(lines).toEqual([
      "Pantheon: Olympians",
      "Existing deities in this pantheon (do not duplicate): Zeus (sky); Hades",
      "Alignment: True Neutral",
      "Primary domain: Death",
    ]);
  });

  it("keeps every line within the server's 400 character cap", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ name: `Deity number ${i}`, portfolio: "everything" }));
    const lines = buildDeityConstraints({ pantheonName: "P", pantheonDeities: many });
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(400);
  });

});

describe("deityImageContextParts", () => {
  it("builds portrait facts", () => {
    const parts = deityImageContextParts({
      name: "Solara", titles: null, alignment: "Lawful Good", domains: ["Life"], portfolio: "dawn", symbol: null,
    });
    expect(parts).toContain("domains of Life");
    expect(parts).toContain("god of dawn");
  });
});
