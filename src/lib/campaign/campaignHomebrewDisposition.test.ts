import { describe, it, expect } from "vitest";
import {
  hasScopedHomebrew,
  summarizeHomebrewCounts,
  planHomebrewDisposition,
  EMPTY_HOMEBREW_COUNTS,
  HOMEBREW_TABLES,
  type HomebrewCounts,
  type HomebrewKind,
} from "@/lib/campaign/campaignHomebrewDisposition";

/** Only the kinds a case cares about; the rest stay zero. Spelling out all six
 *  in every literal buries the one number under test. */
function counts(scoped: Partial<HomebrewCounts>): HomebrewCounts {
  return { ...EMPTY_HOMEBREW_COUNTS, ...scoped };
}

const ALL_KINDS = Object.keys(HOMEBREW_TABLES) as HomebrewKind[];

describe("hasScopedHomebrew", () => {
  it("is false when nothing is scoped to the campaign", () => {
    expect(hasScopedHomebrew(EMPTY_HOMEBREW_COUNTS)).toBe(false);
  });

  // Per kind rather than a sample: a kind left out of hasScopedHomebrew never
  // prompts the DM for a disposition, so the delete hits the NO ACTION FK.
  it.each(ALL_KINDS)("is true when only %s has scoped rows", (kind) => {
    expect(hasScopedHomebrew(counts({ [kind]: 1 }))).toBe(true);
  });
});

describe("summarizeHomebrewCounts", () => {
  it("returns an empty string when nothing is scoped", () => {
    expect(summarizeHomebrewCounts(EMPTY_HOMEBREW_COUNTS)).toBe("");
  });

  it("joins every non-zero kind in HOMEBREW_TABLES key order", () => {
    expect(summarizeHomebrewCounts(counts({ classes: 2, features: 4, monsters: 3 })))
      .toBe("2 classes, 4 features, 3 monsters");
  });

  it("omits kinds with a zero count", () => {
    expect(summarizeHomebrewCounts(counts({ subclasses: 1 }))).toBe("1 subclass");
  });

  it("pluralizes singular counts correctly for every kind", () => {
    const all = counts({ classes: 1, subclasses: 1, features: 1, monsters: 1, traps: 1, puzzles: 1, maps: 1, dungeonFeatures: 1 });
    expect(summarizeHomebrewCounts(all))
      .toBe("1 class, 1 subclass, 1 feature, 1 monster, 1 trap, 1 puzzle, 1 map, 1 dungeon feature");
  });

  it("pluralizes multi counts correctly for every kind", () => {
    const all = counts({ classes: 2, subclasses: 2, features: 2, monsters: 2, traps: 2, puzzles: 2, maps: 2, dungeonFeatures: 2 });
    expect(summarizeHomebrewCounts(all))
      .toBe("2 classes, 2 subclasses, 2 features, 2 monsters, 2 traps, 2 puzzles, 2 maps, 2 dungeon features");
  });
});

describe("planHomebrewDisposition", () => {
  it("returns no actions when nothing is scoped", () => {
    expect(planHomebrewDisposition(EMPTY_HOMEBREW_COUNTS, "delete")).toEqual([]);
    expect(planHomebrewDisposition(EMPTY_HOMEBREW_COUNTS, "promote")).toEqual([]);
  });

  it("plans only the kinds that actually have scoped rows", () => {
    expect(planHomebrewDisposition(counts({ classes: 2, features: 4 }), "promote")).toEqual([
      { kind: "classes", table: "custom_classes", disposition: "promote" },
      { kind: "features", table: "class_features", disposition: "promote" },
    ]);
  });

  it("maps each kind to its own table", () => {
    expect(planHomebrewDisposition(counts({ monsters: 1, traps: 1, puzzles: 1, maps: 1, dungeonFeatures: 1 }), "delete")).toEqual([
      { kind: "monsters", table: "monsters", disposition: "delete" },
      { kind: "traps", table: "traps", disposition: "delete" },
      // Kinds whose table name isn't its kind name.
      { kind: "puzzles", table: "puzzle_rooms", disposition: "delete" },
      { kind: "maps", table: "dungeon_maps", disposition: "delete" },
      { kind: "dungeonFeatures", table: "dungeon_features", disposition: "delete" },
    ]);
  });

  it("carries the chosen disposition through to every planned action", () => {
    const plan = planHomebrewDisposition(counts({ classes: 1, subclasses: 1, monsters: 1 }), "delete");
    expect(plan).toHaveLength(3);
    expect(plan.every((action) => action.disposition === "delete")).toBe(true);
  });
});
