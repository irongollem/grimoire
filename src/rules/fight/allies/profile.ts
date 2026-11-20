// How a party member the AI plays (an ally, #1021) differs from a foe in choosing a turn. Pure and edge-importable
// (relative `.ts` imports only).

import type { TacticalProfile } from "../tactics/profile.ts";
import type { TurnOptionKind } from "../terrain/options/types.ts";

/** RULE ally-never-flees (app convention): the kinds of turn an ally is never offered. Flee is for foes. */
export const ALLY_NEVER_OFFERED: readonly TurnOptionKind[] = ["flee"];

/**
 * RULE ally-never-breaks (app convention): an ally the AI plays never flees off the map and never yields. The temper
 * rules (morale, a way out, Surrender) are for foes; a downed ally rolls death saves, and a frightened one still Dodges or
 * Disengages like anyone. Flee is dropped from what the ally is offered, and its morale never breaks.
 */
export function allyProfile(profile: TacticalProfile): TacticalProfile {
  const offers = new Set([...profile.offers].filter((k) => !ALLY_NEVER_OFFERED.includes(k)));
  // oxlint-disable-next-line unicorn/no-thenable -- `then` is the stat block's own morale field (#1203), not a promise
  return { ...profile, offers, wayOuts: [], morale: { breaksAt: 0, then: "fight_on" } };
}
