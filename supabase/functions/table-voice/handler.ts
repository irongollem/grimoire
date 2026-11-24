// table-voice (#1021): one spoken line of a sitting at the AI table, as audio. No Deno and no Supabase in here;
// everything with I/O comes in through `TableVoiceDeps`, so the rules are tested against an in-memory harness
// (`handler.test.ts`) and `index.ts` only wires real dependencies to them.
//
// What keeps this from being a speech service for anything a caller types:
//   - the caller must own the conversation, in a campaign they run with AI on;
//   - a line already voiced is kept (`loadClip` / `keepClip`, the `grimoire-table-voices` store) under its
//     conversation and a name made of who said what. Asked for again, it is answered from there: nothing is paid
//     twice, and a reopened sitting can be heard again. A kept clip needs no key, because only a line that came
//     with one was ever kept;
//   - the words must be a line that conversation SHOWED, spoken by that speaker, with the cue the character gave.
//     `agent-turn` signs each spoken line as it sends it (`_shared/agent/lineKey.ts`); the request carries the line
//     and its key, and a line whose key does not fit is refused. So a line is voiced the moment it is shown, not
//     once its turn is kept, and nothing about it can be changed by the page.
//
// METERED: every call is a paid request to a speech service on the platform's key. Credits are reserved before the
// line is spoken (`withHold`) and the cost is accrued on the sitting, billed in whole credits as they are crossed
// (`accrue`; `accrue_agent_voice`). It answers only where the stack has voices on (`voicesOn`, `_shared/speech.ts`).
//
// A second speaker, Oolu (role `familiar`: Ask Grimoire reading its own replies aloud): the owl of
// the Familiar box, on one ElevenLabs voice (`FAMILIAR_VOICE`, no stand-in). Oolu belongs to a conversation of kind
// `ask`, the table's roles to `solo_table`; each kind refuses the other's roles as "not found". Ask signs nothing, so
// an Oolu line never carries a key (one that does is an invalid request) and is proven from the stored turns alone:
// its words must be exactly what the assistant wrote (`familiarShown`). The reply is Markdown, so what is spoken is
// a plain version of it (`spokenFromMarkdown`); the clip is still kept and named by the words as shown. Billed under
// `ask_voice`, accrued on the conversation like the table's.

import { VoicesSpent, type SpeechService } from "../_shared/speech.ts";
import { creditsForSpeech, creditsPerMinute, speechChars } from "../_shared/agent/voiceCost.ts";
import type { CreditCalibration } from "../_shared/agent/metering.ts";
import { NARRATOR_CUE, narratorSpeaker, type AgeBand, type NarratorVoice, type Sex } from "./voicePick.ts";
import { castNpc, pickByKey, type Judgment, type SlotAssignment, type VoiceSlot } from "./casting.ts";
import { JEV_MODEL } from "../_shared/typesafe.ts";
import { FAMILIAR_SPEAKER, VOICE_ROLES, type VoiceRole } from "../_shared/agent/lineKey.ts";
import { FAMILIAR_VOICE } from "../_shared/narratorVoice.ts";
import { UUID_RE } from "../_shared/agent/parse.ts";
import type { BaseCampaign, CampaignLoad } from "../_shared/pipeline/aiCampaign.ts";
import type { CreditHold } from "../_shared/pipeline/creditHold.ts";
import { json, jsonError, rateLimited } from "../_shared/pipeline/respond.ts";

/** The ledger lines a spoken line may queue; the hold itself (reserve, release, write) is `withCreditHold`'s. */
export type VoiceHold = Pick<CreditHold, "charge" | "free">;

export interface VoiceSession {
  id: string;
  user_id: string;
  campaign_id: string;
  /** The voice the table's host chose for the Narrator. The table's, never a player's: a line's clip is made once. */
  narrator_voice: NarratorVoice;
  /** What the conversation is: `solo_table` (the AI table) or `ask` (Ask Grimoire). Decides which roles it may voice. */
  kind: string;
}

/** Which conversation kind may voice each role: Oolu belongs to Ask, every other voice to the AI table. */
const kindFor = (role: VoiceRole): string => (role === "familiar" ? "ask" : "solo_table");

/** The credit ledger reasons a spoken line is held and charged under. */
export type VoiceReason = "table_voice" | "ask_voice";

