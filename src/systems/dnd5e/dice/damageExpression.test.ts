import { describe, expect, it } from "vitest";
import { parseDamageExpression } from "./damageExpression";

describe("parseDamageExpression", () => {
  it("splits a compound expression into typed rolls and untyped flat numbers", () => {
    expect(parseDamageExpression("2d6 fire + 1d6 slashing + 5")).toEqual([
      { dice: "2d6", type: "fire" },
      { dice: "1d6", type: "slashing" },
      { dice: "5", type: "" },
    ]);
  });

  it("is empty for blank input", () => {
    expect(parseDamageExpression("   ")).toEqual([]);
  });
});
