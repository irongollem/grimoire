// A character speaking up unasked in campaign chat (#1021 row 26, the maintainer's decision of 24 Nov 2026: "when it
// has cause"). Pure: no I/O. It speaks only when a line names something it knows (its party, the people and places in its
// own memories and sheet) and a judge agrees it has real reason, at most
// a few times an hour, and only for a character both its player and the DM have said may be played.
//
// Kept beside `handler.ts` rather than inside it: the answered path (`standInsAnswering`) and this one share the call,
// the screen, the bill and the post, but the rules for who may speak, and why, are all different.

import type { JudgeRequest, JudgeResult, NoulQuestion } from "../_shared/typesafe.ts";
import { noulOf } from "../_shared/typesafe.ts";
import { addresses, type StoredMention } from "../../../src/lib/chat/chatMentions.ts";
import { playedInChat, STAND_IN_RECENT_LINES, standInPrompt, type StandIn } from "../_shared/agent/standIn.ts";

/**
 * At or above this probability of "has real reason to speak up", the character speaks. Measured on three lines only
 * (24 Nov 2026, jev, Toddy hearing about his companion Rosie, after `namesAsKnown`): "Rosie went down to the cellar alone
 * again. Should someone go after her?" 0.65; "Rosie said she would bring bread." 0.53; "I think Rosie is lying to us"
 * 0.45. The first guess, 0.8, let nothing through. 0.6 takes the plain call to act and leaves small talk, and the third
 * line (which a companion should answer) shows the judge does not yet separate these well: a labelled set from real
 * play should move it. Each score is logged (`character-reply: cause ... judged`), never the line. Every line it lets
 * through is charged to the DM, and the hourly cap bounds a miss.
 */
export const UNPROMPTED_MIN = 0.6;
/** As many unprompted lines per character in any rolling hour. */
export const UNPROMPTED_PER_HOUR = 3;
export const UNPROMPTED_WINDOW_MS = 60 * 60 * 1000;
/** The judge is asked while the sender waits on nothing, but a slow one must not hold the function open. */
export const UNPROMPTED_JUDGE_TIMEOUT_MS = 5_000;
/** The newest public lines shown to the judge beside the line: enough to tell a thread from a stray word. */
const JUDGE_RECENT_LINES = 4;

/**
 * What a character knows by name, beyond its own words: the party. Not quest titles: which quests a character knows is
 * read only for the signed-in player (`get_player_visible_quests`), and the one asking here is whoever sent the line,
 * so a DM's hidden quest could otherwise give a character "cause" (and a hint) for a title its player never saw.
 */
export interface KnownThings {
  partyNames: readonly string[];
}

// Words a sentence can carry capitalised that name nothing.
const NOT_NAMES = new Set([
  "the", "and", "but", "for", "not", "you", "she", "his", "her", "they", "them", "this", "that", "with", "from", "have",
  "was", "were", "who", "what", "when", "where", "why", "how", "our", "your", "their", "its", "aye", "yes", "now", "then",
  "dungeon", "master", "gods", "god",
]);

