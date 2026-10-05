import { parseExpression, parsedToCounts, type DieSize } from "@/lib/dice/dice";

/**
 * Putting a weapon's damage and its riders into one roll (#976). Pure: the
 * player's Combat tab and the encounter runner both assemble through this, so a
 * critical hit means the same thing on both.
 *
 * A critical hit doubles every die, riders' dice included (PHB 2014 and 2024:
 * "roll all of the attack's damage dice twice"), and never a modifier. A rider
 * whose value is flat ("+2" from Rage) is a modifier, so it is added once.
 */

export interface DamageInput {
  /** The weapon's own damage expression ("1d8"). A modifier inside it is kept. */
  base: string;
  /** The ability modifier (and any other flat bonus) on top of the expression. */
  modifier: number;
  /** The riders the player ticked; `dice` is a dice or flat expression ("3d6", "+2"). */
  riders: { dice: string }[];
  critical: boolean;
}

export interface AssembledDamage {
  counts: Partial<Record<DieSize, number>>;
  modifier: number;
  /** Readable pieces for the roll's label: ["2d8", "6d6", "+5"]. */
  parts: string[];
}

export function assembleDamage(input: DamageInput): AssembledDamage {
  const base = parseExpression(input.base);
  if (!base) throw new Error(`Cannot read the damage expression "${input.base}"`);

  const terms = [...base.terms];
  let modifier = input.modifier + base.modifier;
  for (const rider of input.riders) {
    const parsed = parseExpression(rider.dice);
    if (!parsed) throw new Error(`Cannot read the rider damage "${rider.dice}"`);
    terms.push(...parsed.terms);
    modifier += parsed.modifier;
  }

  const factor = input.critical ? 2 : 1;
  // Same die size merges into one entry so "2d8 + 6d6" never lists a die twice.
  const merged = new Map<number, number>();
  for (const t of terms) merged.set(t.sides, (merged.get(t.sides) ?? 0) + t.count * factor);
  const doubled = [...merged].map(([sides, count]) => ({ count, sides }));

  const parts = doubled.map(t => `${t.count}d${t.sides}`);
  if (modifier !== 0) parts.push(modifier > 0 ? `+${modifier}` : String(modifier));
  return { counts: parsedToCounts(doubled), modifier, parts };
}

/** "d4" and "1d6" both mean one die; the catalogue writes the Martial Arts die both ways. */
function wholeDie(die: string): string {
  return /^d\d+$/i.test(die.trim()) ? `1${die.trim()}` : die.trim();
}

/**
 * An Unarmed Strike's damage: the flat 1 + Strength (at least 1), or a Monk's
 * Martial Arts die plus the better of Strength and Dexterity. The flat case has
 * no dice, so `base` is "0".
 */
export function unarmedDamageBase(input: { strMod: number; dexMod: number; martialArtsDie: string | null }): {
  base: string;
  modifier: number;
} {
  if (input.martialArtsDie) {
    return { base: wholeDie(input.martialArtsDie), modifier: Math.max(input.strMod, input.dexMod) };
  }
  return { base: "0", modifier: Math.max(1, 1 + input.strMod) };
}
