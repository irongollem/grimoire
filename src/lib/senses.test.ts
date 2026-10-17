import { describe, it, expect } from "vitest";
import { devilsSightRange, parseSenses, senseRanges } from "@/lib/senses";

/** Every sense at 0: what a character or a senses string without that sense has. */
const NONE = { blindsight: 0, darkvision: 0, tremorsense: 0, truesight: 0 };

describe("parseSenses", () => {
  it("returns [] for nullish/empty", () => {
    expect(parseSenses(null)).toEqual([]);
    expect(parseSenses("")).toEqual([]);
  });

  it("parses icon senses + passive perception, dropping units", () => {
    expect(
      parseSenses("blindsight 60 ft., darkvision 120 ft., passive Perception 23"),
    ).toEqual([
      { sense: "blindsight", value: "60" },
      { sense: "darkvision", value: "120" },
      { label: "PP", value: "23" },
    ]);
  });

  it("ignores a parenthetical qualifier on the number", () => {
    expect(parseSenses("blindsight 30 ft. (blind beyond this radius)")).toEqual([
      { sense: "blindsight", value: "30" },
    ]);
  });

  it("handles tremorsense and truesight", () => {
    expect(parseSenses("tremorsense 60 ft., truesight 120 ft.")).toEqual([
      { sense: "tremorsense", value: "60" },
      { sense: "truesight", value: "120" },
    ]);
  });

  it("keeps an unknown sense as text", () => {
    expect(parseSenses("passive Perception 14")).toEqual([
      { label: "PP", value: "14" },
    ]);
  });
});

describe("senseRanges", () => {
  it("reads feet per sense", () => {
    expect(senseRanges("darkvision 60 ft., blindsight 10 ft., passive Perception 12")).toEqual({ ...NONE,
      darkvision: 60,
      blindsight: 10,
    });
  });
  it("keeps the largest of a repeated sense", () => {
    expect(senseRanges("darkvision 60 ft., Darkvision 120 ft.")).toEqual({ ...NONE, darkvision: 120 });
  });
  it("ignores unrecognised text, rangeless entries and nullish input", () => {
    expect(senseRanges("keen smell, truesight")).toEqual({ ...NONE });
    expect(senseRanges(null)).toEqual({ ...NONE });
  });
});

describe("devilsSightRange", () => {
  it("reads a number, defaults to 120 without one, and is 0 when absent", () => {
    expect(devilsSightRange("Devil's Sight 30 ft.")).toBe(30);
    expect(devilsSightRange("darkvision 60 ft., devil\u2019s sight")).toBe(120);
    expect(devilsSightRange("darkvision 60 ft.")).toBe(0);
    expect(devilsSightRange(null)).toBe(0);
  });
});
