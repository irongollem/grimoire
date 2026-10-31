import { describe, expect, it } from "vitest";
import { objectStatLine } from "./objectStats";

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
