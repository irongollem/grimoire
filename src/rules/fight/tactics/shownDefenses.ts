// What a fight has shown of a creature's defenses (#1021), and what a choosing may make of it. A creature run by the
// game cannot read its target's sheet: it weighs a resistance, an immunity or a vulnerability only after a blow has
// shown it (`RunCombatant.shown_defenses`, written by the `show_defense` command when a defense changed damage).
//
// Pure and edge-importable (relative `.ts` imports only).

import type { RunCombatant } from "../../../types/encounter.types.ts";

export type ShownDefense = "resistant" | "immune" | "vulnerable";

const SHOWN: readonly string[] = ["resistant", "immune", "vulnerable"] satisfies readonly ShownDefense[];

export function isShownDefense(value: unknown): value is ShownDefense {
  return typeof value === "string" && SHOWN.includes(value);
}

/** The damage of a weapon: the only kinds a defense ever tells apart by what delivered the blow. */
const WEAPON_TYPES: ReadonlySet<string> = new Set(["bludgeoning", "piercing", "slashing"]);

/**
 * The key a damage kind is remembered under. Fire is fire, whatever threw it, so every other type is its own key.
 * A weapon's damage is remembered with the bypass properties the blow carried, sorted, after a colon ("slashing",
 * "slashing:magical"): a defense can be "from nonmagical attacks", and `applyDefenses` tells those apart by the same
 * properties.
 */
export function shownDefenseKey(type: string, properties: readonly string[] = []): string {
  if (!WEAPON_TYPES.has(type) || properties.length === 0) return type;
  return `${type}:${[...new Set(properties)].sort().join("+")}`;
}

/**
 * What one damage part is multiplied by: 0 for a shown immunity, 0.5 for resistance, 2 for vulnerability, and 1 for
 * anything not shown or a type that cannot be read. Mirrors `applyDefenses` (immunity zeroes, resistance halves,
 * vulnerability doubles; SRD "Damage Resistance and Vulnerability"), whose arithmetic is inline there, without the
 * rounding down: an expected value is not rounded.
 *
 * For a weapon's damage the lesson runs one way. What held against a blow that carried a property (a magic sword
 * that still glanced off) holds against a plainer blow too, since no defense is only against magic weapons. What
 * glanced off a plain blow says nothing of a magic one: that is exactly what "from nonmagical attacks" means.
 */
export function shownDefenseMultiplier(target: RunCombatant, type: string | null | undefined, properties: readonly string[] = []): number {
  if (type === null || type === undefined) return 1;
  const all = target.shown_defenses;
  let shown = all?.[shownDefenseKey(type, properties)];
  if (shown === undefined && all !== undefined && WEAPON_TYPES.has(type) && properties.length === 0) {
    const stronger = Object.keys(all).sort().find((key) => key.startsWith(`${type}:`));
    shown = stronger === undefined ? undefined : all[stronger];
  }
  if (shown === "immune") return 0;
  if (shown === "resistant") return 0.5;
  if (shown === "vulnerable") return 2;
  return 1;
}
