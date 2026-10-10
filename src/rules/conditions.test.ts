import { describe, it, expect } from "vitest";
import {
  getConditions,
  getCondition,
  getConditionDescription,
  getConditionShort,
  hasAttackDisadvantage,
  hasCheckDisadvantage,
  hasSaveDisadvantage,
  getExhaustionD20Penalty,
  getExhaustionSpeedPenaltyFt,
  getExhaustionLevel,
  setExhaustionLevel,
  isExhaustion,
  EXHAUSTION,
  hasCondition,
  findCondition,
  conditionNames,
  withCondition,
  withoutCondition,
  sameConditions,
  MAX_EXHAUSTION,
} from "@/rules/conditions";

describe("hasSaveDisadvantage", () => {
  it("gives no disadvantage with no relevant conditions", () => {
    expect(hasSaveDisadvantage([], "dex", "2014")).toBe(false);
    expect(hasSaveDisadvantage([{ name: "Poisoned" }], "con", "2014")).toBe(false);
  });

  it("Restrained → disadvantage on DEX saves only (both editions)", () => {
    expect(hasSaveDisadvantage([{ name: "Restrained" }], "dex", "2014")).toBe(true);
    expect(hasSaveDisadvantage([{ name: "Restrained" }], "str", "2014")).toBe(false);
    expect(hasSaveDisadvantage([{ name: "Restrained" }], "con", "2014")).toBe(false);
    expect(hasSaveDisadvantage([{ name: "Restrained" }], "dex", "2024")).toBe(true);
  });

  it("2014 (default): Exhaustion 3+ → disadvantage on ALL saves", () => {
    expect(hasSaveDisadvantage([{ name: "Exhaustion", level: 3 }], "wis", "2014")).toBe(true);
    expect(hasSaveDisadvantage([{ name: "Exhaustion", level: 5 }], "dex", "2014")).toBe(true);
    expect(hasSaveDisadvantage([{ name: "Exhaustion", level: 3 }], "wis", "2014")).toBe(true);
  });

  it("2014: Exhaustion below 3 → no save disadvantage", () => {
    expect(hasSaveDisadvantage([{ name: "Exhaustion", level: 2 }], "wis", "2014")).toBe(false);
  });

  it("2024: Exhaustion never causes save disadvantage (numeric penalty instead)", () => {
    expect(hasSaveDisadvantage([{ name: "Exhaustion", level: 3 }], "wis", "2024")).toBe(false);
    expect(hasSaveDisadvantage([{ name: "Exhaustion", level: 6 }], "con", "2024")).toBe(false);
  });

  it("is case-insensitive on the ability key", () => {
    expect(hasSaveDisadvantage([{ name: "Restrained" }], "DEX", "2014")).toBe(true);
  });
});

describe("hasAttackDisadvantage", () => {
  it("base condition set applies under both editions", () => {
    expect(hasAttackDisadvantage([{ name: "Blinded" }], "2014")).toBe(true);
    expect(hasAttackDisadvantage([{ name: "Blinded" }], "2024")).toBe(true);
    expect(hasAttackDisadvantage([], "2014")).toBe(false);
  });

  it("2014 (default): Exhaustion 3+ also imposes attack disadvantage", () => {
    expect(hasAttackDisadvantage([{ name: "Exhaustion", level: 3 }], "2014")).toBe(true);
    expect(hasAttackDisadvantage([{ name: "Exhaustion", level: 1 }], "2014")).toBe(false);
  });

  it("2024: Exhaustion never causes attack disadvantage", () => {
    expect(hasAttackDisadvantage([{ name: "Exhaustion", level: 3 }], "2024")).toBe(false);
    expect(hasAttackDisadvantage([{ name: "Exhaustion", level: 6 }], "2024")).toBe(false);
  });
});

describe("hasCheckDisadvantage", () => {
  it("base condition set applies under both editions", () => {
    expect(hasCheckDisadvantage([{ name: "Frightened" }], "2014")).toBe(true);
    expect(hasCheckDisadvantage([{ name: "Frightened" }], "2024")).toBe(true);
  });

  it("2014 (default): any Exhaustion level gives check disadvantage", () => {
    expect(hasCheckDisadvantage([{ name: "Exhaustion", level: 1 }], "2014")).toBe(true);
    expect(hasCheckDisadvantage([], "2014")).toBe(false);
  });

  it("2024: Exhaustion never causes check disadvantage", () => {
    expect(hasCheckDisadvantage([{ name: "Exhaustion", level: 1 }], "2024")).toBe(false);
    expect(hasCheckDisadvantage([{ name: "Exhaustion", level: 6 }], "2024")).toBe(false);
  });
});

