import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, normalizeRuleset, RULESET_KEYS } from "./ruleset.types";

describe("campaign ruleset normalization", () => {
  it("defaults missing, legacy, and invalid values to 2014", () => {
    expect(DEFAULT_RULESET).toBe("2014");
    expect(normalizeRuleset(null)).toBe("2014");
    expect(normalizeRuleset(undefined)).toBe("2014");
    expect(normalizeRuleset("legacy")).toBe("2014");
  });

  it("accepts only the shared campaign editions", () => {
    expect(RULESET_KEYS).toEqual(["2014", "2024"]);
    expect(normalizeRuleset("2014")).toBe("2014");
    expect(normalizeRuleset("2024")).toBe("2024");
  });
});

