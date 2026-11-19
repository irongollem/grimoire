import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import { creatureKindOf, kindAllowed, kindLimitOf, kindPhrase } from "./creatureKind.ts";
import { holdPerson, holdPersonEffect } from "./spellTestKit.ts";

const who = (over: Partial<RunCombatant>): RunCombatant => ({
  instance_id: "c", type: "monster", name: "C", faction_id: "m", initiative: null, hp: 10, max_hp: 10, ac: "12", conditions: [], curses: [],
  death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 0, y: 0 }, size: "medium", ...over,
});
const SOURCES = { monsters: [{ id: "wolf", monster_type: "beast" }, { id: "bandit", monster_type: "Humanoid " }, { id: "blank", monster_type: "  " }, { id: "none" }] };

describe("creatureKindOf", () => {
  // Bug caught: the kind is read from the wrong row, or not at all, so every monster is "not known".
  it("is the monster row's type", () => {
    expect(creatureKindOf(who({ monster_id: "wolf" }), SOURCES)).toBe("beast");
  });

  // Bug caught: a comparison that is case or whitespace sensitive ("Humanoid " would then never match "humanoid").
  it("lower-cases and trims the type", () => {
    expect(creatureKindOf(who({ monster_id: "bandit" }), SOURCES)).toBe("humanoid");
  });

  // Bug caught: a player character is "not known", so Hold Person is left to the table against every PC.
  it("takes a player character for a humanoid", () => {
    expect(creatureKindOf(who({ type: "player", party_member_id: "pm" }), SOURCES)).toBe("humanoid");
  });

  // Bug caught: a kind guessed from an NPC's free-text race (an "elf" is not a creature kind of the rules).
  it("does not know an NPC or a companion with no monster row behind it", () => {
    expect(creatureKindOf(who({ npc_id: "n1" }), SOURCES)).toBeNull();
    expect(creatureKindOf(who({ companion_id: "k1" }), SOURCES)).toBeNull();
  });

  // Bug caught: a blank or missing type becomes the empty kind and is treated as a known, disallowed one (a refusal instead of the table's call).
  it("does not know a blank type, a missing type or a missing row", () => {
    expect(creatureKindOf(who({ monster_id: "blank" }), SOURCES)).toBeNull();
    expect(creatureKindOf(who({ monster_id: "none" }), SOURCES)).toBeNull();
    expect(creatureKindOf(who({ monster_id: "gone" }), SOURCES)).toBeNull();
  });
});

describe("kindLimitOf, kindAllowed, kindPhrase", () => {
  it("reads the limit from the condition effect, lower-cased, and none when there is none", () => {
    expect(kindLimitOf(holdPerson({ condition_effect: holdPersonEffect({ only_kinds: ["Humanoid"] }) }))).toEqual(["humanoid"]);
    expect(kindLimitOf(holdPerson())).toBeNull();
    expect(kindLimitOf(holdPerson({ condition_effect: null }))).toBeNull();
  });
  // Bug caught: an unknown kind counts as allowed, so a spell reaches a creature nobody can vouch for.
  it("never allows a kind that is not known", () => {
    expect(kindAllowed("humanoid", ["humanoid"])).toBe(true);
    expect(kindAllowed("beast", ["humanoid"])).toBe(false);
    expect(kindAllowed(null, ["humanoid"])).toBe(false);
  });
  it("words the kinds with the right article", () => {
    expect(kindPhrase(["humanoid"])).toBe("a humanoid");
    expect(kindPhrase(["undead", "beast"])).toBe("an undead or a beast");
  });
});
