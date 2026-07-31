import { describe, it, expect } from "vitest";
import {
  hasScopedHomebrew,
  summarizeHomebrewCounts,
  planHomebrewDisposition,
  EMPTY_HOMEBREW_COUNTS,
  type HomebrewCounts,
} from "@/lib/campaignHomebrewDisposition";

describe("hasScopedHomebrew", () => {
  it("is false when nothing is scoped to the campaign", () => {
    expect(hasScopedHomebrew(EMPTY_HOMEBREW_COUNTS)).toBe(false);
  });

  it("is true when any single kind has scoped rows", () => {
    expect(hasScopedHomebrew({ classes: 1, subclasses: 0, features: 0 })).toBe(true);
    expect(hasScopedHomebrew({ classes: 0, subclasses: 1, features: 0 })).toBe(true);
    expect(hasScopedHomebrew({ classes: 0, subclasses: 0, features: 1 })).toBe(true);
  });
});

describe("summarizeHomebrewCounts", () => {
  it("returns an empty string when nothing is scoped", () => {
    expect(summarizeHomebrewCounts(EMPTY_HOMEBREW_COUNTS)).toBe("");
  });

  it("joins every non-zero kind, classes/subclasses/features order", () => {
    const counts: HomebrewCounts = { classes: 2, subclasses: 1, features: 4 };
    expect(summarizeHomebrewCounts(counts)).toBe("2 classes, 1 subclass, 4 features");
  });

  it("omits kinds with a zero count", () => {
    const counts: HomebrewCounts = { classes: 0, subclasses: 1, features: 0 };
    expect(summarizeHomebrewCounts(counts)).toBe("1 subclass");
  });

  it("pluralizes singular counts correctly for every kind", () => {
    const counts: HomebrewCounts = { classes: 1, subclasses: 1, features: 1 };
    expect(summarizeHomebrewCounts(counts)).toBe("1 class, 1 subclass, 1 feature");
  });

  it("pluralizes multi counts correctly for every kind", () => {
    const counts: HomebrewCounts = { classes: 2, subclasses: 2, features: 2 };
    expect(summarizeHomebrewCounts(counts)).toBe("2 classes, 2 subclasses, 2 features");
  });
});

describe("planHomebrewDisposition", () => {
  it("returns no actions when nothing is scoped", () => {
    expect(planHomebrewDisposition(EMPTY_HOMEBREW_COUNTS, "delete")).toEqual([]);
    expect(planHomebrewDisposition(EMPTY_HOMEBREW_COUNTS, "promote")).toEqual([]);
  });

  it("plans only the kinds that actually have scoped rows", () => {
    const counts: HomebrewCounts = { classes: 2, subclasses: 0, features: 4 };
    expect(planHomebrewDisposition(counts, "promote")).toEqual([
      { kind: "classes", table: "custom_classes", disposition: "promote" },
      { kind: "features", table: "class_features", disposition: "promote" },
    ]);
  });

  it("carries the chosen disposition through to every planned action", () => {
    const counts: HomebrewCounts = { classes: 1, subclasses: 1, features: 1 };
    const plan = planHomebrewDisposition(counts, "delete");
    expect(plan).toHaveLength(3);
    expect(plan.every((action) => action.disposition === "delete")).toBe(true);
  });
});
