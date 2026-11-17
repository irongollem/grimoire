// Between the conversation in memory and the rows that store it (#1205). Pure: rows in, messages out, and back.

import type { AgentBlock, AgentLine, AgentMessage, AgentUsage, AgentWithheld } from "./types.ts";

export interface StoredTurn {
  seq: number;
  role: "user" | "assistant";
  blocks: unknown;
}

export interface TurnRow {
  session_id: string;
  user_id: string;
  seq: number;
  role: "user" | "assistant";
  blocks: AgentBlock[];
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

// A stored line is checked field by field; a bad one is dropped so the result the model needs still replays.
function asLine(x: unknown): AgentLine | null {
  if (!isRecord(x) || (x.kind !== "spoken" && x.kind !== "acted") || typeof x.text !== "string") return null;
  const s = x.speaker;
  if (!isRecord(s) || typeof s.name !== "string" || s.name === "") return null;
  if (s.id !== null && typeof s.id !== "string") return null;
  const line: AgentLine = { kind: x.kind, speaker: { id: s.id, name: s.name }, text: x.text };
  if (typeof x.to === "string" && x.to !== "") line.to = x.to;
  return line;
}

// A kept-back sentence belongs to a recorded character, so an entry without an id, a name or words is dropped.
function asWithheld(x: unknown): AgentWithheld | null {
  if (!isRecord(x) || typeof x.text !== "string" || x.text === "") return null;
  const s = x.speaker;
  if (!isRecord(s) || typeof s.id !== "string" || s.id === "" || typeof s.name !== "string" || s.name === "") return null;
  if (x.to !== null && typeof x.to !== "string") return null;
  return { speaker: { id: s.id, name: s.name }, text: x.text, to: x.to };
}

// The blocks came back from a jsonb column, so every one is checked against the four shapes in types.ts.
function asBlock(x: unknown): AgentBlock | null {
  if (!isRecord(x)) return null;
  switch (x.type) {
    case "text": {
      if (typeof x.text !== "string") return null;
      const p = x.player;
      // A bad `player` is dropped and the text kept: the model's history must still replay.
      const block: AgentBlock = { type: "text", text: x.text };
      if (isRecord(p) && (p.kind === "say" || p.kind === "do") && typeof p.text === "string") {
        block.player = { kind: p.kind, text: p.text };
      }
      // Only a literal `true` counts: anything else was never written by this code, and showing text is the safe side.
      if (x.unshown === true) block.unshown = true;
      return block;
    }
    case "tool_call":
      return typeof x.id === "string" && typeof x.name === "string" && isRecord(x.input)
        ? { type: "tool_call", id: x.id, name: x.name, input: x.input }
        : null;
    case "tool_result":
      if (typeof x.callId !== "string" || typeof x.content !== "string" || typeof x.isError !== "boolean") return null;
      {
        const lines = Array.isArray(x.lines) ? x.lines.map(asLine).filter((l): l is AgentLine => l !== null) : [];
        const block: AgentBlock = { type: "tool_result", callId: x.callId, content: x.content, isError: x.isError };
        if (lines.length > 0) block.lines = lines;
        const withheld = Array.isArray(x.withheld) ? x.withheld.map(asWithheld).filter((w): w is AgentWithheld => w !== null) : [];
        if (withheld.length > 0) block.withheld = withheld;
        return block;
      }
    case "opaque":
      return typeof x.provider === "string" ? { type: "opaque", provider: x.provider, data: x.data } : null;
    default:
      return null;
  }
}

/** The validated blocks of one stored row: bad blocks dropped, and a row whose blocks are not a list holds none. */
export function blocksOf(row: StoredTurn): AgentBlock[] {
  if (!Array.isArray(row.blocks)) return [];
  return row.blocks.map(asBlock).filter((b): b is AgentBlock => b !== null);
}

/**
 * The messages to send: rows in `seq` order, the part the summary covers left out, bad blocks dropped.
 * A stored `tool_call` always has its results after it (the loop guarantees it, see turn.ts), so only the cut at
 * the summary can leave an orphan, and only at the front.
 */
export function historyFrom(stored: StoredTurn[], summaryThroughSeq: number): AgentMessage[] {
  const messages: AgentMessage[] = [];
  const kept = stored.filter((row) => row.seq > summaryThroughSeq).sort((a, b) => a.seq - b.seq);
  for (const row of kept) {
    const blocks = blocksOf(row);
    if (blocks.length === 0) continue;
    messages.push({ role: row.role, blocks });
  }
  // A provider rejects a tool result whose call is not earlier in the conversation.
  while (messages.length > 0) {
    const first = messages[0];
    if (first.role === "user" && first.blocks.every((b) => b.type === "tool_result")) messages.shift();
    else break;
  }
  return messages;
}

function usageColumns(u: AgentUsage | null) {
  return {
    provider: u?.provider ?? null,
    model: u?.model ?? null,
    input_tokens: u?.inputTokens ?? null,
    output_tokens: u?.outputTokens ?? null,
    cache_read_tokens: u?.cacheReadTokens ?? null,
    cache_write_tokens: u?.cacheWriteTokens ?? null,
  };
}

/**
 * One row per added message, `seq` continuing from `lastSeq + 1`. The i-th assistant message carries the i-th step.
 * A step with no message is the turn's last one (an empty answer, or a max_tokens cut that held only a tool call:
 * both end the turn), so the steps beyond the assistant messages are folded into the last assistant row, and into
 * the last row of all when the turn wrote no assistant message. A tool's own model calls (`toolSteps`) land on the
 * tool-result row they belong to, merged with the narrator's leftover steps when that row is also the carrier.
 * The usage columns therefore always sum to the steps plus the tool steps, because those tokens were billed
 * whether or not they produced a message.
 */
export function rowsFor(input: {
  sessionId: string;
  userId: string;
  lastSeq: number;
  added: AgentMessage[];
  steps: AgentUsage[];
  toolSteps: { index: number; usage: AgentUsage }[];
}): TurnRow[] {
  const { steps } = input;
  const assistantCount = input.added.filter((m) => m.role === "assistant").length;
  const carrierIndex = assistantCount > 0 ? assistantCount - 1 : -1;
  const lastRow = input.added.length - 1;

  let assistantSeen = 0;
  return input.added.map((message, i): TurnRow => {
    const parts: AgentUsage[] = [];
    if (message.role === "assistant") {
      const own = steps[assistantSeen];
      if (own) parts.push(own);
      if (assistantSeen === carrierIndex) parts.push(...steps.slice(assistantCount));
      assistantSeen++;
    } else if (carrierIndex === -1 && i === lastRow) {
      parts.push(...steps);
    }
    for (const t of input.toolSteps) if (t.index === i) parts.push(t.usage);
    const usage = parts.length > 0 ? merge(parts[0], parts.slice(1)) : null;
    return {
      session_id: input.sessionId,
      user_id: input.userId,
      seq: input.lastSeq + 1 + i,
      role: message.role,
      blocks: message.blocks,
      ...usageColumns(usage),
    };
  });
}

function merge(first: AgentUsage, rest: AgentUsage[]): AgentUsage {
  const last = rest.length > 0 ? rest[rest.length - 1] : first;
  const all = [first, ...rest];
  return {
    provider: last.provider,
    model: last.model,
    inputTokens: all.reduce((n, u) => n + u.inputTokens, 0),
    outputTokens: all.reduce((n, u) => n + u.outputTokens, 0),
    cacheReadTokens: all.reduce((n, u) => n + u.cacheReadTokens, 0),
    cacheWriteTokens: all.reduce((n, u) => n + u.cacheWriteTokens, 0),
  };
}

/** The system text, byte-identical when there is no summary so a provider's prompt cache holds; else the summary after it. */
export function systemWithSummary(system: string, summary: string | null): string {
  if (summary === null || summary.trim() === "") return system;
  return `${system}\n\n## The story so far\n\n${summary}`;
}
