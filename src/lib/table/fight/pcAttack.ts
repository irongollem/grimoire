import { parseExpression, parsedToCounts, type DieSize, type DieResult, type RollResult } from "@/lib/dice/dice";
import type { PcAttackRow, PcCustomAttackRow } from "@/composables/encounters/usePcAttackRows";
import { damageRollsFor } from "@/rules/combat/typedDamage";
import { DAMAGE_TYPES, type DamageType } from "@/types/damage.types";
import type { DamagePart, StatBlockEntry } from "@/types/statBlock.types";
import type { BoardLine } from "./boardLines";

/**
 * A player character's attack, as the table resolves it in the browser (the server cannot: it refuses an attacker
 * with no stat block). This module is the pure half: turning a weapon row into the entry the 5e rules roll, the
 * dice a person types or the screen throws, and the story lines. The rules themselves stay in `rules/fight`.
 */

function damageTypeOf(raw: string | null): DamageType | null {
  // The rows carry a placeholder ("damage") for a weapon with no type of its own; that is not a type.
  return DAMAGE_TYPES.find((t) => t === raw) ?? null;
}

function isCustom(row: PcAttackRow): row is PcCustomAttackRow {
  return row.kind === "custom";
}

/** The damage a row deals on a hit, as the typed parts the rules roll; null when the row has none to roll. */
function hitPartsOf(row: PcAttackRow): DamagePart[] | null {
  if (isCustom(row)) {
    const dice = row.customDamage.replace(/\s+/g, "");
    if (parseExpression(dice) === null) return null;
    return [{ dice, type: damageTypeOf(row.customDamageType) }];
  }
  if (row.damageDice !== null) {
    return parseExpression(row.damageDice) === null ? null : [{ dice: row.damageDice, type: damageTypeOf(row.damageType) }];
  }
  if (row.damageFixed !== null) {
    // An unarmed strike: "3 bludgeoning". The number is the damage and the word its type.
    const match = row.damageFixed.match(/^\s*(\d+)\s*([a-z]*)/i);
    if (!match) return null;
    return [{ dice: match[1], type: damageTypeOf(match[2] === "" ? null : match[2].toLowerCase()) }];
  }
  return null;
}

/**
 * The entry the attack rules roll for one weapon row. The row's damage already holds the ability modifier, so it is
 * the dice as written. Null for a row that cannot be rolled: no attack bonus (an auto-hit or a save), or no damage.
 */
export function attackEntryOf(row: PcAttackRow): StatBlockEntry | null {
  if (row.attackBonus === null) return null;
  const hit = hitPartsOf(row);
  if (hit === null) return null;
  return {
    name: row.name,
    description: "",
    structured: {
      kind: "attack",
      source: "manual",
      attack: { delivery: row.kind === "melee" ? "melee" : "ranged", bonus: row.attackBonus, hit },
    },
  };
}

/** The faces, one per die, in the order the rules ask for them: part by part, smallest die first (as the dice are counted). */
export function damageDicePlan(entry: StatBlockEntry, critical: boolean): DieSize[] {
  const parts = entry.structured.attack?.hit ?? [];
  const plan: DieSize[] = [];
  for (const { parsed } of damageRollsFor(parts, critical)) {
    for (const [sides, count] of Object.entries(parsedToCounts(parsed.terms))) {
      for (let i = 0; i < (count ?? 0); i++) plan.push(Number(sides) as DieSize);
    }
  }
  return plan;
}

/** Whether typed or rolled faces are whole numbers within their die. */
export function facesFit(faces: readonly number[], plan: readonly number[]): boolean {
  return faces.length === plan.length && faces.every((f, i) => Number.isInteger(f) && f >= 1 && f <= plan[i]);
}

/**
 * A d20 roll made of faces somebody supplied. With advantage or disadvantage and two faces, the kept one is first
 * and the other is marked dropped (the shape `keptD20` reads); with one face (typed at the table) that face stands.
 */
