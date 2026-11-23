// What a turn read (#1253): the records its reading tools returned, kept as names only. Two uses. The browser is told
// ("Show what I read") so the DM can see what an answer rests on, and `offer_ideas` accepts a reference only to a
// record this conversation actually read, so a model cannot link an idea to something it never opened.
// Pure: tool answers in, references out. Never a body, never a field.

import type { AskRecordRef, AskRecordType } from "./askContract.ts";
import { isAskRecordType } from "./askBody.ts";
import { isRecord } from "./parse.ts";
import type { AgentMessage } from "./types.ts";

/** The tool answers that name records. `campaign_overview` is a digest, but the party, active quests and recent notes it lists are records the model has seen by id and name. */
const READERS = new Set(["search", "get", "list", "find", "campaign_overview"]);

/** `bindTools` cuts a long answer and appends a notice; what came before the notice is still JSON up to the cut. */
function parseAnswer(content: string): unknown {
  const cut = content.indexOf("\n[Cut:");
  const text = cut === -1 ? content : content.slice(0, cut);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function refOf(type: unknown, id: unknown, name: unknown): AskRecordRef | null {
  if (!isAskRecordType(type) || typeof id !== "string" || id === "") return null;
  if (typeof name !== "string" || name.trim() === "") return null;
  return { type, id, name: name.trim() };
}

function refsOfList(list: unknown): AskRecordRef[] {
  if (!Array.isArray(list)) return [];
  const out: AskRecordRef[] = [];
  for (const row of list) {
    if (!isRecord(row)) continue;
    const ref = refOf(row.type, row.id, row.name);
    if (ref) out.push(ref);
  }
  return out;
}

/**
 * An overview's rows carry no `type`: the list they sit in says it. Without them a canon idea that rests on "the active
 * quest" read through the overview lost its refs and was shown as a new idea.
 */
function refsOfTypedList(type: AskRecordType, list: unknown, nameField: "name" | "title"): AskRecordRef[] {
  if (!Array.isArray(list)) return [];
  const out: AskRecordRef[] = [];
  for (const row of list) {
    if (!isRecord(row)) continue;
    const ref = refOf(type, row.id, row[nameField]);
    if (ref) out.push(ref);
  }
  return out;
}

/** The records a reading tool's answer named. A failed call, an unknown tool or an answer that is not JSON names none. */
export function recordsRead(tool: string, input: Record<string, unknown>, answer: { content: string; isError: boolean }): AskRecordRef[] {
  if (answer.isError || !READERS.has(tool)) return [];
  const parsed = parseAnswer(answer.content);
  if (!isRecord(parsed)) return [];
  switch (tool) {
    case "search":
    case "find":
      return refsOfList(parsed.hits);
    case "list":
      return refsOfList(parsed.items);
    case "campaign_overview":
      return [
        ...refsOfTypedList("party_member", parsed.party, "name"),
        ...refsOfTypedList("quest", parsed.active_quests, "title"),
        ...refsOfTypedList("note", parsed.recent_notes, "title"),
      ];
    case "get": {
      // A whole row: its kind is what was asked for, and its name is `name` or `title` by the kind.
      const ref = refOf(input.type, parsed.id, parsed.name ?? parsed.title);
      return ref ? [ref] : [];
    }
    default:
      return [];
  }
}

/** What this conversation has read, keyed by kind and id. */
export interface ReadLog {
  /** Adds records; returns only the ones not read before, so the browser hears each once. */
  add(refs: AskRecordRef[]): AskRecordRef[];
  has(type: AskRecordType, id: string): boolean;
  all(): AskRecordRef[];
}

export function createReadLog(): ReadLog {
  const read = new Map<string, AskRecordRef>();
  const key = (type: AskRecordType, id: string) => `${type}:${id}`;
  return {
    add(refs) {
      const fresh: AskRecordRef[] = [];
      for (const ref of refs) {
        const k = key(ref.type, ref.id);
        if (read.has(k)) continue;
        read.set(k, ref);
        fresh.push(ref);
      }
      return fresh;
    },
    has: (type, id) => read.has(key(type, id)),
    all: () => [...read.values()],
  };
}

/**
 * The records the earlier turns of the conversation read, recovered from the stored tool calls and their results, so
 * an idea in turn four may rest on a record turn two opened. Only the part of the conversation still in reach (not
 * folded into the summary) is read: a record that is no longer in what the model can see is not one it may cite.
 */
export function seedReadLog(log: ReadLog, history: readonly AgentMessage[]): void {
  const calls = new Map<string, { name: string; input: Record<string, unknown> }>();
  for (const message of history) {
    for (const block of message.blocks) {
      if (block.type === "tool_call") calls.set(block.id, { name: block.name, input: block.input });
      else if (block.type === "tool_result") {
        const call = calls.get(block.callId);
        if (call) log.add(recordsRead(call.name, call.input, block));
      }
    }
  }
}
