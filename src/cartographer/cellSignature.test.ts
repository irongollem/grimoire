import { describe, expect, it } from "vitest";
import { canonicalCells, cellSignature } from "./cellSignature";

describe("canonicalCells", () => {
  it("sorts by row then column and drops duplicates", () => {
    expect(canonicalCells(["2,1", "0,0", "1,0", "2,1", "0,1"])).toEqual(["0,0", "1,0", "0,1", "2,1"]);
  });

  it("orders negative coordinates numerically, not lexically", () => {
    expect(canonicalCells(["10,0", "-1,0", "2,0"])).toEqual(["-1,0", "2,0", "10,0"]);
  });
});

describe("cellSignature", () => {
  it("is independent of paint order", () => {
    expect(cellSignature(["1,1", "0,0", "0,1"])).toBe(cellSignature(["0,1", "1,1", "0,0"]));
  });

  it("changes when one cell moves", () => {
    expect(cellSignature(["0,0", "1,0"])).not.toBe(cellSignature(["0,0", "2,0"]));
  });

  it("leads with the cell count so a glance says how big the shape is", () => {
    expect(cellSignature(["0,0", "1,0", "2,0"])).toMatch(/^3:[0-9a-f]{16}$/);
  });

  it("is stable across runs", () => {
    expect(cellSignature(["0,0"])).toBe(cellSignature(["0,0"]));
    expect(cellSignature([])).toBe("0:cbf29ce484222325");
  });
});
