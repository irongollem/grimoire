// The key that lets a spoken line be voiced the moment it is shown (#1021).
//
// `table-voice` must speak only words the table itself showed, in the manner the character gave them, or it is a
// speech service for whatever a caller types. A line is stored when its turn is kept, which is seconds after the
// player has read it, so waiting for the stored line made every voice late. Instead `agent-turn` signs each spoken
// line as it sends it, and `table-voice` speaks a line whose key fits: the conversation, the speaker, the words
// and the cue are all under the signature, so none of them can be changed by the page.
//
// The secret never leaves the server; both functions derive it from the same server-only value.

import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AgentLine } from "./types.ts";

/** Who the words belong to: a character of the story, the narrator, or the player's own character. */
export type VoiceRole = "character" | "narrator" | "player";
export const VOICE_ROLES: readonly VoiceRole[] = ["character", "narrator", "player"];

/** The name the narrator's words are signed and stored under: the narrator is nobody in the story. */
export const NARRATOR_SPEAKER = { id: null, name: "The Narrator" } as const;

export type KeyedLine = Pick<AgentLine, "speaker" | "text"> & { how?: string | null; role?: VoiceRole };

function digest(secret: string, sessionId: string, line: KeyedLine): Buffer {
  // A JSON array, so no field can run into the next ("ab" + "c" is not "a" + "bc").
  // The role is under the signature too: a character's line cannot be asked for in the narrator's voice.
  const signed = JSON.stringify([sessionId, line.role ?? "character", line.speaker.id, line.speaker.name, line.text, line.how ?? null]);
  return createHmac("sha256", `table-voice-line:${secret}`).update(signed).digest();
}

export function lineKey(secret: string, sessionId: string, line: KeyedLine): string {
  return digest(secret, sessionId, line).toString("base64url");
}

/** Whether the key is the one this server gave for exactly this line of this conversation. */
export function lineKeyFits(secret: string, sessionId: string, line: KeyedLine, key: string): boolean {
  if (secret === "") return false;
  const given = Buffer.from(key, "base64url");
  const wanted = digest(secret, sessionId, line);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * The name a line's clip is kept under, inside its conversation. Not a secret and not a proof: it only says which
 * words by whom, so the same line asked for again finds the clip that was made for it. The cue is left out, since a
 * line read back from a stored conversation is asked for without one.
 */
export function clipName(line: KeyedLine): string {
  const named = JSON.stringify([line.role ?? "character", line.speaker.id, line.speaker.name, line.text.trim()]);
  return createHmac("sha256", "table-voice-clip").update(named).digest("hex");
}
