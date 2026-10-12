import { describe, expect, it } from "vitest";
import {
  effectiveLanguages,
  effectiveSize,
  effectiveSpeed,
  findSubrace,
  speciesHasWalkSpeed,
  walkSpeedFromSubrace,
} from "@/rules/speciesStats";
import type { SpeciesStatsSource } from "@/rules/speciesStats";

const darakhul: SpeciesStatsSource = {
  size: null,
  speed: null,
  languages: ["Common", "Darakhul"],
  subraces: [
    { name: "Dwarf Heritage", description: "", traits: [], size: "medium", speed: { walk: 25 }, languages: ["Dwarvish"] },
    { name: "Halfling Heritage", description: "", traits: [], size: "small", speed: { walk: 25 }, languages: ["Halfling"] },
  ],
};

const minotaur: SpeciesStatsSource = {
  size: "medium",
  speed: { walk: 30 },
  languages: ["Common", "Minotaur"],
  subraces: [
    { name: "Bhain Kwai", description: "", traits: [], speed: { swim: 25 } },
    { name: "Boghaid", description: "", traits: [] },
  ],
};

describe("findSubrace", () => {
  it("finds by name and treats no name as no subrace", () => {
    expect(findSubrace(minotaur, "Boghaid")?.name).toBe("Boghaid");
    expect(findSubrace(minotaur, "")).toBeNull();
    expect(findSubrace(minotaur, null)).toBeNull();
    expect(findSubrace(minotaur, "Unknown")).toBeNull();
  });
});

describe("effective stats", () => {
  it("takes a deferred size and speed from the subrace", () => {
    expect(effectiveSize(darakhul, "Halfling Heritage")).toBe("small");
    expect(effectiveSpeed(darakhul, "Dwarf Heritage")).toEqual({ walk: 25 });
  });

  it("is the parent's when no subrace is chosen", () => {
    expect(effectiveSize(darakhul)).toBeNull();
    expect(effectiveSpeed(darakhul)).toBeNull();
    expect(effectiveSize(minotaur, "Boghaid")).toBe("medium");
  });

  it("adds a subrace's speed mode to the parent's", () => {
    expect(effectiveSpeed(minotaur, "Bhain Kwai")).toEqual({ walk: 30, swim: 25 });
  });

  it("adds a subrace's languages after the parent's, each once", () => {
    expect(effectiveLanguages(darakhul, "Dwarf Heritage")).toEqual(["Common", "Darakhul", "Dwarvish"]);
    expect(effectiveLanguages({ ...minotaur, subraces: [{ name: "X", description: "", traits: [], languages: ["Common"] }] }, "X")).toEqual([
      "Common",
      "Minotaur",
    ]);
  });
});

describe("speciesHasWalkSpeed", () => {
  it("holds for a species with its own walk speed", () => {
    expect(speciesHasWalkSpeed(minotaur)).toBe(true);
    expect(walkSpeedFromSubrace(minotaur)).toBe(false);
  });

  it("holds when every subrace states one", () => {
    expect(speciesHasWalkSpeed(darakhul)).toBe(true);
    expect(walkSpeedFromSubrace(darakhul)).toBe(true);
  });

  it("fails when one subrace leaves it unstated, or there are no subraces", () => {
    const gap = { ...darakhul, subraces: [...(darakhul.subraces ?? []), { name: "Ravenfolk", description: "", traits: [] }] };
    expect(speciesHasWalkSpeed(gap)).toBe(false);
    expect(speciesHasWalkSpeed({ speed: null, subraces: [] })).toBe(false);
    expect(speciesHasWalkSpeed({ speed: { fly: 30 }, subraces: null })).toBe(false);
  });
});
