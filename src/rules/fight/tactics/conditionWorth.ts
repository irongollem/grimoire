// What a condition (or a spell that stops casting) is worth on a target, in hit points (#1021, the clever layer), so a
// creature run by the game can weigh a Hold Person against a dagger. The worth is roughly "the damage this stops the
// target dealing": the target's damage per turn, times the share of its turn the condition takes away, times the turns
// it is expected to last.
//
// What it may read of the target is what the fight has shown of it (`shownThreat.ts`) and nothing else: never its stat
// block, class or spell list. A creature cannot look at a sheet, so it values a Paralyzed fighter by what the fighter
// has been seen to do, and until it has seen anything it takes the foe to be about as dangerous as itself
// (`fallbackPerTurn`, APP CONVENTION).
//
// Pure and edge-importable (relative `.ts` imports only).
//
// APP CONVENTION throughout: the books give each condition's effect, never a price for it. Each number below is a
// knob a later tuning pass will move, kept in `CONDITION_SHARES` and `ASSUMED_ROUNDS`. The SRD text (5.1 "Conditions")
// each follows from is named where it does.
//
//   share of the target's turn a condition takes away      anyone   the kind it hurts most
//   Paralyzed, Stunned, Unconscious, Petrified, Incapacitated  1.00   - (Incapacitated: no actions or reactions; Paralyzed
//                                                                   and Stunned include it; Unconscious and Petrified
//                                                                   are Incapacitated too, so it does nothing on its turns)
//   Restrained   0.50   0.75 brawler (speed 0 and disadvantage on its attacks; a brawler cannot close in at all)
//   Blinded      0.50   0.75 archer or caster (disadvantage on its attacks; most of what they do needs sight)
//   Frightened   0.50   0.75 brawler (disadvantage while the source is in sight, and it cannot willingly move closer)
//   Grappled     0.25   0.50 brawler (speed 0; its attacks are not hindered, but it cannot reposition)
//   Prone        0.25   (it spends half its movement standing, and melee attacks on it have advantage)
//   Poisoned     0.50   (disadvantage on attack rolls and ability checks)
//   Charmed      0.50   (it cannot attack the charmer, which is some of its targets and not all)
//   Deafened     0.10   (hearing rarely matters in a fight)
//   Exhaustion   0.10   (not in the brief; one level costs d20 tests a little, so it is priced like Deafened)
//   Invisible    0.00   (a benefit to the bearer, never a harm to it)
//   stops casting "all" 1.00 for a caster, else 0; "verbal" 0.75 for a caster, else 0 (a caster can still do some things
//   without words, a non-caster loses nothing).
//
// Shares do not add up: a target both Restrained and Blinded loses the larger share of its turn, not both.

import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { SaveEnds, SrdConditionName } from "../../../types/statBlock.types.ts";
import { seenAs, seenDamagePerTurn, type SeenAs } from "./shownThreat.ts";

/** APP CONVENTION: a fight is taken to last about three more rounds, so nothing is valued over more than this many turns. */
export const ASSUMED_ROUNDS = 3;

interface Share {
  base: number;
  /** The kind of creature it hurts most, and the larger share for it. */
  worse?: { kinds: readonly (keyof SeenAs)[]; share: number };
}

/** The knobs: what share of its turn a condition takes from a target (see the header table). */
export const CONDITION_SHARES: Readonly<Record<SrdConditionName, Share>> = {
  Paralyzed: { base: 1 },
  Stunned: { base: 1 },
  Unconscious: { base: 1 },
  Petrified: { base: 1 },
  Incapacitated: { base: 1 },
  Restrained: { base: 0.5, worse: { kinds: ["brawler"], share: 0.75 } },
  Blinded: { base: 0.5, worse: { kinds: ["archer", "caster"], share: 0.75 } },
  Frightened: { base: 0.5, worse: { kinds: ["brawler"], share: 0.75 } },
  Grappled: { base: 0.25, worse: { kinds: ["brawler"], share: 0.5 } },
  Prone: { base: 0.25 },
  Poisoned: { base: 0.5 },
  Charmed: { base: 0.5 },
  Deafened: { base: 0.1 },
  Exhaustion: { base: 0.1 },
  Invisible: { base: 0 },
};

/** The share of its turn a spell that stops casting takes from a target: all of a caster's, three quarters when only words are stopped, none of anyone else's. */
export const STOPS_CASTING_SHARE = { all: 1, verbal: 0.75 } as const;

export type StopsCasting = "all" | "verbal" | null;

function shareOf(name: SrdConditionName, seen: SeenAs): number {
  const { base, worse } = CONDITION_SHARES[name];
  return worse !== undefined && worse.kinds.some((kind) => seen[kind]) ? worse.share : base;
}

export interface ConditionWorthInput {
  conditions: readonly SrdConditionName[];
  stopsCasting: StopsCasting;
  /** How many of the target's turns the condition is expected to last (`expectedRounds`); never counted past `ASSUMED_ROUNDS`. */
  rounds: number;
  target: RunCombatant;
  /**
   * The damage per turn to assume while the fight has seen none of the target's turns: the mover's own best expected
   * damage this turn. APP CONVENTION: until it has seen otherwise, a creature takes its foe to be about as dangerous as itself.
   */
  fallbackPerTurn: number;
}

/** Hit points: `perTurn * share * min(rounds, ASSUMED_ROUNDS)`, the largest share that applies. */
export function conditionWorth(input: ConditionWorthInput): number {
  const { target } = input;
  const seen = seenAs(target);
  const shown = seenDamagePerTurn(target);
  const perTurn = shown === null ? input.fallbackPerTurn : shown;
  let share = 0;
  for (const name of input.conditions) share = Math.max(share, shareOf(name, seen));
  if (input.stopsCasting !== null && seen.caster) share = Math.max(share, STOPS_CASTING_SHARE[input.stopsCasting]);
  return perTurn * share * Math.max(0, Math.min(input.rounds, ASSUMED_ROUNDS));
}

/**
 * How many of the bearer's turns a condition is expected to last, from what ends it.
 * - Nothing the fight can state: `ASSUMED_ROUNDS`.
 * - For N rounds: N.
 * - Until the next turn edge: 1.
 * - A repeat save, `fails` being the chance the bearer fails each repeat (it keeps the condition while it fails): a turn
 *   is affected only after the earlier saves failed. Ended at the END of its turn, it acts under the condition on turn 1,
 *   then on turn k+1 with chance fails^k: 1 + f + f^2 + ... = (1 - f^n) / (1 - f) over n turns. Ended at the START of its
 *   turn it must fail first: f + f^2 + ... = f * (1 - f^n) / (1 - f). `n` is `remaining` when the prose caps it, else
 *   unbounded (1 / (1 - f), or f / (1 - f)); a save that is always failed lasts `n`, or `ASSUMED_ROUNDS` with no cap.
 */
export function expectedRounds(ends: SaveEnds | undefined, repeatFails: number): number {
  if (ends === undefined) return ASSUMED_ROUNDS;
  if (ends.kind === "rounds") return ends.remaining;
  if (ends.kind === "turn") return 1;
  const cap = ends.remaining === undefined ? null : ends.remaining;
  const f = Math.min(1, Math.max(0, repeatFails));
  const first = ends.at === "start" ? f : 1;
  if (f >= 1) return cap === null ? ASSUMED_ROUNDS : cap;
  const series = cap === null ? 1 / (1 - f) : (1 - f ** cap) / (1 - f);
  return first * series;
}
