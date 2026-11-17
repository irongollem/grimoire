/** What a minute of speech costs in credits on each service; null where the service cannot speak. */
export interface VoiceRateView {
  on: boolean;
  perMinute: { elevenlabs: number | null; inworld: number | null };
}

const credits = (n: number): string => `${n} ${n === 1 ? "credit" : "credits"}`;

/**
 * The one sentence that says what the voices cost, before anyone switches one on. The dearest rate is the one
 * named ("up to"), because which voice a character has is the campaign's choice and not the player's; a cheaper
 * one is mentioned when there is one. Null when voices are off or nothing is priced.
 */
export function voiceCostLine(rates: VoiceRateView): string | null {
  if (!rates.on) return null;
  const priced = [rates.perMinute.elevenlabs, rates.perMinute.inworld].filter((n): n is number => n !== null && n > 0);
  if (priced.length === 0) return null;
  const most = Math.max(...priced);
  const least = Math.min(...priced);
  const rate = least < most ? `up to ${credits(most)} for a minute of speech (some voices cost about ${least})` : `about ${credits(most)} for a minute of speech`;
  return `Voices cost credits on top of the story: ${rate}. Each line is charged once, when it is first read; hearing it again is free.`;
}
