// @-mentions in campaign chat (#1021 row 26). Pure: no I/O.
//
// The maintainer, 19 Nov 2026: "we already have @ mentions elsewhere so may as well build them into chat as well
// which is the public addressal form of a whisper". A whisper says something to one person in private; a mention says
// it to them in front of the table. Who can be mentioned is the party's characters and the Dungeon Master: a table
// addresses a character, and a character played for an absent player (row 26) answers to its name.
//
// A message stays plain text ("@Rosie hold the door"). What it mentions is worked out from the text against the names
// the table has, and stored beside it (`metadata.mentions`) so a reader, or the server, need not parse it again.

import type { StoredMention } from "../../types/chat.types.ts";

// The stored shape lives with the other chat types; re-exported so importers here keep working.
export type { StoredMention };

/**
 * Whom a chat line can address: one character, the Dungeon Master, or the whole party ("@party", the maintainer the
 * same day: "which also indirectly addresses them"). Only a character has a `partyMemberId`.
 */
export interface MentionTarget {
  kind: "member" | "dm" | "party";
  partyMemberId: string | null;
  name: string;
}


/** The two targets every table has beside its characters. */
export const DM_MENTION: MentionTarget = { kind: "dm", partyMemberId: null, name: "Dungeon Master" };
export const PARTY_MENTION: MentionTarget = { kind: "party", partyMemberId: null, name: "party" };

/** Whether a message's mentions address this character: by name, or with the whole party. */
export function addresses(mentions: readonly StoredMention[], partyMemberId: string): boolean {
  return mentions.some((m) => m.kind === "party" || (m.kind === "member" && m.party_member_id === partyMemberId));
}

/** As many suggestions as the picker shows: a party is a handful. */
export const MENTION_SUGGESTIONS_MAX = 8;
/** A name being typed is never longer than this; past it the "@" is taken for something else. */
const QUERY_MAX_CHARS = 40;

const lower = (s: string) => s.toLocaleLowerCase();
const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}_]/u.test(ch);

/**
 * The mention being typed at the caret: the "@" that opens it and what follows up to the caret. Null when the caret
 * is not in one. An "@" inside a word (an email address) opens nothing.
 */
export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start < 0) return null;
  if (start > 0 && !/\s/.test(before[start - 1])) return null;
  const query = before.slice(start + 1);
  if (query.includes("\n") || query.length > QUERY_MAX_CHARS) return null;
  return { start, query };
}

/** The targets a typed query could mean: a name, or any word of it, that starts with the query. Best first. */
export function matchingTargets(targets: readonly MentionTarget[], query: string): MentionTarget[] {
  const q = lower(query.trimStart());
  const scored = targets.flatMap((t) => {
    const name = lower(t.name);
    if (name.startsWith(q)) return [{ t, rank: 0 }];
    if (name.split(/\s+/).some((word) => word.replace(/^["'“(]+/, "").startsWith(q))) return [{ t, rank: 1 }];
    return [];
  });
  return scored.sort((a, b) => a.rank - b.rank || a.t.name.localeCompare(b.t.name)).slice(0, MENTION_SUGGESTIONS_MAX).map((s) => s.t);
}

/** The text with the mention being typed replaced by the chosen name, and where the caret goes after it. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const inserted = `@${name} `;
  const rest = text.slice(caret).replace(/^ /, "");
  return { text: text.slice(0, start) + inserted + rest, caret: start + inserted.length };
}

/**
 * Whether a line just posted might be answered by a character played for its absent player (#1021 row 26): the table
 * has someone played. Any line may be: one that addresses a character, the party or a whisper is answered, and since
 * 24 Nov 2026 (the maintainer: "when it has cause") a line that names something a played character knows may draw a
 * word from them unasked. The server decides who speaks, and a line no one answers costs nobody anything. A reader who
 * is not shown who is played (the flag missing from their party rows) asks the server.
 */
export function mightBeAnswered(party: readonly { ai_stands_in?: boolean }[]): boolean {
  return party.length > 0 && !party.every((p) => p.ai_stands_in === false);
}

/**
 * Every place the text names a target after an "@", longest name first so "Rosie Vermeil" is not read as "Rosie".
 * Every index here is into the ORIGINAL text: lowercasing can change a string's length ("İ" becomes two code units),
 * so each candidate is compared as a slice of the original, never found in a re-cased copy.
 */
function mentionSpans(text: string, targets: readonly MentionTarget[]): { start: number; end: number; target: MentionTarget }[] {
  // App convention: on equal length the whole party wins, so "@party" always addresses the table even when a
  // character is literally named "party".
  const byLength = [...targets]
    .filter((t) => t.name.trim() !== "")
    .sort((a, b) => b.name.length - a.name.length || Number(b.kind === "party") - Number(a.kind === "party"));
  const spans: { start: number; end: number; target: MentionTarget }[] = [];
  let at = text.indexOf("@");
  while (at >= 0) {
    const opens = at === 0 || !isWordChar(text[at - 1]);
    const found = opens
      ? byLength.find((t) => lower(text.slice(at + 1, at + 1 + t.name.length)) === lower(t.name) && !isWordChar(text[at + 1 + t.name.length]))
      : undefined;
    if (found) {
      spans.push({ start: at, end: at + 1 + found.name.length, target: found });
      at = text.indexOf("@", at + 1 + found.name.length);
    } else {
      at = text.indexOf("@", at + 1);
    }
  }
  return spans;
}

/** Whom a message mentions, each once, in the order they are named. */
export function mentionsIn(text: string, targets: readonly MentionTarget[]): StoredMention[] {
  const seen = new Set<string>();
  const out: StoredMention[] = [];
  for (const { target } of mentionSpans(text, targets)) {
    const key = target.kind === "member" ? `member:${target.partyMemberId}` : target.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: target.kind, party_member_id: target.partyMemberId, name: target.name });
  }
  return out;
}

/** Backslash-escapes what the chat's markdown would take for markup, so a name such as "Star*Lord" shows as typed. */
function escapeMarkdown(s: string): string {
  return s.replace(/[\\`*_[\]~<>&|#]/g, "\\$&");
}

/** The text with each mention set in bold, for the chat's markdown: no markup of our own enters the message. */
export function emphasiseMentions(text: string, targets: readonly MentionTarget[]): string {
  let out = "";
  let from = 0;
  for (const span of mentionSpans(text, targets)) {
    out += `${text.slice(from, span.start)}**${escapeMarkdown(text.slice(span.start, span.end))}**`;
    from = span.end;
  }
  return out + text.slice(from);
}
