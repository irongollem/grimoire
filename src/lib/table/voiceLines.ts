import type { StoryItem } from "./soloTypes";

/** A spoken line as the voice endpoint is asked for it. */
export interface SpokenLine {
  speakerId: string | null;
  speakerName: string;
  text: string;
}

/**
 * The lines to read aloud out of a stretch of the story: what characters SAID, in order. Deeds, narration, the
 * player's own words, rolls and margin notes stay text (the maintainer's choice, 17 Nov 2026: the acted voice is
 * for speech; narration is not worth its price).
 */
export function spokenLines(items: readonly StoryItem[]): SpokenLine[] {
  return items.flatMap((item) =>
    item.kind === "spoken" && item.text.trim() !== "" ? [{ speakerId: item.speaker.id, speakerName: item.speaker.name, text: item.text }] : [],
  );
}
