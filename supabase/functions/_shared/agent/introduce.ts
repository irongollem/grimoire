// A person the narrator made up gets a record of their own (#1021).
//
// Where the campaign is silent the narrator invents, and what it invents goes on record as facts. A fact is a
// sentence; a person who will matter again (the buyer from a memory, a named stranger) needs more than sentences
// that mention them: a record the campaign keeps, that the player finds among the people they know, that can be
// given a voice and memories, and that the next sitting finds by name. Seen live: "Master Floret" was invented in a
// memory and lived only in three facts.
//
// Three rules:
//   1. Never a second record for someone who has one: the name is checked against the campaign first.
//   2. The record is made when the turn is kept, like every other write of a turn.
//   3. Few and small: at most two a turn, a name and a few sentences. The DM fills in the rest, or deletes it.
//   4. A record the table itself made can be brought up to date the same way (the player says who their old
//      master really was, and the narrator accepts it). A record the DM wrote, or has edited, is never touched.
//
// Pure: no I/O.

import type { AgentTool } from "./types.ts";

export const INTRODUCE_TOOL_NAME = "introduce";
export const INTRODUCTIONS_PER_TURN = 2;
export const NAME_MAX = 80;
export const ABOUT_MAX = 600;
export const OCCUPATION_MAX = 80;

export const INTRODUCE_TOOL: AgentTool = {
  name: INTRODUCE_TOOL_NAME,
  description:
    "Gives a person you made up a record of their own, so the campaign keeps them. Use it the moment an invented " +
    "person gets a name and is likely to matter again (someone from the player's character's past, a named stranger " +
    "with a part to play). Not for a passer-by with no name, and never for someone who already has a record: search " +
    "first. Give the name, one to three plain sentences of what is true of them so far, their occupation if they " +
    "have one, whether they are in the party's place right now, and whether the player's character knows of them. " +
    "The record exists from the next turn; record what happens with them as facts as usual. Calling it again for a " +
    "person you introduced earlier replaces what their record says: give the whole of what is true of them now.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", maxLength: NAME_MAX, description: "The person's name as the player's character would know it." },
      about: { type: "string", maxLength: ABOUT_MAX, description: "One to three sentences: who they are and what is true of them so far." },
      occupation: { type: "string", maxLength: OCCUPATION_MAX, description: "What they do, in a few words. Leave out when unknown." },
      here: { type: "boolean", description: "True when they are in the party's place right now. A person from a memory is not." },
      known: { type: "boolean", description: "True (the default) when the player's character knows of them; false for someone still hidden from them." },
    },
    required: ["name", "about"],
  },
};

export interface Introduction {
  /** The table-made record this brings up to date; null for a new person. */
  replaces: string | null;
  name: string;
  about: string;
  occupation: string | null;
  here: boolean;
  known: boolean;
}

type Parsed = { ok: true; value: Introduction } | { ok: false; error: string };

export function parseIntroduction(input: Record<string, unknown>): Parsed {
  const { name, about, occupation, here, known } = input;
  if (typeof name !== "string" || name.trim() === "") return { ok: false, error: "name is required: the person's name." };
  if (name.trim().length > NAME_MAX) return { ok: false, error: `name is at most ${NAME_MAX} characters.` };
  if (typeof about !== "string" || about.trim() === "") return { ok: false, error: "about is required: one to three sentences of what is true of them." };
  if (about.trim().length > ABOUT_MAX) return { ok: false, error: `about is at most ${ABOUT_MAX} characters: keep it to what is true so far.` };
  if (occupation !== undefined && (typeof occupation !== "string" || occupation.trim().length > OCCUPATION_MAX)) {
    return { ok: false, error: `occupation is a few words, at most ${OCCUPATION_MAX} characters.` };
  }
  if (here !== undefined && typeof here !== "boolean") return { ok: false, error: "here must be true or false." };
  if (known !== undefined && typeof known !== "boolean") return { ok: false, error: "known must be true or false." };
  const job = typeof occupation === "string" && occupation.trim() !== "" ? occupation.trim() : null;
  return { ok: true, value: { replaces: null, name: name.trim(), about: about.trim(), occupation: job, here: here === true, known: known !== false } };
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The record that already carries this name, if one does: the narrator is sent to it instead of making a twin. */
export function alreadyRecorded(name: string, found: ReadonlyArray<{ id: string; shownName: string }>): { id: string; shownName: string } | null {
  return found.find((f) => same(f.shownName, name)) ?? null;
}

export function existsText(existing: { id: string; shownName: string }): string {
  return `${existing.shownName} already has a record (id ${existing.id}). Use it: nothing new was made.`;
}

export function introducedText(intro: Introduction): string {
  if (intro.replaces !== null) {
    return `When this turn is kept, ${intro.name}'s record says this instead of what it said. Go on with the story.`;
  }
  return (
    `When this turn is kept, ${intro.name} gets a record${intro.known ? " the player's character knows of" : ", hidden from the player"}. ` +
    "Find them with search from the next turn on. Go on with the story."
  );
}
