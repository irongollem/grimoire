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
  MAX_EXHAUSTION,
} from "@/rules/conditions";

describe("hasSaveDisadvantage", () => {
  it("gives no disadvantage with no relevant conditions", () => {
    expect(hasSaveDisadvantage([], "dex")).toBe(false);
    expect(hasSaveDisadvantage(["Poisoned"], "con")).toBe(false);
  });

  it("Restrained → disadvantage on DEX saves only (both editions)", () => {
    expect(hasSaveDisadvantage(["Restrained"], "dex")).toBe(true);
    expect(hasSaveDisadvantage(["Restrained"], "str")).toBe(false);
    expect(hasSaveDisadvantage(["Restrained"], "con")).toBe(false);
    expect(hasSaveDisadvantage(["Restrained"], "dex", "2024")).toBe(true);
  });

  it("2014 (default): Exhaustion 3+ → disadvantage on ALL saves", () => {
    expect(hasSaveDisadvantage(["Exhaustion 3"], "wis")).toBe(true);
    expect(hasSaveDisadvantage(["Exhaustion 5"], "dex")).toBe(true);
    expect(hasSaveDisadvantage(["Exhaustion 3"], "wis", "2014")).toBe(true);
  });

  it("2014: Exhaustion below 3 → no save disadvantage", () => {
    expect(hasSaveDisadvantage(["Exhaustion 2"], "wis")).toBe(false);
  });

  it("2024: Exhaustion never causes save disadvantage (numeric penalty instead)", () => {
    expect(hasSaveDisadvantage(["Exhaustion 3"], "wis", "2024")).toBe(false);
    expect(hasSaveDisadvantage(["Exhaustion 6"], "con", "2024")).toBe(false);
  });

  it("is case-insensitive on the ability key", () => {
    expect(hasSaveDisadvantage(["Restrained"], "DEX")).toBe(true);
  });
});

describe("hasAttackDisadvantage", () => {
  it("base condition set applies under both editions", () => {
    expect(hasAttackDisadvantage(["Blinded"])).toBe(true);
    expect(hasAttackDisadvantage(["Blinded"], "2024")).toBe(true);
    expect(hasAttackDisadvantage([])).toBe(false);
  });

  it("2014 (default): Exhaustion 3+ also imposes attack disadvantage", () => {
    expect(hasAttackDisadvantage(["Exhaustion 3"])).toBe(true);
    expect(hasAttackDisadvantage(["Exhaustion 1"])).toBe(false);
  });

  it("2024: Exhaustion never causes attack disadvantage", () => {
    expect(hasAttackDisadvantage(["Exhaustion 3"], "2024")).toBe(false);
    expect(hasAttackDisadvantage(["Exhaustion 6"], "2024")).toBe(false);
  });
});

describe("hasCheckDisadvantage", () => {
  it("base condition set applies under both editions", () => {
    expect(hasCheckDisadvantage(["Frightened"])).toBe(true);
    expect(hasCheckDisadvantage(["Frightened"], "2024")).toBe(true);
  });

  it("2014 (default): any Exhaustion level gives check disadvantage", () => {
    expect(hasCheckDisadvantage(["Exhaustion 1"])).toBe(true);
    expect(hasCheckDisadvantage([])).toBe(false);
  });

  it("2024: Exhaustion never causes check disadvantage", () => {
    expect(hasCheckDisadvantage(["Exhaustion 1"], "2024")).toBe(false);
    expect(hasCheckDisadvantage(["Exhaustion 6"], "2024")).toBe(false);
  });
});

describe("exhaustion models — 2014 (disadvantage tiers) vs 2024 (flat penalty)", () => {
  it("2014: getExhaustionD20Penalty and getExhaustionSpeedPenaltyFt are always 0 (that edition uses disadvantage flags instead)", () => {
    for (const level of [1, 3, 6]) {
      const conditions = [`Exhausted ${level}`];
      expect(getExhaustionD20Penalty(conditions)).toBe(0);
      expect(getExhaustionD20Penalty(conditions, "2014")).toBe(0);
      expect(getExhaustionSpeedPenaltyFt(conditions, "2014")).toBe(0);
    }
  });

  it("2024: getExhaustionD20Penalty is a flat −2 per level", () => {
    expect(getExhaustionD20Penalty(["Exhausted 1"], "2024")).toBe(-2);
    expect(getExhaustionD20Penalty(["Exhausted 3"], "2024")).toBe(-6);
    expect(getExhaustionD20Penalty(["Exhausted 6"], "2024")).toBe(-12);
    expect(getExhaustionD20Penalty([], "2024")).toBe(0);
  });

  it("2024: getExhaustionSpeedPenaltyFt is a flat −5 ft per level", () => {
    expect(getExhaustionSpeedPenaltyFt(["Exhausted 1"], "2024")).toBe(5);
    expect(getExhaustionSpeedPenaltyFt(["Exhausted 3"], "2024")).toBe(15);
    expect(getExhaustionSpeedPenaltyFt(["Exhausted 6"], "2024")).toBe(30);
  });

  it("MAX_EXHAUSTION is 6 for both editions", () => {
    expect(MAX_EXHAUSTION).toBe(6);
  });

  it("exhaustion level storage/parsing is edition-agnostic", () => {
    expect(isExhaustion("Exhausted 3")).toBe(true);
    expect(getExhaustionLevel(["Exhausted 4"])).toBe(4);
    expect(setExhaustionLevel([], 6)).toEqual(["Exhausted 6"]);
    expect(setExhaustionLevel(["Exhausted 6"], 7)).toEqual(["Exhausted 6"]); // clamped
  });
});

describe("getConditions / getCondition resolver", () => {
  it("returns all 16 conditions (15 SRD + Hidden) for both editions", () => {
    expect(getConditions("2014")).toHaveLength(16);
    expect(getConditions("2024")).toHaveLength(16);
  });

  it("defaults to 2014", () => {
    expect(getConditions()).toEqual(getConditions("2014"));
    expect(getCondition("Blinded")).toEqual(getCondition("Blinded", "2014"));
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

  it("handles the Exhausted N storage format by falling back to the Exhaustion entry, for both editions", () => {
    expect(getCondition("Exhausted 3", "2014")?.id).toBe("exhaustion");
    expect(getCondition("Exhausted 3", "2024")?.id).toBe("exhaustion");
  });

  it("returns undefined for an unknown condition name", () => {
    expect(getCondition("Not A Condition", "2014")).toBeUndefined();
  });
});

describe("getConditionDescription", () => {
  it("injects the level header for Exhausted N under both editions", () => {
    expect(getConditionDescription("Exhausted 2", "2014")).toContain("level 2 of 6");
    expect(getConditionDescription("Exhausted 2", "2024")).toContain("level 2 of 6");
  });

  it("2014 and 2024 text differ for a condition whose wording changed (Exhaustion)", () => {
    const text2014 = getConditionDescription("Exhausted 3", "2014");
    const text2024 = getConditionDescription("Exhausted 3", "2024");
    expect(text2014).not.toBe(text2024);
  });

  it("falls back to the raw name for an unknown condition", () => {
    expect(getConditionDescription("Not A Condition")).toBe("Not A Condition");
  });
});

describe("getConditionShort", () => {
  it("2014 Exhausted N returns the matching per-level bullet", () => {
    expect(getConditionShort("Exhausted 2", "2014")).toContain("Speed halved");
  });

  it("2024 Exhausted N returns the computed uniform penalty summary", () => {
    expect(getConditionShort("Exhausted 3", "2024")).toBe("−6 to all d20 Tests, −15 ft Speed");
  });
});
