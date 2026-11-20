import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { functionErrorPayload } from "@edge-shared/functionError.ts";

/**
 * Plain, player-facing sentences for what generate-character-doll (or the job
 * it starts) can answer. `raw` is what edgeErrorMessage or the job row gave:
 * usually the function's error code, sometimes a sentence the server wrote.
 */
export const DOLL_FALLBACK_ERROR = "The doll could not be made. You have not been charged.";

/**
 * What a failed generate-character-doll call said: the stable `code` from the body (the shared refusals answer
 * `{ error: code, message: sentence }`, and `edgeErrorMessage` shows the sentence, so the code is read from the body
 * itself) and the sentence to show when the code is not one the doll knows. A body can be read once, so both come from
 * one read.
 */
export async function readDollFailure(fnError: { message?: string; context?: Response }): Promise<{ code: string | null; sentence: string }> {
  const payload = await functionErrorPayload(fnError);
  const sentence = await edgeErrorMessage({ message: fnError.message, context: new Response(JSON.stringify(payload)) });
  return { code: payload?.error ?? null, sentence };
}

/**
 * Translate a generator error into a player-facing message. `code` is the response's error code when there was one
 * (a job row's failure has none: its `raw` text is all there is). Preserve recognized screening, credit, rate, and
 * account messages; use the generic fallback for unrecognized errors.
 */
export function dollErrorMessage(raw: string, code?: string | null): string {
  const text = raw.trim();
  switch (code ?? text) {
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
    case "campaign_not_found":
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
