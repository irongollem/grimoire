import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, normalizeRuleset } from "./ruleset.types";

describe("campaign ruleset normalization", () => {
  it("defaults missing, legacy, and invalid values to 2014", () => {
    expect(DEFAULT_RULESET).toBe("2014");
    expect(normalizeRuleset(null)).toBe("2014");
    expect(normalizeRuleset(undefined)).toBe("2014");
    expect(normalizeRuleset("legacy")).toBe("2014");
    expect(normalizeRuleset("2025")).toBe("2014");
    expect(normalizeRuleset("")).toBe("2014");
  });

  it("keeps either shared campaign edition as it is", () => {
    expect(normalizeRuleset("2014")).toBe("2014");
    expect(normalizeRuleset("2024")).toBe("2024");
  });
});

