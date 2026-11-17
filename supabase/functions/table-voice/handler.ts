// table-voice (#1021): one spoken line of a sitting at the AI table, as audio. No Deno and no Supabase in here;
// everything with I/O comes in through `TableVoiceDeps`, so the rules are tested against an in-memory harness
// (`handler.test.ts`) and `index.ts` only wires real dependencies to them.
//
// What keeps this from being a speech service for anything a caller types:
//   - the caller must own the conversation, in a campaign they run with AI on;
//   - the words must be a line that conversation SHOWED, spoken by that speaker, with the cue the character gave.
//     `agent-turn` signs each spoken line as it sends it (`_shared/agent/lineKey.ts`); the request carries the line
//     and its key, and a line whose key does not fit is refused. So a line is voiced the moment it is shown, not
//     once its turn is kept, and nothing about it can be changed by the page.
//
// NOT METERED YET. Every call is a paid request to a speech service on the platform's key, and nothing here charges
// credits for it. So it answers only where both the key and `TABLE_VOICE_TRIAL=on` are set, which today is the
// maintainer's own stack. Before either is set in production, voice has to be priced and charged like every other
// generation (`_shared/credits.ts`).

import { pickVoice, speechText, type AgeBand, type Sex } from "./voicePick.ts";

export interface VoiceRefusal {
  status: number;
  error: string;
}

export interface VoiceSession {
  id: string;
  user_id: string;
  campaign_id: string;
}

export interface VoiceCampaign {
  id: string;
  user_id: string;
  ai_enabled: boolean | null;
}

export interface TableVoiceDeps {
  /** Whether voices are switched on for this stack: the speech key and the trial switch are both set. */
  voiceOn(): boolean;
  /** By id alone: the handler decides whether it belongs to the caller. */
  loadSession(sessionId: string): Promise<VoiceSession | null>;
  loadCampaign(campaignId: string): Promise<VoiceCampaign | null>;
  isDm(campaign: VoiceCampaign, userId: string): Promise<boolean>;
  rateLimit(userId: string): Promise<boolean>;
  /** Whether the key is the one `agent-turn` gave for exactly this line of this conversation. */
  keyFits(sessionId: string, line: { speaker: { id: string | null; name: string }; text: string; how: string | null }, key: string): boolean;
  /**
   * What the character's record says of its sex and age, for casting, and the voice the DM gave it
   * (`npcs.spoken_voice_id`); nulls when it says nothing or has no record.
   */
  loadTraits(campaignId: string, speakerId: string): Promise<SpeakerTraits>;
  /** Speaks the text in the voice and answers the audio (mp3, base64). Throws when the speech service fails. */
  synthesize(voiceId: string, text: string): Promise<string>;
}

export interface SpeakerTraits {
  sex: Sex | null;
  age: AgeBand | null;
  voiceId: string | null;
}

/** A voice id as the speech service writes them. It goes into a URL, so anything else is not used. */
export const VOICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** The voice the DM gave the character, or null when there is none or it is not an id. */
export function ownVoice(traits: Pick<SpeakerTraits, "voiceId">): string | null {
  return traits.voiceId !== null && VOICE_ID_RE.test(traits.voiceId) ? traits.voiceId : null;
}

export const VOICE_MESSAGES = {
  badBody: "The request is not valid.",
  off: "Voices are not switched on.",
  notFound: "That conversation was not found.",
  aiOff: "AI is disabled for this campaign.",
  forbidden: "Only the campaign's DM can use the AI table.",
  rateLimited: "rate_limited",
  noLine: "That line is not one this sitting has shown.",
  failed: "The line could not be spoken right now.",
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VoiceBody {
  campaignId: string;
  sessionId: string;
  /** The speaker's record, or null for someone with no record. */
  speakerId: string | null;
  speakerName: string;
  text: string;
  /** The character's cue for how it is said, as the line carried it; null when it had none. */
  how: string | null;
  /** The key the line came with. */
  key: string;
}

export function parseVoiceBody(raw: unknown): VoiceBody | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.campaignId !== "string" || !UUID_RE.test(r.campaignId)) return null;
  if (typeof r.sessionId !== "string" || !UUID_RE.test(r.sessionId)) return null;
  if (r.speakerId !== null && (typeof r.speakerId !== "string" || !UUID_RE.test(r.speakerId))) return null;
  if (typeof r.speakerName !== "string" || r.speakerName.trim() === "" || r.speakerName.length > 200) return null;
  if (typeof r.text !== "string" || r.text.trim() === "" || r.text.length > 4000) return null;
  const how = r.how === undefined || r.how === null ? null : r.how;
  if (how !== null && (typeof how !== "string" || how.length > 400)) return null;
  if (typeof r.key !== "string" || r.key === "" || r.key.length > 200) return null;
  return { campaignId: r.campaignId, sessionId: r.sessionId, speakerId: r.speakerId, speakerName: r.speakerName, text: r.text, how, key: r.key };
}

export async function speakLine(input: {
  userId: string;
  body: unknown;
  deps: TableVoiceDeps;
}): Promise<{ ok: true; audio: string; mime: "audio/mpeg" } | { ok: false; refusal: VoiceRefusal }> {
  const { userId, deps } = input;
  const refuse = (status: number, error: string) => ({ ok: false as const, refusal: { status, error } });

  const body = parseVoiceBody(input.body);
  if (!body) return refuse(400, VOICE_MESSAGES.badBody);
  if (!deps.voiceOn()) return refuse(503, VOICE_MESSAGES.off);

  // Someone else's conversation, or one in another campaign, is "not found": a 403 would say it exists.
  const session = await deps.loadSession(body.sessionId);
  if (!session || session.user_id !== userId || session.campaign_id !== body.campaignId) return refuse(404, VOICE_MESSAGES.notFound);
  const campaign = await deps.loadCampaign(session.campaign_id);
  if (!campaign) return refuse(404, VOICE_MESSAGES.notFound);
  if (campaign.ai_enabled !== true) return refuse(403, VOICE_MESSAGES.aiOff);
  if (!(await deps.isDm(campaign, userId))) return refuse(403, VOICE_MESSAGES.forbidden);

  if (!(await deps.rateLimit(userId))) return refuse(429, VOICE_MESSAGES.rateLimited);

  const line = { speaker: { id: body.speakerId, name: body.speakerName }, text: body.text, how: body.how };
  if (!deps.keyFits(session.id, line, body.key)) return refuse(404, VOICE_MESSAGES.noLine);

  // Cast from the record when there is one; someone without a record is cast by their shown name alone.
  let traits: SpeakerTraits = { sex: null, age: null, voiceId: null };
  if (line.speaker.id !== null) {
    try {
      traits = await deps.loadTraits(session.campaign_id, line.speaker.id);
    } catch (error) {
      console.error("table-voice: reading the speaker's record failed:", error);
    }
  }
  // A voice the DM gave the character wins over the casting.
  const voiceId = ownVoice(traits) ?? pickVoice(line.speaker.id ?? line.speaker.name, traits).id;

  try {
    // The words and the cue are the ones under the key: the page could not have changed either.
    const audio = await deps.synthesize(voiceId, speechText(line.text, line.how));
    return { ok: true, audio, mime: "audio/mpeg" };
  } catch (error) {
    console.error("table-voice: the speech service failed:", error);
    return refuse(502, VOICE_MESSAGES.failed);
  }
}
