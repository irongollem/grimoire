import { describe, it, expect } from "vitest";
import { crColor, crToNumber, crText, crLabel, UNKNOWN_CR_LABEL } from "@/lib/monsterDisplay";

describe("crToNumber", () => {
  it("treats CR 0 as zero", () => {
    expect(crToNumber("0")).toBe(0);
  });

  // `stat_block` is jsonb: the key can simply not be there. It reached
  // production on one AI-generated monster, and every bestiary card calling
  // crColor threw `Cannot read properties of undefined (reading 'includes')`
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

describe("crColor", () => {
  it("returns the trivial tier (green) for CR ≤ 1/2", () => {
    expect(crColor("0")).toBe("#22c55e");
    expect(crColor("1/4")).toBe("#22c55e");
    expect(crColor("1/2")).toBe("#22c55e");
  });

  it("returns the low tier (yellow) for CR 1–4", () => {
    expect(crColor("1")).toBe("#eab308");
    expect(crColor("4")).toBe("#eab308");
  });

  it("returns the mid tier (orange) for CR 5–9", () => {
    expect(crColor("5")).toBe("#f97316");
    expect(crColor("9")).toBe("#f97316");
  });

  it("returns the high tier (red) for CR 10–15", () => {
    expect(crColor("10")).toBe("#dc2626");
    expect(crColor("15")).toBe("#dc2626");
  });

  it("returns the deadly tier (purple) for CR ≥ 16", () => {
    expect(crColor("16")).toBe("#7c3aed");
    expect(crColor("30")).toBe("#7c3aed");
  });

  // Neutral, and specifically NOT the CR-0 green: an unrated monster must not
  // read at a glance as a harmless one.
  it("returns a neutral swatch, off the threat scale, for an unknown rating", () => {
    const unknown = crColor(undefined);
    expect(unknown).toBe("#6b7280");
    expect(crColor(null)).toBe(unknown);
    expect(crColor("")).toBe(unknown);
    expect(unknown).not.toBe(crColor("0"));
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
