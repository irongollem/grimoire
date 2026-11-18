// A creature's way out of a fight (#1203): the power a broken creature uses to get away before it runs or yields.
// A night hag that is losing steps into the Ethereal Plane; she does not bargain from a spot she could simply leave.
//
// RULE way-out-names is 5e by the book: these are the named powers that take a creature out of a fight or out of
// sight. Misty Step and the like are left out on purpose, because 30 feet away is still in the fight.
// APP CONVENTION: that a broken creature uses one first. A spell's tally key comes from `spells/castLimit.ts`.
//
// Pure and edge-importable (relative `.ts` imports only).

import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { StatBlockEntry } from "../../../types/statBlock.types.ts";
import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import { actionLimit, actionUseKey, limitAvailability, type ActionLimit } from "../../encounterTurn.ts";
import { isSpellcastingEntry, parseSpellcasting } from "../../statBlock/spellcastingProse.ts";
import { castLimitOf } from "../spells/castLimit.ts";

export type WayOutEffect = "leaves" | "unseen";

export interface WayOut {
  /** The power's own name, in the case the rules print it. */
  name: string;
  /** "leaves": the creature is gone from the fight. "unseen": it turns Invisible and slips away. */
  effect: WayOutEffect;
  slot: "action" | "bonus";
  /** Where its uses are tallied; null when it has no limit. */
  useKey: string | null;
  limit: ActionLimit | null;
}

/**
 * RULE way-out-names: what each named power does. Keys are lower case, without any trailing parenthetical.
 * `spellOnly`: the name counts as a spell the creature casts, never as an action of that name. A monster's own
 * "Teleport" action is a short hop (a blink dog's is 40 feet, a balor's 120) that leaves it in the fight, where the
 * Teleport spell takes its caster miles away; Plane Shift is only ever a spell.
 */
const WAY_OUT_NAMES: Readonly<Record<string, { name: string; effect: WayOutEffect; spellOnly?: true }>> = {
  etherealness: { name: "Etherealness", effect: "leaves" },
  "plane shift": { name: "Plane Shift", effect: "leaves", spellOnly: true },
  teleport: { name: "Teleport", effect: "leaves", spellOnly: true },
  "dimension door": { name: "Dimension Door", effect: "leaves" },
  "invisible passage": { name: "Invisible Passage", effect: "unseen" },
  invisibility: { name: "Invisibility", effect: "unseen" },
  "greater invisibility": { name: "Greater Invisibility", effect: "unseen" },
};

/** A name as the rules compare it: trimmed, a trailing "(self only)" or "(1/Day)" dropped, lower case. */
function normalName(raw: string): string {
  return raw.replace(/\s*\([^()]*\)\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function wayOutNamed(raw: string): { name: string; effect: WayOutEffect; spellOnly?: true } | null {
  const key = normalName(raw);
  return Object.hasOwn(WAY_OUT_NAMES, key) ? WAY_OUT_NAMES[key] : null;
}

interface CastableSpell {
  name: string;
  limit: ActionLimit | null;
  useKey: string | null;
}

/** The spells a spellcasting entry names, with how often each can be cast. */
function spellsIn(entry: StatBlockEntry): CastableSpell[] {
  const prose = parseSpellcasting(entry);
  if (prose === null) return [];
  const spells: CastableSpell[] = [];
  for (const group of prose.groups) {
    for (const spell of group.spells) {
      const { useKey, limit } = castLimitOf(group, spell.name);
      spells.push({ name: spell.name, limit, useKey });
    }
  }
  return spells;
}

function entriesOf(statBlock: MonsterStatBlock) {
  return [
    ...(statBlock.actions ?? []).map((entry) => ({ list: "actions" as const, entry })),
    ...(statBlock.bonus_actions ?? []).map((entry) => ({ list: "bonus_actions" as const, entry })),
  ];
}

/**
 * RULE way-out-order: a power that takes the creature out of the fight comes before one that only hides it; within
 * that, one with no limit before one that is limited, so a hag keeps her 2/day Plane Shift for when Etherealness is
 * spent. A name is listed once.
 */
export function wayOutsOf(statBlock: MonsterStatBlock): WayOut[] {
  const found: WayOut[] = [];
  const add = (way: WayOut) => {
    if (!found.some((f) => f.name === way.name)) found.push(way);
  };

  for (const { list, entry } of entriesOf(statBlock)) {
    const known = wayOutNamed(entry.name);
    if (known === null || known.spellOnly === true) continue;
    const limit = actionLimit(entry);
    const limited = limit.recharge !== undefined || limit.per_day !== undefined;
    add({
      name: known.name,
      effect: known.effect,
      slot: list === "bonus_actions" ? "bonus" : "action",
      useKey: limited ? actionUseKey(list, entry) : null,
      limit: limited ? limit : null,
    });
  }

  const casters = [...entriesOf(statBlock).map((e) => e.entry), ...(statBlock.special_abilities ?? [])].filter(isSpellcastingEntry);
  for (const caster of casters) {
    for (const spell of spellsIn(caster)) {
      const known = wayOutNamed(spell.name);
      // Casting a spell takes the Action.
      if (known !== null) add({ name: known.name, effect: known.effect, slot: "action", useKey: spell.useKey, limit: spell.limit });
    }
  }

  const rank = (w: WayOut) => (w.effect === "leaves" ? 0 : 2) + (w.limit === null ? 0 : 1);
  return found
    .map((way, index) => ({ way, index }))
    .sort((a, b) => rank(a.way) - rank(b.way) || a.index - b.index)
    .map((r) => r.way);
}

/**
 * The first way out the creature can use right now, or null. Not usable when its uses are spent (N a day reached, a
 * recharge not yet back), when it costs the Action or Bonus Action and that is already used this turn, or when it
 * would turn the creature Invisible and it already is.
 */
export function usableWayOut(wayOuts: readonly WayOut[], mover: RunCombatant): WayOut | null {
  const invisible = mover.conditions.some((c) => c.name.toLowerCase() === "invisible");
  return (
    wayOuts.find((way) => {
      if (way.effect === "unseen" && invisible) return false;
      if (way.slot === "action" ? mover.action_used === true : mover.bonus_used === true) return false;
      if (way.useKey !== null && way.limit !== null && !limitAvailability(mover, way.useKey, way.limit).available) return false;
      return true;
    }) ?? null
  );
}
