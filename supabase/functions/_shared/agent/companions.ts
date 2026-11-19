// The rest of the party at the AI table (#1021 row 26). Pure: no I/O.
//
// The maintainer, 19 Nov 2026: the other party members sit down too, played by the AI, and one "speaks if there's
// enough character data and the player enabled on their sheet". A character whose player has not said so, or whose
// sheet says too little to speak from, is still there: the Narrator tells what they do and gives them no line. A
// voice made up for someone else's character, from nothing, is the one thing this must not do.

import type { PlayerCharacter } from "./playerCharacter.ts";

/** One of the party who is not the played character. */
export interface Companion extends PlayerCharacter {
  /** The player's own word that the AI may speak for them (`party_members.ai_speaks`). */
  aiSpeaks: boolean;
}

/** The least a sheet must say of who a character is before the AI speaks as them. app convention. */
export const ENOUGH_TO_SPEAK_CHARS = 80;

/** Whether the sheet says enough of who they are to speak from: looks alone, or a name and a class, is not a voice. */
export function enoughToSpeak(c: Pick<PlayerCharacter, "about">): boolean {
  return (c.about ?? "").replace(/\s+/g, " ").trim().length >= ENOUGH_TO_SPEAK_CHARS;
}

/** Whether this companion is given lines of their own, or only told by the Narrator. */
export function companionSpeaks(c: Companion): boolean {
  return c.aiSpeaks && enoughToSpeak(c);
}

/** As many of the party as are named to the narrator: a party is a handful. */
export const COMPANIONS_MAX = 8;

const kindOf = (c: Companion): string => [c.level === null ? null : `level ${c.level}`, c.species, c.className].filter((p): p is string => !!p).join(" ");

/** The section that says who else of the party is here, and how each is played. Empty with nobody else. */
export function companionsSection(companions: readonly Companion[]): string {
  const shown = companions.slice(0, COMPANIONS_MAX);
  if (shown.length === 0) return "";
  const lines = shown.map((c) => {
    const kind = kindOf(c);
    const hp = c.hitPoints ? `, hit points ${c.hitPoints.current} of ${c.hitPoints.max}` : "";
    return companionSpeaks(c)
      ? `- ${c.name} (id ${c.id})${kind ? `, ${kind}` : ""}${hp}: speaks for themselves. Use speak and act with this id, like anyone the player meets.`
      : `- ${c.name}${kind ? `, ${kind}` : ""}${hp}: only acts. Tell what ${c.name} does in your own narration; never give ${c.name} a line of speech, and never call speak for them.`;
  });
  return [
    "## The rest of the party",
    "These travel with the player's character and are here unless the story has parted them. They are other players' characters, played by you while those players are away:",
    ...lines,
    "When you put a fact about one of them on record, name them in its sentence and leave them out of what it is about: the record ties facts to the campaign's own people, places and things.",
    "Play them as their sheets and their past in this story have them: loyal to the party, with minds of their own. They never take the lead from the player's character, decide for them, or settle what the player came to do. They spend nothing that cannot be got back (a rare potion, a once-a-day gift) unless the player's character asks them to, and they take no step that cannot be undone.",
  ].join("\n");
}

/** A companion as a speaker's own instructions know them: who they are, from their sheet. */
export function companionProfile(c: Companion): string {
  const kind = kindOf(c);
  const lines = [`You are ${c.name}${c.pronouns ? ` (${c.pronouns})` : ""}${kind ? `, a ${kind}` : ""}, one of the party the player's character travels with.`];
  const about = (c.about ?? "").trim();
  if (about !== "") lines.push("", "Who you are, as your own player wrote it:", about);
  lines.push("", "Your own player is away and you are played for them: stay who their sheet says you are, loyal to the party, and decide nothing they could not take back.");
  return lines.join("\n");
}