export interface TableVoiceDeps {
  /** Whether voices are switched on for this stack: the speech key and the trial switch are both set. */
  voiceOn(): boolean;
  /** By id alone: the handler decides whether it belongs to the caller. */
  loadSession(sessionId: string): Promise<VoiceSession | null>;
  /** The campaign, or the refusal to answer with: the caller must be its DM, and AI must be on. */
  loadCampaign(campaignId: string, userId: string, aiSwitch: "campaign" | "table"): Promise<CampaignLoad<BaseCampaign>>;
  rateLimit(userId: string): Promise<boolean>;
  /** Whether the key is the one `agent-turn` gave for exactly this line of this conversation. */
  keyFits(sessionId: string, line: VoicedLine, key: string): boolean;
  /** The clip kept for this line of this conversation (mp3, base64), or null when none is. Throws are the caller's to survive. */
  loadClip(at: { campaignId: string; sessionId: string }, line: VoicedLine): Promise<string | null>;
  /** Keeps the clip for the line, so it is never made twice. */
  keepClip(at: { campaignId: string; sessionId: string }, line: VoicedLine, audio: string): Promise<void>;
  /**
   * For a line asked for without a key: whether the conversation's own stored turns hold it, and the cue it was
   * stored with. Null when they do not.
   */
  findShown(sessionId: string, line: VoicedLine): Promise<{ how: string | null } | null>;
  /** The played character's own pronouns and voice, for the player's said lines. */
  loadPlayerTraits(campaignId: string, memberId: string): Promise<SpeakerTraits>;
  /**
   * What the character's record says: sex and age for casting, the slot it already holds (`npcs.speech_voice_id`),
   * where it is found, and the text it is matched to a slot on. `hasRecord` false when there is no such record.
   */
  loadTraits(campaignId: string, speakerId: string): Promise<SpeakerTraits>;
  /**
   * One slot, read with the caller's own client. Null when it is gone, retired, unfilled, or not one this caller may
   * read: the character is then cast again.
   */
  loadSlot(slotId: string): Promise<VoiceSlot | null>;
  /** The filled, active cast slots the caller may read, on any service. The handler keeps the ones this stack can speak. */
  loadSlots(): Promise<VoiceSlot[]>;
  /** Who holds which slot in the campaign, for spreading voices over a place. */
  loadAssignments(campaignId: string): Promise<SlotAssignment[]>;
  /**
   * Asks the judgment model which of the options fits the character best. Null when there is no key or it could
   * not answer in time; the choice is an option's name. Throws are the caller's to survive.
   */
  judgeSlot(options: Array<{ name: string; description: string }>, fitting: string): Promise<Judgment | null>;
  /**
   * Remembers the slot on a character that has none yet, with the caller's own client, and answers the slot the
   * character holds afterwards: this one, or the one another line saved first (every line of a reply is asked for at
   * once, so several may cast the same new character together; the first save wins). Throws when it cannot.
   */
  saveSlot(campaignId: string, npcId: string, slotId: string): Promise<string | null>;
  /** Whether this stack can speak through the service (its key is set). */
  hasService(service: VoiceService): boolean;
  /**
   * Speaks the line in the voice and answers the audio (mp3, base64). The words and the cue are given apart: each
   * service takes a cue its own way. Throws when the speech service fails.
   */
  synthesize(voice: VoiceRef, line: { text: string; how: string | null; narration: boolean }): Promise<string>;
  /**
   * What the service's speech costs, in USD per million characters, and what a credit is worth: the admin's
   * numbers (`ai_model_pricing`, the credit calibration). Null when either is not on file: speech is then not made,
   * because it could not be charged.
   */
  /** True when the line must not be spoken (the same screen a turn's own words go through). Throws when it cannot run. */
  isFlagged(text: string): Promise<boolean>;
  loadRate(service: VoiceService): Promise<{ usdPerMillionChars: number; calibration: CreditCalibration } | null>;
  /** The model the service speaks with, for the ledger line. */
  modelOf(service: VoiceService): string;
  /** Holds `credits` for a line about to be made, runs it and releases the hold whatever happens; a refused hold answers its refusal. */
  withHold(userId: string, credits: number, reason: VoiceReason, work: (hold: VoiceHold) => Promise<Response>): Promise<Response>;
  /**
   * Adds the line's exact cost to the conversation and answers the whole credits it newly crossed (0 when none).
   * Billing those is the hold's: `table_voice` lines are charged by accrual, not per line.
   */
  accrue(sessionId: string, credits: number): Promise<number>;
}

