import { describe, it, expect } from "vitest";
import { crBg, crTier, crToNumber, crText, crLabel, UNKNOWN_CR_LABEL } from "@/lib/monsterDisplay";

describe("crToNumber", () => {
  it("treats CR 0 as zero", () => {
    expect(crToNumber("0")).toBe(0);
  });

  // `stat_block` is jsonb: the key can simply not be there. It reached
  // production on one AI-generated monster, and every bestiary card calling
  // crTier threw `Cannot read properties of undefined (reading 'includes')`
  // as soon as infinite scroll rendered that row — taking the whole list with
  // it, on both the Custom tab and All Sources.
  it("returns null for a rating that isn't there", () => {
    expect(crToNumber(undefined)).toBeNull();
    expect(crToNumber(null)).toBeNull();
    expect(crToNumber("")).toBeNull();
    expect(crToNumber("   ")).toBeNull();
  });

  it("returns null rather than NaN for a rating that isn't a number", () => {
    expect(crToNumber("?")).toBeNull();
    expect(crToNumber("Unknown")).toBeNull();
    expect(crToNumber("1/0")).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    expect(crToNumber(" 5 ")).toBe(5);
    expect(crToNumber(" 1/4 ")).toBeCloseTo(0.25);
  });

  it("parses fractional CRs", () => {
    expect(crToNumber("1/8")).toBeCloseTo(0.125);
    expect(crToNumber("1/4")).toBeCloseTo(0.25);
    expect(crToNumber("1/2")).toBeCloseTo(0.5);
  });

  it("parses whole-number CRs", () => {
    expect(crToNumber("1")).toBe(1);
    expect(crToNumber("17")).toBe(17);
  });
});

describe("crTier", () => {
  it("names the trivial tier for CR \u2264 1/2", () => {
    expect(crTier("0")).toBe("trivial");
    expect(crTier("1/4")).toBe("trivial");
    expect(crTier("1/2")).toBe("trivial");
  });

  it("names the low tier for CR 1\u20134", () => {
    expect(crTier("1")).toBe("low");
    expect(crTier("4")).toBe("low");
  });

  it("names the moderate tier for CR 5\u20139", () => {
    expect(crTier("5")).toBe("moderate");
    expect(crTier("9")).toBe("moderate");
  });

  it("names the high tier for CR 10\u201315", () => {
    expect(crTier("10")).toBe("high");
    expect(crTier("15")).toBe("high");
  });

  it("names the deadly tier for CR \u2265 16", () => {
    expect(crTier("16")).toBe("deadly");
    expect(crTier("30")).toBe("deadly");
  });

  // Neutral, and specifically NOT the CR-0 tier: an unrated monster must not
  // read at a glance as a harmless one.
  it("names a tier off the threat scale for an unknown rating", () => {
    expect(crTier(undefined)).toBe("unknown");
    expect(crTier(null)).toBe("unknown");
    expect(crTier("")).toBe("unknown");
    expect(crTier("?")).toBe("unknown");
    expect(crTier(undefined)).not.toBe(crTier("0"));
  });
});

describe("crBg", () => {
  // The classes must be literals in the source or Tailwind never generates
  // them — a computed `bg-cr-${tier}` compiles, passes tests, and renders
  // transparent. Asserting the exact strings is what catches that.
  it("returns a static utility class per tier", () => {
    expect(crBg("1/4")).toBe("bg-cr-trivial");
    expect(crBg("3")).toBe("bg-cr-low");
    expect(crBg("7")).toBe("bg-cr-moderate");
    expect(crBg("12")).toBe("bg-cr-high");
    expect(crBg("20")).toBe("bg-cr-deadly");
    expect(crBg(undefined)).toBe("bg-cr-unknown");
  });
});

describe("crText / crLabel", () => {
  it("passes a real rating through", () => {
    expect(crText("1/4")).toBe("1/4");
    expect(crLabel("5")).toBe("CR 5");
  });

  it("marks an absent rating instead of rendering 'undefined' or a blank", () => {
    expect(crText(undefined)).toBe(UNKNOWN_CR_LABEL);
    expect(crText(null)).toBe(UNKNOWN_CR_LABEL);
    expect(crText("  ")).toBe(UNKNOWN_CR_LABEL);
    expect(crLabel(undefined)).toBe(`CR ${UNKNOWN_CR_LABEL}`);
  });

  it("trims incidental whitespace", () => {
    expect(crText(" 12 ")).toBe("12");
  });
});
