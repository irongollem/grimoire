import type { BoardLine } from "./boardLines";

/**
 * The table's wording for a player character's attack: the story lines and the damage text. The rows turned into
 * the entry the 5e rules roll, and the dice helpers, live in `rules/fight/pcAttacks/entry`.
 */

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