describe("exhaustion models — 2014 (disadvantage tiers) vs 2024 (flat penalty)", () => {
  it("2014: getExhaustionD20Penalty and getExhaustionSpeedPenaltyFt are always 0 (that edition uses disadvantage flags instead)", () => {
    for (const level of [1, 3, 6]) {
      const conditions = [{ name: "Exhaustion", level }];
      expect(getExhaustionD20Penalty(conditions, "2014")).toBe(0);
      expect(getExhaustionD20Penalty(conditions, "2014")).toBe(0);
      expect(getExhaustionSpeedPenaltyFt(conditions, "2014")).toBe(0);
    }
  });

  it("2024: getExhaustionD20Penalty is a flat −2 per level", () => {
    expect(getExhaustionD20Penalty([{ name: "Exhaustion", level: 1 }], "2024")).toBe(-2);
    expect(getExhaustionD20Penalty([{ name: "Exhaustion", level: 3 }], "2024")).toBe(-6);
    expect(getExhaustionD20Penalty([{ name: "Exhaustion", level: 6 }], "2024")).toBe(-12);
    expect(getExhaustionD20Penalty([], "2024")).toBe(0);
  });

  it("2024: getExhaustionSpeedPenaltyFt is a flat −5 ft per level", () => {
    expect(getExhaustionSpeedPenaltyFt([{ name: "Exhaustion", level: 1 }], "2024")).toBe(5);
    expect(getExhaustionSpeedPenaltyFt([{ name: "Exhaustion", level: 3 }], "2024")).toBe(15);
    expect(getExhaustionSpeedPenaltyFt([{ name: "Exhaustion", level: 6 }], "2024")).toBe(30);
  });

  it("MAX_EXHAUSTION is 6 for both editions", () => {
    expect(MAX_EXHAUSTION).toBe(6);
  });

  it("exhaustion level storage/parsing is edition-agnostic", () => {
    expect(isExhaustion({ name: "Exhaustion", level: 3 })).toBe(true);
    expect(isExhaustion({ name: "Poisoned" })).toBe(false);
    expect(getExhaustionLevel([{ name: "Exhaustion", level: 4 }])).toBe(4);
    expect(setExhaustionLevel([], 6)).toEqual([{ name: "Exhaustion", level: 6 }]);
    expect(setExhaustionLevel([{ name: "Exhaustion", level: 6 }], 7)).toEqual([{ name: "Exhaustion", level: 6 }]); // clamped
  });
});

describe("getConditions / getCondition resolver", () => {
  it("returns all 16 conditions (15 SRD + Hidden) for both editions", () => {
    expect(getConditions("2014")).toHaveLength(16);
    expect(getConditions("2024")).toHaveLength(16);
  });

  it("defaults to 2014", () => {
    expect(getConditions("2014")).toEqual(getConditions("2014"));
    expect(getCondition("Blinded", "2014")).toEqual(getCondition("Blinded", "2014"));
  });

  it("2014 text is the SRD 5.1 per-level exhaustion table", () => {
    const cond = getCondition("Exhaustion", "2014");
    expect(cond?.description).toContain("Level 1");
    expect(cond?.description).toContain("Level 6");
  });

  it("2024 text (from the patch layer) is the SRD 5.2 uniform-penalty model", () => {
    const cond = getCondition("Exhaustion", "2024");
    expect(cond?.description).toContain("D20 Test");
    expect(cond?.description).not.toContain("Level 1");
  });

  it("patch layer wins: 2024 Exhaustion comes from CONDITION_PATCHES, not an empty base array", () => {
    // SRD_CONDITIONS_2024 is currently empty (open5e-api#793) — if getCondition
    // still resolves a full entry, the patch layer applied.
    const cond = getCondition("Exhaustion", "2024");
    expect(cond).toBeDefined();
    expect(cond?.effects.length).toBeGreaterThan(0);
  });

  it("resolves Exhaustion directly, for both editions", () => {
    expect(getCondition("Exhaustion", "2014")?.id).toBe("exhaustion");
    expect(getCondition("Exhaustion", "2024")?.id).toBe("exhaustion");
  });

  it("no longer resolves the retired \"Exhaustion\" string", () => {
    expect(getCondition("Exhausted 3", "2014")).toBeUndefined();
  });

  it("returns undefined for an unknown condition name", () => {
    expect(getCondition("Not A Condition", "2014")).toBeUndefined();
  });
});

