import { describe, expect, it } from "vitest";
import { combatant } from "../fightTestKit";
import { mageBlock } from "./spellTestKit";
import { reactionCastPlan, reactionTurnsHit, reactsByRules } from "./reactionCast";

describe("reactsByRules", () => {
  const member = (id: string) => ({ type: "player" as const, party_member_id: id });
  // APP CONVENTION: a party member's Reaction is the rules' only for an AI-played ally. Bugs caught: a player in a DM's fight (no one named) reacting
  // for themselves, the played character reacting, an ally who is not reacting, and a monster that cannot.
  it("fails if a person's Reaction is taken for them, or an ally's or a monster's is not", () => {
    expect(reactsByRules(member("pm-tam"), undefined)).toBe(false);
    expect(reactsByRules(member("pm-tam"), "pm-tam")).toBe(false);
    expect(reactsByRules(member("pm-tam"), "pm-pip")).toBe(true);
    expect(reactsByRules({ type: "player" }, "pm-pip")).toBe(false);
    expect(reactsByRules({ type: "monster" }, undefined)).toBe(true);
    expect(reactsByRules({ type: "monster", bystander: true }, undefined)).toBe(false);
  });
});

describe("reactionTurnsHit", () => {
  // Shield adds 5. AC 12 (the armour class the roll was made against), so AC 17 with it.
  // A total of 14 hit at 12 and misses at 17: cast. 16 misses at 17: cast. 17 still meets 17: no point. A natural 20 hits at any AC: no point.
  // Bugs caught: comparing against the bare AC (never casts), `<=` (casts on a total that still hits), the natural 20 not excepted.
  it("fails if the spell is cast when it cannot turn the hit, or not when it can", () => {
    const roll = (natural: number, total: number) => ({ natural, total, armorClass: 12 });
    expect(reactionTurnsHit(roll(10, 14), 5)).toBe(true);
    expect(reactionTurnsHit(roll(12, 16), 5)).toBe(true);
    expect(reactionTurnsHit(roll(13, 17), 5)).toBe(false);
    expect(reactionTurnsHit(roll(20, 15), 5)).toBe(false);
  });
});

describe("reactionCastPlan", () => {
  const mage = (uses: Record<string, { used: number; per_day: number }> = {}) => combatant("mage", { monster_id: "m-mage", hp: 40, max_hp: 40, action_uses: uses });
  // The mage lists "1st level (4 slots): magic missile, shield" and "3rd level (3 slots): counterspell, fireball" and "4th level (3 slots): ice storm". RULE spell-slots: the lowest slot of the spell's level
  // or higher. Bugs caught: the 3rd-level slot spent while a 1st is there, the spell cast with nothing left, an upcast that never looks past the listed level.
  it("fails if Shield is not cast from the lowest slot left, upcast when the 1st-level ones are spent, or refused when none are", () => {
    expect(reactionCastPlan(mage(), mageBlock(), "Shield", 1)).toMatchObject({ castLevel: 1, useKey: "slots/1", how: "slots" });
    const spent1 = { "slots/1": { used: 4, per_day: 4 } };
    expect(reactionCastPlan(mage(spent1), mageBlock(), "Shield", 1)).toMatchObject({ castLevel: 3, useKey: "slots/3" });
    expect(reactionCastPlan(mage({ ...spent1, "slots/3": { used: 3, per_day: 3 }, "slots/4": { used: 3, per_day: 3 } }), mageBlock(), "Shield", 1)).toBeNull();
  });

  // Bug caught: a creature that does not list Shield casting it.
  it("fails if a creature that does not list the spell is given a cast of it", () => {
    expect(reactionCastPlan(mage(), mageBlock(), "Hold Person", 2)).toBeNull();
  });
});
