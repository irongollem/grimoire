import type { StoryItem } from "./soloTypes";

/** Whose words a clip is: a character of the story, the narrator, or the player's own character. */
export type VoiceRole = "character" | "narrator" | "player" | "familiar";

/** The three things that can be read aloud, each with a switch of its own. */
export type VoicePart = "narrator" | "characters" | "player";
export type VoiceParts = Record<VoicePart, boolean>;
export const NO_VOICES: VoiceParts = { narrator: false, characters: false, player: false };

/** The name the narrator's words are signed and kept under on the server. */
export const NARRATOR_NAME = "The Narrator";

/** A line as the voice endpoint is asked for it. */
export interface SpokenLine {
  role: VoiceRole;
  speakerId: string | null;
  speakerName: string;
  text: string;
  how: string | null;
  /** The server's key for the line; null for one read back from a stored sitting, which only a kept clip answers. */
  key: string | null;
}

/** The played character, for their own said lines; null when nobody is played. */
export type PlayedSpeaker = { id: string; name: string } | null;

/**
 * What one thing on the page has to say aloud, in order: a character's spoken line, the narrator's text (each
 * stretch the server offered, or the whole of a stored one), a character's deed (the narrator reads it), or the
 * player's own line said aloud. The player's own deeds, questions to the Narrator, rolls and margin notes are
 * never read.
 */
export function linesOfItem(item: StoryItem, who: PlayedSpeaker): Array<SpokenLine & { part: VoicePart }> {
  if ((item.kind !== "spoken" && item.kind !== "acted" && item.kind !== "narration" && item.kind !== "player") || item.text.trim() === "") return [];
  // What a character does is told, not said: the narrator reads it.
  if (item.kind === "acted") {
    return [{ part: "narrator", role: "narrator", speakerId: null, speakerName: NARRATOR_NAME, text: item.text.trim(), how: null, key: item.voice ? item.voice.key : null }];
  }
  if (item.kind === "spoken") {
    return [{ part: "characters", role: "character", speakerId: item.speaker.id, speakerName: item.speaker.name, text: item.text, how: item.voice ? item.voice.how : null, key: item.voice ? item.voice.key : null }];
  }
  if (item.kind === "narration") {
    const stretches = item.voices !== undefined && item.voices.length > 0 ? item.voices : [{ text: item.text.trim(), key: null }];
    return stretches.map((v) => ({ part: "narrator" as const, role: "narrator" as const, speakerId: null, speakerName: NARRATOR_NAME, text: v.text, how: null, key: v.key }));
  }
  if (item.kind === "player" && item.mode === "say" && who !== null) {
    return [{ part: "player", role: "player", speakerId: who.id, speakerName: who.name, text: item.text.trim(), how: null, key: item.voice ? item.voice.key : null }];
  }
  return [];
}

/**
 * The lines to read aloud by themselves out of a stretch of the story: only what is switched on, and only a line
 * that came with the server's key. A reopened sitting has none, so an old story is never read out from the top;
 * it can still be heard line by line, from the clips that were kept.
 */
export function freshLines(items: readonly StoryItem[], on: VoiceParts, who: PlayedSpeaker): SpokenLine[] {
  return items.flatMap((item) => linesOfItem(item, who)).filter((line) => on[line.part] && line.key !== null).map(({ part: _part, ...line }) => line);
}

/** One thing's lines, to hear again: keyed or not. */
export function replayLines(item: StoryItem, who: PlayedSpeaker): SpokenLine[] {
  return linesOfItem(item, who).map(({ part: _part, ...line }) => line);
}
