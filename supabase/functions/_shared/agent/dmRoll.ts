// A roll the Dungeon Master made, as the page may show it (#1021, Solo Table canvas: "The Dungeon Master rolled how
// warmly Honeycomb takes to you / d20 (20) / Rolled by Grimoire").
//
// The narrator rolls through the campaign's `roll` tool, which rolls on the server and posts to the campaign's chat.
// Until now the page showed only that something was rolled. This reads the tool's own answer and keeps what a
// player at a table would see of the DM's dice: what it was for, the dice, the modifier and the total.
//
// One rule: a roll the narrator made hidden is not shown at all, not even that it happened. The tool's answer says
// `hidden`; anything that does not plainly say it was an open roll is treated as hidden.
//
// Pure: no I/O.

import type { DmRoll } from "./types.ts";
import { isRecord } from "./parse.ts";

const LABEL_MAX = 80;
/** The roll tool takes at most 100 dice; more than that in an answer is not an answer this code knows. */
const DICE_MAX = 100;

const isWhole = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);
const isDice = (x: unknown): x is number[] => Array.isArray(x) && x.length <= DICE_MAX && x.every((f) => isWhole(f) && f >= 1);

/** Dice notation and nothing else: the expression is the model's own text, and only digits, d, + and - are shown. */
function notation(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tight = raw.replace(/\s+/g, "").toLowerCase();
  return /^[0-9d+-]{2,24}$/.test(tight) && tight.includes("d") ? tight : null;
}

/** A roll already parsed (a stored block, or the tool's answer as an object), or null when it is not a shown roll. */
export function asDmRoll(raw: unknown): DmRoll | null {
  if (!isRecord(raw)) return null;
  const { label, dice, faces, dropped, modifier, total } = raw;
  if (!isDice(faces) || faces.length < 1 || !isDice(dropped) || !isWhole(modifier) || !isWhole(total)) return null;
  if (label !== null && typeof label !== "string") return null;
  const named = typeof label === "string" ? label.trim().slice(0, LABEL_MAX) : "";
  return { label: named === "" ? null : named, dice: notation(dice), faces: [...faces], dropped: [...dropped], modifier, total };
}

/**
 * The roll in a `roll` tool's answer, or null when there is none to show: the answer is not JSON, is not a roll, or
 * was rolled hidden. Only a literal `hidden: false` is an open roll.
 */
export function shownDmRoll(content: string, expression?: unknown): DmRoll | null {
  let answer: unknown;
  try {
    answer = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(answer) || answer.hidden !== false) return null;
  return asDmRoll({
    label: typeof answer.label === "string" ? answer.label : null,
    dice: expression,
    faces: answer.faces,
    dropped: answer.dropped_faces,
    modifier: answer.modifier,
    total: answer.total,
  });
}
