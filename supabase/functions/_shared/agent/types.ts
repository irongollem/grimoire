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
  /**
   * Who the words were said to: a shown name, or "everyone". Left out when they were said to the player, to nobody
   * in particular, or to someone who could not be matched, so the page only claims what the code knows.
   */
  to?: string;
  /**
   * How a spoken line is said, as the character itself gave it ("furious, shouting"): a cue for a voice, never
   * drawn as text. Only on spoken lines, and left out when the words were said plainly.
   */
  how?: string;
}

/**
 * Something a listener wanted to say and did not get the floor for. Kept on the stored tool result and given back
 * to that character alone on a later call. It is never a line and no browser event carries it.
 */
export interface AgentWithheld {
  speaker: { id: string; name: string };
  text: string;
  /** The shown name it was meant for, or "everyone"; null when it was not meant for anyone. */
  to: string | null;
}

/** A piece of a message. */
export type AgentBlock =
  /**
   * `player` is set on the player's own message: what they typed and whether their character says it aloud or
   * does it. The page draws from it; `text` is what the model reads, which says the same in words.
   * `unshown` is set on narrator text the player was never shown because it only repeated the lines before it
   * (narrationCheck.ts). It stays in the history the model reads; a page that replays the turn must not draw it.
   * `roll` is set on the player's message when it answered a roll the narrator asked for (playerRoll.ts): the
   * arithmetic the page shows, never the DC or how it went.
   */
  | { type: "text"; text: string; player?: PlayerMove; unshown?: true; roll?: PlayerRolled }
  /** The model asks for a tool. `id` pairs it with its result; `input` is already parsed JSON. */
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  /** What a tool answered, as text the model reads. `isError` tells the model the call failed. */
  | { type: "tool_result"; callId: string; content: string; isError: boolean; lines?: AgentLine[]; withheld?: AgentWithheld[]; dmRoll?: DmRoll }
  /**
   * Something a provider needs handed back unchanged and nobody else reads (a reasoning item, a thinking block).
   * An adapter writes it and only the same provider's adapter replays it; every other adapter drops it.
   */
  | { type: "opaque"; provider: string; data: unknown };

/** A roll the Dungeon Master made in the open, as the page shows it (dmRoll.ts). Never a hidden one. */
export interface DmRoll {
  /** What the roll was for, in the narrator's words; null when it gave none. */
  label: string | null;
  /** The dice asked for, as notation ("1d20+2"); null when the call's expression was not plain notation. */
  dice: string | null;
  /** The dice that count. */
  faces: number[];
  /** Dice rolled and set aside (the lower of two with advantage). */
  dropped: number[];
  modifier: number;
  total: number;
}

/** A roll the player made for their own character, as it is shown and stored. */
export interface PlayerRolled {
  label: string;
  faces: number[];
  /** The die that counts: the only one, the higher with advantage, the lower with disadvantage. */
  kept: number;
  bonus: number;
  total: number;
  mode: "normal" | "advantage" | "disadvantage";
  /** True when the player rolled real dice and typed the face. */
  atTable: boolean;
}

/** What the player's character does with a message: says it aloud, or does it. */
export interface PlayerMove {
  /** `ask` is a question put to the Dungeon Master out of character: not something the character said or did. */
  kind: "say" | "do" | "ask";
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
  /** Kept on the stored result for later calls; the turn loop never sends it to the browser. */
  withheld?: AgentWithheld[];
  /** An open roll the Dungeon Master made with this call: shown on the page and kept on the stored result. */
  dmRoll?: DmRoll;
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
