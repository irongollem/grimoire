import { describe, it, expect } from "vitest";
import { placementKind, type LocationPlacement } from "./locationPlacement.types";

type TargetCols = Pick<LocationPlacement, "trap_id" | "dungeon_feature_id" | "roll_table_id" | "loot_table_id">;

function row(overrides: Partial<TargetCols> = {}): TargetCols {
  return {
    trap_id: null,
    dungeon_feature_id: null,
    roll_table_id: null,
    loot_table_id: null,
    ...overrides,
  };
}

describe("placementKind (#788)", () => {
  it("resolves a trap placement", () => {
    expect(placementKind(row({ trap_id: "t1" }))).toBe("trap");
  });

  it("resolves a dungeon feature placement", () => {
    expect(placementKind(row({ dungeon_feature_id: "f1" }))).toBe("dungeon_feature");
  });

  it("resolves a roll table placement", () => {
    expect(placementKind(row({ roll_table_id: "r1" }))).toBe("roll_table");
  });

  it("resolves a loot table placement", () => {
    expect(placementKind(row({ loot_table_id: "l1" }))).toBe("loot_table");
  });

  it("throws for a row with no target set, rather than guessing", () => {
    expect(() => placementKind(row())).toThrow(/no target set/i);
  });
});