/** A line as it is signed, kept and spoken. */
export interface VoicedLine {
  role: VoiceRole;
  speaker: { id: string | null; name: string };
  text: string;
  how: string | null;
}

export interface SpeakerTraits {
  sex: Sex | null;
  age: AgeBand | null;
  /** Whether the speaker has a record to cast from and remember a voice on. */
  hasRecord: boolean;
  /** The slot the character already holds; null until one is cast or picked. */
  slotId: string | null;
  locationId: string | null;
  /** What the character is matched to a slot on: occupation, appearance, personality, voice. Not backstory or notes. */
  fitting: string;
}

/** Nothing known about the speaker. */
export const NO_TRAITS: SpeakerTraits = { sex: null, age: null, hasRecord: false, slotId: null, locationId: null, fitting: "" };

/** A voice id as a speech service writes them. It goes into a URL or a request, so anything else is not used. */
export const VOICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** The services a voice may live on. ElevenLabs speaks for everyone by default; Inworld holds the voices ElevenLabs will not make (a child's). */
export type VoiceService = SpeechService;
export interface VoiceRef {
  service: VoiceService;
  id: string;
}

/** A slot's voice, when this stack can speak through its service and the id is the shape a speech service takes. */
function refOf(slot: VoiceSlot, deps: Pick<TableVoiceDeps, "hasService">): VoiceRef | null {
  return deps.hasService(slot.service) && VOICE_ID_RE.test(slot.voiceId) ? { service: slot.service, id: slot.voiceId } : null;
}

/** Thrown by `synthesize` when the speech service says its allowance is used up: asking again cannot help. */
// Defined with the speech call itself, which throws it; named here for this function's own callers.
export { VoicesSpent };

export const VOICE_MESSAGES = {
  badBody: "The request is not valid.",
  off: "Voices are not switched on.",
  notFound: "That conversation was not found.",
  forbidden: "Only the campaign's DM can use the AI table.",
  noLine: "That line is not one this sitting has shown.",
  failed: "The line could not be spoken right now. Nothing was charged.",
  spent: "The voices have used up their allowance for now.",
  unpriced: "Voices cannot be metered right now.",
  unspeakable: "That line cannot be read aloud.",
} as const;

export interface VoiceBody {
  campaignId: string;
  sessionId: string;
  /** The speaker's record, or null for someone with no record. */
  speakerId: string | null;
  speakerName: string;
  text: string;
  /** The character's cue for how it is said, as the line carried it; null when it had none. */
  how: string | null;
  /** The key the line came with; null for a line read back from a stored conversation, which only a kept clip answers. Always null for Oolu. */
  key: string | null;
  /** Whose words: a character's (the default), the narrator's, the player's own character's, or Oolu's (Ask). */
  role: VoiceRole;
}

/**
 * The longest reply Oolu is handed, in characters. The page joins a reply's text across the model's steps (text, a
 * tool call, more text), so one reply can run past a single answer's 1,500 tokens; it is accepted whole, so the
 * words still prove against the stored turns, and read only up to `FAMILIAR_SPOKEN_MAX`.
 */
export const FAMILIAR_TEXT_MAX = 32000;

/** The most of a reply Oolu reads aloud, cut at the end of a sentence: what one answer's worth of speech costs. */
export const FAMILIAR_SPOKEN_MAX = 8000;

export function parseVoiceBody(raw: unknown): VoiceBody | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.campaignId !== "string" || !UUID_RE.test(r.campaignId)) return null;
  if (typeof r.sessionId !== "string" || !UUID_RE.test(r.sessionId)) return null;
  if (r.speakerId !== null && (typeof r.speakerId !== "string" || !UUID_RE.test(r.speakerId))) return null;
  if (typeof r.speakerName !== "string" || r.speakerName.trim() === "" || r.speakerName.length > 200) return null;
  const role = r.role === undefined ? "character" : r.role;
  if (typeof role !== "string" || !(VOICE_ROLES as readonly string[]).includes(role)) return null;
  // An Ask reply can join several answers (see FAMILIAR_TEXT_MAX); a spoken line of the table is a few sentences.
  const maxText = role === "familiar" ? FAMILIAR_TEXT_MAX : 4000;
  if (typeof r.text !== "string" || r.text.trim() === "" || r.text.length > maxText) return null;
  const how = r.how === undefined || r.how === null ? null : r.how;
  if (how !== null && (typeof how !== "string" || how.length > 400)) return null;
  const key = r.key === undefined || r.key === null ? null : r.key;
  if (key !== null && (typeof key !== "string" || key === "" || key.length > 200)) return null;
  // Ask signs nothing, so a key on Oolu's line is a caller trying something else: refused as an invalid request.
  if (role === "familiar" && key !== null) return null;
  return { campaignId: r.campaignId, sessionId: r.sessionId, speakerId: r.speakerId, speakerName: r.speakerName, text: r.text, how, key, role: role as VoiceRole };
}

