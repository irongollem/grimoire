/**
 * Plain, player-facing sentences for what generate-character-doll (or the job
 * it starts) can answer. `raw` is what edgeErrorMessage or the job row gave:
 * usually the function's error code, sometimes a sentence the server wrote.
 */
export const DOLL_FALLBACK_ERROR = "The doll could not be made. You have not been charged.";

/**
 * Translate a trimmed generator error into a player-facing message. Preserve
 * recognized screening, credit, rate, and account messages; use the generic
 * fallback for unrecognized errors.
 */
export function dollErrorMessage(raw: string): string {
  const text = raw.trim();
  switch (text) {
    case "no_portrait":
      return "Add a portrait first: the doll is drawn from it.";
    case "doll_in_progress":
      return "Your doll is already being drawn.";
    case "ai_disabled":
      return "Your DM has turned AI off for this table.";
    case "forbidden":
      return "Only the character's player or the campaign's DM can make its doll.";
    case "no_campaign":
      return "Open a campaign first.";
    // The client gate normally catches this; the server checks again in case
    // the notice changed since it was accepted.
    case "likeness_acknowledgement_required":
      return "Confirm the likeness notice first, then try again.";
    case "not_found":
      return "This character could not be found.";
    default:
      break;
  }
  // The server's own wording is worth keeping for a refusal (the player can
  // reword or pick another portrait) and for the credit and rate messages.
  if (/content screening|insufficient credits|too fast|frozen|aren't available/i.test(text)) return text;
  return DOLL_FALLBACK_ERROR;
}

/** What the player or DM sees when setting or clearing a doll ask failed. */
export const DOLL_ASK_ERROR = "The request could not be updated. Try again.";
