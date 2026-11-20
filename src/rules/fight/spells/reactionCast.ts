// A creature the rules play casts a Reaction spell when it is hit (#1021 row 13): Shield. What is decided here is pure: whether the
// creature is one the rules play, whether the spell would be worth casting, and what the cast costs. The server performs the cast
// (`encounter-command/resolve.ts`); nothing here changes a fight.
//
// RULE shield (PHB 2014 and 2024 "Shield": a 1st-level spell with a Reaction casting time, "which you take when you are hit by an
// attack"; until the start of your next turn you have +5 to AC, including against the triggering attack).
// Pure and edge-importable (relative `.ts` imports only).

import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import { limitAvailability, type ActionLimit } from "../../encounterTurn.ts";
import { castableBy, slotLimitAt } from "./castLimit.ts";

/**
 * APP CONVENTION: whether the creature's Reaction is a choice the rules make. A monster, an NPC or a companion with a stat block always
 * is. A party member is only when the request names the member the person plays (`playedMemberId`) and it is someone else (an AI-played
 * ally); with no one named (a DM's own fight) every player is a person and chooses for themselves. A bystander never reacts.
 */
export function reactsByRules(c: Pick<RunCombatant, "type" | "party_member_id" | "bystander">, playedMemberId: string | undefined): boolean {
  if (c.bystander === true) return false;
  if (c.type !== "player") return true;
  return playedMemberId !== undefined && c.party_member_id !== undefined && c.party_member_id !== playedMemberId;
}

/**
 * APP CONVENTION: the Reaction is spent only when it saves something. The roll to hit was a hit; the spell is cast when the attack's
 * total falls short of the armour class plus what the spell adds (it turns this hit into a miss), and never on a natural 20, which
 * hits whatever the armour class (PHB 2014 ch. 9 "Rolling 20"), so the slot would be wasted.
 */
export function reactionTurnsHit(roll: { natural: number; total: number; armorClass: number }, bonus: number): boolean {
  return roll.natural !== 20 && roll.total < roll.armorClass + bonus;
}

export interface ReactionCast {
  /** The slot level the spell is cast at (the spell's own level for innate casting). */
  castLevel: number;
  /** Where the cast is tallied, null for at will. */
  useKey: string | null;
  limit: ActionLimit | null;
  /** How the block lists the spell: a slot is written to an ally's sheet, a daily use likewise. */
  how: "slots" | "per_day" | "at_will" | "cantrips";
}

/**
 * How the creature can cast `spell` now: it must list it, and have a slot (the lowest of the spell's level or higher, as a cast is
 * upcast when the first runs out) or a use left. Null when it does not list it or nothing is left to cast it with.
 * RULE spell-slots (PHB 2014 ch. 10 "Spell Slots": a spell is cast with a slot of its level or higher).
 */
export function reactionCastPlan(c: RunCombatant, block: MonsterStatBlock, spell: string, spellLevel: number): ReactionCast | null {
  const listed = castableBy(block, spell);
  if (listed === null) return null;
  const how = listed.group.frequency.kind;
  if (how !== "slots") {
    if (listed.useKey !== null && listed.limit !== null && !limitAvailability(c, listed.useKey, listed.limit).available) return null;
    return { castLevel: spellLevel, useKey: listed.useKey, limit: listed.limit, how };
  }
  // RULE spell-slots: any slot of the spell's own level or higher, whatever line of the block lists it (a spell listed under a higher
  // heading may still use a free lower slot of its own level). The listed line's tally serves its own level in the loop.
  for (let level = spellLevel; level <= 9; level++) {
    const at = level === listed.level ? { useKey: listed.useKey, limit: listed.limit } : slotLimitAt(block, level);
    if (at === null || at.useKey === null || at.limit === null) continue;
    if (limitAvailability(c, at.useKey, at.limit).available) return { castLevel: level, useKey: at.useKey, limit: at.limit, how };
  }
  return null;
}
