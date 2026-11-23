// The OpenAI adapter for the agent runtime (#1205, moved to the Responses API in #1021 row 6a): always streamed, with
// tool calling. Raw fetch like `textGen.ts`, because the edge functions carry no provider SDKs.
//
// Why the Responses API: Chat Completions refuses function tools together with a reasoning effort on the gpt-5.6 and
// gpt-6 models (seen live, 16 Nov 2026: "use /v1/responses or set reasoning_effort to 'none'"), so a narrator with
// tools could not think between its calls and made them one at a time. Here it reasons at the effort `textGen.ts`
// uses, and its reasoning is carried from one call of a turn to the next.
//
// Stateless on purpose (`store: false`): nothing of a sitting is kept at OpenAI between calls. What lets the model
// pick up its own reasoning is the reasoning item it returned, `encrypted_content` included, which this adapter
// keeps as an `opaque` block and hands back in order, ahead of the calls it led to.

import { isOpenAiReasoningModel } from "../platformModels.ts";
import { type AdapterDeps, parseEventJson, parseToolInput, runStream } from "./providerHttp.ts";
import { isRecord } from "./parse.ts";
import {
  AgentProviderError,
  type AgentBlock,
  type AgentMessage,
  type AgentStop,
  type CallModel,
  type ModelRequest,
} from "./types.ts";

const PROVIDER = "openai";
const URL = "https://api.openai.com/v1/responses";

type WireItem = Record<string, unknown>;

/**
 * The conversation as Responses input items, in the order the blocks stand. Another provider's `opaque` block is
 * dropped; this provider's own is a reasoning item and goes back exactly where it was.
 */
function toInputItems(messages: AgentMessage[]): WireItem[] {
  const items: WireItem[] = [];
  for (const message of messages) {
    for (const b of message.blocks) {
      if (message.role === "assistant") {
        if (b.type === "text" && b.text !== "") {
          items.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: b.text }] });
        } else if (b.type === "tool_call") {
          items.push({ type: "function_call", call_id: b.id, name: b.name, arguments: JSON.stringify(b.input) });
        } else if (b.type === "opaque" && b.provider === PROVIDER && isRecord(b.data)) {
          items.push(b.data);
        }
        continue;
      }
      if (b.type === "tool_result") {
        // The wire has no error flag, so a failure says so in the text the model reads.
        items.push({ type: "function_call_output", call_id: b.callId, output: b.isError ? `Error: ${b.content}` : b.content });
      } else if (b.type === "text" && b.text !== "") {
        items.push({ role: "user", content: b.text });
      }
    }
  }
  return items;
}

/**
 * The effort `textGen.ts` uses for a reasoning model ("low"), or "none" for a `quick` call (a character's line of a
 * sentence or two, which should not wait on thinking). A model outside the reasoning families is sent none at all:
 * it rejects the parameter.
 */
function reasoningParams(model: string, quick: boolean): Record<string, unknown> {
  if (!isOpenAiReasoningModel(model)) return {};
  return {
    reasoning: { effort: quick ? "none" : "low" },
    // Stateless reasoning is replayed from this. Newer models return it by default; the field is still accepted.
    include: ["reasoning.encrypted_content"],
  };
}

/** A reasoning item as it is sent back: only the fields an input item takes. */
function reasoningItem(item: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "reasoning",
    id: item.id,
    summary: Array.isArray(item.summary) ? item.summary : [],
    ...(typeof item.encrypted_content === "string" ? { encrypted_content: item.encrypted_content } : {}),
  };
}

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
}

/** What a finished output item is, by its place in the output. Text is read from its deltas instead. */
type Done =
  | { kind: "message"; refused: boolean }
  | { kind: "call"; id: string; name: string; args: string }
  | { kind: "reasoning"; item: Record<string, unknown> };

type Ended = { status: "completed" } | { status: "incomplete"; reason: string };

function stopOf(ended: Ended, refused: boolean, askedForCall: boolean, hasCall: boolean): AgentStop {
  if (refused) return "refusal";
  if (ended.status === "incomplete") {
    if (ended.reason === "max_output_tokens") return "max_tokens";
    return ended.reason === "content_filter" ? "refusal" : "other";
  }
  if (hasCall) return "tool_calls";
  // It asked for calls and none could be run (broken arguments): not a plain end the loop can close on.
  return askedForCall ? "other" : "end";
}

