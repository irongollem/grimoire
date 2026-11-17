// The played character's hit points outside a fight (#1021).
//
// Seen live: Honeycomb gave Rosie a healing potion, the narrator wrote "8 hit points are restored", and the sheet
// stayed at 15 of 58. The narrator had named a number it never rolled and had no way to make it true. In a fight the
// board holds everyone's hit points; outside one nothing did.
//
// Three rules:
//   1. The narrator never names the amount. It rolls the dice with the roll tool first, and this takes that roll's
//      total: no roll this turn, no change.
//   2. One change a turn, written when the turn is kept, like every other write of a turn.
//   3. When the healing or the harm came out of a thing someone carried (a potion, a salve), that thing is used up:
//      the narrator says whose it was and what it was, and one of it leaves their belongings.
//
// Pure: no I/O.

import type { AgentTool } from "./types.ts";

export const HIT_POINTS_TOOL_NAME = "hit_points";
export const WHY_MAX = 80;
export const THING_MAX = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const HIT_POINTS_TOOL: AgentTool = {
  name: HIT_POINTS_TOOL_NAME,
  description:
    "Heals or harms the player's character outside a fight, on their sheet. First roll the dice with the roll tool " +
    "(a Potion of Healing is 2d4+2, a fall is 1d6 per 10 feet); this takes the total of the roll you made last in " +
    "this reply, so never state an amount yourself and never tell the player a number you did not roll. Say whether " +
    "it heals or harms and, in a few words, what did it. When it came out of a thing a character carried and it is " +
    "now used up (a potion drunk, a salve spent), give that character's id as used_by and the thing's name as " +
    "used_thing: one of it leaves their belongings. One change a turn; it is made when the turn is kept. In a fight " +
    "the board keeps the hit points and this tool is not offered.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      change: { type: "string", enum: ["heal", "harm"], description: "Whether the character gains or loses hit points." },
      why: { type: "string", maxLength: WHY_MAX, description: "What did it, in a few words the player may read: \"Potion of Healing\", \"The fall from the gallery\"." },
      used_by: { type: "string", description: "The id of the character whose thing was used up. Leave out when nothing was." },
      used_thing: { type: "string", maxLength: THING_MAX, description: "The name of the thing used up, as it is among their belongings." },
    },
    required: ["change", "why"],
  },
};

export interface HitPointChange {
  change: "heal" | "harm";
  /** The total of the narrator's roll: what was gained or lost before the sheet's limits. */
  rolled: number;
  why: string;
  /** The character's hit points once this is kept, between nothing and their most. */
  after: number;
  max: number;
  /** The thing that was used up for it, and whose it was; null when nothing was. */
  used: { characterId: string; thing: string } | null;
}

type Parsed = { ok: true; value: HitPointChange } | { ok: false; error: string };

export function parseHitPointChange(
  input: Record<string, unknown>,
  ctx: { hitPoints: { current: number; max: number } | null; lastRoll: number | null },
): Parsed {
  if (ctx.hitPoints === null) return { ok: false, error: "The player's character has no hit points on their sheet, so there is nothing to change." };
  const { change, why, used_by: usedBy, used_thing: usedThing } = input;
  if (change !== "heal" && change !== "harm") return { ok: false, error: "change must be \"heal\" or \"harm\"." };
  if (typeof why !== "string" || why.trim() === "") return { ok: false, error: "why is required: what did it, in a few words." };
  if (why.trim().length > WHY_MAX) return { ok: false, error: `why is at most ${WHY_MAX} characters.` };
  if (ctx.lastRoll === null) return { ok: false, error: "Roll the dice first with the roll tool (a Potion of Healing is 2d4+2), then call this again: it takes that roll's total. Never state an amount yourself." };
  if (ctx.lastRoll < 1) return { ok: false, error: "The roll came to nothing, so nothing changes. Tell that." };
  let used: HitPointChange["used"] = null;
  if (usedBy !== undefined || usedThing !== undefined) {
    if (typeof usedBy !== "string" || !UUID.test(usedBy)) return { ok: false, error: "used_by must be the id of the character whose thing was used up." };
    if (typeof usedThing !== "string" || usedThing.trim() === "" || usedThing.trim().length > THING_MAX) return { ok: false, error: "used_thing must be the name of the thing that was used up." };
    used = { characterId: usedBy, thing: usedThing.trim() };
  }
  const { current, max } = ctx.hitPoints;
  const after = change === "heal" ? Math.min(max, current + ctx.lastRoll) : Math.max(0, current - ctx.lastRoll);
  return { ok: true, value: { change, rolled: ctx.lastRoll, why: why.trim(), after, max, used } };
}

/** What the narrator is told once the change is taken. */
export function hitPointsText(c: HitPointChange, before: number): string {
  const moved = Math.abs(c.after - before);
  const verb = c.change === "heal" ? "regains" : "loses";
  const note =
    c.change === "heal" && moved < c.rolled
      ? moved === 0 ? " They were already unhurt." : " The rest is wasted: they are unhurt now."
      : c.change === "harm" && c.after === 0 ? " They drop to 0 hit points and fall unconscious: tell that." : "";
  return `The player's character ${verb} ${moved} hit points and stands at ${c.after} of ${c.max} once this turn is kept.${note} Tell the amount as rolled, once.`;
}

/** The total of a `roll` tool's answer, open or hidden; null when the answer is not a roll. */
export function rollTotal(content: string): number | null {
  try {
    const answer: unknown = JSON.parse(content);
    if (typeof answer !== "object" || answer === null) return null;
    const total = (answer as Record<string, unknown>).total;
    return typeof total === "number" && Number.isInteger(total) ? total : null;
  } catch {
    return null;
  }
}
