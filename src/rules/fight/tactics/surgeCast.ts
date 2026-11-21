// Action Surge for a spell (#1021): the extra action is a cast, or the Attack action after a cast. The options the assembly makes are
// one action each, so a turn of two actions is made here from the best casts and what the mover could still do after each: a composite
// cast option whose numbers are both actions' together, which the picker weighs like any other cast (an attack entry that surges is
// weighed the same way: `Action Surge (Longsword)` carries the whole doubled Attack action).
//
// RULE action-surge-cast (PHB 2014 "Fighter: Action Surge": "you can take one additional action on top of your regular action and a possible
// bonus action"; ch. 10 "Casting a Spell", "Bonus Action": a creature that casts a spell with a Bonus Action casts no other spell that turn, except a
// cantrip with a casting time of one action, so a Bonus Action heal never rides a turn that casts two leveled spells: `healChoice.ts`).
// PHB 2024 "Action Surge" gives "one additional action, except the Magic action", so under the 2024 rules a surge is never a cast and this
// file is not asked.
// APP CONVENTION: it is used whenever its second action adds damage (the same standing rule the attack surge follows: "use it whenever
// an attack is in reach and a use is left"); only a damage spell comes first, and the extra action stays where the mover stands: a cast, or an
// Attack action made from the square it is on, never a walk (a walk after a cast is a different turn).
// Pure and edge-importable (relative `.ts` imports only).

import { allyEntryFeature } from "../allies/statBlock.ts";
import type { TurnOption } from "../terrain/options/types.ts";

/** How many first casts are weighed against what could follow them: the options assembly runs once for each. */
export const MAX_SURGE_FIRST_CASTS = 3;

/** A number the options may not have: damage nobody could work out adds nothing to a turn's total, and a turn that adds nothing is not offered. */
const unknownAddsNothing = (v: number | null | undefined): number => (v === null || v === undefined ? 0 : v);

/** What an option is worth to compare in hit points: expected damage, and for a cast what its conditions take from the targets. Null when nothing is known. */
function valueOf(o: TurnOption): number | null {
  if (o.kind === "spell" && o.spell !== undefined && o.spell !== null) {
    return o.spell.expectedDamage === null ? null : o.spell.expectedDamage + (o.spell.expectedWorth === undefined || o.spell.expectedWorth === null ? 0 : o.spell.expectedWorth);
  }
  return o.attack === null ? null : o.attack.expectedDamage;
}

/** A cast that catches none of the mover's own side and whose damage is known: the only cast a surge is spent on. */
// A cast from where the creature stands: the extra action's options are worked out from that square, and the creature never walks
// between the two actions, so a cast that walks first (a moved spell option) is never one of them.
const isSafeCast = (o: TurnOption): boolean => o.kind === "spell" && o.spell !== undefined && o.spell !== null && o.spell.friendsCaught.length === 0 && o.spell.expectedDamage !== null && o.spell.surge === undefined && (o.feet === null || o.feet === 0);

/**
 * Whether `o` can be the extra action after a cast: another safe cast, or an Attack action (not the Action Surge entry itself: one surge is one extra
 * action) made without moving.
 */
function isSecondAction(o: TurnOption): boolean {
  if (isSafeCast(o)) return true;
  if (o.kind !== "attack" || o.attack === null || o.attack.list !== "actions" || allyEntryFeature(o.attack.action) !== null) return false;
  return o.feet === null || o.feet === 0;
}

/**
 * The composite turns to add to the options: for each of the best `MAX_SURGE_FIRST_CASTS` safe casts, the cast followed by the best extra action
 * `after` finds (`after(first)` is every option the mover has once `first` is cast: the slot it takes is already spent there, and each option carries
 * its numbers). Only a second action that adds value makes a composite; a cast whose surge would add nothing is not offered one.
 */
export function surgeCasts(options: readonly TurnOption[], after: (first: TurnOption) => readonly TurnOption[]): TurnOption[] {
  const firsts = options
    .filter(isSafeCast)
    .map((option, order) => ({ option, order, value: unknownAddsNothing(valueOf(option)) }))
    .sort((a, b) => b.value - a.value || a.order - b.order)
    .slice(0, MAX_SURGE_FIRST_CASTS);
  const out: TurnOption[] = [];
  for (const { option: first } of firsts) {
    if (first.spell === undefined || first.spell === null) continue;
    const seconds = after(first).filter(isSecondAction).map((option, order) => ({ option, order, value: unknownAddsNothing(valueOf(option)) })).sort((a, b) => b.value - a.value || a.order - b.order);
    const best = seconds[0];
    if (best === undefined || best.value <= 0) continue;
    const secondDamage = best.option.kind === "spell" && best.option.spell ? unknownAddsNothing(best.option.spell.expectedDamage) : unknownAddsNothing(best.option.attack === null ? null : best.option.attack.expectedDamage);
    const secondWorth = best.option.kind === "spell" && best.option.spell ? unknownAddsNothing(best.option.spell.expectedWorth) : 0;
    const firstWorth = unknownAddsNothing(first.spell.expectedWorth);
    out.push({
      ...first,
      id: `surge:${first.id}+${best.option.id}`,
      spell: {
        ...first.spell,
        spends: true,
        expectedDamage: unknownAddsNothing(first.spell.expectedDamage) + secondDamage,
        expectedWorth: firstWorth + secondWorth,
        surge: { second: best.option },
      },
      summary: `${first.summary}; then, with Action Surge, ${best.option.summary.charAt(0).toLowerCase()}${best.option.summary.slice(1)}`,
    });
  }
  return out;
}