export function d20FromFaces(faces: readonly number[], mode: "normal" | "advantage" | "disadvantage", modifier: number, label: string): RollResult {
  if (faces.length === 0 || faces.some((f) => !Number.isInteger(f) || f < 1 || f > 20)) throw new Error("A d20 face is a whole number from 1 to 20");
  let breakdown: DieResult[];
  if (mode === "normal" || faces.length === 1) breakdown = [{ val: faces[0], dropped: false }];
  else {
    const kept = mode === "advantage" ? Math.max(faces[0], faces[1]) : Math.min(faces[0], faces[1]);
    const other = faces[0] === kept ? faces[1] : faces[0];
    breakdown = [
      { val: kept, dropped: false },
      { val: other, dropped: true },
    ];
  }
  return { total: breakdown[0].val + modifier, label, modifier, breakdown, isCrit: false, isFumble: false };
}

/** A damage roll made of the faces for these dice (in `damageDicePlan` order). */
export function damageFromFaces(faces: readonly number[], modifier: number, label: string): RollResult {
  const breakdown = faces.map((val) => ({ val, dropped: false }));
  return { total: faces.reduce((sum, f) => sum + f, 0) + modifier, label, modifier, breakdown, isCrit: false, isFumble: false, isDamage: true };
}

export interface AttackLinesInput {
  attackerName: string;
  targetName: string;
  weapon: string;
  natural: number;
  bonus: number;
  hit: boolean;
  critical: boolean;
  /** The damage dealt, once rolled; null at the roll to hit. */
  damage: { amount: number; type: string | null }[] | null;
  /** The player rolled real dice and typed them in. */
  atTable: boolean;
}

/** "9 piercing", or "6 piercing and 2 fire"; "no damage" when nothing got through. */
export function damageText(damage: { amount: number; type: string | null }[]): string {
  const parts = damage.filter((d) => d.amount > 0).map((d) => (d.type === null ? `${d.amount}` : `${d.amount} ${d.type}`));
  return parts.length === 0 ? "no damage" : parts.join(" and ");
}

/** The dice behind a damage roll: each die's size and face in the order rolled, and what was added to them. */
export interface DamageMath {
  dice: { sides: number; face: number }[];
  modifier: number;
  atTable: boolean;
}

/** "2d8 (3, 8) + 4": dice of one size together, in the order their size first came up, then the modifier. */
export function damageMathText(math: DamageMath): string {
  const bySize = new Map<number, number[]>();
  for (const d of math.dice) bySize.set(d.sides, [...(bySize.get(d.sides) ?? []), d.face]);
  const dice = [...bySize].map(([sides, faces]) => `${faces.length}d${sides} (${faces.join(", ")})`).join(" + ");
  const mod = math.modifier === 0 ? "" : math.modifier > 0 ? ` + ${math.modifier}` : ` - ${Math.abs(math.modifier)}`;
  const body = dice === "" ? String(math.modifier) : `${dice}${mod}`;
  return `${body}${math.atTable ? " · rolled at the table" : ""}`;
}

/**
 * The line for damage dealt. It names the damage, never what is left of the target. With the dice behind it, it is
 * drawn as a roll with its arithmetic ("dnd nerds like seeing the dice math"); the number set large is what the
 * target took, which a resistance may have made less than the dice say.
 */
export function damageLine(attackerName: string, damage: { amount: number; type: string | null }[], math: DamageMath | null = null): BoardLine {
  const text = `${attackerName} deals ${damageText(damage)}`;
  if (math === null) return { kind: "margin", text };
  return { kind: "roll", die: damage.reduce((sum, d) => sum + d.amount, 0), label: text, detail: damageMathText(math), critical: false };
}

/**
 * The player's own attack as story lines: their die, bonus and total with "a hit", "a critical hit" or "a miss",
 * then the damage. The target's armour class and hit points never appear: the player is shown a result, not the
 * number it was held against.
 */
export function attackLines(input: AttackLinesInput): BoardLine[] {
  const { natural, bonus } = input;
  const outcome = !input.hit ? "a miss" : input.critical ? "a critical hit" : "a hit";
  const bonusPart = bonus === 0 ? "" : bonus > 0 ? ` + ${bonus}` : ` - ${Math.abs(bonus)}`;
  const lines: BoardLine[] = [
    {
      kind: "roll",
      die: natural + bonus,
      label: `${input.weapon} against ${input.targetName}: ${outcome}`,
      detail: `d20 (${natural})${bonusPart}${input.atTable ? " · rolled at the table" : ""}`,
      critical: input.hit && input.critical,
    },
  ];
  if (input.hit && input.damage !== null) lines.push(damageLine(input.attackerName, input.damage));
  return lines;
}
