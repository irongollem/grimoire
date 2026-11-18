// The turn loop of the agent runtime (#1205): one player message in, the model called, the tools it asks for run,
// the model called again with their results, until it stops. Pure: the model and the tools come in as functions,
// and everything that happened goes out as messages to append to the stored conversation.
//
// The invariant this module guards is that a conversation it returns never holds a `tool_call` without its
// `tool_result`. A provider rejects the next request when one is missing, and a stored conversation that cannot be
// continued is a dead table.

import type { Shown } from "./show.ts";
import type { DmRoll, PlayerMove, PlayerRolled, AgentBlock, AgentLine, ToolAnswer, AgentMessage, AgentTool, AgentUsage, CallModel, CallTool } from "./types.ts";

export type TurnEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_end"; id: string; name: string; isError: boolean; lines?: AgentLine[]; dmRoll?: DmRoll; shown?: Shown }
  | { type: "step"; usage: AgentUsage };

export type TurnEnd = "done" | "step_limit" | "budget" | "max_tokens" | "refusal" | "aborted";

export interface TurnInput {
  system: string;
  /** What came before, already valid. Never changed. */
  history: AgentMessage[];
  /** The new message, as the model reads it. */
  user: string;
  /** What the player typed and whether it was said or done, kept on the stored message for the page. */
  player?: PlayerMove;
  /**
   * Where things stand right now (the scene, the quests, the record), read by the model at the head of the new
   * message and never stored. It is not part of `system` because the provider's prompt cache holds nothing of a
   * request whose instructions changed (probed 17 Nov 2026, gpt-6-luna: one changed sentence at the end of a
   * 6,000-token system message read 0 tokens from the cache; the same change in the newest message read 5,792).
   * The stored message keeps only `user`, so the history carries no stale copies of it.
   */
  state?: string;
  /** The roll this message answered, kept on the stored message for the page. */
  roll?: PlayerRolled;
  tools: AgentTool[];
  callModel: CallModel;
  callTool: CallTool;
  limits: { maxSteps: number; maxOutputTokens: number; tokenBudget: number | null };
  onEvent?: (event: TurnEvent) => void;
  signal?: AbortSignal;
}

export interface TurnResult {
  /** The user message, then every assistant and tool-result message, in order. */
  added: AgentMessage[];
  /** One per model call. */
  steps: AgentUsage[];
  /** Model calls the tools made themselves; `index` is the position in `added` of the tool-result message they belong to. */
  toolSteps: { index: number; usage: AgentUsage }[];
  end: TurnEnd;
  /** The visible text of the last assistant message ("" when it had none). */
  text: string;
}

type ToolCall = Extract<AgentBlock, { type: "tool_call" }>;
type ToolResult = Extract<AgentBlock, { type: "tool_result" }>;

/**
 * What a cached input token weighs against a turn's budget: about what it costs beside a full one (a tenth, the
 * providers' cached rate). The budget is about spend. Counted at full weight, a long sitting ran out of budget in
 * three or four ordinary steps, because every step resends the whole conversation and nearly all of it is a cache
 * read: seen live (18 Nov 2026), a turn ended on "token budget" after a refused call, a search and a lookup,
 * having told the player nothing.
 */
export const CACHED_TOKEN_WEIGHT = 0.1;

/** What the budget counts for one call: full-rate tokens whole, cache reads at their weight. */
export function budgetTokens(usage: AgentUsage): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheWriteTokens + usage.cacheReadTokens * CACHED_TOKEN_WEIGHT;
}

/** Everything the provider billed, summed, for the record of the turn. Cached tokens count whole here. */
export function totalTokens(steps: AgentUsage[]): number {
  let total = 0;
  for (const s of steps) total += s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheWriteTokens;
  return total;
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  return error instanceof Error && error.name === "AbortError";
}

function visibleText(message: AgentMessage | undefined): string {
  if (!message) return "";
  return message.blocks.map((b) => (b.type === "text" ? b.text : "")).join("");
}

/** What the narrator is told when a limit ends the turn with tools still asked for. */
const CLOSING =
  "Nothing that tool would have done has happened. You can call no more tools in this reply: tell the player now, in " +
  "one to three sentences, what has happened so far, and leave what is still open for their next message.";

const REASONS: Record<"step_limit" | "budget" | "aborted", string> = {
  step_limit: "step limit",
  budget: "token budget",
  aborted: "the turn was stopped",
};

/** The state and the player's message as one text, each under its own heading so neither is read as the other. */
export function withState(state: string, user: string): string {
  return `# The table right now\n\nThe server's account of where things stand as of this message. It replaces any earlier one.\n\n${state}\n\n# The player's message\n\n${user}`;
}

