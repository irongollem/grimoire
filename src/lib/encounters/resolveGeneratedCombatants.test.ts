import { describe, it, expect } from "vitest";
import { resolveGeneratedCombatants } from "./resolveGeneratedCombatants";
import type { Monster } from "@/types/monster.types";
import type { EncounterCombatantAiResult } from "@/ai/types";

function makeMonster(overrides: Partial<Monster> & { id: string; name: string }): Monster {
  return {
    user_id: "",
    monster_type: "beast",
    size: "medium",
    alignment: "unaligned",
    habitat: null,
    source: null,
    tags: [],
    stat_block: {
      armor_class: 10,
      hit_points: "1d8",
      speed: "30 ft.",
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
      challenge_rating: "1/4",
    },
    notes: null,
    image_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeAiCombatant(
  overrides: Partial<EncounterCombatantAiResult> & { name: string },
): EncounterCombatantAiResult {
  return { count: 1, role: "", ...overrides };
}

describe("resolveGeneratedCombatants", () => {
  it("resolves an exact name match", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin", count: 2, role: "Leader" })],
      [goblin],
    );
    expect(result.unmatched).toEqual([]);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toMatchObject({
      monster_id: "m-goblin",
      npc_id: null,
      count: 2,
      faction_id: "enemy",
      custom_name: "Goblin (Leader)",
    });
  });

  it("resolves a case-insensitive match", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "goblin" })],
      [goblin],
    );
    expect(result.unmatched).toEqual([]);
    expect(result.matched[0]?.monster_id).toBe("m-goblin");
  });

  it("resolves a plural against the singular library entry", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblins" })],
      [goblin],
    );
    expect(result.unmatched).toEqual([]);
    expect(result.matched[0]?.monster_id).toBe("m-goblin");
  });

  it("resolves punctuation variants via normalization", () => {
    const direWolf = makeMonster({ id: "m-dire-wolf", name: "Dire Wolf" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "dire-wolf" })],
      [direWolf],
    );
    expect(result.unmatched).toEqual([]);
    expect(result.matched[0]?.monster_id).toBe("m-dire-wolf");
  });

  it("does not falsely truncate a name that already ends in a meaningful 's'", () => {
    const goblinBoss = makeMonster({ id: "m-goblin-boss", name: "Goblin Boss" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin Boss" })],
      [goblinBoss],
    );
    expect(result.unmatched).toEqual([]);
    expect(result.matched[0]?.monster_id).toBe("m-goblin-boss");
  });

  it("puts an unmatched name in unmatched and emits no matched entry", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const entry = makeAiCombatant({ name: "Beholder" });
    const result = resolveGeneratedCombatants([entry], [goblin]);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual([entry]);
  });

  it("prefers a user-created monster over a same-named library monster", () => {
    const libraryGoblin = makeMonster({ id: "m-library", name: "Goblin", user_id: "" });
    const homebrewGoblin = makeMonster({ id: "m-homebrew", name: "Goblin", user_id: "user-123" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin" })],
      [libraryGoblin, homebrewGoblin],
    );
    expect(result.matched[0]?.monster_id).toBe("m-homebrew");
  });

  it("clamps count below the minimum up to 1", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin", count: 0 })],
      [goblin],
    );
    expect(result.matched[0]?.count).toBe(1);
  });

  it("clamps count above the maximum down to 20", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin", count: 99 })],
      [goblin],
    );
    expect(result.matched[0]?.count).toBe(20);
  });

  it("falls back to 1 for a NaN count", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin", count: NaN })],
      [goblin],
    );
    expect(result.matched[0]?.count).toBe(1);
  });

  it("falls back to 1 for a missing count (untrusted AI payload)", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const malformed = JSON.parse('{"name":"Goblin","role":""}') as EncounterCombatantAiResult;
    const result = resolveGeneratedCombatants([malformed], [goblin]);
    expect(result.matched[0]?.count).toBe(1);
  });

  it("builds custom_name from the role when present", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin", role: "Archer" })],
      [goblin],
    );
    expect(result.matched[0]?.custom_name).toBe("Goblin (Archer)");
  });

  it("leaves custom_name null when the role is empty or whitespace", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const emptyResult = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin", role: "" })],
      [goblin],
    );
    const whitespaceResult = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin", role: "   " })],
      [goblin],
    );
    expect(emptyResult.matched[0]?.custom_name).toBeNull();
    expect(whitespaceResult.matched[0]?.custom_name).toBeNull();
  });

  it("returns both arrays correctly and preserves input order for a mixed batch", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const direWolf = makeMonster({ id: "m-dire-wolf", name: "Dire Wolf" });
    const beholder = makeAiCombatant({ name: "Beholder" });
    const mindFlayer = makeAiCombatant({ name: "Mind Flayer" });
    const result = resolveGeneratedCombatants(
      [
        makeAiCombatant({ name: "Goblin", count: 3, role: "Grunt" }),
        beholder,
        makeAiCombatant({ name: "dire-wolf", count: 1 }),
        mindFlayer,
      ],
      [goblin, direWolf],
    );
    expect(result.matched.map((c) => c.monster_id)).toEqual(["m-goblin", "m-dire-wolf"]);
    expect(result.unmatched).toEqual([beholder, mindFlayer]);
  });
});
