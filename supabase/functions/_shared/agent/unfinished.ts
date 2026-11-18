// Unfinished business (#1021): what a character wanted to say and did not get to, carried past the sitting.
//
// In a room of several people only one of the listeners gets the floor; the others' sentences are kept back
// (`withheld`) and handed to their owner the next time that character is asked, within the same sitting
// (`unsaidBy`). When the player leaves the table, whatever is still unsaid would be lost with the conversation's
// working memory. It is written into the character's own memory instead, so the next time the party meets them
// they still have it on their mind and may bring it up, the way a person does ("I meant to tell you...").

import { storedEvents, unsaidBy, UNSAID_CARRIED } from "./hearing.ts";
import type { StoredTurn } from "./transcript.ts";

export interface Unfinished {
  characterId: string;
  /** A sentence in the character's own voice, as their memory keeps it. */
  body: string;
}

/** Longer than this is not one thing left unsaid. The memory's own limit is 1,000 characters. */
const BODY_MAX = 600;

/**
 * What each character of a sitting still had to say when it ended: the sentences kept back from them that they
 * never got to say afterwards, at most a couple each, as memories in their own voice.
 */
export function unfinishedBusiness(stored: StoredTurn[]): Unfinished[] {
  const events = storedEvents(stored);
  const speakers = new Set<string>();
  for (const event of events) for (const w of event.withheld) speakers.add(w.speaker.id);
  const out: Unfinished[] = [];
  for (const characterId of speakers) {
    for (const w of unsaidBy(events, characterId).slice(-UNSAID_CARRIED)) {
      const text = w.text.trim();
      if (text === "") continue;
      const whom = w.to === null ? "" : w.to === "everyone" ? " to everyone there" : ` to ${w.to}`;
      out.push({ characterId, body: `I meant to say this${whom} and did not get to: "${text}"`.slice(0, BODY_MAX) });
    }
  }
  return out;
}
