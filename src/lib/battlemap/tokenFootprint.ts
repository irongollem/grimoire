// Map D&D 5e creature sizes to the cell footprint a VTT token occupies.
// PHB 2024 "Creature Size": Tiny 2½ ft, Small/Medium 5 ft, Large 10 ft, Huge 15 ft, Gargantuan 20 ft
// of space; a grid square is 5 ft, so Tiny is half a square on a side (#1125 decision 13).

import type { MonsterSize } from "@/types/monster.types";

export type TokenFootprint = 0.5 | 1 | 2 | 3 | 4;

const FOOTPRINTS: Record<MonsterSize, TokenFootprint> = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

/** A missing or unrecognised size is Medium (app convention): a creature always needs a square to stand on. */
export function sizeToFootprint(size: string | null | undefined): TokenFootprint {
  if (!size) return 1;
  const key = size.trim().toLowerCase();
  return Object.hasOwn(FOOTPRINTS, key) ? FOOTPRINTS[key as MonsterSize] : 1;
}

/**
 * What a token needs to know about itself to be sized. Structural so the player's
 * projection of a combatant (which has no monster tables behind it) qualifies too.
 */
export interface SizedToken {
  /** Baked at spawn, because players cannot read the monster or NPC tables. */
  footprint?: number;
  size?: MonsterSize | null;
  /** The DM's Enlarge/Reduce (or any other resize) for this fight. */
  size_override?: MonsterSize | null;
  wildshape?: { beast_size?: MonsterSize | null } | null;
}

/** The size a token is right now: an override beats a beast form, which beats the size baked at spawn. Null when none was baked. */
export function combatantSize(c: SizedToken): MonsterSize | null {
  return c.size_override ?? c.wildshape?.beast_size ?? c.size ?? null;
}

/**
 * Cells per side of the token right now. Every consumer reads this, never
 * `c.footprint` directly, or an override and a beast form would be ignored.
 * A combatant spawned before sizes were stored has only the baked footprint.
 */
export function combatantFootprint(c: SizedToken): number {
  const size = combatantSize(c);
  if (size) return sizeToFootprint(size);
  if (c.footprint && c.footprint > 0) return c.footprint;
  return 1;
}
