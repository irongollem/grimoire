// Checking a brainstorm (#1253): ideas, each line either something the campaign already says (with the records it
// rests on) or new. A line marked canon is a claim about the campaign, so it must stand on records the conversation
// really read; a reference to anything else is dropped, and a canon line left with no reference is no longer
// canon, because nothing shows it is. Pure.

import type { AskIdea, AskIdeaLine, AskRecordRef } from "./askContract.ts";
import { askGenerator } from "./askContract.ts";
import type { ReadLog } from "./askReads.ts";
import { isRecord } from "./parse.ts";
import { isAskRecordType } from "./askBody.ts";

export const MAX_IDEAS = 6;
export const MAX_LINES = 6;
const TITLE_MAX = 120;
const LINE_MAX = 500;

export interface CheckedIdeas {
  ideas: AskIdea[];
  /** What the check changed, for the model to know: refs dropped, lines demoted, ideas skipped. */
  notes: string[];
}

function lineOf(raw: unknown, log: ReadLog, notes: string[]): AskIdeaLine | null {
  if (!isRecord(raw) || typeof raw.text !== "string" || raw.text.trim() === "") return null;
  const refs: AskRecordRef[] = [];
  for (const ref of Array.isArray(raw.refs) ? raw.refs : []) {
    if (!isRecord(ref) || !isAskRecordType(ref.type) || typeof ref.id !== "string") continue;
    if (!log.has(ref.type, ref.id)) {
      notes.push(`A reference to ${ref.type} ${ref.id} was dropped: it was not read in this conversation.`);
      continue;
    }
    // The name is the one that was read, never the one the model wrote.
    const read = log.all().find((r) => r.type === ref.type && r.id === ref.id);
    if (read) refs.push(read);
  }
  const claimsCanon = raw.canon === true;
  if (claimsCanon && refs.length === 0) notes.push(`"${raw.text.trim().slice(0, 40)}" was marked canon with nothing read to rest on, so it is shown as new.`);
  return { canon: claimsCanon && refs.length > 0, text: raw.text.trim().slice(0, LINE_MAX), refs };
}

export function checkIdeas(raw: unknown, log: ReadLog): CheckedIdeas {
  const notes: string[] = [];
  const ideas: AskIdea[] = [];
  for (const item of Array.isArray(raw) ? raw.slice(0, MAX_IDEAS) : []) {
    if (!isRecord(item) || typeof item.title !== "string" || item.title.trim() === "") continue;
    const lines = (Array.isArray(item.lines) ? item.lines.slice(0, MAX_LINES) : [])
      .map((l) => lineOf(l, log, notes))
      .filter((l): l is AskIdeaLine => l !== null);
    if (lines.length === 0) continue;
    const idea: AskIdea = { title: item.title.trim().slice(0, TITLE_MAX), lines };
    // A handoff names a generator; the panel validates its inputs again before it quotes, so only the id is checked here.
    if (isRecord(item.handoff) && typeof item.handoff.generator === "string" && askGenerator(item.handoff.generator) !== undefined && typeof item.handoff.concept === "string" && item.handoff.concept.trim() !== "") {
      idea.handoff = {
        generator: item.handoff.generator,
        concept: item.handoff.concept.trim(),
        inputs: isRecord(item.handoff.inputs) ? item.handoff.inputs : {},
      };
    }
    ideas.push(idea);
  }
  return { ideas, notes };
}
