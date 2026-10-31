import type { StructuredSpellEffect } from "@/types/spell.types";

export interface ResolvedSpellEffect {
  targetId: string;
  effect: StructuredSpellEffect;
}

export interface SpellRollGroup {
  /** Same key = same physical roll. */
  key: string;
  dice: string;
  modifier: StructuredSpellEffect["modifier"];
  entries: ResolvedSpellEffect[];
}

/** An attack ray, dart or beam: each one that hits is its own roll. */
function isAttackInstance(effect: StructuredSpellEffect): boolean {
  return !!effect.instances && (effect.outcome === "hit" || effect.outcome === "critical_hit");
}

function rollKey(entry: ResolvedSpellEffect, dice: string): string {
  const { effect } = entry;
  // join() writes a null or absent modifier or damage type as an empty field.
  const parts = [effect.phase, effect.kind, dice, effect.modifier, effect.damageType];
  // Scorching Ray: each ray that hits rolls its own damage. Automatic instances
  // (Magic Missile darts) strike together and fall through to one shared roll.
  if (isAttackInstance(effect)) parts.push(`instance:${entry.targetId}`);
  return parts.join("|");
}

/**
 * PHB 2014 "Damage Rolls": a spell that deals damage to several targets at once
 * rolls the damage once for all of them; targets who save take half of that same
 * roll, one per damage type (Meteor Swarm's fire and bludgeoning are two rolls).
 * Entries share a roll when phase, kind, dice, modifier and damage type match, whatever
 * their effect id or multiplier. A critical hit's doubled dice differ, so that
 * target forms its own group, and so does each attack ray or beam (darts share).
 */
export function groupSpellRolls(resolved: ResolvedSpellEffect[]): SpellRollGroup[] {
  const groups = new Map<string, SpellRollGroup>();
  for (const entry of resolved) {
    const { effect } = entry;
    if (!effect.dice) continue;
    const dice = effect.dice.replace(/\s+/g, "").toLowerCase();
    const key = rollKey(entry, dice);
    const group = groups.get(key);
    if (group) group.entries.push(entry);
    else groups.set(key, { key, dice: effect.dice, modifier: effect.modifier, entries: [entry] });
  }
  return [...groups.values()];
}