export function openaiModel(apiKey: string, model: string, deps: AdapterDeps = {}): CallModel {
  return async (request: ModelRequest) => {
    const body = {
      model,
      instructions: request.system,
      input: toInputItems(request.messages),
      ...reasoningParams(model, request.quick === true),
      ...(request.tools.length > 0
        ? {
            tools: request.tools.map((t) => ({
              type: "function",
              name: t.name,
              description: t.description,
              parameters: t.inputSchema,
              strict: false,
            })),
          }
        : {}),
      max_output_tokens: request.maxOutputTokens,
      store: false,
      stream: true,
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
      async (events) => {
        // Text is kept from its deltas, per output item, so an answer cut at the cap keeps what was written.
        const texts = new Map<number, string>();
        const done = new Map<number, Done>();
        let ended: Ended | null = null;
        let usage: Usage = {};

        for await (const event of events) {
          const e = parseEventJson(PROVIDER, event.data);
          const index = typeof e.output_index === "number" ? e.output_index : -1;
          if (e.type === "response.output_text.delta" && typeof e.delta === "string") {
            texts.set(index, (texts.get(index) ?? "") + e.delta);
            request.onText?.(e.delta);
          } else if (e.type === "response.output_item.done" && isRecord(e.item)) {
            // Only the finished item is used: a reasoning item's encrypted content may be partial before this.
            const item = e.item;
            if (item.type === "function_call") {
              done.set(index, {
                kind: "call",
                id: typeof item.call_id === "string" ? item.call_id : "",
                name: typeof item.name === "string" ? item.name : "",
                args: typeof item.arguments === "string" ? item.arguments : "",
              });
            } else if (item.type === "reasoning") {
              done.set(index, { kind: "reasoning", item: reasoningItem(item) });
            } else if (item.type === "message") {
              const parts = Array.isArray(item.content) ? item.content : [];
              done.set(index, { kind: "message", refused: parts.some((p) => isRecord(p) && p.type === "refusal") });
            }
          } else if (e.type === "response.completed" || e.type === "response.incomplete") {
            const response = isRecord(e.response) ? e.response : {};
            if (isRecord(response.usage)) usage = response.usage as Usage;
            const details = isRecord(response.incomplete_details) ? response.incomplete_details : {};
            ended =
              e.type === "response.completed"
                ? { status: "completed" }
                : { status: "incomplete", reason: typeof details.reason === "string" ? details.reason : "" };
            break;
          } else if (e.type === "response.failed" || e.type === "error") {
            const response = isRecord(e.response) ? e.response : {};
            const error = isRecord(response.error) ? response.error : e;
            const message = typeof error.message === "string" ? error.message : "openai stream error";
            // A server-side failure may pass on a fresh attempt; anything else is the request's fault.
            throw new AgentProviderError(message, null, error.code === "server_error");
          }
        }

        // Without a terminal event the connection dropped mid-answer: what we hold is a fragment, and passing it off
        // as a short answer would be worse than asking for it again.
        if (ended === null) {
          throw new AgentProviderError("openai stream ended before the answer was complete", null, true);
        }

        const blocks: AgentBlock[] = [];
        let refused = false;
        let askedForCall = false;
        const cut = ended.status === "incomplete";
        for (const i of [...new Set([...texts.keys(), ...done.keys()])].sort((a, b) => a - b)) {
          const item = done.get(i);
          if (item?.kind === "reasoning") {
            blocks.push({ type: "opaque", provider: PROVIDER, data: item.item });
          } else if (item?.kind === "call") {
            askedForCall = true;
            const input = parseToolInput(item.args);
            // A call that cannot be run (not an object, missing its id or name, or cut by the cap) is not offered.
            if (!cut && input !== null && item.id !== "" && item.name !== "") {
              blocks.push({ type: "tool_call", id: item.id, name: item.name, input });
            }
          } else if (item?.kind === "message" && item.refused) {
            refused = true;
          } else {
            const text = texts.get(i) ?? "";
            if (text !== "") blocks.push({ type: "text", text });
          }
        }

        const input = usage.input_tokens ?? 0;
        const cached = usage.input_tokens_details?.cached_tokens ?? 0;
        return {
          blocks,
          stop: stopOf(ended, refused, askedForCall, blocks.some((b) => b.type === "tool_call")),
          usage: {
            provider: PROVIDER,
            model,
            // A field the provider leaves out counts as 0: usage is bookkeeping, and the answer is still good.
            inputTokens: input - cached,
            outputTokens: usage.output_tokens ?? 0,
            cacheReadTokens: cached,
            cacheWriteTokens: 0, // OpenAI caches without billing writes apart.
          },
        };
      },
    );
  };
}
