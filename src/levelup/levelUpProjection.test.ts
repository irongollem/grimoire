import { describe, expect, it } from "vitest";
import type { GrantedFeature, ResourcePool } from "@/rules/features/characterFeatures";
import type { ClassFeature } from "@/types/feature.types";
import { gainedAtLevel, lowerClasses, poolChanges, projectClasses, scalingChanges, type ClassRowInfo } from "./levelUpProjection";

const row = (over: Partial<ClassRowInfo> = {}): ClassRowInfo => ({
  id: "r1", className: "Rogue", subclassName: null, levels: 4, classFeatures: { "5": ["a"] }, subclassFeatures: null, armorProficiencies: [], ...over,
});
const g = (id: string, kind: "class" | "subclass", levelsGained: number[], scalingValue: string | null = null, className = "Rogue"): GrantedFeature => ({
  feature: { id, name: id } as unknown as ClassFeature,
  mechanics: scalingValue === null ? {} : { scaling: { label: "Sneak Attack", values: {} } },
  grant: { kind, className, subclassName: null, classLevel: 5, levelsGained },
  scalingValue,
});

describe("projectClasses", () => {
  it("raises only the chosen row and leaves the before state alone", () => {
    const { before, after } = projectClasses({ rows: [row(), row({ id: "r2", className: "Fighter", levels: 2 })], chosenRowId: "r1", newClass: null, pickedSubclass: null });
    expect(before.map((c) => c.levels)).toEqual([4, 2]);
    expect(after.map((c) => c.levels)).toEqual([5, 2]);
  });

  it("a subclass picked now counts from this level, and a new class is appended", () => {
    const picked = { name: "Thief", features: { "5": ["t"] } };
    const { after } = projectClasses({ rows: [row()], chosenRowId: "r1", newClass: null, pickedSubclass: picked });
    expect(after[0].subclassName).toBe("Thief");
    expect(after[0].subclassMap).toEqual({ "5": ["t"] });
    const added = projectClasses({ rows: [row()], chosenRowId: null, newClass: { className: "Wizard", classFeatures: null, startLevels: 1 }, pickedSubclass: null });
    expect(added.after.map((c) => `${c.className}${c.levels}`)).toEqual(["Rogue4", "Wizard1"]);
  });
});

describe("gainedAtLevel", () => {
  it("lists class and subclass features gained at the level, each once", () => {
    const list = [g("a", "class", [5]), g("a", "subclass", [5]), g("b", "subclass", [5]), g("c", "class", [1]), g("d", "class", [5], null, "Wizard")];
    expect(gainedAtLevel(list, "Rogue", 5).map((x) => x.feature.id)).toEqual(["a", "b"]);
  });
});

describe("scalingChanges", () => {
  it("names Sneak Attack growing, and skips what did not change", () => {
    const changes = scalingChanges([g("sa", "class", [1], "2d6"), g("x", "class", [1], "1")], [g("sa", "class", [1], "3d6"), g("x", "class", [1], "1")]);
    expect(changes).toEqual([{ featureId: "sa", featureName: "sa", label: "Sneak Attack", from: "2d6", to: "3d6" }]);
  });
});

describe("poolChanges", () => {
  const pool = (key: string, max: number | "unlimited"): ResourcePool => ({ key, label: key, max, recharge: "long", shortRestRegain: null, pool: false, sources: [] });
  it("reports a changed maximum and a new pool", () => {
    expect(poolChanges([pool("rage", 3)], [pool("rage", 4), pool("ki", 2)])).toEqual([
      { key: "rage", label: "rage", from: 3, to: 4 },
      { key: "ki", label: "ki", from: null, to: 2 },
    ]);
  });
});

describe("lowerClasses", () => {
  it("drops a class that empties and clears a subclass the level chose", () => {
    const rows = [row({ subclassName: "Thief", subclassFeatures: { "3": ["t"] } }), row({ id: "r2", className: "Wizard", levels: 1 })];
    expect(lowerClasses(rows, "r2", false).map((c) => c.className)).toEqual(["Rogue"]);
    const cleared = lowerClasses(rows, "r1", true);
    expect(cleared[0]).toMatchObject({ levels: 3, subclassName: null, subclassMap: null });
  });
});
