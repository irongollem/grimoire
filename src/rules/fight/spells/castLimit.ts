// How often a creature can cast a spell it lists (#1021, row 5b), and the key that tally is kept under.
// One rule, shared by the way-out check (`tactics/wayOut.ts`) and the server's `cast_spell`, so the two can never
// disagree about which key a slot is spent under.
//
// RULE spell-frequency is the stat block's own (SRD 5.1 "Spellcasting", "Innate Spellcasting"): at will and cantrips
// are unlimited, "N/day" is N casts of that spell, "Nth level (S slots)" is S casts of any spell at that level.
// APP CONVENTION: a slot line is tallied per level (`slots/<level>`), not per spell, and "per day" never resets in a
// fight. Slots are whole until the first one is spent: the tally only exists from then on.
//
// Pure and edge-importable (relative `.ts` imports only).

import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import type { ActionLimit } from "../../encounterTurn.ts";
import { spellcastingOf, type ProseSpellGroup } from "../../statBlock/spellcastingProse.ts";

/** A spell's name as the stat block's prose and the tally key it: single-spaced, lower case. */
export function spellKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Where a spell's casts are tallied and how many there are; both null for a spell with no limit. */
export function castLimitOf(group: ProseSpellGroup, spellName: string): { useKey: string | null; limit: ActionLimit | null } {
  const { frequency } = group;
  switch (frequency.kind) {
    case "per_day":
      return { useKey: `spell/${spellKey(spellName)}`, limit: { per_day: frequency.count } };
    case "slots":
      return { useKey: `slots/${frequency.level}`, limit: { per_day: frequency.slots } };
    case "at_will":
    case "cantrips":
      return { useKey: null, limit: null };
  }
}

export interface Castable {
  saveDc: number | null;
  attackBonus: number | null;
  casterLevel: number | null;
  group: ProseSpellGroup;
  useKey: string | null;
  limit: ActionLimit | null;
  /** The slot level of the group the spell is listed under, 0 for cantrips, null for at will and "N/day" innate casting (the spell's own level is used then). */
  level: number | null;
}

/** How the creature casts the spell, or null when no spellcasting entry of its stat block lists it. */
export function castableBy(statBlock: MonsterStatBlock, spellName: string): Castable | null {
  const wanted = spellKey(spellName);
  for (const { prose } of spellcastingOf(statBlock)) {
    for (const group of prose.groups) {
      if (!group.spells.some((s) => s.key === wanted)) continue;
      const { useKey, limit } = castLimitOf(group, spellName);
      const level = group.frequency.kind === "slots" ? group.frequency.level : group.frequency.kind === "cantrips" ? 0 : null;
      return { saveDc: prose.saveDc, attackBonus: prose.attackBonus, casterLevel: prose.casterLevel, group, useKey, limit, level };
    }
  }
  return null;
}

/** The tally of the creature's slots of one level, when its spell lists give it any: what an upcast spends. */
export function slotLimitAt(statBlock: MonsterStatBlock, level: number): { useKey: string; limit: ActionLimit } | null {
  for (const { prose } of spellcastingOf(statBlock)) {
    for (const group of prose.groups) {
      if (group.frequency.kind === "slots" && group.frequency.level === level) {
        return { useKey: `slots/${level}`, limit: { per_day: group.frequency.slots } };
      }
    }
  }
  return null;
}
