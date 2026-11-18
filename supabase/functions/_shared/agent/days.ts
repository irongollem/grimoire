// Days passing at the AI table (#1222, story 4's open half, for the table).
//
// A journey takes days, and so do a long wait and a week of mending: the campaign's own date has to move with the
// story, or the calendar, the weather and everything due on a day stand still while the party crosses a country.
// The narrator says how many whole days passed; the page moves the date, because the campaign's calendar (its
// months, its leap days, a setting's own reckoning) lives with the app, and the date is the campaign owner's own
// row to write. Like a ruling on the board, it is carried out once the turn is kept.
//
// Pure: no I/O.

import type { AgentTool } from "./types.ts";

export const PASS_DAYS_TOOL_NAME = "pass_days";
/** Two months in one reply is a long campaign's skip; more than that is a mistake or a different story. */
export const MAX_DAYS_PASSED = 60;

export const PASS_DAYS_TOOL: AgentTool = {
  name: PASS_DAYS_TOOL_NAME,
  description:
    "Moves the campaign's date on by whole days, when the story did: a journey (give the days on the calendar that " +
    "travel answered), a long wait, days of rest or work. Call it once, with the total, in the reply that tells " +
    "those days. Not for hours, a night's sleep in the same place, or anything inside a fight.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["days"],
    properties: {
      days: { type: "integer", minimum: 1, maximum: MAX_DAYS_PASSED, description: "Whole days that passed." },
    },
  },
};

export type ParsedDays = { ok: true; days: number } | { ok: false; error: string };

export function parsePassDays(input: Record<string, unknown>): ParsedDays {
  const days = input.days;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > MAX_DAYS_PASSED) {
    return { ok: false, error: `days must be a whole number from 1 to ${MAX_DAYS_PASSED}.` };
  }
  return { ok: true, days };
}

export function passedText(days: number): string {
  return `${days} ${days === 1 ? "day passes" : "days pass"}. The campaign's date moves on with ${days === 1 ? "it" : "them"} when this reply is kept.`;
}