/**
 * Whose voice says the line: the narrator's one voice, or a slot of the registry cast from the speaker's record.
 * `inputTokens` is what the judgment model spent on the way (0 when it did not run), for the ledger.
 */
async function voiceFor(deps: TableVoiceDeps, session: VoiceSession, line: VoicedLine): Promise<{ voice: VoiceRef; inputTokens: number }> {
  const campaignId = session.campaign_id;
  const narrator = () => narratorSpeaker(session.narrator_voice, deps.hasService);
  if (line.role === "narrator") {
    // The table's choice, on that choice's own service; the same choice on the other where this stack lacks the key.
    return { voice: narrator(), inputTokens: 0 };
  }
  let traits: SpeakerTraits = NO_TRAITS;
  if (line.speaker.id !== null) {
    try {
      traits = line.role === "player" ? await deps.loadPlayerTraits(campaignId, line.speaker.id) : await deps.loadTraits(campaignId, line.speaker.id);
    } catch (error) {
      console.error("table-voice: reading the speaker's record failed:", error);
    }
  }
  const npcId = line.role === "character" && traits.hasRecord ? line.speaker.id : null;

  let pool: VoiceSlot[] = [];
  try {
    pool = (await deps.loadSlots()).filter((slot) => refOf(slot, deps) !== null);
  } catch (error) {
    console.error("table-voice: reading the voice registry failed:", error);
  }
  const ref = (slot: VoiceSlot): VoiceRef => ({ service: slot.service, id: slot.voiceId });

  // A character with a slot speaks in it. One that cannot be used from here (retired or emptied for a while, someone
  // else's signature voice, a service this stack has no key for, a read that failed) is spoken around with a stand-in
  // picked from the character alone: no judgment and no save, so the same stand-in every line and the slot itself
  // left on the character for when it can be used again. A slot that is deleted is cleared by its foreign key, and
  // the character is cast afresh.
  if (npcId !== null && traits.slotId !== null) {
    try {
      const slot = await deps.loadSlot(traits.slotId);
      const own = slot === null ? null : refOf(slot, deps);
      if (own !== null) return { voice: own, inputTokens: 0 };
    } catch (error) {
      console.error("table-voice: reading the character's voice slot failed:", error);
    }
    if (pool.length === 0) return { voice: narrator(), inputTokens: 0 };
    return { voice: ref(pickByKey(npcId, pool, traits)), inputTokens: 0 };
  }

  // Nothing filled on any service this stack has: the narrator's voice rather than silence.
  if (pool.length === 0) return { voice: narrator(), inputTokens: 0 };

  // A player's character and someone with no record keep to the old, cheap way: the same voice every time from a key.
  if (npcId === null) {
    const slot = pickByKey(line.speaker.id ?? line.speaker.name, pool, line.role === "player" ? traits : { sex: null, age: null });
    return { voice: ref(slot), inputTokens: 0 };
  }

  let assignments: SlotAssignment[] = [];
  try {
    assignments = await deps.loadAssignments(campaignId);
  } catch (error) {
    console.error("table-voice: reading who holds which voice failed:", error);
  }
  const cast = await castNpc({ npcId, traits, fitting: traits.fitting, locationId: traits.locationId, pool, assignments }, deps.judgeSlot);
  // The pool is not empty, so a cast is always made.
  if (cast === null) return { voice: narrator(), inputTokens: 0 };
  let spoken = cast.slot;
  try {
    // Another line of the same reply may have cast this character first: then its slot is theirs, and every line
    // speaks it. A failed save costs the character a stable voice, never the line.
    const holder = await deps.saveSlot(campaignId, npcId, cast.slot.id);
    if (holder !== null && holder !== cast.slot.id) {
      const first = pool.find((slot) => slot.id === holder);
      if (first !== undefined) spoken = first;
    }
  } catch (error) {
    console.error("table-voice: remembering the character's voice failed:", error);
  }
  return { voice: ref(spoken), inputTokens: cast.inputTokens };
}

