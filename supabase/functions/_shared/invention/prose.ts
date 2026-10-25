import type { InventionMechanic } from "./types.ts";

export interface ProseInput {
  name: string;
  flavor: string;
  rulesText: string;
  /** The new item's own base weapon dice, which are declared outside the mechanics list. */
  baseDice: string | null;
  mechanics: readonly InventionMechanic[];
}

const DICE_RE = /\b(\d+)\s*d\s*(\d+)(?:\s*[+-]\s*\d+)?/gi;
const BONUS_RE = /\+\s*(\d+)/g;
const DC_RE = /\bDC\s*(\d+)/gi;

function diceBase(text: string): string {
  const m = /(\d+)\s*d\s*(\d+)/i.exec(text);
  return m ? `${Number(m[1])}d${Number(m[2])}` : text.toLowerCase().replace(/\s+/g, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Finds game effects written into the text that no declared mechanic accounts
 * for. Never blocks: the findings go to the DM as warnings.
 */
export function scanProse(input: ProseInput): string[] {
  const warnings: string[] = [];
  const mech = input.mechanics;
  const rules = `${input.name}\n${input.rulesText}`;

  const declaredBonuses = new Set<number>();
  const declaredDice = new Set<string>();
  for (const m of mech) {
    if (m.kind === "attack_bonus" || m.kind === "ac_bonus" || m.kind === "save_bonus") declaredBonuses.add(m.value);
    if (m.kind === "extra_damage" || m.kind === "healing") declaredDice.add(diceBase(m.dice));
  }
  if (input.baseDice !== null) declaredDice.add(diceBase(input.baseDice));

  // Dice are read first and removed so the "+2" in "2d4+2" is not mistaken for a bonus.
  const diceFound = unique([...rules.matchAll(DICE_RE)].map((m) => `${Number(m[1])}d${Number(m[2])}`));
  const withoutDice = rules.replace(DICE_RE, " ");
  for (const d of diceFound) {
    if (!declaredDice.has(d)) warnings.push(`The text mentions ${d} but no matching damage or healing is declared.`);
  }
  const bonuses = unique([...withoutDice.matchAll(BONUS_RE)].map((m) => m[1]));
  for (const b of bonuses) {
    if (!declaredBonuses.has(Number(b))) warnings.push(`The text mentions a +${b} bonus but no matching bonus is declared.`);
  }
  for (const dc of unique([...rules.matchAll(DC_RE)].map((m) => m[1]))) {
    warnings.push(`The text sets a DC ${dc} that no declared effect carries.`);
  }

  const all = `${input.name}\n${input.flavor}\n${input.rulesText}`;
  if (/\badvantage\b/i.test(all) && !mech.some((m) => m.kind === "advantage")) {
    warnings.push("The text grants advantage but no advantage effect is declared.");
  }
  if (/\bresist(?:ance|ances|ant|s)?\b/i.test(all) && !mech.some((m) => m.kind === "resistance")) {
    warnings.push("The text grants resistance but no resistance effect is declared.");
  }
  if (/\b(?:immune|immunity|immunities)\b/i.test(all)) {
    warnings.push("The text grants immunity, which the invention limits do not allow.");
  }
  if (/\bcasts?\b(?!\s+iron)/i.test(all) && !mech.some((m) => m.kind === "spell")) {
    warnings.push("The text casts a spell but no spell effect is declared.");
  }
  if (/\d/.test(input.flavor)) {
    warnings.push("The description carries game numbers; they belong in the rules.");
  }
  return warnings;
}
