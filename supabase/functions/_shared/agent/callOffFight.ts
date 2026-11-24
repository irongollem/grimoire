// A correction reaching a fight (#1021 row 23, "That's not what happened").
//
// The player overruled what was told, and what they said is true from now on, a fight's outcome as much as one
// sentence ("we're not gatekeeping", the maintainer, 18 Nov 2026). Live on 24 Nov 2026 the player attacked a
// sentry, the Narrator started a fight, and the correction "it never noticed me; I slipped past it" was told and
// filed while the fight stayed set on the sitting: `fight_change` needs the player's successful roll, and is
// offered only while the board is running. A correction is not an attempt, so this tool asks for no roll, costs
// the turn nothing, and is offered whether the fight is running or only set up.
//
// Four ways, three of which are what `fight_change` ends a fight with (and are carried out the same way), and one
// it has no word for: the fight never happened.
//
// Pure: no I/O.

import type { AgentTool } from "./types.ts";
import { chaseText, changedText, type FightChange, type FightEnd } from "./fightChange.ts";
import type { FightState } from "./fight.ts";
import { isRecord, refuse, type Parsed } from "./parse.ts";

export const CALL_OFF_HOW = ["never_happened", "they_give_in", "they_flee", "you_get_away"] as const;
export type CallOffHow = (typeof CALL_OFF_HOW)[number];

export const CALL_OFF_FIGHT_TOOL_NAME = "call_off_fight";

export const CALL_OFF_FIGHT_TOOL: AgentTool = {
  name: CALL_OFF_FIGHT_TOOL_NAME,
  description:
    "Only in a correction: ends the fight on the board (or the one set up and not yet begun) because the player's " +
    "sentence means it did not happen, or ended some other way. No roll is asked and nothing is spent: the player's " +
    "word is the ruling. never_happened: the fight was never fought (the foe never noticed, nobody drew); the foes " +
    "are where they were, unhurt, and nothing is awarded. they_give_in, they_flee, you_get_away: the fight happened " +
    "and ended so, exactly as with fight_change. Once a reply, and not together with fight_change.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      how: { type: "string", enum: [...CALL_OFF_HOW], description: "How the corrected story has the fight end." },
    },
    required: ["how"],
  },
};

export function parseCallOff(input: Record<string, unknown>): Parsed<CallOffHow> {
  if (!isRecord(input)) return refuse("how is one of: " + CALL_OFF_HOW.join(", ") + ".");
  const how = CALL_OFF_HOW.find((h) => h === input.how);
  if (how === undefined) return refuse("how is one of: " + CALL_OFF_HOW.join(", ") + ".");
  return { ok: true, value: how };
}

/** The ending as the page's board carries it out, or null for `never_happened`, which the board has nothing to end for. */
export function boardEndOf(how: CallOffHow): FightEnd | null {
  return how === "never_happened" ? null : how;
}

/** The ruling the page applies to end a fight the correction ended by one of the three endings: no cost, nothing else. */
export function endingChange(end: FightEnd): FightChange {
  return { costs: "nothing", condition: null, damage: null, ends: end };
}

/** What the narrator is told once the fight is called off; the three endings say what `fight_change` says of them. */
export function calledOffText(how: CallOffHow, fight: FightState): string {
  if (how === "never_happened") {
    return "When this turn is kept: the fight is gone from the table. It never happened: its foes are where they were, unhurt and with nothing awarded. Tell on from the corrected moment, and do not narrate a fight.";
  }
  const told = changedText(endingChange(how));
  return how === "you_get_away" ? `${told} ${chaseText(fight)}` : told;
}
