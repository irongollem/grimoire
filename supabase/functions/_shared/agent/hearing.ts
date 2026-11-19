// What a character has heard at the AI-run table (#1021): who was in earshot of each line, at what volume, and what
// a character kept back because it did not get the floor. Worked out from the stored tool calls, never kept in a
// table, so a character that was not there never learns the line happened. Pure.

import { blocksOf, type StoredTurn } from "./transcript.ts";
import { SPEECH_TOOL_NAMES, VOLUMES, type Volume } from "./speakInput.ts";
import type { AgentLine, AgentWithheld } from "./types.ts";

export interface Heard {
  speaker: string;
  kind: "spoken" | "acted";
  text: string;
  /** What the speaker perceived when it spoke. Only ever set for the speaker's own lines. */
  happening: string | null;
}

export type Who = { id: string | null; name: string };

/**
 * One recorded speak/act: who it was, who was in earshot, and what was shown. A character's turn can hold a deed
 * and words from one call, so `lines` holds up to two, the deed first. A stored event is the whole call: the first
 * speaker's lines, then the lines of everyone who answered it.
 */
export interface SpeechEvent {
  speakerId: string | null;
  speakerName: string | null;
  present: string[];
  happening: string | null;
  /** The player's words that drew this event. */
  playerSaid: string | null;
  playerVolume: Volume;
  volume: Volume;
  whisperedTo: string[];
  alsoHeardBy: string[];
  /** True when a device or magic carries the words to `alsoHeardBy` whatever the volume. */
  carried: boolean;
  lines: AgentLine[];
  /** What listeners wanted to say to this line and did not get to. Never shown, never heard by anyone else. */
  withheld: AgentWithheld[];
}

/** The player's character has no record in a conversation yet, so its lines carry this name. */
export const PLAYER_SPEAKER = "The player's character";

const norm = (s: string): string => s.trim().toLowerCase();

function isSpeaker(who: Who, e: SpeechEvent): boolean {
  if (who.id) return e.speakerId === who.id;
  return e.speakerName !== null && norm(e.speakerName) === norm(who.name);
}

function listed(who: Who, list: string[]): boolean {
  if (who.id) return list.some((p) => p === who.id);
  return list.some((p) => norm(p) === norm(who.name));
}

/**
 * Whether a listener who is not the speaker hears words said at `volume`, as at a table (maintainer, 16 Nov 2026):
 * a whisper reaches only those it was whispered to, ordinary speech fills the room, and only a shout or something
 * that carries words (a sending stone) reaches someone elsewhere. "seen" is the room noticing a whisper it could
 * not make out.
 */
export function hears(who: Who, e: SpeechEvent, volume: Volume): "words" | "seen" | "nothing" {
  const inRoom = listed(who, e.present);
  const elsewhere = listed(who, e.alsoHeardBy);
  if (elsewhere && (volume === "shout" || e.carried)) return "words";
  if (volume === "whisper") {
    if (listed(who, e.whisperedTo)) return "words";
    return inRoom ? "seen" : "nothing";
  }
  return inRoom ? "words" : "nothing";
}

/** How `who` takes in one line of an event: a deed is seen by the room only, words follow the volume. */
function takeIn(who: Who, e: SpeechEvent, line: AgentLine, mine: boolean): "words" | "seen" | "nothing" {
  if (mine) return "words";
  if (line.kind === "acted") return listed(who, e.present) ? "words" : "nothing";
  return hears(who, e, e.volume);
}