export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const { tools, callModel, callTool, limits, signal } = input;
  const added: AgentMessage[] = [
    {
      role: "user",
      blocks: [{ type: "text", text: input.user, ...(input.player ? { player: input.player } : {}), ...(input.roll ? { roll: input.roll } : {}) }],
    },
  ];
  // What the model is sent for this turn: the stored messages, with the state at the head of the first one.
  const sent = (): AgentMessage[] =>
    input.state === undefined
      ? added
      : [{ role: "user", blocks: [{ ...added[0].blocks[0], type: "text", text: withState(input.state, input.user) }] }, ...added.slice(1)];
  const steps: AgentUsage[] = [];
  const toolSteps: { index: number; usage: AgentUsage }[] = [];

  // A listener that throws is the listener's bug; it must not cost the player their turn.
  const emit = (event: TurnEvent) => {
    try {
      input.onEvent?.(event);
    } catch {
      // ignored on purpose
    }
  };

  const result = (end: TurnEnd): TurnResult => ({
    added,
    steps,
    toolSteps,
    end,
    text: visibleText([...added].reverse().find((m) => m.role === "assistant")),
  });

  // Rule 3: answer every call that will not run, so the stored conversation stays valid.
  const answerPending = async (calls: ToolCall[], end: "step_limit" | "budget" | "aborted"): Promise<TurnResult> => {
    added.push({
      role: "user",
      blocks: calls.map(
        (c): ToolResult => ({
          type: "tool_result",
          callId: c.id,
          content: end === "aborted" ? `The turn ended before this tool ran: ${REASONS[end]}.` : `The turn ended before this tool ran: ${REASONS[end]}. ${CLOSING}`,
          isError: true,
        }),
      ),
    });
    // A turn that ran into a limit must not end having told the player nothing: one last call, with no tools to
    // reach for, says where things stand. Stopped by the player is different: they asked for silence.
    if (end === "aborted" || signal?.aborted) return result(end);
    try {
      const closing = await callModel({
        system: input.system,
        messages: [...input.history, ...sent()],
        tools: [],
        maxOutputTokens: limits.maxOutputTokens,
        onText: (delta) => emit({ type: "text", delta }),
        signal,
      });
      steps.push(closing.usage);
      emit({ type: "step", usage: closing.usage });
      const kept = closing.blocks.filter((b) => b.type !== "tool_call");
      if (kept.length > 0) added.push({ role: "assistant", blocks: kept });
    } catch (error) {
      // The closing words are a courtesy: a failure here leaves the turn as it stood.
      if (!isAbort(error, signal)) console.error("agent turn: the closing call failed:", error);
    }
    return result(end);
  };

  // A tool's own model calls are billed like the narrator's, so the budget counts both.
  const spent = () => [...steps, ...toolSteps.map((t) => t.usage)].reduce((sum, usage) => sum + budgetTokens(usage), 0);

  const runOne = async (call: ToolCall): Promise<{ block: ToolResult; usage: AgentUsage[] }> => {
    emit({ type: "tool_start", id: call.id, name: call.name, input: call.input });
    let answer: ToolAnswer;
    if (!tools.some((t) => t.name === call.name)) {
      answer = { content: `No such tool: ${call.name}`, isError: true };
    } else {
      try {
        answer = await callTool(call.name, call.input);
      } catch (error) {
        answer = { content: error instanceof Error ? error.message : String(error), isError: true };
      }
    }
    emit({
      type: "tool_end",
      id: call.id,
      name: call.name,
      isError: answer.isError,
      ...(answer.lines && answer.lines.length > 0 ? { lines: answer.lines } : {}),
      ...(answer.dmRoll ? { dmRoll: answer.dmRoll } : {}),
      ...(answer.shown ? { shown: answer.shown } : {}),
    });
    const block: ToolResult = { type: "tool_result", callId: call.id, content: answer.content, isError: answer.isError };
    if (answer.lines && answer.lines.length > 0) block.lines = answer.lines;
    if (answer.dmRoll) block.dmRoll = answer.dmRoll;
    if (answer.shown) block.shown = answer.shown;
    // Stored for a later call to hand back to its character; deliberately not in the `tool_end` event above.
    if (answer.withheld && answer.withheld.length > 0) block.withheld = answer.withheld;
    return { block, usage: answer.usage ?? [] };
  };

  for (;;) {
    if (signal?.aborted) return result("aborted");

    let step;
    try {
      step = await callModel({
        system: input.system,
        messages: [...input.history, ...sent()],
        tools,
        maxOutputTokens: limits.maxOutputTokens,
        onText: (delta) => emit({ type: "text", delta }),
        signal,
      });
    } catch (error) {
      if (isAbort(error, signal)) return result("aborted");
      throw error;
    }
    steps.push(step.usage);
    emit({ type: "step", usage: step.usage });

    if (step.stop === "max_tokens") {
      // A call cut off at the cap may be half a call, so only the text and opaque blocks survive.
      const kept = step.blocks.filter((b) => b.type !== "tool_call");
      if (kept.length > 0) added.push({ role: "assistant", blocks: kept });
      return result("max_tokens");
    }

    if (step.blocks.length > 0) added.push({ role: "assistant", blocks: step.blocks });
    if (step.stop === "refusal") return result("refusal");

    const calls = step.blocks.filter((b): b is ToolCall => b.type === "tool_call");
    // `tool_calls` with no call in it has nothing to answer; looping on it would send an empty message.
    if (step.stop !== "tool_calls" || calls.length === 0) return result("done");

    if (signal?.aborted) return answerPending(calls, "aborted");
    if (steps.length >= limits.maxSteps) return answerPending(calls, "step_limit");
    if (limits.tokenBudget !== null && spent() >= limits.tokenBudget) {
      return answerPending(calls, "budget");
    }

    // Together, so a slow tool does not hold the others up; Promise.all keeps the order the calls were made in.
    const ran = await Promise.all(calls.map(runOne));
    const index = added.length;
    added.push({ role: "user", blocks: ran.map((r) => r.block) });
    for (const r of ran) {
      for (const usage of r.usage) {
        toolSteps.push({ index, usage });
        emit({ type: "step", usage });
      }
    }
  }
}
