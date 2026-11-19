import { creditsForUsd, type CreditCalibration } from "./metering.ts";

/**
 * What a line read aloud costs (#1021). Speech is priced by the character of text sent to the service
 * (`ai_model_pricing.cost_per_million_characters_usd`, the admin's to change), and charged like a turn of the
 * story: that cost times the admin's margin, in credits, accrued exactly on the conversation with only whole
 * credits billed (`accrue_agent_voice`). A cheaper service is cheaper for the player too: each line is charged
 * what it cost. A line already made is kept and is never charged again.
 */

/** The characters a line sends to be spoken: its words and, when it has one, its cue with the brackets around it. */
export function speechChars(text: string, how: string | null): number {
  return text.length + (how === null || how === "" ? 0 : how.length + 3);
}

/** Exact, in credits. A rate that is not a positive number throws: a missing price must never make speech free. */
export function creditsForSpeech(chars: number, usdPerMillionChars: number, calibration: CreditCalibration): number {
  if (!Number.isFinite(usdPerMillionChars) || usdPerMillionChars <= 0) throw new Error("Speech price is not usable");
  return creditsForUsd((Math.max(0, chars) * usdPerMillionChars) / 1_000_000, calibration);
}

/** About how many characters a minute of speech is: for telling a player what a voice costs, never for charging. */
export const CHARS_PER_MINUTE = 900;

/** What a minute of speech costs in credits, rounded up to a tenth, for the page to show before anything is spent. */
export function creditsPerMinute(usdPerMillionChars: number, calibration: CreditCalibration): number {
  return Math.ceil(creditsForSpeech(CHARS_PER_MINUTE, usdPerMillionChars, calibration) * 10) / 10;
}
