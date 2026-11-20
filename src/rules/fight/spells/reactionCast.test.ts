import { describe, expect, it } from "vitest";
import { combatant } from "../fightTestKit";
import { MAGE_SPELLCASTING, mageBlock } from "./spellTestKit";
import { reactionCastPlan, playerPlayedByRules, reactionTurnsHit, reactsByRules } from "./reactionCast";

describe("reactsByRules and playerPlayedByRules", () => {
  const member = (id: string) => ({ type: "player" as const, party_member_id: id });
  const who = (playedMemberId: string | undefined, ...standIns: string[]) => ({ playedMemberId, standIns: new Set(standIns) });
  // APP CONVENTION (#1021 rows 15 and 26): at the AI table every member but the played one is the rules'; in a DM's fight only the stand-ins.
  // Bugs caught: a player in a DM's fight who is no stand-in reacting for themselves, the played character reacting, an ally at the AI
  // table not reacting, and a monster that cannot.
  it("fails if a person's Reaction is taken for them, or an ally's or a monster's is not", () => {
    expect(reactsByRules(member("pm-tam"), who(undefined))).toBe(false);
    expect(reactsByRules(member("pm-tam"), who("pm-tam"))).toBe(false);
    expect(reactsByRules(member("pm-tam"), who("pm-pip"))).toBe(true);
    expect(reactsByRules({ type: "player" }, who("pm-pip"))).toBe(false);
    expect(reactsByRules({ type: "monster" }, who(undefined))).toBe(true);
    expect(reactsByRules({ type: "monster", bystander: true }, who(undefined))).toBe(false);
  });

  // Bug caught: the stand-in set ignored in a DM's fight (everyone or no one played), or consulted at the AI table (where the person
  // named is the only human, whoever the stand-ins are), or a stand-in with no member id (nothing to look up) played.
  it("plays exactly the stand-ins in a DM's fight, and everyone but the played one at the AI table", () => {
    expect(playerPlayedByRules("pm-tam", who(undefined, "pm-tam"))).toBe(true);
    expect(playerPlayedByRules("pm-pip", who(undefined, "pm-tam"))).toBe(false);
    expect(playerPlayedByRules("pm-pip", who("pm-tam", "pm-tam"))).toBe(true);
    expect(playerPlayedByRules("pm-tam", who("pm-tam", "pm-tam"))).toBe(false);
    expect(playerPlayedByRules(undefined, who(undefined, "pm-tam"))).toBe(false);
    expect(playerPlayedByRules(undefined, who("pm-pip"))).toBe(false);
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

  // RULE spell-slots (PHB 2014 ch. 10 "Spell Slots"): a spell is cast with a slot of its own level or higher, whatever heading lists it. A block
  // listing Shield under its 3rd-level line still has 1st-level slots: Shield takes a 1st, and once the 3rd-level slots are spent it still has
  // the 1st. Bugs caught (CodeRabbit on #1233): the search starting at the listed heading, so a 3rd-level slot is spent while a 1st is free, or
  // Shield is refused when only the 3rd-level ones are gone.
  it("fails if a spell listed under a higher heading cannot use a free slot of its own level", () => {
    const listedHigh = mageBlock({ special_abilities: [{ ...MAGE_SPELLCASTING, description: MAGE_SPELLCASTING.description.replace("magic missile, shield", "magic missile").replace("counterspell, fireball", "counterspell, fireball, shield") }] });
    expect(reactionCastPlan(mage(), listedHigh, "Shield", 1)).toMatchObject({ castLevel: 1, useKey: "slots/1" });
    expect(reactionCastPlan(mage({ "slots/3": { used: 3, per_day: 3 } }), listedHigh, "Shield", 1)).toMatchObject({ castLevel: 1 });
  });

  // Bug caught: a creature that does not list Shield casting it.
  it("fails if a creature that does not list the spell is given a cast of it", () => {
    expect(reactionCastPlan(mage(), mageBlock(), "Hold Person", 2)).toBeNull();
  });
});
