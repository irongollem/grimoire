import type { StoryItem } from "./soloTypes";

/** A spoken line as the voice endpoint is asked for it. */
export interface SpokenLine {
  speakerId: string | null;
  speakerName: string;
  text: string;
  how: string | null;
  key: string;
}

/**
 * The lines to read aloud out of a stretch of the story: what characters SAID, in order. Deeds, narration, the
 * player's own words, rolls and margin notes stay text (the maintainer's choice, 17 Nov 2026: the acted voice is
 * for speech; narration is not worth its price). Only a line that came with the server's key: one read back from a
 * reopened sitting has none, so an old story is read, never replayed.
 */
export function spokenLines(items: readonly StoryItem[]): SpokenLine[] {
  return items.flatMap((item) =>
    item.kind === "spoken" && item.voice !== undefined && item.text.trim() !== ""
      ? [{ speakerId: item.speaker.id, speakerName: item.speaker.name, text: item.text, how: item.voice.how, key: item.voice.key }]
      : [],
  );
}
