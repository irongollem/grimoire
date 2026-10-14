import { describe, it, expect } from "vitest";
import {
  encounterTrapRefs,
  featureRefColumns,
  featureRefOf,
  isLibraryFeature,
  isLibraryId,
  isLibraryTrap,
  placementColumnFor,
  placementTargetId,
  shadowByName,
  splitTrapRefs,
} from "./library";
import type { DungeonFeatureEntry } from "@/types/dungeonFeature.types";
import type { TrapEntry } from "@/types/trap.types";

const UUID_A = "3f2b8a40-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const UUID_B = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";

describe("isLibraryId", () => {
  it("is false for a uuid and true for a slug", () => {
    expect(isLibraryId(UUID_A)).toBe(false);
    expect(isLibraryId("grimoire_hidden_pit")).toBe(true);
  });
});

describe("entry guards", () => {
  it("narrow by id shape", () => {
    expect(isLibraryTrap({ id: "grimoire_x" } as TrapEntry)).toBe(true);
    expect(isLibraryTrap({ id: UUID_A } as TrapEntry)).toBe(false);
    expect(isLibraryFeature({ id: "grimoire_x" } as DungeonFeatureEntry)).toBe(true);
    expect(isLibraryFeature({ id: UUID_A } as DungeonFeatureEntry)).toBe(false);
  });
});

describe("shadowByName", () => {
  it("hides a library row an own row shares a trimmed, case-insensitive name with", () => {
    const library = [{ name: "Hidden Pit" }, { name: "Poison Dart" }];
    const own = [{ name: " hidden pit " }, { name: "Zap" }];
    expect(shadowByName(library, own).map((r) => r.name)).toEqual([" hidden pit ", "Poison Dart", "Zap"]);
  });

  it("sorts library and own rows together by name", () => {
    expect(shadowByName([{ name: "Banana" }], [{ name: "Apple" }, { name: "Cherry" }]).map((r) => r.name))
      .toEqual(["Apple", "Banana", "Cherry"]);
  });

  it("returns the library untouched when there are no own rows", () => {
    expect(shadowByName([{ name: "A" }], [])).toEqual([{ name: "A" }]);
  });
});

describe("placementColumnFor", () => {
  it("routes by kind and id shape", () => {
    expect(placementColumnFor("trap", UUID_A)).toBe("trap_id");
    expect(placementColumnFor("trap", "grimoire_pit")).toBe("library_trap_id");
    expect(placementColumnFor("dungeon_feature", UUID_A)).toBe("dungeon_feature_id");
    expect(placementColumnFor("dungeon_feature", "grimoire_lever")).toBe("library_dungeon_feature_id");
  });
});

describe("placementTargetId", () => {
  const none = { trap_id: null, library_trap_id: null, dungeon_feature_id: null, library_dungeon_feature_id: null };
  it("reads whichever column holds the target", () => {
    expect(placementTargetId({ ...none, trap_id: UUID_A })).toBe(UUID_A);
    expect(placementTargetId({ ...none, library_trap_id: "g_t" })).toBe("g_t");
    expect(placementTargetId({ ...none, dungeon_feature_id: UUID_B })).toBe(UUID_B);
    expect(placementTargetId({ ...none, library_dungeon_feature_id: "g_f" })).toBe("g_f");
  });
  it("is null for a roll or loot placement", () => {
    expect(placementTargetId(none)).toBeNull();
  });
});

describe("splitTrapRefs", () => {
  it("splits, preserves order and drops duplicates", () => {
    expect(splitTrapRefs(["g_b", UUID_A, "g_a", UUID_A, "g_b", UUID_B])).toEqual({
      trap_ids: [UUID_A, UUID_B],
      library_trap_ids: ["g_b", "g_a"],
    });
  });
  it("handles an empty list", () => {
    expect(splitTrapRefs([])).toEqual({ trap_ids: [], library_trap_ids: [] });
  });
});

describe("encounterTrapRefs", () => {
  it("lists own then library", () => {
    expect(encounterTrapRefs({ trap_ids: [UUID_A], library_trap_ids: ["g_a"] })).toEqual([UUID_A, "g_a"]);
  });
});

describe("featureRefColumns / featureRefOf", () => {
  it("sets the right column and nulls the other", () => {
    expect(featureRefColumns(UUID_A)).toEqual({ dungeon_feature_id: UUID_A, library_dungeon_feature_id: null });
    expect(featureRefColumns("g_f")).toEqual({ dungeon_feature_id: null, library_dungeon_feature_id: "g_f" });
    expect(featureRefColumns(null)).toEqual({ dungeon_feature_id: null, library_dungeon_feature_id: null });
  });
  it("round-trips through featureRefOf", () => {
    for (const id of [UUID_A, "g_f", null]) expect(featureRefOf(featureRefColumns(id))).toBe(id);
  });
});
