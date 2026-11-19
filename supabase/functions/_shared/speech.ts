// The speech services, as every function that speaks uses them (#1021): the AI table's lines (`table-voice`) and a
// note read aloud (`note-reading`). One place calls ElevenLabs and Inworld and one place reads what a character of
// speech costs, so a second speaker cannot drift from the first.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditCalibration } from "./agent/metering.ts";

export type SpeechService = "elevenlabs" | "inworld";

/** The speech allowance of the stack's own account is used up: nothing is wrong with the request. */
export class VoicesSpent extends Error {}

// Eleven v4 Turbo: half the cost of v4 and two to three times sooner back. The maintainer compared the two by ear on
// three voices (17 Nov 2026): "every turbo is almost identical to the non turbo, unless its for a very specific
// project i think turbo is fine". `TABLE_VOICE_MODEL` names another for such a project (`eleven_v4` for the fuller
// acting); a clip already kept was made by whichever model spoke it first.
export const DEFAULT_ELEVEN_MODEL = "eleven_v4_turbo";
export const INWORLD_MODEL = "inworld-tts-2";
export const SPEECH_TIMEOUT_MS = 30_000;

export interface SpeechEnv {
  elevenKey: string | undefined;
  inworldKey: string | undefined;
  elevenModel: string;
}

export function speechEnvFrom(env: (key: string) => string | undefined): SpeechEnv {
  const named = env("TABLE_VOICE_MODEL");
  return { elevenKey: env("ELEVENLABS_API_KEY"), inworldKey: env("INWORLD_API_KEY"), elevenModel: named !== undefined && named.trim() !== "" ? named.trim() : DEFAULT_ELEVEN_MODEL };
}

export const hasSpeechService = (env: SpeechEnv, service: SpeechService): boolean => (service === "inworld" ? !!env.inworldKey : !!env.elevenKey);

/** The model a service speaks with, which is also the row its price is kept under. */
export const speechModelOf = (env: SpeechEnv, service: SpeechService): string => (service === "inworld" ? INWORLD_MODEL : env.elevenModel);

export function bytesFromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/**
 * Speaks the text in the voice and answers the audio (MP3). The text is sent as given: how a cue is put to each
 * service is the caller's (`voicePick.ts`). Throws `VoicesSpent` when the account's allowance is used up, and an
 * ordinary error when the service fails.
 */
export async function synthesizeSpeech(env: SpeechEnv, voice: { service: SpeechService; id: string }, text: string): Promise<Uint8Array> {
  if (voice.service === "inworld") {
    const response = await fetch("https://api.inworld.ai/tts/v1/voice", {
      method: "POST",
      headers: { Authorization: `Basic ${env.inworldKey ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: INWORLD_MODEL, text, voiceId: voice.id, audioConfig: { audioEncoding: "MP3" } }),
      signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`inworld answered ${response.status}`);
    const body = (await response.json().catch(() => null)) as { audioContent?: unknown } | null;
    if (!body || typeof body.audioContent !== "string" || body.audioContent === "") throw new Error("inworld answered without audio");
    return bytesFromBase64(body.audioContent);
  }
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.id)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.elevenKey ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: env.elevenModel }),
    signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
  });
  if (!response.ok) {
    // Only the service's own status word is read, never its message.
    const detail = (await response.json().catch(() => null)) as { detail?: { status?: unknown } } | null;
    if (detail?.detail?.status === "quota_exceeded") throw new VoicesSpent("the speech allowance is used up");
    throw new Error(`speech service answered ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** The admin's numbers: what the service's model costs by the character, and what a credit is worth. Null when either is not set. */
export async function loadSpeechRate(admin: SupabaseClient, env: SpeechEnv, service: SpeechService): Promise<{ usdPerMillionChars: number; calibration: CreditCalibration } | null> {
  const [price, calibration] = await Promise.all([
    admin.from("ai_model_pricing").select("cost_per_million_characters_usd").eq("model", speechModelOf(env, service)).maybeSingle(),
    admin.rpc("agent_credit_calibration"),
  ]);
  if (price.error) throw price.error;
  if (calibration.error) throw calibration.error;
  const row = Array.isArray(calibration.data) ? calibration.data[0] : calibration.data;
  const rate = price.data?.cost_per_million_characters_usd;
  if (rate === null || rate === undefined || !row || row.usd_per_credit === null) return null;
  const usdPerMillionChars = Number(rate);
  const usdPerCredit = Number(row.usd_per_credit);
  const margin = Number(row.margin);
  if (!(usdPerMillionChars > 0) || !(usdPerCredit > 0) || !(margin > 0)) return null;
  return { usdPerMillionChars, calibration: { usdPerCredit, margin } };
}
