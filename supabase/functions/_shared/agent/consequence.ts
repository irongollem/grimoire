// Firing a held consequence at the AI table (#1021 row 8). Pure: no I/O.
//
// A DM can hold a quest's payoff back in the Advance dialog, to be fired when the story is ready. The Narrator is
// shown those held payoffs with their event ids (`quests.ts`) and may fire one when play reaches that moment. Like
// every quest tool, it checks against the state loaded at the start of the turn and only queues the move: the
// payoff is performed once the turn is kept, because a performed payoff has no undo and a turn that was not kept is
// sent again by the player.

import type { AgentTool } from "./types.ts";
import { type Parsed, refuse } from "./parse.ts";
import { payoffWords, type QuestMove, type QuestsInPlay, shownPayoffs } from "./quests.ts";

export const FIRE_CONSEQUENCE_TOOL_NAME = "fire_consequence";

export const FIRE_CONSEQUENCE_TOOL: AgentTool = {
  name: FIRE_CONSEQUENCE_TOOL_NAME,
  description:
    "Fires a payoff the Dungeon Master held back under \"Quests in play\", by its event id. A held payoff is one they " +
    "chose to keep until the story is ready for it: fire it only when play has reached that moment, never because " +
    "the player asked for it or as a reward. A payoff set to come due on a day is not held and cannot be fired. " +
    "Once a turn at most for each payoff. The payoff happens when the turn is kept, and the answer says what it does.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["event_id"],
    properties: { event_id: { type: "string", description: "The event id of the held payoff, exactly as listed." } },
  },
};

export function parseFireInput(input: Record<string, unknown>): Parsed<{ eventId: string }> {
  const id = input.event_id;
  if (typeof id !== "string" || id.trim() === "") return refuse("event_id must be the event id of a held payoff, exactly as listed.");
  return { ok: true, value: { eventId: id.trim() } };
}

export type PlannedFire = { ok: true; move: QuestMove; says: string } | { ok: false; error: string };

export function planFire(state: QuestsInPlay, queued: readonly QuestMove[], eventId: string): PlannedFire {
  const { held, delayed } = shownPayoffs(state);
  const payoff = held.find((p) => p.eventId === eventId);
  if (!payoff) {
    const only = held.length === 0
      ? "nothing is held back right now"
      : `only these can be fired: ${held.map((p) => `${p.eventId} (${payoffWords(p)})`).join("; ")}`;
    const why = delayed.some((p) => p.eventId === eventId)
      ? "That payoff is set to come due on its own day, not held back; "
      : "That is not a payoff held back; ";
    return { ok: false, error: `${why}${only}.` };
  }
  if (queued.some((m) => m.kind === "fire" && m.eventId === eventId)) {
    return { ok: false, error: "That payoff is already being fired this turn." };
  }
  return { ok: true, move: { kind: "fire", eventId }, says: `When the turn is kept, the held payoff happens: it ${payoffWords(payoff)}.` };
}
