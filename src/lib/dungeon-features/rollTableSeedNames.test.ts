import { describe, expect, it } from "vitest";
import { missingSeeds, seedNameKey } from "./rollTableSeedNames";
import { ROLL_TABLE_SEEDS } from "@/data/rollTableSeeds";

describe("missingSeeds", () => {
  it("treats a table populated under an older punctuation of its name as present", () => {
    const existing = ["Dungeon Level 1–2 — Wandering", "Forest Road — Daytime"];
    const names = missingSeeds(ROLL_TABLE_SEEDS, existing).map((seed) => seed.name);
    expect(names).not.toContain("Dungeon Level 1–2: Wandering");
    expect(names).not.toContain("Forest Road: Daytime");
    expect(names).toContain("Underdark Patrol");
  });

  it("returns every seed for a DM with none, and none for a DM with all", () => {
    expect(missingSeeds(ROLL_TABLE_SEEDS, [])).toHaveLength(ROLL_TABLE_SEEDS.length);
    expect(missingSeeds(ROLL_TABLE_SEEDS, ROLL_TABLE_SEEDS.map((seed) => seed.name))).toEqual([]);
  });

  it("still tells genuinely different names apart", () => {
    expect(seedNameKey("Forest Road: Daytime")).not.toBe(seedNameKey("Forest Road: Night"));
    expect(seedNameKey("Dungeon Level 1–2")).not.toBe(seedNameKey("Dungeon Level 12"));
  });
});
