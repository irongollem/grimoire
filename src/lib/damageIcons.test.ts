import { describe, it, expect } from "vitest";
import {
  damageTypesFromRolls,
  tokenizeDamage,
  tokenizeRich,
} from "@/lib/damageIcons";

describe("tokenizeDamage", () => {
  it("returns [] for empty", () => {
    expect(tokenizeDamage("")).toEqual([]);
  });

  it("replaces 'X damage' and bare 'X' with type markers", () => {
    expect(
      tokenizeDamage("19 (2d10 + 8) piercing damage plus 7 (2d6) fire damage"),
    ).toEqual([
      { text: "19 (2d10 + 8) " },
      { type: "piercing" },
      { text: " plus 7 (2d6) " },
      { type: "fire" },
    ]);
  });

  it("leaves text with no damage type untouched", () => {
    expect(tokenizeDamage("The dragon can breathe air and water.")).toEqual([
      { text: "The dragon can breathe air and water." },
    ]);
  });

  it("does not match a substring of another word", () => {
    expect(tokenizeDamage("acidic sludge")).toEqual([{ text: "acidic sludge" }]);
  });

  it("is case-insensitive and lowercases the type", () => {
    const toks = tokenizeDamage("takes Cold damage");
    expect(toks).toEqual([{ text: "takes " }, { type: "cold" }]);
  });
});

describe("tokenizeRich", () => {
  it("marks **bold** runs and still extracts damage icons", () => {
    expect(tokenizeRich("**Fire Breath.** deals fire damage")).toEqual([
      { type: "fire", bold: true },
      { text: " Breath.", bold: true },
      { text: " deals " },
      { type: "fire" },
    ]);
  });

  it("handles plain text with no markup", () => {
    expect(tokenizeRich("a melee attack")).toEqual([{ text: "a melee attack" }]);
  });
});

describe("damageTypesFromRolls", () => {
  it("returns [] for null/empty", () => {
    expect(damageTypesFromRolls(null)).toEqual([]);
    expect(damageTypesFromRolls([])).toEqual([]);
  });

  it("collects distinct valid types in canonical order", () => {
    expect(
      damageTypesFromRolls([
        { dice: "8d6", type: "Fire" },
        { dice: "2d6", type: "cold" },
        { dice: "1d6", type: "fire" },
      ]),
    ).toEqual(["cold", "fire"]);
  });

  it("ignores untyped or unrecognized rolls", () => {
    expect(
      damageTypesFromRolls([
        { dice: "5", type: "" },
        { dice: "1d4", type: "sonic" },
        { dice: "2d8", type: "radiant" },
      ]),
    ).toEqual(["radiant"]);
  });
});
