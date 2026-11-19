// What a fight has shown of how dangerous a creature is, and of what kind (#1021, the clever layer). A creature run by
// the game cannot read its target's sheet, so how much harm a target does and whether it is a caster, an archer or a
// brawler comes from `RunCombatant.shown_deeds` (written by the `show_deed` command as each deed happens) and from
// what anyone can see of it (a spell it holds). Nothing here reads a stat block.
//
// Pure and edge-importable (relative `.ts` imports only).

import type { RunCombatant, ShownDeeds } from "../../../types/encounter.types.ts";

/** What one deed adds: every field optional, so a deed names only what happened. */
export type ShownDeedDelta = Partial<ShownDeeds>;

export const SHOWN_DEED_KEYS = ["dealt", "turns", "cast", "ranged", "melee"] as const satisfies readonly (keyof ShownDeeds)[];

const NOTHING_SEEN: ShownDeeds = { dealt: 0, turns: 0, cast: 0, ranged: 0, melee: 0 };

/** True when `value` is a delta of non-negative finite numbers over the known keys: what the edge accepts as a deed. */
export function isShownDeedDelta(value: unknown): value is ShownDeedDelta {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, n]) => (SHOWN_DEED_KEYS as readonly string[]).includes(key) && typeof n === "number" && Number.isFinite(n) && n >= 0);
}

/** The deeds with `delta` added. Adding nothing returns `current` itself, so a no-op command changes no state. */
export function addDeeds(current: ShownDeeds | undefined, delta: ShownDeedDelta): ShownDeeds | undefined {
  if (SHOWN_DEED_KEYS.every((key) => delta[key] === undefined || delta[key] === 0)) return current;
  const base = current === undefined ? NOTHING_SEEN : current;
  const sum = (key: keyof ShownDeeds): number => base[key] + (delta[key] === undefined ? 0 : delta[key]);
  return { dealt: sum("dealt"), turns: sum("turns"), cast: sum("cast"), ranged: sum("ranged"), melee: sum("melee") };
}

/** Damage per turn the fight has seen it deal: `dealt / turns`; null when none of its turns has started, so nothing is known. */
export function seenDamagePerTurn(target: RunCombatant): number | null {
  const deeds = target.shown_deeds;
  if (deeds === undefined || deeds.turns < 1) return null;
  return deeds.dealt / deeds.turns;
}

export interface SeenAs {
  caster: boolean;
  archer: boolean;
  brawler: boolean;
}

/**
 * What the fight has seen a creature to be. A caster has cast at least once or is seen holding a concentration spell;
 * an archer has made more ranged attacks than melee (and at least one); a brawler at least as many melee as ranged (and
 * at least one). A creature nothing has been seen of is none of the three.
 */
export function seenAs(target: RunCombatant): SeenAs {
  const deeds = target.shown_deeds;
  const concentrating = target.concentration !== undefined && target.concentration !== null;
  if (deeds === undefined) return { caster: concentrating, archer: false, brawler: false };
  return {
    caster: concentrating || deeds.cast >= 1,
    archer: deeds.ranged > deeds.melee && deeds.ranged >= 1,
    brawler: deeds.melee >= deeds.ranged && deeds.melee >= 1,
  };
}
