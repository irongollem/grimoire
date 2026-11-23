import type { AgentMessage } from "./types.ts";

// Whether the DM has already said yes or no to a picture, read from their own words and nothing else.
//
// The prompt tells the model not to ask about a portrait when the DM said "no portrait", and in a live run (#1253)
// it asked anyway, twice. A rule a model may skip is not a rule, so `ask_choice` checks it here: a question about
// a picture the DM already settled is refused with what they said, and the model proposes in the same turn.
//
// Matching is deliberately narrow. A wrong "no" silently drops a picture the DM wanted, so a phrase counts only
// when it is the DM refusing or asking for the picture itself ("no portrait.", "without a portrait", "skip the
// picture"), never when the word merely appears ("a portrait of the old portrait painter").

const PICTURE = "(?:portraits?|pictures?|images?|paintings?|art(?:work)?|illustrations?)";
// "no portrait painter in town" is about a person, not a refusal; "a portrait" is also the start of a description.
const NOT_A_PERSON = "(?!\\s+(?:painter|artist|gallery|studio|shop|hall|frame)\\b)";
// A bare "no portrait" must end its clause (or be followed by a softener), so "no portrait of him in the hall" is not a refusal.
const CLAUSE_END = "(?=\\s*(?:[.,;:!?)\\n]|$)|\\s+(?:please|thanks|thank|needed|necessary|at all|yet|now|for|this|just|and|but|then|though)\\b)";

const NO: RegExp[] = [
  new RegExp(`\\bno\\s+${PICTURE}${NOT_A_PERSON}${CLAUSE_END}`, "i"),
  new RegExp(`\\bwithout\\s+(?:a\\s+|the\\s+|any\\s+)?${PICTURE}${NOT_A_PERSON}`, "i"),
  new RegExp(`\\b(?:skip|leave\\s+out|omit|drop|forget)\\s+(?:the\\s+|a\\s+)?${PICTURE}${NOT_A_PERSON}`, "i"),
  new RegExp(`\\b(?:don'?t|do\\s+not|dont|never)\\s+(?:need|want|add|include|make|generate|create)\\s+(?:a\\s+|the\\s+|any\\s+)?${PICTURE}${NOT_A_PERSON}`, "i"),
  /\b(?:don'?t|do\s+not|dont)\s+(?:paint|draw|illustrate)\b/i,
  /\bno\s+(?:need\s+to\s+)?(?:paint|draw)\b/i,
];

const YES: RegExp[] = [
  new RegExp(`\\b(?:with|add|include|and)\\s+(?:a|the)\\s+${PICTURE}${NOT_A_PERSON}`, "i"),
  new RegExp(`\\b(?:make|generate|create|give\\s+(?:them|him|her|it))\\s+(?:a\\s+|the\\s+)?${PICTURE}${NOT_A_PERSON}`, "i"),
  new RegExp(`\\b(?:i\\s+)?(?:do\\s+)?want\\s+(?:a\\s+|the\\s+)?${PICTURE}${NOT_A_PERSON}`, "i"),
  new RegExp(`\\byes,?\\s+(?:a\\s+|the\\s+)?${PICTURE}${NOT_A_PERSON}`, "i"),
  /\b(?:paint|draw|illustrate)\s+(?:them|him|her|it)\b/i,
];

/** What one DM message says about a picture: refused, asked for, or nothing. A refusal wins within one message. */
export function pictureSaid(message: string): "no" | "yes" | null {
  if (NO.some((re) => re.test(message))) return "no";
  if (YES.some((re) => re.test(message))) return "yes";
  return null;
}

/** The DM's latest word on a picture across their messages, oldest first; null when they never settled it. */
export function pictureSettled(dmMessages: readonly string[]): "no" | "yes" | null {
  for (let i = dmMessages.length - 1; i >= 0; i--) {
    const said = pictureSaid(dmMessages[i]);
    if (said !== null) return said;
  }
  return null;
}

/** Whether a question put to the DM, or its chips, is about a picture. */
export function isPictureQuestion(question: string, chips: readonly { label: string; reply: string }[]): boolean {
  const about = new RegExp(`\\b${PICTURE}\\b|\\b(?:paint|illustrat)`, "i");
  return about.test(question) || chips.some((c) => about.test(c.label) || about.test(c.reply));
}

/** The DM's own words in a stored history: the text of user messages, never the tool results that share that role. */
export function dmWordsOf(history: readonly AgentMessage[]): string[] {
  return history.filter((m) => m.role === "user").flatMap((m) => m.blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])));
}
