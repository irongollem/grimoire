// The Anthropic adapter for the agent runtime (#1205): Messages API, always streamed, with tool calling and
// prompt caching on the stable prefix (tools, then system). Raw fetch like `textGen.ts`.

import type { AdapterDeps } from "./openai.ts";
import { parseEventJson, parseToolInput, runStream } from "./providerHttp.ts";
import {
  AgentProviderError,
  type AgentBlock,
  type AgentMessage,
  type AgentStop,
  type CallModel,
  type ModelRequest,
} from "./types.ts";

const PROVIDER = "anthropic";
const URL = "https://api.anthropic.com/v1/messages";
const CACHE = { type: "ephemeral" } as const;

type WireBlock = Record<string, unknown>;

function toWireMessages(messages: AgentMessage[]): { role: string; content: WireBlock[] }[] {
  const wire: { role: string; content: WireBlock[] }[] = [];
  for (const message of messages) {
    const content: WireBlock[] = [];
    // Tool results must come first in the user message, and all of one turn's results share that one message.
    if (message.role === "user") {
      for (const b of message.blocks) {
        if (b.type === "tool_result") {
          content.push({ type: "tool_result", tool_use_id: b.callId, content: b.content, is_error: b.isError });
        }
      }
    }
    for (const b of message.blocks) {
      if (b.type === "text" && b.text !== "") content.push({ type: "text", text: b.text });
      else if (b.type === "tool_call") content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
      else if (b.type === "opaque" && b.provider === PROVIDER && typeof b.data === "object" && b.data !== null) {
        content.push(b.data as WireBlock);
      }
    }
    if (content.length > 0) wire.push({ role: message.role, content });
  }
  return wire;
}

const STOPS: Record<string, AgentStop> = {
  end_turn: "end",
  stop_sequence: "end",
  tool_use: "tool_calls",
  max_tokens: "max_tokens",
  refusal: "refusal",
  pause_turn: "other",
};

type Slot = { kind: "text"; text: string } | { kind: "tool"; id: string; name: string; json: string } | { kind: "skip" };

export function anthropicModel(apiKey: string, model: string, deps: AdapterDeps = {}): CallModel {
  return async (request: ModelRequest) => {
    const body = {
      model,
      max_tokens: request.maxOutputTokens,
      stream: true,
      // The cache breakpoint on the last tool and on the system block makes tools plus system one cached prefix.
      // Nothing that changes between calls may come before them.
      ...(request.system !== ""
        ? { system: [{ type: "text", text: request.system, cache_control: CACHE }] }
        : {}),
      ...(request.tools.length > 0
        ? {
            tools: request.tools.map((t, i) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema,
              ...(i === request.tools.length - 1 ? { cache_control: CACHE } : {}),
            })),
          }
        : {}),
      messages: toWireMessages(request.messages),
    };

    return await runStream(
      {
        provider: PROVIDER,
        url: URL,
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body,
        signal: request.signal,
        fetch: deps.fetch,
        timeoutMs: deps.timeoutMs,
      },
      async (messages) => {
        const slots = new Map<number, Slot>();
        let stopReason: string | null = null;
        let finished = false;
        // A field the provider leaves out counts as 0: usage is bookkeeping, and the answer is still good.
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheRead = 0;
        let cacheWrite = 0;

        for await (const message of messages) {
          const event = parseEventJson(PROVIDER, message.data);
          switch (event.type) {
            case "message_start": {
              const usage = (event.message as { usage?: Record<string, number> } | undefined)?.usage;
              inputTokens = usage?.input_tokens ?? 0;
              outputTokens = usage?.output_tokens ?? 0;
              cacheRead = usage?.cache_read_input_tokens ?? 0;
              cacheWrite = usage?.cache_creation_input_tokens ?? 0;
              break;
            }
            case "content_block_start": {
              const block = event.content_block as { type?: string; id?: string; name?: string; text?: string };
              const index = event.index as number;
              if (block.type === "text") {
                slots.set(index, { kind: "text", text: "" });
                if (block.text) {
                  (slots.get(index) as { text: string }).text += block.text;
                  request.onText?.(block.text);
                }
              } else if (block.type === "tool_use") {
                slots.set(index, { kind: "tool", id: block.id ?? "", name: block.name ?? "", json: "" });
              } else {
                // Thinking and server-tool blocks are not enabled here; if one shows up it is ignored.
                slots.set(index, { kind: "skip" });
              }
              break;
            }
            case "content_block_delta": {
              const slot = slots.get(event.index as number);
              const delta = event.delta as { type?: string; text?: string; partial_json?: string };
              if (slot?.kind === "text" && delta.type === "text_delta" && delta.text) {
                slot.text += delta.text;
                request.onText?.(delta.text);
              } else if (slot?.kind === "tool" && delta.type === "input_json_delta" && delta.partial_json) {
                slot.json += delta.partial_json;
              }
              break;
            }
            case "message_delta": {
              const delta = event.delta as { stop_reason?: string | null } | undefined;
              if (delta?.stop_reason) stopReason = delta.stop_reason;
              const usage = event.usage as Record<string, number> | undefined;
              // message_delta usage is cumulative for output; input figures appear only if the server repeats them.
              if (usage?.output_tokens !== undefined) outputTokens = usage.output_tokens;
              if (usage?.input_tokens !== undefined) inputTokens = usage.input_tokens;
              if (usage?.cache_read_input_tokens !== undefined) cacheRead = usage.cache_read_input_tokens;
              if (usage?.cache_creation_input_tokens !== undefined) cacheWrite = usage.cache_creation_input_tokens;
              break;
            }
            case "message_stop":
              finished = true;
              break;
            case "error": {
              const err = event.error as { type?: string; message?: string } | undefined;
              // overloaded_error is the one mid-stream error a retry can clear.
              throw new AgentProviderError(
                err?.message ?? "anthropic stream error",
                null,
                err?.type === "overloaded_error" || err?.type === "api_error",
              );
            }
            default:
              break; // ping and anything newer
          }
        }

        if (!finished || stopReason === null) {
          throw new AgentProviderError("anthropic stream ended before the answer was complete", null, true);
        }

        const blocks: AgentBlock[] = [];
        for (const [, slot] of [...slots.entries()].sort((a, b) => a[0] - b[0])) {
          if (slot.kind === "text" && slot.text !== "") blocks.push({ type: "text", text: slot.text });
          else if (slot.kind === "tool") {
            const input = parseToolInput(slot.json);
            // A call that cannot be run (cut off, or not an object) is not offered to the loop.
            if (input === null || slot.id === "" || slot.name === "") continue;
            blocks.push({ type: "tool_call", id: slot.id, name: slot.name, input });
          }
        }
        let stop: AgentStop = STOPS[stopReason] ?? "other";
        if (stop === "tool_calls" && !blocks.some((b) => b.type === "tool_call")) stop = "other";

        return {
          blocks,
          stop,
          usage: {
            provider: PROVIDER,
            model,
            inputTokens,
            outputTokens,
            cacheReadTokens: cacheRead,
            cacheWriteTokens: cacheWrite,
          },
        };
      },
    );
  };
}
