// The turn loop of the agent runtime (#1205): one player message in, the model called, the tools it asks for run,
// the model called again with their results, until it stops. Pure: the model and the tools come in as functions,
// and everything that happened goes out as messages to append to the stored conversation.
//
// The invariant this module guards is that a conversation it returns never holds a `tool_call` without its
// `tool_result`. A provider rejects the next request when one is missing, and a stored conversation that cannot be
// continued is a dead table.

import type { AgentBlock, AgentLine, ToolAnswer, AgentMessage, AgentTool, AgentUsage, CallModel, CallTool } from "./types.ts";

export type TurnEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_end"; id: string; name: string; isError: boolean; line?: AgentLine }
  | { type: "step"; usage: AgentUsage };

export type TurnEnd = "done" | "step_limit" | "budget" | "max_tokens" | "refusal" | "aborted";

export interface TurnInput {
  system: string;
  /** What came before, already valid. Never changed. */
  history: AgentMessage[];
  /** The new message. */
  user: string;
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

/** Everything the provider billed, summed. Cached tokens count: the budget is about spend, not about the prompt. */
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

const REASONS: Record<"step_limit" | "budget" | "aborted", string> = {
  step_limit: "step limit",
  budget: "token budget",
  aborted: "the turn was stopped",
};

export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const { tools, callModel, callTool, limits, signal } = input;
  const added: AgentMessage[] = [{ role: "user", blocks: [{ type: "text", text: input.user }] }];
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
  const answerPending = (calls: ToolCall[], end: "step_limit" | "budget" | "aborted"): TurnResult => {
    added.push({
      role: "user",
      blocks: calls.map(
        (c): ToolResult => ({
          type: "tool_result",
          callId: c.id,
          content: `The turn ended before this tool ran: ${REASONS[end]}.`,
          isError: true,
        }),
      ),
    });
    return result(end);
  };

  // A tool's own model calls are billed like the narrator's, so the budget counts both.
  const spent = () => totalTokens([...steps, ...toolSteps.map((t) => t.usage)]);

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
      ...(answer.line ? { line: answer.line } : {}),
    });
    const block: ToolResult = { type: "tool_result", callId: call.id, content: answer.content, isError: answer.isError };
    if (answer.line) block.line = answer.line;
    return { block, usage: answer.usage ?? [] };
  };

  for (;;) {
    if (signal?.aborted) return result("aborted");

    let step;
    try {
      step = await callModel({
        system: input.system,
        messages: [...input.history, ...added],
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
