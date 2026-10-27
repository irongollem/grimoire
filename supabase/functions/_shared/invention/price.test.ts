import { describe, it, expect } from "vitest";
import { formatCostCp, parseCostCp, unitValueCp } from "./price.ts";

describe("parseCostCp", () => {
  it("reads coins", () => {
    expect(parseCostCp("50 gp")).toBe(5000);
    expect(parseCostCp("1,500 gp")).toBe(150000);
    expect(parseCostCp("5 sp")).toBe(50);
    expect(parseCostCp("2 cp")).toBe(2);
    expect(parseCostCp("1 pp")).toBe(1000);
    expect(parseCostCp("3 ep")).toBe(150);
    expect(parseCostCp("1 gp 5 sp")).toBe(150);
  });
  it("treats a bare number as gp", () => {
    expect(parseCostCp("12")).toBe(1200);
    expect(parseCostCp("0.50")).toBe(50);
  });
  it("calls zero, blank and junk unpriced", () => {
    expect(parseCostCp("0.00")).toBeNull();
    expect(parseCostCp("0")).toBeNull();
    expect(parseCostCp("  ")).toBeNull();
    expect(parseCostCp(null)).toBeNull();
    expect(parseCostCp("priceless")).toBeNull();
  });
});

describe("unitValueCp", () => {
  it("falls back to the rarity table", () => {
    expect(unitValueCp("0.00", "mundane")).toBe(100);
    expect(unitValueCp(null, "uncommon")).toBe(10100);
    expect(unitValueCp("", "artifact")).toBe(5000100);
    expect(unitValueCp("7 gp", "rare")).toBe(700);
  });
});

describe("formatCostCp", () => {
  it("prefers gp, then sp, then cp", () => {
    expect(formatCostCp(4000)).toBe("40 gp");
    expect(formatCostCp(70)).toBe("7 sp");
    expect(formatCostCp(150000)).toBe("1,500 gp");
    expect(formatCostCp(155)).toBe("155 cp");
    expect(formatCostCp(0)).toBe("0 cp");
  });
});
