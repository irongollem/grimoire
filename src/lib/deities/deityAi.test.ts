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

  it("survives junk input", () => {
    const r = normalizeDeityResult({ name: 4, domains: "War", tags: null, alternate_names: [1, "x"] });
    expect(r.name).toBe("");
    expect(r.domains).toEqual([]);
    expect(r.tags).toEqual([]);
    expect(r.alternate_names).toEqual(["x"]);
    expect(normalizeDeityResult(null).description).toBe("");
  });

  it("reads a blank or whitespace-only optional text field as absent", () => {
    const r = normalizeDeityResult({ titles: "   ", portfolio: "", symbol: "\n" });
    expect(r.titles).toBeNull();
    expect(r.portfolio).toBeNull();
    expect(r.symbol).toBeNull();
  });

  it("keeps the provenance the generator attached and ignores a non-object one", () => {
    const provenance = { model: "m" };
    expect(normalizeDeityResult({ ai_provenance: provenance }).ai_provenance).toBe(provenance);
    expect(normalizeDeityResult({ ai_provenance: "yes" }).ai_provenance).toBeUndefined();
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

describe("buildDeityConstraints at the 400 character cap", () => {
  const CAP = 400;
  // The deities line is "<prefix><entry>; <entry>"; measure the prefix from a one-letter deity.
  const prefixLength =
    buildDeityConstraints({ pantheonName: "P", pantheonDeities: [{ name: "A", portfolio: null }] })[1].length - 1;
  const deityLine = (names: string[]) =>
    buildDeityConstraints({
      pantheonName: "P",
      pantheonDeities: names.map((name) => ({ name, portfolio: null })),
    })[1];

  it("fits as many deities as stay within the cap, an exact fit included", () => {
    // Two entries joined by "; " land on exactly CAP characters.
    const first = "a".repeat(100);
    const second = "b".repeat(CAP - prefixLength - first.length - 2);
    expect(deityLine([first, second])).toHaveLength(CAP);
    // One more character and the second no longer fits, so it is left out whole.
    expect(deityLine([first, `${second}b`])).toHaveLength(prefixLength + first.length);
  });

  it("clips a single deity too long to list, rather than dropping the line", () => {
    const line = deityLine(["z".repeat(CAP * 2)]);
    expect(line).toHaveLength(CAP);
    expect(line.endsWith("…")).toBe(true);
  });

  it("leaves a line of exactly the cap unclipped, and clips one a character over", () => {
    const exact = "n".repeat(CAP - "Pantheon: ".length);
    expect(buildDeityConstraints({ pantheonName: exact })[0]).toBe(`Pantheon: ${exact}`);
    expect(buildDeityConstraints({ pantheonName: `${exact}n` })[0]).toHaveLength(CAP);
  });

  it("lists a pantheon's deities only when the pantheon is named, and never for an empty one", () => {
    expect(buildDeityConstraints({ pantheonDeities: [{ name: "Zeus", portfolio: null }] })).toEqual([]);
    expect(buildDeityConstraints({ pantheonName: "P", pantheonDeities: [] })).toEqual(["Pantheon: P"]);
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
