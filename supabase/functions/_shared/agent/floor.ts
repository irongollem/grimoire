// Who has the floor when a turn ends (#1021).
//
// At a table the world does not stop because the player has been given a chance to speak. When the characters are
// in the middle of a conversation among themselves (an argument by the campfire, two guards settling who goes
// first), the player may want to sit back and watch it unfold (the maintainer, 18 Nov 2026: "in some games you want
// to see how NPCs talk to each other sometimes rather than making you the hero all the time"). So the question at
// the end of a turn is not "has the conversation reached a pause" but "is there a reason to hand the turn back
// right now". When there is none, the turn ends with the floor still the characters', and the page may let them
// go on without the player saying anything. The player can always step in.

import type { AgentTool } from "./types.ts";

export type Floor = "player" | "characters";

export const KEEP_TALKING_TOOL_NAME = "keep_talking";

/**
 * Whether a conversation has more in it is a judgement, so the narrator can say so. Seen live (18 Nov 2026): the
 * player sat down "just to listen" while two characters argued, one of them spoke to the whole room, and the turn
 * was handed back to the player after a single line, because nothing but a call's limits counted as "still going".
 */
export const KEEP_TALKING_TOOL: AgentTool = {
  name: KEEP_TALKING_TOOL_NAME,
  description:
    "Says the people here go on talking among themselves without waiting for the player. Call it as the last thing " +
    "in your reply when a conversation between characters is under way and has more in it (an argument not " +
    "settled, a plan half made, a story half told) and the player's character is listening or busy with something " +
    "else: they will then speak again without the player having to say anything, and the player can step in at any " +
    "moment. Never call it when someone has asked the player something or turned to them, when a decision is the " +
    "player's to make, when you asked for a roll, or when nothing more would be said.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      why: { type: "string", maxLength: 160, description: "What is still unsaid between them, in a few words. Never shown to the player." },
    },
    required: ["why"],
  },
};

/**
 * Whose floor it is as a turn ends. The characters keep it when the last exchange of the turn was still going
 * between them (cut short by the limits of one call) or the narrator said they go on (`keep_talking`), provided
 * nobody has turned to the player and nothing else waits on them: no roll asked for, no fight begun or being
 * fought, and the turn ran to its end.
 */
export function floorOf(input: {
  /** The last exchange of the turn: how it ended, and whether only its limits stopped it. Null when nobody spoke. */
  lastExchange: { ended: "to_player" | "open"; cutShort: boolean } | null;
  /** The narrator said the characters go on among themselves. */
  narratorKeeps: boolean;
  /** A roll is being asked of the player. */
  rollAsked: boolean;
  /** A fight was started this turn or is being fought on the board. */
  inFight: boolean;
  /** The turn ran to its own end (not stopped, not out of steps). */
  finished: boolean;
}): Floor {
  if (!input.finished || input.rollAsked || input.inFight) return "player";
  // Nobody spoke: there is no conversation to go on. Someone turned to the player: it is theirs to answer,
  // whatever the narrator thought.
  if (input.lastExchange === null || input.lastExchange.ended === "to_player") return "player";
  return input.lastExchange.cutShort || input.narratorKeeps ? "characters" : "player";
}

/**
 * What the narrator reads in place of a player's message when the player says nothing and goes on listening.
 */
export const LISTENING_TEXT =
  "The player's character says nothing and goes on listening. The people here go on with what they were saying to " +
  "each other: call speak for the one who was last spoken to, or for whoever would speak next, with nothing new " +
  "from the player. Add no narration of your own unless something new reaches the senses, and never repeat what " +
  "was said. If the conversation has run its course, or someone now turns to the player, end with one short " +
  "sentence at most, and call keep_talking only if there is still more between them. Decide nothing for the " +
  "player's character, ask for no roll, and mark no quest move.";
