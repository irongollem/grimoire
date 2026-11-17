import type { DmRoll } from "./soloTypes";
import type { RollLine } from "./tableRoll";

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isWhole = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);
const isDice = (x: unknown): x is number[] => Array.isArray(x) && x.length <= 100 && x.every((f) => isWhole(f) && f >= 1);

/**
 * An open roll of the Dungeon Master's, as the stream and a stored `tool_result` both carry it, or null when it is
 * not one. The server sends none for a hidden roll, so there is nothing here to hide; this only refuses a shape the
 * line could not be drawn from.
 */
export function parseDmRoll(raw: unknown): DmRoll | null {
  if (!isRecord(raw)) return null;
  const { label, dice, faces, dropped, modifier, total } = raw;
  if (!isDice(faces) || faces.length < 1 || !isDice(dropped) || !isWhole(modifier) || !isWhole(total)) return null;
  if (label !== null && typeof label !== "string") return null;
  if (dice !== null && typeof dice !== "string") return null;
  return { label, dice, faces: [...faces], dropped: [...dropped], modifier, total };
}

/**
 * The three texts of the Dungeon Master's roll line. The dice notation leads when the server passed it on ("1d20+2");
 * without it the modifier is spelled out, so the total can still be checked against the dice.
 */
export function dmRollLine(roll: DmRoll): RollLine {
  const rolled = `rolled ${roll.faces.join(", ")}`;
  const aside = roll.dropped.length > 0 ? `, set aside ${roll.dropped.join(", ")}` : "";
  const modifier = roll.modifier > 0 ? ` + ${roll.modifier}` : roll.modifier < 0 ? ` - ${-roll.modifier}` : "";
  return {
    total: String(roll.total),
    title: roll.label === null ? "The Dungeon Master rolled" : `The Dungeon Master rolled: ${roll.label}`,
    detail: roll.dice === null ? `${rolled}${aside}${modifier}` : `${roll.dice} · ${rolled}${aside}`,
  };
}
