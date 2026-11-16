// The agent runtime's own vocabulary (#1205): a conversation the server holds with a model that may call tools.
//
// Provider-neutral on purpose. `textGen.ts` is one request in, one answer out; a table the AI runs needs many
// messages, tool calls in the middle and text that streams. Every provider adapter (`openai.ts` first, because it
// is the only text provider production offers; others follow the same contract) turns these shapes into its own
// wire format and back, and the turn loop (`turn.ts`) never sees a provider's JSON. Nothing here does I/O.

/** A piece of a message. */
export type AgentBlock =
  | { type: "text"; text: string }
  /** The model asks for a tool. `id` pairs it with its result; `input` is already parsed JSON. */
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  /** What a tool answered, as text the model reads. `isError` tells the model the call failed. */
  | { type: "tool_result"; callId: string; content: string; isError: boolean }
  /**
   * Something a provider needs handed back unchanged and nobody else reads (a reasoning item, a thinking block).
   * An adapter writes it and only the same provider's adapter replays it; every other adapter drops it.
   */
  | { type: "opaque"; provider: string; data: unknown };

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
export type CallTool = (name: string, input: Record<string, unknown>) => Promise<{ content: string; isError: boolean }>;

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
