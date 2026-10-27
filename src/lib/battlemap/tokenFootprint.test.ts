import { describe, it, expect } from "vitest";
import { sizeToFootprint } from "@/lib/battlemap/tokenFootprint";

describe("sizeToFootprint", () => {
  // PHB 2014 "Creature Size" / SRD 5.2 "Size": Tiny-Medium share one square, Large is 2x2, Huge 3x3, Gargantuan 4x4.
  it.each([
    ["Tiny", 1],
    ["Medium", 1],
    ["Large", 2],
    ["Huge", 3],
    ["Gargantuan", 4],
  ])("%s takes %i cells across", (size, cells) => {
    expect(sizeToFootprint(size)).toBe(cells);
  });

  it("is case-insensitive and tolerates trimmed input", () => {
    expect(sizeToFootprint(" huge ")).toBe(3);
    expect(sizeToFootprint("GARGANTUAN")).toBe(4);
  });

  it("defaults to 1 for null / unknown / empty", () => {
    expect(sizeToFootprint(null)).toBe(1);
    expect(sizeToFootprint(undefined)).toBe(1);
    expect(sizeToFootprint("")).toBe(1);
    expect(sizeToFootprint("Colossal")).toBe(1);
  });
});
