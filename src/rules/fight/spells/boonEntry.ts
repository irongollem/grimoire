// A boon spell turned into what one cast gives (#1021): the numbers each target gains (`SpellGrants`), how many creatures, what the
// cast costs and how long it lasts. Nothing is rolled here; `cast_spell` puts the boon on its targets and the tactics weigh it.
// Pure and edge-importable (relative `.ts` imports only).
//
// How a boon is known: the library's structured `effects`, a `text` effect carrying `grants` (`SpellGrants`), never the spell's prose.
// RULE bless (PHB 2014 and 2024 "Bless": up to three creatures within 30 feet, a d4 on attack rolls and saving throws, Concentration
// up to 1 minute; "one additional creature for each slot level above 1st") and RULE shield-of-faith (PHB 2014 and 2024 "Shield of
// Faith": one creature within 60 feet, +2 AC, a Bonus Action, Concentration up to 10 minutes) are carried by their rows' `grants`.
// RULE casting-time: as for a heal (`castSlotOf`), only an Action or a Bonus Action is cast in a fight.

import type { ConditionGrants } from "../../../types/condition.types.ts";
import type { SpellGrants } from "../../../types/spell.types.ts";
import { boonDie } from "../boons.ts";
import { castSlotOf, type CastSlot } from "./healEntry.ts";
import type { SpellRecord } from "./spellChoice.ts";

export interface BoonPlan {
  boonable: true;
  /** What each target gains, as its condition carries it. */
  grants: ConditionGrants;
  /** How many creatures one cast reaches at this slot level (Bless at 2nd level: 4). */
  targetCount: number;
  slot: CastSlot;
  /** Rounds it lasts (a minute is 10). */
  rounds: number;
  concentration: boolean;
}

export type BoonEntry = BoonPlan | { boonable: false; why: string };

const no = (why: string): BoonEntry => ({ boonable: false, why });

const grantsOf = (record: SpellRecord): SpellGrants[] =>
  (record.effects ?? []).flatMap((e) => (e.grants === undefined || e.grants === null ? [] : [e.grants]));

/** Whether the record gives a boon at all: a structured effect carries `grants`. Such a spell is never rolled as damage. */
export function isBoonSpell(record: SpellRecord): boolean {
  return grantsOf(record).length > 0;
}

/** The boon of one cast at `castLevel` (the slot used; the spell's own level for innate casting), or the plain reason it is not one. */
export function boonEntryFor(record: SpellRecord, castLevel: number): BoonEntry {
  if (castLevel < record.level) return no(`${record.name} is a level ${record.level} spell and cannot be cast with a level ${castLevel} slot.`);
  const effects = (record.effects ?? []).filter((e) => e.grants !== undefined && e.grants !== null);
  if (effects.length === 0) return no(`${record.name} gives no boon in its data, and the rules do not read it from the spell's text.`);
  if (effects.length > 1) return no(`${record.name} has several boons, which the rules do not give yet.`);
  const slot = castSlotOf(record);
  if (slot === null) return no(`${record.name} is not cast as an Action or a Bonus Action, so a fight does not cast it.`);
  const [effect] = effects;
  const grants = effect.grants as SpellGrants;
  if (effect.target.type !== "creature") return no(`${record.name} gives its boon to an area rather than chosen creatures, which the rules do not aim yet.`);
  for (const roll of ["attack", "save"] as const) {
    const dice = grants[roll];
    if (dice !== undefined && boonDie(record.name, dice) === null) return no(`${record.name}'s boon "${dice}" is not a dice expression the rules can roll.`);
  }
  if (!(grants.rounds > 0)) return no(`${record.name}'s boon has no duration in its data.`);
  const base = effect.target.count === null ? 1 : Math.max(1, effect.target.count);
  const more = grants.morePerSlot === undefined ? 0 : Math.max(0, grants.morePerSlot);
  const given: ConditionGrants = {
    ...(grants.attack !== undefined ? { attack: grants.attack } : {}),
    ...(grants.save !== undefined ? { save: grants.save } : {}),
    ...(typeof grants.ac === "number" ? { ac: grants.ac } : {}),
  };
  return { boonable: true, grants: given, targetCount: base + more * (castLevel - record.level), slot, rounds: grants.rounds, concentration: record.concentration };
}