describe("getConditionDescription", () => {
  it("injects the level header for Exhaustion under both editions", () => {
    expect(getConditionDescription(EXHAUSTION, "2014", 2)).toContain("level 2 of 6");
    expect(getConditionDescription(EXHAUSTION, "2024", 2)).toContain("level 2 of 6");
  });

  it("2014 and 2024 text differ for a condition whose wording changed (Exhaustion)", () => {
    const text2014 = getConditionDescription(EXHAUSTION, "2014", 3);
    const text2024 = getConditionDescription(EXHAUSTION, "2024", 3);
    expect(text2014).not.toBe(text2024);
  });

  it("falls back to the raw name for an unknown condition", () => {
    expect(getConditionDescription("Not A Condition", "2014")).toBe("Not A Condition");
  });
});

describe("getConditionShort", () => {
  it("2014 Exhaustion returns the matching per-level bullet", () => {
    expect(getConditionShort(EXHAUSTION, "2014", 2)).toContain("Speed halved");
  });

  it("2024 Exhaustion returns the computed uniform penalty summary", () => {
    expect(getConditionShort(EXHAUSTION, "2024", 3)).toBe("−6 to all d20 Tests, −15 ft Speed");
  });
});

describe("condition record helpers", () => {
  const src = { id: "vex", spell: "Hold Person" };

  it("hasCondition / findCondition / conditionNames read by name", () => {
    const list = [{ name: "Prone" }, { name: "Stunned", source: src }];
    expect(hasCondition(list, "Prone")).toBe(true);
    expect(hasCondition(list, "Blinded")).toBe(false);
    expect(findCondition(list, "Stunned")?.source).toEqual(src);
    expect(findCondition(list, "Blinded")).toBeUndefined();
    expect(conditionNames(list)).toEqual(["Prone", "Stunned"]);
  });

  it("withCondition replaces the same-named record in place", () => {
    const list = [{ name: "Prone" }, { name: "Stunned" }, { name: "Blinded" }];
    const next = withCondition(list, { name: "Stunned", source: src });
    expect(next).toEqual([{ name: "Prone" }, { name: "Stunned", source: src }, { name: "Blinded" }]);
    expect(list[1]).toEqual({ name: "Stunned" }); // input untouched
  });

  it("withCondition appends a new name", () => {
    expect(withCondition([{ name: "Prone" }], { name: "Blinded" })).toEqual([
      { name: "Prone" },
      { name: "Blinded" },
    ]);
  });

  it("withoutCondition drops by name", () => {
    expect(withoutCondition([{ name: "Prone" }, { name: "Blinded" }], "Prone")).toEqual([
      { name: "Blinded" },
    ]);
  });

  it("sameConditions compares records and order", () => {
    expect(sameConditions([{ name: "A" }, { name: "B" }], [{ name: "A" }, { name: "B" }])).toBe(true);
    expect(sameConditions([{ name: "A" }, { name: "B" }], [{ name: "B" }, { name: "A" }])).toBe(false);
    expect(sameConditions([{ name: "A" }], [{ name: "A", level: 1 }])).toBe(false);
    expect(sameConditions([{ name: "A" }], [])).toBe(false);
  });

  it("getExhaustionLevel is 0 when absent", () => {
    expect(getExhaustionLevel([{ name: "Prone" }])).toBe(0);
  });

  it("setExhaustionLevel keeps position and other fields", () => {
    const list = [
      { name: "Prone" },
      { name: "Exhaustion", level: 2, source: src },
      { name: "Blinded" },
    ];
    expect(setExhaustionLevel(list, 3)).toEqual([
      { name: "Prone" },
      { name: "Exhaustion", level: 3, source: src },
      { name: "Blinded" },
    ]);
  });

  it("setExhaustionLevel 0 removes the record, and clamps below 0", () => {
    const list = [{ name: "Prone" }, { name: "Exhaustion", level: 2 }];
    expect(setExhaustionLevel(list, 0)).toEqual([{ name: "Prone" }]);
    expect(setExhaustionLevel(list, -4)).toEqual([{ name: "Prone" }]);
  });

  it("setExhaustionLevel appends when absent", () => {
    expect(setExhaustionLevel([{ name: "Prone" }], 1)).toEqual([
      { name: "Prone" },
      { name: "Exhaustion", level: 1 },
    ]);
  });
});