/** `playerName` is the player's character's own name when the conversation knows it; otherwise the fixed one. */
export function heardFrom(events: SpeechEvent[], who: Who, playerName: string = PLAYER_SPEAKER): Heard[] {
  const out: Heard[] = [];
  let lastSaid: string | null = null;
  for (const e of events) {
    const mine = isSpeaker(who, e);
    // The player spoke to the speaker, so the speaker always heard it; a whisper to them is not for the room.
    const player = e.playerSaid === null ? "nothing" : mine ? "words" : hears(who, e, e.playerVolume);
    const taken = e.lines.map((line) => ({ line, how: takeIn(who, e, line, mine) }));
    if (player === "nothing" && taken.every((t) => t.how === "nothing")) continue;

    // Each character answering the same words carries them on its own call, and a listener to all of them heard
    // them once: the newest thing the player said is not repeated. (The player asking the very same thing again
    // later reads as one question, which loses nothing.)
    if (player === "words" && e.playerSaid && lastSaid !== e.playerSaid) {
      out.push({ speaker: playerName, kind: "spoken", text: e.playerSaid, happening: null });
      lastSaid = e.playerSaid;
    } else if (player === "seen") {
      out.push({ speaker: playerName, kind: "acted", text: `Whispers something to ${e.lines[0].speaker.name} that cannot be made out.`, happening: null });
    }
    // The speaker's own perception is handed back once per event, on its first line.
    let own = mine;
    for (const { line, how } of taken) {
      if (how === "words") {
        out.push({ speaker: line.speaker.name, kind: line.kind, text: line.text, happening: own ? e.happening : null });
        own = false;
      } else if (how === "seen") {
        out.push({ speaker: line.speaker.name, kind: "acted", text: "Whispers something that cannot be made out.", happening: null });
      }
    }
  }
  return out;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function names(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : [];
}

// A stored value that is not one of the three is read as ordinary speech: the narrowest reading that still lets
// the room hear, and never one that carries words to another room.
function storedVolume(v: unknown): Volume {
  return VOLUMES.find((x) => x === v) ?? "normal";
}

/** An event for one character's answer to what was just said. The room hears it; nobody was asked by the player. */
export function answerEvent(fields: Pick<SpeechEvent, "speakerId" | "present" | "lines"> & Partial<SpeechEvent>): SpeechEvent {
  return {
    speakerName: null, happening: null, playerSaid: null, playerVolume: "normal", volume: "normal",
    whisperedTo: [], alsoHeardBy: [], carried: false, withheld: [],
    ...fields,
  };
}

function eventOf(input: Record<string, unknown>, lines: AgentLine[], withheld: AgentWithheld[]): SpeechEvent {
  return {
    speakerId: str(input.speaker_id),
    speakerName: str(input.speaker_name),
    present: names(input.present),
    happening: str(input.happening),
    playerSaid: str(input.player_said),
    playerVolume: storedVolume(input.player_volume),
    volume: storedVolume(input.volume),
    whisperedTo: names(input.whispered_to),
    alsoHeardBy: names(input.also_heard_by),
    carried: str(input.via) !== null,
    lines,
    withheld,
  };
}

export function storedEvents(stored: StoredTurn[]): SpeechEvent[] {
  const events: SpeechEvent[] = [];
  const ordered = [...stored].sort((a, b) => a.seq - b.seq);
  // A call and its result sit in different rows, so every result is indexed first.
  const results = new Map<string, { lines: AgentLine[]; withheld: AgentWithheld[] }>();
  for (const row of ordered) {
    for (const b of blocksOf(row)) {
      if (b.type === "tool_result" && !b.isError && b.lines) results.set(b.callId, { lines: b.lines, withheld: b.withheld ?? [] });
    }
  }
  for (const row of ordered) {
    for (const b of blocksOf(row)) {
      if (b.type !== "tool_call" || !SPEECH_TOOL_NAMES.has(b.name)) continue;
      const result = results.get(b.id);
      if (result) events.push(eventOf(b.input, result.lines, result.withheld));
    }
  }
  return events;
}

/**
 * Everything `who` heard, saw or said in this conversation, oldest first. Reads every stored row, summarised or
 * not: a summary shortens what the narrator re-reads, but a character's memory of what happened to it is not the
 * narrator's to lose. What one character perceived (`happening`) is handed back only to that character.
 */
export function heardBy(stored: StoredTurn[], who: Who, playerName: string = PLAYER_SPEAKER): Heard[] {
  return heardFrom(storedEvents(stored), who, playerName);
}

/** The newest entries that fit both limits, still oldest first. */
export function trimHeard(heard: Heard[], maxEntries = 20, maxChars = 6000): Heard[] {
  const kept: Heard[] = [];
  let chars = 0;
  for (let i = heard.length - 1; i >= 0 && kept.length < maxEntries; i--) {
    const h = heard[i];
    const size = h.speaker.length + h.text.length + (h.happening?.length ?? 0);
    if (chars + size > maxChars) break;
    chars += size;
    kept.push(h);
  }
  return kept.reverse();
}

/** A character carries this many unspent sentences into a call; the older ones are let go. */
export const UNSAID_CARRIED = 2;

/**
 * What `characterId` wanted to say and did not get to, newest last. Nothing is stored about whether it was spent:
 * a sentence is gone once the character has spoken after it, which the order of the lines says. Within one event
 * the sentences were kept back right after the first speaker's lines (that is when the listeners were asked), so
 * a character who answered later in the same event has spoken after them.
 */
export function unsaidBy(events: SpeechEvent[], characterId: string): AgentWithheld[] {
  let kept: AgentWithheld[] = [];
  for (const e of events) {
    const first = e.lines[0]?.speaker;
    let placed = false;
    const place = () => {
      if (placed) return;
      placed = true;
      kept = [...kept, ...e.withheld.filter((w) => w.speaker.id === characterId)];
    };
    for (const line of e.lines) {
      if (first && (line.speaker.id !== first.id || line.speaker.name !== first.name)) place();
      if (line.speaker.id === characterId) kept = [];
    }
    place();
  }
  return kept.slice(-UNSAID_CARRIED);
}
