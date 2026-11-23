/**
 * Ask Grimoire (#1253): one decoded `data:` payload of the `ask-turn` stream to a typed event, or null.
 *
 * The stream is the server's, but a malformed or newer event must not take the panel down, and a proposal's fields
 * go into a quote and then into a generator: nothing here is trusted until it has been checked. A record reference
 * that cannot be drawn as a link is dropped on its own; any other malformed field drops the whole event.
 */
import {
  askGenerator,
  type AskChoice,
  type AskEvent,
  type AskIdea,
  type AskIdeaLine,
  type AskProposal,
  type AskRecordRef,
  type AskRecordType,
  type AskTurnEnd,
} from "@edge-shared/agent/askContract";

const RECORD_TYPES: ReadonlySet<string> = new Set<AskRecordType>([
  "npc", "monster", "item", "spell", "location", "faction", "quest", "quest_beat", "encounter", "deity",
  "party_member", "note", "canon", "room",
]);

const TURN_ENDS: ReadonlySet<string> = new Set<AskTurnEnd>(["done", "step_limit", "budget", "max_tokens", "refusal", "aborted"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function parseRef(raw: unknown): AskRecordRef | null {
  if (!isRecord(raw) || typeof raw.type !== "string" || !RECORD_TYPES.has(raw.type)) return null;
  if (!isText(raw.id) || typeof raw.name !== "string") return null;
  return { type: raw.type as AskRecordType, id: raw.id, name: raw.name };
}

function parseRefs(raw: unknown): AskRecordRef[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.flatMap((r) => {
    const ref = parseRef(r);
    return ref ? [ref] : [];
  });
}

function parseChoices(raw: unknown): AskChoice[] | null {
  if (!Array.isArray(raw)) return null;
  const choices: AskChoice[] = [];
  for (const c of raw) {
    if (!isRecord(c) || !isText(c.label) || !isText(c.reply)) return null;
    choices.push({ label: c.label, reply: c.reply, ...(isText(c.note) ? { note: c.note } : {}) });
  }
  return choices;
}

function parseLine(raw: unknown): AskIdeaLine | null {
  if (!isRecord(raw) || typeof raw.canon !== "boolean" || !isText(raw.text)) return null;
  const refs = raw.refs === undefined ? [] : parseRefs(raw.refs);
  return refs ? { canon: raw.canon, text: raw.text, refs } : null;
}

function parseIdea(raw: unknown): AskIdea | null {
  if (!isRecord(raw) || !isText(raw.title) || !Array.isArray(raw.lines)) return null;
  const lines: AskIdeaLine[] = [];
  for (const l of raw.lines) {
    const line = parseLine(l);
    if (!line) return null;
    lines.push(line);
  }
  let handoff: AskIdea["handoff"];
  if (raw.handoff !== undefined) {
    const h = raw.handoff;
    // A handoff to a generator this build does not know is no handoff: there would be nothing to quote it with.
    if (!isRecord(h) || typeof h.generator !== "string" || !askGenerator(h.generator) || typeof h.concept !== "string" || !isRecord(h.inputs)) return null;
    handoff = { generator: h.generator, concept: h.concept, inputs: h.inputs };
  }
  return { title: raw.title, lines, ...(handoff ? { handoff } : {}) };
}

/** A proposal as the stream carries it, or null. The generator must be one this build can quote. */
export function parseAskProposal(raw: unknown): AskProposal | null {
  if (!isRecord(raw) || !isText(raw.proposalId) || typeof raw.generator !== "string" || !askGenerator(raw.generator)) return null;
  if (typeof raw.concept !== "string" || !isRecord(raw.inputs)) return null;
  let target: AskRecordRef | undefined;
  if (raw.target !== undefined) {
    const t = parseRef(raw.target);
    if (!t) return null;
    target = t;
  }
  return { proposalId: raw.proposalId, generator: raw.generator, concept: raw.concept, inputs: raw.inputs, ...(target ? { target } : {}) };
}

export function parseAskEvent(raw: unknown): AskEvent | null {
  if (!isRecord(raw) || typeof raw.type !== "string") return null;
  switch (raw.type) {
    case "session":
      return isText(raw.sessionId) ? { type: "session", sessionId: raw.sessionId } : null;
    case "text":
      return typeof raw.delta === "string" ? { type: "text", delta: raw.delta } : null;
    case "tool_start":
      return typeof raw.name === "string" ? { type: "tool_start", name: raw.name } : null;
    case "tool_end":
      return typeof raw.name === "string" ? { type: "tool_end", name: raw.name, isError: raw.isError === true } : null;
    case "read": {
      const records = parseRefs(raw.records);
      return records ? { type: "read", records } : null;
    }
    case "ask": {
      const choices = parseChoices(raw.choices);
      return isText(raw.question) && choices ? { type: "ask", question: raw.question, choices } : null;
    }
    case "ideas": {
      if (!Array.isArray(raw.ideas)) return null;
      const ideas: AskIdea[] = [];
      for (const i of raw.ideas) {
        const idea = parseIdea(i);
        if (!idea) return null;
        ideas.push(idea);
      }
      return { type: "ideas", ideas };
    }
    case "propose": {
      const proposal = parseAskProposal(raw.proposal);
      return proposal ? { type: "propose", proposal } : null;
    }
    case "done": {
      const { end, routed, free, credits, freeLeft } = raw;
      if (typeof end !== "string" || !TURN_ENDS.has(end) || typeof routed !== "boolean" || typeof free !== "boolean") return null;
      if (typeof credits !== "number" || !Number.isFinite(credits) || credits < 0) return null;
      if (typeof freeLeft !== "number" || !Number.isInteger(freeLeft) || freeLeft < 0) return null;
      return { type: "done", end: end as AskTurnEnd, routed, free, credits, freeLeft };
    }
    case "error":
      return {
        type: "error",
        message: typeof raw.message === "string" && raw.message !== "" ? raw.message : "That did not work. Try again.",
        // Only a literal true: anything else leaves what was shown where it is.
        ...(raw.withheld === true ? { withheld: true as const } : {}),
      };
    default:
      return null;
  }
}
