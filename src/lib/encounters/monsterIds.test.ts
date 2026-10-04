import { describe, expect, it } from "vitest";
import { encounterMonsterIds } from "@/lib/encounters/monsterIds";

describe("encounterMonsterIds", () => {
  it("collects combatant and companion source monsters once each", () => {
    const ids = encounterMonsterIds(
      [{ monster_id: "a" }, { monster_id: null }, { monster_id: "a" }, { monster_id: "b" }],
      [{ source_monster_id: "c" }, { source_monster_id: null }, { source_monster_id: "b" }],
    );
    expect(ids.sort()).toEqual(["a", "b", "c"]);
  });

  it("is empty with nothing to read", () => {
    expect(encounterMonsterIds([])).toEqual([]);
  });
});
