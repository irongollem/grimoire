import { describe, expect, it } from "vitest";
import { wildShapeRules } from "@/rules/wildshape";
import { remainingUses } from "./uses";
import { wildShapeLeft, wildShapePool } from "./wildShapePool";

const rules = (edition: "2014" | "2024", druidLevel: number) =>
  wildShapeRules({ edition, druidLevel, isCircleOfMoon: false, wisMod: 0 });

describe("wildShapePool", () => {
  it("is the edition's maximum, regained by the edition's short rest rule", () => {
    expect(wildShapePool(rules("2024", 6))).toMatchObject({ key: "wild_shape", label: "Wild Shape", max: 3, recharge: "long", shortRestRegain: 1 });
    expect(wildShapePool(rules("2014", 2))).toMatchObject({ max: 2, recharge: "short", shortRestRegain: null });
  });

  it("is unlimited for a 2014 level 20 druid", () => {
    expect(wildShapePool(rules("2014", 20))?.max).toBe("unlimited");
  });

  it("does not exist for a character with no Wild Shape", () => {
    expect(wildShapePool(rules("2024", 1))).toBeNull();
    expect(wildShapePool(rules("2024", 0))).toBeNull();
  });

  it("counts what is left from the spent count, never below zero", () => {
    const pool = wildShapePool(rules("2024", 2))!;
    expect(wildShapeLeft(pool, 0)).toBe(2);
    expect(wildShapeLeft(pool, 1)).toBe(1);
    expect(wildShapeLeft(pool, 5)).toBe(0);
  });

  it("is absent from the feature pools, so the stored-resource path treats it as no pool", () => {
    expect(remainingUses({}, [], "wild_shape")).toBeNull();
  });
});
