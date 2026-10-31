import { describe, expect, it } from "vitest";
import { objectStatLine, withObjectMaterial } from "./objectStats";

const none = { object_ac: null, object_hp: null, damage_threshold: null, break_dc: null, lock_dc: null };

describe("objectStatLine", () => {
  it("prints every stat in book order when all are set", () => {
    expect(
      objectStatLine({ object_ac: 19, object_hp: 18, damage_threshold: 10, break_dc: 20, lock_dc: 15 }),
    ).toBe("AC 19 · 18 HP · Threshold 10 · Break DC 20 · Pick lock DC 15");
  });

  it("has no line for a feature with no object stats (an empty line would draw a blank paragraph)", () => {
    expect(objectStatLine(none)).toBeNull();
  });

  it("drops a lock DC nobody set instead of printing DC null", () => {
    expect(objectStatLine({ ...none, object_ac: 15, object_hp: 4 })).toBe("AC 15 · 4 HP");
  });

  it("drops an unset AC instead of printing AC null", () => {
    expect(objectStatLine({ ...none, object_hp: 18 })).toBe("18 HP");
  });

  it("drops an unset hit point total instead of printing null HP", () => {
    expect(objectStatLine({ ...none, object_ac: 17, lock_dc: 12 })).toBe("AC 17 · Pick lock DC 12");
  });

  it("drops an unset threshold instead of printing Threshold null", () => {
    expect(objectStatLine({ ...none, object_ac: 17, break_dc: 18 })).toBe("AC 17 · Break DC 18");
  });

  it("drops an unset break DC instead of printing Break DC null", () => {
    expect(objectStatLine({ ...none, damage_threshold: 5, lock_dc: 12 })).toBe("Threshold 5 · Pick lock DC 12");
  });

  it("keeps a stat when only that one is set", () => {
    expect(objectStatLine({ ...none, lock_dc: 10 })).toBe("Pick lock DC 10");
  });
});

describe("withObjectMaterial", () => {
  const blank = {
    object_material: null, object_size: null, object_ac: null, object_hp: null,
    damage_threshold: null, break_dc: null, lock_dc: null,
  };

  it("fills the book AC for the first material picked (DMG: wood 15)", () => {
    expect(withObjectMaterial(blank, "wood").object_ac).toBe(15);
  });

  // Bug: the AC filled only when empty, so Wood then Iron saved AC 15 instead of 19.
  it("moves the AC with the material while it is still the book's AC", () => {
    const wood = withObjectMaterial(blank, "wood");
    expect(withObjectMaterial(wood, "iron").object_ac).toBe(19);
  });

  it("keeps an AC the DM typed when the material changes", () => {
    const typed = { ...withObjectMaterial(blank, "wood"), object_ac: 17 };
    expect(withObjectMaterial(typed, "iron").object_ac).toBe(17);
  });

  // Bug: "Not an object" kept every stat, so the sheet still drew the Object block and its immunities.
  it("clears every object stat for Not an object", () => {
    const door = { ...withObjectMaterial(blank, "wood"), object_size: "medium" as const, object_hp: 18, damage_threshold: 5, break_dc: 15, lock_dc: 15 };
    expect(withObjectMaterial(door, null)).toEqual(blank);
  });
});
