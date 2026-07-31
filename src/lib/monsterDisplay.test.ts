import { describe, it, expect } from "vitest";
import { crColor, crToNumber } from "@/lib/monsterDisplay";

describe("crToNumber", () => {
  it("treats CR 0 as zero", () => {
    expect(crToNumber("0")).toBe(0);
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
});
