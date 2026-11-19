/** What a turn that did not happen says, and what the page offers next (Wrong frame). */
export interface TurnFailure {
  /** One plain sentence under the player's line. */
  message: string;
  /** What the page offers: send the same message again, buy credits, or only the sentence. `ended`: the page leaves the table. */
  action: "resend" | "credits" | "none" | "ended";
}

/** The Narrator did not answer: a broken stream, a dropped connection, the model's maker being busy. */
export const NO_ANSWER: TurnFailure = {
  message: "The Narrator did not answer. Nothing was charged.",
  action: "resend",
};

/** The answer was dropped by the check on what the table may tell: sending the same again would only repeat it. */
export const WITHHELD: TurnFailure = {
  message: "The Narrator's answer was withheld: it went somewhere this table does not tell. Nothing was charged. Try something else.",
  action: "none",
};

/**
 * The server's refusal before the stream opened (`{ error }` with a status) as a sentence for the player.
 * Keyed on the status and the few codes the function names, never on its wording, which is written for logs.
 * Every one of these is a turn that was not kept, so nothing was charged for it.
 */
export function refusalFailure(status: number, code: string | null): TurnFailure {
  if (status === 402 || code === "insufficient_credits") {
    return {
      message: "You are out of credits. The story is saved and waits for you. Nothing was charged for the message you just tried to send.",
      action: "credits",
    };
  }
  // A long pause ended the sitting (`sittingLength.ts`). Before the statuses: it is a 409 like any other otherwise.
  if (code === "sitting_ended") {
    return { message: "This sitting ended while you were away. Sit down again to pick the story up.", action: "ended" };
  }
  if (status === 429 || code === "rate_limited") {
    return { message: "The table is catching its breath. Wait a moment and send again.", action: "resend" };
  }
  if (status === 400) {
    return {
      message: "That message cannot be sent to the table. It was stopped by the check on what may be sent to the model. Reword it and send again.",
      action: "none",
    };
  }
  if (code === "table_closed") {
    return {
      message: "The table is closed to this account for now, after several messages that may not be sent to it. If you think that is a mistake, write to support.",
      action: "none",
    };
  }
  if (code === "child_account") {
    return { message: "This table is not open to a child account.", action: "none" };
  }
  if (status === 403) {
    return { message: "This table is not open to you. AI must be on for the campaign, and only its Dungeon Masters sit here.", action: "none" };
  }
  if (status === 404) {
    return { message: "That story, character or place could not be found in this campaign.", action: "none" };
  }
  if (status === 401) {
    return { message: "You were signed out. Sign in again; the story is saved.", action: "none" };
  }
  return {
    message: "The table is resting. The AI table is not available right now. Your story is saved; try again in a little while.",
    action: "resend",
  };
}
