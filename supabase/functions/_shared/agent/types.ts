// The agent runtime's own vocabulary (#1205): a conversation the server holds with a model that may call tools.
//
// Provider-neutral on purpose. `textGen.ts` is one request in, one answer out; a table the AI runs needs many
// messages, tool calls in the middle and text that streams. Every provider adapter (`openai.ts` first, because it
// is the only text provider production offers; others follow the same contract) turns these shapes into its own
// wire format and back, and the turn loop (`turn.ts`) never sees a provider's JSON. Nothing here does I/O.

/**
 * Something a character said aloud or visibly did, shown to the player in that character's own box. `speaker.id`
 * is the campaign record's id, null for someone with no record.
 */
export interface AgentLine {
  kind: "spoken" | "acted";
  speaker: { id: string | null; name: string };
  text: string;
}

/** A piece of a message. */
export type AgentBlock =
  /**
   * `player` is set on the player's own message: what they typed and whether their character says it aloud or
   * does it. The page draws from it; `text` is what the model reads, which says the same in words.
   */
  | { type: "text"; text: string; player?: PlayerMove }
  /** The model asks for a tool. `id` pairs it with its result; `input` is already parsed JSON. */
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  /** What a tool answered, as text the model reads. `isError` tells the model the call failed. */
  | { type: "tool_result"; callId: string; content: string; isError: boolean; lines?: AgentLine[] }
  /**
   * Something a provider needs handed back unchanged and nobody else reads (a reasoning item, a thinking block).
   * An adapter writes it and only the same provider's adapter replays it; every other adapter drops it.
   */
  | { type: "opaque"; provider: string; data: unknown };

/** What the player's character does with a message: says it aloud, or does it. */
export interface PlayerMove {
  kind: "say" | "do";
  text: string;
}

/** One message. Tool results travel in a `user` message, as every provider expects them after the call. */
export interface AgentMessage {
  role: "user" | "assistant";
  blocks: AgentBlock[];
}

/** A tool the model may call. `inputSchema` is JSON Schema, the shape the MCP tools already use (`_shared/mcp/tools.ts`). */
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Tokens one model call used, as the provider measured them. Cached input is counted apart: it is billed apart. */
export interface AgentUsage {
  provider: string;
  model: string;
  /** Input tokens billed at the full rate (cached reads and writes excluded). */
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the provider's prompt cache. */
  cacheReadTokens: number;
  /** Input tokens written to the cache this call (0 for a provider that does not bill writes apart). */
  cacheWriteTokens: number;
}

/**
 * Why a model call ended. `tool_calls`: it wants tools run. `end`: it is done. `max_tokens`: cut off at the output
 * cap. `refusal`: the provider declined. `other`: anything else; the loop treats it as an end and records it.
 */
export type AgentStop = "end" | "tool_calls" | "max_tokens" | "refusal" | "other";

export interface ModelRequest {
  /** The standing instructions. Kept byte-stable across a session so a provider's prompt cache can hold it. */
  system: string;
  messages: AgentMessage[];
  tools: AgentTool[];
  maxOutputTokens: number;
  /**
   * True for a call that should answer at once without thinking it over first: a character's line of a sentence or
   * two. A reasoning model otherwise spends a second or more before its first word, and the player waits for it.
   */
  quick?: boolean;
  /** Called with each piece of visible text as it arrives. An adapter that cannot stream calls it once at the end. */
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}

/** One model call's answer: the assistant message it produced, why it stopped, and what it cost. */
export interface ModelStep {
  blocks: AgentBlock[];
  stop: AgentStop;
  usage: AgentUsage;
}

/** A provider adapter, bound to its key and model. Throws `AgentProviderError` on a failed request. */
export type CallModel = (request: ModelRequest) => Promise<ModelStep>;

/** Runs one tool. Never throws for a tool's own failure: that is `isError: true`, which the model can read and react to. */
export type CallTool = (name: string, input: Record<string, unknown>) => Promise<ToolAnswer>;

/**
 * What a tool answered. `usage` is every model call the tool made itself (a character speaking is one), so the turn
 * can count, budget and store those tokens. `lines` is what the browser may show, in order (a character's deed, then its words), kept on the stored result.
 */
export interface ToolAnswer {
  content: string;
  isError: boolean;
  usage?: AgentUsage[];
  lines?: AgentLine[];
}

/** A provider request that did not produce an answer. `retryable` is true for a timeout, a 429 and a 5xx. */
export class AgentProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AgentProviderError";
  }
}
