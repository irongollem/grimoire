import { describe, expect, it } from "vitest";
import { characterSenses, formatSenses } from "@/rules/characterSenses";

/** Every sense at 0: what a character or a senses string without that sense has. */
const NONE = { blindsight: 0, darkvision: 0, tremorsense: 0, truesight: 0, devilsSight: 0 };

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

describe("characterSenses devil's sight", () => {
  it("reads it with or without a number", () => {
    expect(characterSenses({ species: null, senses: "Devil's Sight 60 ft." }).devilsSight).toBe(60);
    expect(characterSenses({ species: null, senses: "darkvision 60 ft., Devil\u2019s Sight" }).devilsSight).toBe(120);
    expect(characterSenses({ species: null, senses: "darkvision 60 ft." }).devilsSight).toBe(0);
  });
});

describe("formatSenses devil's sight", () => {
  it("lists it after the other senses", () => {
    expect(formatSenses({ ...NONE, darkvision: 60, devilsSight: 120 })).toBe("Darkvision 60 ft., devil's sight 120 ft.");
    expect(formatSenses({ ...NONE, devilsSight: 120 })).toBe("Devil's sight 120 ft.");
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
