import type { StoryItem, TableLine } from "./soloTypes";

/**
 * The five pigments of the Solo Table canvas, in the order a story hands them out. The canvas draws a character's box,
 * hairline and name in one of these; colour is never the only clue (the name is always there), it only helps tell two
 * speakers apart. A sixth speaker starts the order again.
 */
export const VOICE_PIGMENTS = ["info", "caution", "arcane", "success", "rubric"] as const;
export type VoicePigment = (typeof VOICE_PIGMENTS)[number];

/** Who a line belongs to: a character with a record by id, anyone else by their name. */
export function speakerKey(speaker: TableLine["speaker"]): string {
  return speaker.id !== null ? `id:${speaker.id}` : `name:${speaker.name.trim().toLowerCase()}`;
}

/**
 * One pigment per character for the whole story, in order of first appearance. It reads the items, not a counter kept
 * while playing, so a reload (which rebuilds the same items from the stored conversation) hands out the same colours.
 */
export function assignSpeakerColours(items: readonly StoryItem[]): Map<string, VoicePigment> {
  const colours = new Map<string, VoicePigment>();
  for (const item of items) {
    if (item.kind !== "spoken" && item.kind !== "acted") continue;
    const key = speakerKey(item.speaker);
    if (!colours.has(key)) colours.set(key, VOICE_PIGMENTS[colours.size % VOICE_PIGMENTS.length]);
  }
  return colours;
}