export async function speakLine(input: {
  userId: string;
  body: unknown;
  deps: TableVoiceDeps;
}): Promise<Response> {
  const { userId, deps } = input;

  const body = parseVoiceBody(input.body);
  if (!body) return jsonError(400, "invalid_body", VOICE_MESSAGES.badBody);
  if (!deps.voiceOn()) return jsonError(503, "voices_off", VOICE_MESSAGES.off);
  // Oolu speaks on ElevenLabs alone: no stand-in on another service, so without its key Oolu is silent. Answered
  // here, before the rate limit, the kept-clip read, the stored-turn proof and the paid screen are spent on nothing.
  if (body.role === "familiar" && !deps.hasService(FAMILIAR_VOICE.service)) return jsonError(503, "voices_off", VOICE_MESSAGES.off);

  // Someone else's conversation, or one in another campaign, is "not found": a 403 would say it exists.
  const session = await deps.loadSession(body.sessionId);
  if (!session || session.user_id !== userId || session.campaign_id !== body.campaignId) return jsonError(404, "conversation_not_found", VOICE_MESSAGES.notFound);
  // A role on the wrong kind of conversation answers the same, so it reveals nothing about the conversation.
  if (session.kind !== kindFor(body.role)) return jsonError(404, "conversation_not_found", VOICE_MESSAGES.notFound);
  const familiar = body.role === "familiar";
  const load = await deps.loadCampaign(session.campaign_id, userId, familiar ? "campaign" : "table");
  if (!load.ok) return load.response;

  if (!(await deps.rateLimit(userId))) return rateLimited();

  // Oolu is always Oolu and has no cue, whatever the body says: both are under the clip's name.
  const line: VoicedLine = familiar
    ? { role: body.role, speaker: { ...FAMILIAR_SPEAKER }, text: body.text, how: null }
    : { role: body.role, speaker: { id: body.speakerId, name: body.speakerName }, text: body.text, how: body.how };
  const at = { campaignId: session.campaign_id, sessionId: session.id };

  // A clip made before is answered as it was made. A store that cannot be read costs a new clip, never the line.
  try {
    const kept = await deps.loadClip(at, line);
    if (kept !== null) return json({ audio: kept, mime: "audio/mpeg" });
  } catch (error) {
    console.error("table-voice: reading the kept clip failed:", error);
  }
  // Nothing kept: only a line this sitting showed is made. One that just arrived proves it with the key it came
  // with; one read back from a reopened sitting has no key, and is looked up in the conversation's own stored turns
  // (and spoken with the cue stored there, never one the page sends).
  if (body.key !== null) {
    if (!deps.keyFits(session.id, line, body.key)) return jsonError(404, "line_not_shown", VOICE_MESSAGES.noLine);
  } else {
    const shown = await deps.findShown(session.id, line);
    if (shown === null) return jsonError(404, "line_not_shown", VOICE_MESSAGES.noLine);
    line.how = shown.how;
  }

  // What is said aloud: Oolu's Markdown as plain words. Screened, counted and spoken in this form.
  const said = familiar ? headOf(spokenFromMarkdown(line.text), FAMILIAR_SPOKEN_MAX) : line.text;
  if (said === "") return jsonError(422, "line_unspeakable", VOICE_MESSAGES.unspeakable);

  // A line is voiced the moment it arrives, before its turn has been screened and kept, so it is screened here
  // too: a line the table may not tell is never spoken. An outage of the screen does not silence the table.
  try {
    if (await deps.isFlagged(said)) return jsonError(422, "line_unspeakable", VOICE_MESSAGES.unspeakable);
  } catch (error) {
    console.error("table-voice: screening the line failed:", error);
  }

  const cast = familiar ? { voice: { ...FAMILIAR_VOICE }, inputTokens: 0 } : await voiceFor(deps, session, line);
  const voice: VoiceRef = cast.voice;
  // A line that is made is paid for: what it costs is worked out before it is made, from the admin's numbers.
  // Without them nothing is made, because nothing could be charged.
  const rate = await deps.loadRate(voice.service);
  if (rate === null) return jsonError(503, "metering_unavailable", VOICE_MESSAGES.unpriced);
  // Narration carries no cue of its own; on ElevenLabs, which acts on one, the Narrator tells as a storyteller
  // (the maintainer's ear: "significantly better"). The cue is sent, so it is counted like the words.
  const how = line.role === "narrator" && voice.service === "elevenlabs" ? NARRATOR_CUE : line.how;
  const chars = speechChars(said, how);
  const credits = creditsForSpeech(chars, rate.usdPerMillionChars, rate.calibration);
  const reason: VoiceReason = familiar ? "ask_voice" : "table_voice";
  return deps.withHold(userId, Math.max(1, Math.ceil(credits)), reason, async (hold) => {
    // The judgment model was paid for by the platform, not the player: a free line keeps that spend visible.
    if (cast.inputTokens > 0) hold.free("entity_judgment", { model: JEV_MODEL, provider: "typesafe", input_tokens: cast.inputTokens });
    let audio: string;
    try {
      // The words and the cue are the ones under the key: the page could not have changed either.
      audio = await deps.synthesize(voice, { text: said, how, narration: line.role === "narrator" });
    } catch (error) {
      // Out of allowance is told apart, so the page can say so once and stop asking for every line.
      if (error instanceof VoicesSpent) return jsonError(402, "voices_spent", VOICE_MESSAGES.spent);
      console.error("table-voice: the speech service failed:", error);
      return jsonError(502, "generation_failed", VOICE_MESSAGES.failed);
    }
    // Kept before it is answered, but a clip that cannot be kept is still heard.
    await deps.keepClip(at, line, audio).catch((error) => console.error("table-voice: keeping the clip failed:", error));
    // Accrued once it exists: the exact cost goes on the conversation and only the whole credits it newly crossed are
    // billed. An accrual that fails is logged and the line is still heard: the player is never made to pay twice by
    // asking again, since the clip is kept.
    try {
      const due = await deps.accrue(session.id, credits);
      if (due > 0) hold.charge(reason, { cost: due, log: { provider: voice.service, model: deps.modelOf(voice.service) } });
    } catch (error) {
      console.error("table-voice: charging the line failed:", error);
    }
    return json({ audio, mime: "audio/mpeg" });
  });
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Whether a conversation's stored turns hold this line: a character's spoken line by that speaker, the narrator's
 * text (a paragraph the player was shown, or a deed, which the narrator reads), or the player's own said line.
 * Answers the cue the line was stored with. Pure: the turns come in as they are read from `agent_turns`.
 */
export function shownInTurns(turns: ReadonlyArray<{ role: string; blocks: unknown }>, line: VoicedLine): { how: string | null } | null {
  if (line.role === "familiar") return familiarShown(turns, line.text) ? { how: null } : null;
  const wanted = line.text.trim();
  for (const turn of turns) {
    if (!Array.isArray(turn.blocks)) continue;
    for (const block of turn.blocks) {
      if (!isRecord(block)) continue;
      if (block.type === "text" && turn.role === "user" && line.role === "player") {
        const player = block.player;
        if (isRecord(player) && player.kind === "say" && typeof player.text === "string" && player.text.trim() === wanted) return { how: null };
      } else if (block.type === "text" && turn.role === "assistant" && line.role === "narrator") {
        if (block.unshown !== true && typeof block.text === "string" && block.text.trim() === wanted) return { how: null };
      } else if (block.type === "tool_result" && Array.isArray(block.lines)) {
        for (const stored of block.lines) {
          if (!isRecord(stored) || typeof stored.text !== "string" || stored.text.trim() !== wanted) continue;
          if (stored.kind === "acted" && line.role === "narrator") return { how: null };
          const speaker = stored.speaker;
          if (stored.kind === "spoken" && line.role === "character" && isRecord(speaker) && speaker.id === line.speaker.id && speaker.name === line.speaker.name) {
            return { how: typeof stored.how === "string" && stored.how !== "" ? stored.how : null };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Whether Ask's reply is something the assistant wrote. The browser shows one reply as the raw concatenation of the
 * assistant's text blocks across model steps (text, a tool call, more text), so the words are accepted when they equal
 * that join of one or more CONSECUTIVE text blocks. Turns come in order of `seq`. What breaks a run: a `user` row
 * with a text block (the DM's own next message; a user row of tool results alone belongs to the same reply), a block
 * marked `unshown`, or a text block with no string. Nothing the assistant did not write can be joined in, so this is
 * no speech service for what a caller types. Pure.
 */
export function familiarShown(turns: ReadonlyArray<{ role: string; blocks: unknown }>, text: string): boolean {
  const wanted = text.trim();
  if (wanted === "") return false;
  let run: string[] = [];
  const inRun = (): boolean => {
    for (let from = 0; from < run.length; from++) {
      let joined = "";
      for (let to = from; to < run.length; to++) {
        joined += run[to];
        if (joined.trim() === wanted) return true;
      }
    }
    return false;
  };
  for (const turn of turns) {
    if (!Array.isArray(turn.blocks)) continue;
    for (const block of turn.blocks) {
      if (!isRecord(block) || block.type !== "text") continue;
      if (turn.role === "assistant" && typeof block.text === "string" && block.unshown !== true) {
        run.push(block.text);
      } else {
        // The DM's own message, or words the reader was not shown: the reply before it is complete.
        if (inRun()) return true;
        run = [];
      }
    }
  }
  return inRun();
}

/** A table row's cells as a spoken line ("Goblin, 7, 15."); null for a separator row ("|---|:--:|"). */
function tableRow(line: string): string | null {
  const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  if (cells.every((c) => /^:?-{1,}:?$/.test(c) || c === "")) return null;
  return `${cells.filter((c) => c !== "").join(", ")}.`;
}

/**
 * Ask's reply as it is said aloud: the Markdown's marks dropped, its words kept, as the reader sees it rendered.
 * Headings, list bullets, quote marks, fences, rules and code ticks go; a link or an image says its text; a table
 * is read a row at a time with its cells in a list. Emphasis goes only where it wraps words, so a `*` between
 * spaces ("2 * 3") is kept. Blank lines collapse to one.
 */
export function spokenFromMarkdown(md: string): string {
  return md
    .split("\n")
    .map((row) => (/^\s*\|.*\|\s*$/.test(row) ? tableRow(row) : row))
    .filter((row): row is string => row !== null)
    .join("\n")
    .replace(/^\s*(```|~~~).*$/gm, "")
    .replace(/^\s{0,3}([-*_])(\s*\1){2,}\s*$/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/`+([^`\n]*)`+/g, "$1")
    .replace(/(\*{1,3})(?=\S)([^*\n]*?\S)\1/g, "$2")
    .replace(/(^|[^\w])_{1,2}([^_\n]+)_{1,2}(?![\w])/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** At most `max` characters of `text`, ending at the last full sentence that fits (or a word, when none ends). */
export function headOf(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf(".\n"));
  if (sentence > max / 2) return cut.slice(0, sentence + 1).trim();
  const word = cut.lastIndexOf(" ");
  return (word > 0 ? cut.slice(0, word) : cut).trim();
}

/**
 * What the voices cost, for the page to say before anyone sits down: credits for a minute of speech on each
 * service this stack speaks through. Null for a service that is not priced or not switched on.
 */
export async function voiceRates(deps: Pick<TableVoiceDeps, "voiceOn" | "hasService" | "loadRate">): Promise<{ on: boolean; perMinute: Record<VoiceService, number | null> }> {
  const perMinute: Record<VoiceService, number | null> = { elevenlabs: null, inworld: null };
  if (!deps.voiceOn()) return { on: false, perMinute };
  for (const service of ["elevenlabs", "inworld"] as const) {
    if (!deps.hasService(service)) continue;
    const rate = await deps.loadRate(service);
    if (rate !== null) perMinute[service] = creditsPerMinute(rate.usdPerMillionChars, rate.calibration);
  }
  return { on: true, perMinute };
}