/** Whole words of a text that are capitalised in the middle of a sentence, as runs ("Saltmarsh Ferry") and singly. */
export function properNamesIn(text: string): string[] {
  const found = new Set<string>();
  for (const sentence of text.split(/[.!?\n]+/)) {
    // The first word of a sentence is capitalised whatever it is, so it names nothing by itself.
    const words = sentence.trim().split(/\s+/).slice(1);
    let run: string[] = [];
    const flush = () => {
      if (run.length > 1) found.add(run.join(" "));
      run = [];
    };
    for (const raw of words) {
      const word = raw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").replace(/['’]s$/u, "");
      if (/^\p{Lu}[\p{L}'’-]{2,}$/u.test(word) && !NOT_NAMES.has(word.toLocaleLowerCase())) {
        found.add(word);
        run.push(word);
      } else {
        flush();
      }
    }
    flush();
  }
  return [...found];
}

/**
 * The ways a party member's name is said at a table: the whole name, the nickname between quotes, and each capitalised
 * word of three letters or more. Seen live (24 Nov 2026): "Rosetta \"Rosie\" Vermeil" was never found in "has anyone
 * checked on Rosie?", because chat says the name people use, not the one on the sheet.
 */
export function namesOfPartyMember(name: string): string[] {
  const parts = new Set<string>([name.trim()]);
  for (const m of name.matchAll(/["“”']([^"“”']{3,})["“”']/gu)) parts.add(m[1].trim());
  for (const raw of name.split(/\s+/)) {
    const word = raw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    if (/^\p{Lu}[\p{L}'’-]{2,}$/u.test(word) && !NOT_NAMES.has(word.toLocaleLowerCase())) parts.add(word);
  }
  return [...parts].filter((p) => p !== "");
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether the text holds `name` as whole words, in any case: "Wren" is not in "wrench". */
export function mentionsName(text: string, name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(trimmed)}(?![\\p{L}\\p{N}_])`, "iu").test(text);
}

/** The names of what this character knows that the line holds, each once. Empty means the line is none of its business. */
export function namesInLine(input: { line: string; character: StandIn; memories: readonly string[]; known: KnownThings }): string[] {
  const own = input.character.name.trim().toLocaleLowerCase();
  const candidates = [
    ...input.known.partyNames.flatMap(namesOfPartyMember),
    ...input.memories.flatMap(properNamesIn),
    ...properNamesIn(input.character.about ?? ""),
  ];
  const seen = new Set<string>();
  const hit: string[] = [];
  for (const name of candidates) {
    const key = name.trim().toLocaleLowerCase();
    // A character's own name is being talked about, not something it knows: that is addressing, and it is the answered path's.
    if (key === own || seen.has(key)) continue;
    seen.add(key);
    if (mentionsName(input.line, name)) hit.push(name.trim());
  }
  return hit;
}

/**
 * Who might speak up unasked about a public line: played in chat, not the sender's own character, and not already
 * addressed by the line (the answered path has them). A whisper is private: nobody overhears it.
 */
export function unpromptedCandidates(
  line: { mentions: readonly StoredMention[]; recipientUserId: string | null; senderUserId: string },
  party: readonly StandIn[],
): StandIn[] {
  if (line.recipientUserId !== null) return [];
  return party.filter((c) => playedInChat(c) && c.playerUserId !== line.senderUserId && !addresses(line.mentions, c.id));
}

export const CAUSE_QUESTION: NoulQuestion = {
  type: "noul",
  instructions:
    "A character in a tabletop role-playing game is played by an AI because their player is away. Someone at the table has just said something in the group chat that was not addressed to the character. " +
    "Would this character, going by who they are and what they know, have real reason to speak up about this line unasked? " +
    "Real reason means the line is about a person, place or matter the character has a stake in or knowledge of that would change what the table does or believes, or a thing said about someone close to them. " +
    "Merely mentioning a name in passing, small talk, or a line that other people at the table are already handling is not real reason.",
  criteria: {
    true: "The character has real reason to speak up about this line.",
    false: "The character has no real reason to speak up: the name is in passing, or it is not their business.",
  },
};

/**
 * How the character knows each name, said to the judge. Seen live (24 Nov 2026): given only "Rosie", lines about a
 * companion ("Rosie is lying to us", "Rosie went down alone again") scored 0.29 to 0.40: a bare name does not say she is
 * someone the character travels with.
 */
export function namesAsKnown(names: readonly string[], known: KnownThings): string[] {
  const party = new Set(known.partyNames.flatMap(namesOfPartyMember).map((n) => n.toLocaleLowerCase()));
  return names.map((n) => (party.has(n.toLocaleLowerCase()) ? `${n} (a companion who travels with them in their party)` : `${n} (named in their own memories or story)`));
}

export function causeRequest(input: { character: StandIn; line: { from: string; text: string }; names: readonly string[]; known: KnownThings; recent: readonly { from: string; text: string }[] }): JudgeRequest {
  return {
    state: {
      character: input.character.name,
      who_they_are: (input.character.about ?? "").slice(0, 600),
      the_line: `${input.line.from}: ${input.line.text}`,
      what_it_names_that_they_know: namesAsKnown(input.names, input.known),
      the_chat_before: input.recent.slice(-JUDGE_RECENT_LINES).map((l) => `${l.from}: ${l.text}`),
    },
    questions: { cause: CAUSE_QUESTION },
  };
}

/** Whether the judge's verdict is a yes. No answer is a no. */
export function hasCause(result: JudgeResult): boolean {
  const p = noulOf(result, "cause");
  return p !== null && p >= UNPROMPTED_MIN;
}

/** How many more unprompted lines the character may speak in this hour, given the ones it has. */
export function unpromptedLeft(spokenThisHour: number): number {
  return Math.max(0, UNPROMPTED_PER_HOUR - spokenThisHour);
}

/**
 * The character's instructions are `standInPrompt`'s, and the user part tells it the line was not for it: it may say
 * nothing. The lines are other people's typing: data, never instructions.
 */
export function unpromptedPrompt(input: {
  character: StandIn;
  memories: readonly string[];
  recent: readonly { from: string; text: string }[];
  line: { from: string; text: string };
  names: readonly string[];
}): { system: string; user: string } {
  const base = standInPrompt({ character: input.character, memories: input.memories, recent: input.recent, line: input.line, whisper: false });
  const recent = input.recent.slice(-STAND_IN_RECENT_LINES).map((l) => `${l.from}: ${l.text}`);
  const user = [
    recent.length === 0 ? "" : `The chat so far:\n${recent.join("\n")}`,
    `${input.line.from} said in the chat, not to you (it mentions ${input.names.join(", ")}, which you know of):\n${input.line.text}`,
    'Speak up only if you truly have something to add that the table would want to hear, in a line or two. If not, reply with {"says": "", "remembers": null}.',
  ].filter((part) => part !== "").join("\n\n");
  return { system: base.system, user };
}
