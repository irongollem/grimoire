import { describe, expect, it } from "vitest";
import { findOfficialAsiFeature, withFeatureAtLevels } from "./asiFeature";
import type { ClassFeature } from "@/types/feature.types";

function row(over: Partial<ClassFeature>): ClassFeature {
  return { id: "x", user_id: null, name: "Ability Score Improvement", kind: "feature", ruleset: "2014", ...over } as ClassFeature;
}

describe("findOfficialAsiFeature", () => {
  const asi2014 = row({ id: "a14", ruleset: "2014" });
  const asi2024 = row({ id: "a24", ruleset: "2024" });
  const homebrew = row({ id: "mine", user_id: "u1" });

  it("picks the official row of the edition", () => {
    expect(findOfficialAsiFeature([homebrew, asi2014, asi2024], "2024")?.id).toBe("a24");
    expect(findOfficialAsiFeature([homebrew, asi2014, asi2024], "2014")?.id).toBe("a14");
  });

  it("ignores homebrew rows and other names", () => {
    expect(findOfficialAsiFeature([homebrew, row({ id: "o", name: "Second Wind" })], "2014")).toBeNull();
  });

  it("accepts a row with no edition for either", () => {
    expect(findOfficialAsiFeature([row({ id: "any", ruleset: null })], "2024")?.id).toBe("any");
  });

  it("is null for an edition it has no row for", () => {
    expect(findOfficialAsiFeature([asi2014], "2024")).toBeNull();
  });
});

describe("withFeatureAtLevels", () => {
  it("adds the feature at each level once and leaves other features alone", () => {
    const out = withFeatureAtLevels({ "4": ["x"], "8": ["asi"] }, "asi", [4, 8, 12]);
    expect(out).toEqual({ "4": ["x", "asi"], "8": ["asi"], "12": ["asi"] });
  });
});
