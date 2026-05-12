import { describe, it, expect } from "vitest";
import { sizeToFootprint } from "./tokenFootprint";

describe("sizeToFootprint", () => {
  it("treats Tiny / Small / Medium as 1×1", () => {
    expect(sizeToFootprint("Tiny")).toBe(1);
    expect(sizeToFootprint("Small")).toBe(1);
    expect(sizeToFootprint("Medium")).toBe(1);
  });

  it("Large is 2×2", () => {
    expect(sizeToFootprint("Large")).toBe(2);
  });

  it("Huge is 3×3", () => {
    expect(sizeToFootprint("Huge")).toBe(3);
  });

  it("Gargantuan is 4×4", () => {
    expect(sizeToFootprint("Gargantuan")).toBe(4);
  });

  it("is case-insensitive and tolerates trimmed input", () => {
    expect(sizeToFootprint(" huge ")).toBe(3);
    expect(sizeToFootprint("GARGANTUAN")).toBe(4);
    expect(sizeToFootprint("LARGE")).toBe(2);
  });

  it("defaults to 1 for null / unknown / empty", () => {
    expect(sizeToFootprint(null)).toBe(1);
    expect(sizeToFootprint(undefined)).toBe(1);
    expect(sizeToFootprint("")).toBe(1);
    expect(sizeToFootprint("Colossal")).toBe(1);
  });
});
