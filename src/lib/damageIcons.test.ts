import { describe, it, expect } from "vitest";
import { parseDamageString } from "./damageIcons";

describe("parseDamageString", () => {
  it("returns empty for nullish/empty input", () => {
    expect(parseDamageString(null)).toEqual({ types: [], qualifier: "" });
    expect(parseDamageString("")).toEqual({ types: [], qualifier: "" });
  });

  it("extracts a simple comma list with no qualifier", () => {
    expect(parseDamageString("fire, cold")).toEqual({
      types: ["cold", "fire"], // canonical order
      qualifier: "",
    });
  });

  it("keeps the qualifier after stripping type words and connectors", () => {
    expect(
      parseDamageString("bludgeoning, piercing, and slashing from nonmagical attacks"),
    ).toEqual({
      types: ["bludgeoning", "piercing", "slashing"],
      qualifier: "from nonmagical attacks",
    });
  });

  it("handles multiple groups separated by a semicolon", () => {
    const r = parseDamageString(
      "lightning, thunder; bludgeoning, piercing, and slashing from nonmagical attacks",
    );
    expect(r.types).toEqual([
      "bludgeoning",
      "lightning",
      "piercing",
      "slashing",
      "thunder",
    ]);
    expect(r.qualifier).toBe("from nonmagical attacks");
  });

  it("de-duplicates repeated types", () => {
    expect(parseDamageString("fire, fire damage").types).toEqual(["fire"]);
  });

  it("is case-insensitive", () => {
    expect(parseDamageString("Fire and Cold").types).toEqual(["cold", "fire"]);
  });

  it("does not match a type that is only a substring of another word", () => {
    // "acidic" should not register as "acid"
    expect(parseDamageString("acidic residue").types).toEqual([]);
  });
});
