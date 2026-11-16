// The OpenAI adapter for the agent runtime (#1205): Chat Completions, always streamed, with tool calling.
// Raw fetch like `textGen.ts`, because the edge functions carry no provider SDKs.

import { openaiReasoningParams } from "../textGen.ts";
import { parseEventJson, parseToolInput, runStream } from "./providerHttp.ts";
import {
  AgentProviderError,
  type AgentBlock,
  type AgentMessage,
  type AgentStop,
  type CallModel,
  type ModelRequest,
} from "./types.ts";

const PROVIDER = "openai";
const URL = "https://api.openai.com/v1/chat/completions";

export interface AdapterDeps {
  fetch?: typeof fetch;
  /** Cap for the whole stream, in milliseconds. Default 120 s. */
  timeoutMs?: number;
}

type WireMessage = Record<string, unknown>;

function textOf(blocks: AgentBlock[]): string {
  return blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

/**
 * Chat Completions has no field for a reasoning item or any other provider's private block, so every `opaque`
 * block is dropped, this provider's own included (the adapter never emits one).
 */
function toWireMessages(system: string, messages: AgentMessage[]): WireMessage[] {
  const wire: WireMessage[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "assistant") {
      const text = textOf(message.blocks);
      const calls = message.blocks.flatMap((b) =>
        b.type === "tool_call"
          ? [{ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) } }]
          : [],
      );
      if (text === "" && calls.length === 0) continue;
      wire.push({
        role: "assistant",
        content: text === "" ? null : text,
        ...(calls.length > 0 ? { tool_calls: calls } : {}),
      });
      continue;
    }
    // Each tool result is its own `tool` message, and they must follow the assistant message that made the calls.
    for (const b of message.blocks) {
      if (b.type !== "tool_result") continue;
      // The wire has no error flag, so a failure says so in the text the model reads.
      wire.push({ role: "tool", tool_call_id: b.callId, content: b.isError ? `Error: ${b.content}` : b.content });
    }
    const text = textOf(message.blocks);
    if (text !== "") wire.push({ role: "user", content: text });
  }
  return wire;
}

/**
 * Chat Completions refuses function tools together with a reasoning effort on the gpt-5.6 and gpt-6 models. Seen
 * live on both, 16 Nov 2026: "Function tools with reasoning_effort are not supported for gpt-5.6-luna in /v1/chat/completions. To
 * use function tools, use /v1/responses or set reasoning_effort to 'none'." So a request that declares tools sets
 * the effort to "none", which that message names as accepted; one without tools keeps what `textGen.ts` sends. A
 * model that should reason between tool calls needs the Responses API, which this adapter does not speak yet.
 */
function reasoningParams(model: string, hasTools: boolean): Record<string, string> {
  const params = openaiReasoningParams(model);
  return hasTools && "reasoning_effort" in params ? { reasoning_effort: "none" } : params;
}

const STOPS: Record<string, AgentStop> = {
  stop: "end",
  tool_calls: "tool_calls",
  length: "max_tokens",
  content_filter: "refusal",
};

interface PendingCall {
  id: string;
  name: string;
  args: string;
}

export function openaiModel(apiKey: string, model: string, deps: AdapterDeps = {}): CallModel {
  return async (request: ModelRequest) => {
    const body = {
      model,
      ...reasoningParams(model, request.tools.length > 0),
      messages: toWireMessages(request.system, request.messages),
      ...(request.tools.length > 0
        ? {
            tools: request.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.inputSchema },
            })),
          }
        : {}),
      max_completion_tokens: request.maxOutputTokens,
      stream: true,
      stream_options: { include_usage: true },
    };

    return await runStream(
      {
        provider: PROVIDER,
        url: URL,
        headers: { Authorization: `Bearer ${apiKey}` },
        body,
        signal: request.signal,
        fetch: deps.fetch,
        timeoutMs: deps.timeoutMs,
      },
      async (messages) => {
        let text = "";
        const calls = new Map<number, PendingCall>();
        let finish: string | null = null;
        let done = false;
        let promptTokens = 0;
        let cachedTokens = 0;
        let completionTokens = 0;

        for await (const message of messages) {
          if (message.data === "[DONE]") {
            done = true;
            break;
          }
          const chunk = parseEventJson(PROVIDER, message.data);
          if (chunk.error !== undefined && chunk.error !== null) {
            const err = chunk.error as { message?: unknown };
            throw new AgentProviderError(
              typeof err.message === "string" ? err.message : "openai stream error",
              null,
              false,
            );
          }
          const usage = chunk.usage as
            | { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
            | null
            | undefined;
          if (usage) {
            // A field the provider leaves out counts as 0: usage is bookkeeping, and the answer is still good.
            promptTokens = usage.prompt_tokens ?? 0;
            completionTokens = usage.completion_tokens ?? 0;
            cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
          }
          const choices = chunk.choices;
          if (!Array.isArray(choices) || choices.length === 0) continue;
          const choice = choices[0] as {
            delta?: {
              content?: string | null;
              tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
            };
            finish_reason?: string | null;
          };
          const delta = choice.delta;
          if (delta?.content) {
            text += delta.content;
            request.onText?.(delta.content);
          }
          for (const part of delta?.tool_calls ?? []) {
            const pending = calls.get(part.index) ?? { id: "", name: "", args: "" };
            if (part.id) pending.id = part.id;
            if (part.function?.name) pending.name += part.function.name;
            if (part.function?.arguments) pending.args += part.function.arguments;
            calls.set(part.index, pending);
          }
          if (choice.finish_reason) finish = choice.finish_reason;
        }

        // Without both the finish reason and the [DONE] line the connection dropped mid-answer: what we hold is a
        // fragment, and passing it off as a short answer would be worse than asking for it again.
        if (!done || finish === null) {
          throw new AgentProviderError("openai stream ended before the answer was complete", null, true);
        }

        const blocks: AgentBlock[] = [];
        if (text !== "") blocks.push({ type: "text", text });
        for (const [, call] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
          const input = parseToolInput(call.args);
          // A call that cannot be run (cut off, or not an object) is not offered to the loop.
          if (input === null || call.id === "" || call.name === "") continue;
          blocks.push({ type: "tool_call", id: call.id, name: call.name, input });
        }
        let stop: AgentStop = STOPS[finish] ?? "other";
        if (stop === "tool_calls" && !blocks.some((b) => b.type === "tool_call")) stop = "other";

        return {
          blocks,
          stop,
          usage: {
            provider: PROVIDER,
            model,
            inputTokens: promptTokens - cachedTokens,
            outputTokens: completionTokens,
            cacheReadTokens: cachedTokens,
            cacheWriteTokens: 0, // OpenAI caches without billing writes apart.
          },
        };
      },
    );
  };
}
