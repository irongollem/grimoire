import { describe, expect, it } from "vitest";
import { armorTrainingOf } from "./armorTraining";

describe("armorTrainingOf", () => {
  it("reads the categories a class lists", () => {
    const trained = armorTrainingOf(["Light armor", "Medium armor", "Shields"]);
    expect([...trained].sort()).toEqual(["light", "medium", "shield"]);
  });

  it("'All armor' trains the three armor categories but not shields", () => {
    expect([...armorTrainingOf(["All armor"])].sort()).toEqual(["heavy", "light", "medium"]);
  });

  it("a class with no armor training has none", () => {
    expect(armorTrainingOf([]).size).toBe(0);
  });
});
