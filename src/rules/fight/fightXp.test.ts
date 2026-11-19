import { describe, expect, it } from "vitest";
import { fightXp } from "./fightXp";
import { combatant, pc } from "./fightTestKit";
import type { RunCombatant } from "@/types/encounter.types";

// The default sides: the party and its allies against the enemy, a neutral nobody's foe.
const FACTIONS = [
  { id: "players", hostile_to: ["enemy"] },
  { id: "enemy", hostile_to: ["players", "ally"] },
  { id: "ally", hostile_to: ["enemy"] },
  { id: "neutral", hostile_to: [] },
];
const CR: Record<string, string> = { goblin: "1/4", ogre: "2", bandit: "1/8" };
const crOf = (c: Pick<RunCombatant, "monster_id" | "npc_id">) => CR[c.monster_id ?? c.npc_id ?? ""] ?? null;

const hero = (id: string, over: Partial<RunCombatant> = {}) => pc(id, { faction_id: "players", ...over });
const foe = (id: string, kind: string, hp: number, over: Partial<RunCombatant> = {}) =>
  combatant(id, { faction_id: "enemy", monster_id: kind, hp, ...over });

describe("fightXp", () => {
  // DMG 2014 ch. 8 "Experience Points": an ogre (CR 2) is 450 XP and two goblins (CR 1/4) 50 each, so 550 between
  // three characters is 183 each, the third of a point dropped.
  it("adds each defeated foe's challenge-rating XP and divides it equally among the party", () => {
    const award = fightXp(
      [hero("a"), hero("b"), hero("c"), foe("o", "ogre", 0), foe("g1", "goblin", 0), foe("g2", "goblin", -3)],
      FACTIONS,
      crOf,
    );
    expect(award).toEqual({ total: 550, each: 183, memberIds: ["pm-a", "pm-b", "pm-c"] });
  });

  it("drops a half point rather than rounding it up: 450 between four is 112 each", () => {
    expect(fightXp([hero("a"), hero("b"), hero("c"), hero("d"), foe("o", "ogre", 0)], FACTIONS, crOf)?.each).toBe(112);
  });

  it("a foe still standing at the end is not counted (the DM awards one that fled by hand)", () => {
    expect(fightXp([hero("a"), foe("o", "ogre", 1), foe("g", "goblin", 0)], FACTIONS, crOf)?.total).toBe(50);
  });

  it("an ally, a neutral or a bystander brought down is worth nothing", () => {
    const award = fightXp(
      [
        hero("a"),
        foe("x", "ogre", 0, { faction_id: "ally" }),
        foe("y", "ogre", 0, { faction_id: "neutral" }),
        foe("z", "ogre", 0, { bystander: true }),
      ],
      FACTIONS,
      crOf,
    );
    expect(award).toBeNull();
  });

  it("a character at 0 hit points still takes a share; a companion takes none", () => {
    const award = fightXp(
      [hero("a", { hp: 0 }), hero("b"), pc("wolf", { faction_id: "players", party_member_id: undefined, companion_id: "c1" }), foe("o", "ogre", 0)],
      FACTIONS,
      crOf,
    );
    expect(award).toEqual({ total: 450, each: 225, memberIds: ["pm-a", "pm-b"] });
  });

  it("an NPC foe is worth its challenge rating too", () => {
    expect(fightXp([hero("a"), foe("n", "", 0, { monster_id: undefined, npc_id: "bandit" })], FACTIONS, crOf)?.total).toBe(25);
  });

  it("a fight with no party member in it awards nothing", () => {
    expect(fightXp([foe("o", "ogre", 0)], FACTIONS, crOf)).toBeNull();
  });
});
