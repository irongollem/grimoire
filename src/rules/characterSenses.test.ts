import { describe, expect, it } from "vitest";
import { characterSenses, formatSenses } from "@/rules/characterSenses";

/** Every sense at 0: what a character or a senses string without that sense has. */
const NONE = { blindsight: 0, darkvision: 0, tremorsense: 0, truesight: 0 };

const elf = { subraces: [], traits: [{ name: "Darkvision", description: "You can see in the dark out to 60 feet." }] };
const human = { subraces: [], traits: [] };

describe("characterSenses", () => {
  it("reads species darkvision", () => {
    expect(characterSenses({ species: elf, senses: null })).toEqual({ ...NONE, darkvision: 60 });
  });
  it("reads the character's own senses", () => {
    expect(characterSenses({ species: human, senses: "blindsight 10 ft., truesight 30 ft." })).toEqual({ ...NONE,
      blindsight: 10,
      truesight: 30,
    });
  });
  it("takes the better source, never the sum", () => {
    expect(characterSenses({ species: elf, senses: "darkvision 120 ft." }).darkvision).toBe(120);
    expect(characterSenses({ species: elf, senses: "darkvision 30 ft." }).darkvision).toBe(60);
  });
  it("works without a species", () => {
    expect(characterSenses({ species: null, senses: "tremorsense 20" })).toEqual({ ...NONE, tremorsense: 20 });
    expect(characterSenses({ species: undefined, senses: undefined })).toEqual({ ...NONE });
  });
});

describe("formatSenses", () => {
  it("lists in a fixed order", () => {
    expect(formatSenses({ ...NONE, darkvision: 60, blindsight: 10 })).toBe("Blindsight 10 ft., darkvision 60 ft.");
  });
  it("is empty when there are none", () => {
    expect(formatSenses(NONE)).toBe("");
  });
});
