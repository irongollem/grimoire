import { describe, it, expect } from "vitest";
import { resolveGeneratedCombatants, swapCombatantVersion } from "./resolveGeneratedCombatants";
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
    expect(result.matched[0]?.def).toMatchObject({
      monster_id: "m-goblin",
      npc_id: null,
      count: 2,
      faction_id: "enemy",
      custom_name: "Goblin (Leader)",
    });
    expect(result.matched[0]?.monster).toBe(goblin);
  });

  it("resolves a case-insensitive match", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "goblin" })],
      [goblin],
    );
    expect(result.unmatched).toEqual([]);
    expect(result.matched[0]?.def.monster_id).toBe("m-goblin");
  });

  it("resolves a plural against the singular library entry", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblins" })],
      [goblin],
    );
    expect(result.unmatched).toEqual([]);
    expect(result.matched[0]?.def.monster_id).toBe("m-goblin");
  });

  it("resolves punctuation variants via normalization", () => {
    const direWolf = makeMonster({ id: "m-dire-wolf", name: "Dire Wolf" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "dire-wolf" })],
      [direWolf],
    );
    expect(result.unmatched).toEqual([]);
    expect(result.matched[0]?.def.monster_id).toBe("m-dire-wolf");
  });

  it("does not falsely truncate a name that already ends in a meaningful 's'", () => {
    const goblinBoss = makeMonster({ id: "m-goblin-boss", name: "Goblin Boss" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin Boss" })],
      [goblinBoss],
    );
    expect(result.unmatched).toEqual([]);
    expect(result.matched[0]?.def.monster_id).toBe("m-goblin-boss");
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
    expect(result.matched[0]?.def.monster_id).toBe("m-homebrew");
  });

  it("exposes every same-tier version as a candidate, in bestiary order (#601)", () => {
    const blackflagGhost = makeMonster({ id: "m-bf", name: "Ghost", source: "blackflag" });
    const menagerieGhost = makeMonster({ id: "m-men", name: "Ghost", source: "menagerie" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Ghost" })],
      [blackflagGhost, menagerieGhost],
    );
    expect(result.matched[0]?.candidates.map((m) => m.id)).toEqual(["m-bf", "m-men"]);
    expect(result.matched[0]?.def.monster_id).toBe("m-bf");
  });

  it("reports a single candidate for an unambiguous name", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin" })],
      [goblin],
    );
    expect(result.matched[0]?.candidates).toEqual([goblin]);
  });

  it("only offers candidates from the winning tier, not looser tiers", () => {
    // "Goblin" hits the exact tier; the differently-cased row would only tie
    // at the case-insensitive tier and must not appear as a swap candidate.
    const exact = makeMonster({ id: "m-exact", name: "Goblin" });
    const cased = makeMonster({ id: "m-cased", name: "goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin" })],
      [exact, cased],
    );
    expect(result.matched[0]?.candidates.map((m) => m.id)).toEqual(["m-exact"]);
  });

  it("clamps count below the minimum up to 1", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin", count: 0 })],
      [goblin],
    );
    expect(result.matched[0]?.def.count).toBe(1);
  });

  it("clamps count above the maximum down to 20", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin", count: 99 })],
      [goblin],
    );
    expect(result.matched[0]?.def.count).toBe(20);
  });

  it("falls back to 1 for a NaN count", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin", count: NaN })],
      [goblin],
    );
    expect(result.matched[0]?.def.count).toBe(1);
  });

  it("falls back to 1 for a missing count (untrusted AI payload)", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const malformed = JSON.parse('{"name":"Goblin","role":""}') as EncounterCombatantAiResult;
    const result = resolveGeneratedCombatants([malformed], [goblin]);
    expect(result.matched[0]?.def.count).toBe(1);
  });

  it("builds custom_name from the role when present", () => {
    const goblin = makeMonster({ id: "m-goblin", name: "Goblin" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Goblin", role: "Archer" })],
      [goblin],
    );
    expect(result.matched[0]?.def.custom_name).toBe("Goblin (Archer)");
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
    expect(emptyResult.matched[0]?.def.custom_name).toBeNull();
    expect(whitespaceResult.matched[0]?.def.custom_name).toBeNull();
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
    expect(result.matched.map((c) => c.def.monster_id)).toEqual(["m-goblin", "m-dire-wolf"]);
    expect(result.unmatched).toEqual([beholder, mindFlayer]);
    // entryIndex is the position in the ORIGINAL AI array, not the matched
    // array — the panel keys version picks on it, so it must not renumber
    // when an entry in between fails (or later starts) to match.
    expect(result.matched.map((c) => c.entryIndex)).toEqual([0, 2]);
  });
});

describe("swapCombatantVersion", () => {
  const blackflagGhost = makeMonster({ id: "m-bf", name: "Ghost", source: "blackflag" });
  const menagerieGhost = makeMonster({ id: "m-men", name: "Ghost", source: "menagerie" });

  function makeAmbiguousMatch(role = "Haunter") {
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "Ghost", count: 3, role })],
      [blackflagGhost, menagerieGhost],
    );
    return result.matched[0]!;
  }

  it("swaps to the picked candidate and rebuilds the def around it", () => {
    const match = makeAmbiguousMatch();
    const swapped = swapCombatantVersion(match, "m-men");
    expect(swapped.monster).toBe(menagerieGhost);
    expect(swapped.def.monster_id).toBe("m-men");
    expect(swapped.def.custom_name).toBe("Ghost (Haunter)");
    expect(swapped.def.count).toBe(3);
    // The def id is the list key in the panel — a swap must not change it.
    expect(swapped.def.id).toBe(match.def.id);
    expect(swapped.candidates).toBe(match.candidates);
  });

  it("rebuilds custom_name around the newly picked monster's own spelling", () => {
    // Both tie at the normalized tier ("dire-wolf" → "direwolf"), but spell
    // their names differently — the swapped def must carry the new spelling.
    const spaced = makeMonster({ id: "m-spaced", name: "Dire Wolf" });
    const fused = makeMonster({ id: "m-fused", name: "Direwolf" });
    const result = resolveGeneratedCombatants(
      [makeAiCombatant({ name: "dire-wolf", role: "Alpha" })],
      [spaced, fused],
    );
    const swapped = swapCombatantVersion(result.matched[0]!, "m-fused");
    expect(swapped.def.custom_name).toBe("Direwolf (Alpha)");
  });

  it("returns the match unchanged for an id outside the candidate set", () => {
    const match = makeAmbiguousMatch();
    expect(swapCombatantVersion(match, "m-not-a-candidate")).toBe(match);
  });

  it("returns the match unchanged when picking the already-chosen version", () => {
    const match = makeAmbiguousMatch();
    expect(swapCombatantVersion(match, "m-bf")).toBe(match);
  });
});
