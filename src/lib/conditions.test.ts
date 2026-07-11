import { describe, it, expect } from "vitest";
import { hasSaveDisadvantage } from "./conditions";

describe("hasSaveDisadvantage", () => {
  it("gives no disadvantage with no relevant conditions", () => {
    expect(hasSaveDisadvantage([], "dex")).toBe(false);
    expect(hasSaveDisadvantage(["Poisoned"], "con")).toBe(false);
  });

  it("Restrained → disadvantage on DEX saves only", () => {
    expect(hasSaveDisadvantage(["Restrained"], "dex")).toBe(true);
    expect(hasSaveDisadvantage(["Restrained"], "str")).toBe(false);
    expect(hasSaveDisadvantage(["Restrained"], "con")).toBe(false);
  });

  it("Exhaustion 3+ → disadvantage on ALL saves", () => {
    expect(hasSaveDisadvantage(["Exhaustion 3"], "wis")).toBe(true);
    expect(hasSaveDisadvantage(["Exhaustion 5"], "dex")).toBe(true);
  });

  it("Exhaustion below 3 → no save disadvantage", () => {
    expect(hasSaveDisadvantage(["Exhaustion 2"], "wis")).toBe(false);
  });

  it("is case-insensitive on the ability key", () => {
    expect(hasSaveDisadvantage(["Restrained"], "DEX")).toBe(true);
  });
});
