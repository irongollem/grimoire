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

export type KeyedLine = Pick<AgentLine, "speaker" | "text"> & { how?: string | null };

function digest(secret: string, sessionId: string, line: KeyedLine): Buffer {
  // A JSON array, so no field can run into the next ("ab" + "c" is not "a" + "bc").
  const signed = JSON.stringify([sessionId, line.speaker.id, line.speaker.name, line.text, line.how ?? null]);
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
