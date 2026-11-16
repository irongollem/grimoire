import { describe, expect, it } from "vitest";
import { anthropicModel } from "./anthropic";
import { fakeFetch, jsonResponse, named, sseResponse } from "./testSupport";
import { AgentProviderError, type ModelRequest } from "./types";

const base: ModelRequest = { system: "sys", messages: [{ role: "user", blocks: [{ type: "text", text: "hi" }] }], tools: [], maxOutputTokens: 500 };

const start = (usage: Record<string, number> = { input_tokens: 10, output_tokens: 1 }) => named("message_start", { type: "message_start", message: { usage } });
const blockStart = (index: number, content_block: unknown) => named("content_block_start", { type: "content_block_start", index, content_block });
const delta = (index: number, d: unknown) => named("content_block_delta", { type: "content_block_delta", index, delta: d });
const stopBlock = (index: number) => named("content_block_stop", { type: "content_block_stop", index });
const end = (stop_reason: string, usage: Record<string, number> = { output_tokens: 9 }) =>
  named("message_delta", { type: "message_delta", delta: { stop_reason }, usage }) + named("message_stop", { type: "message_stop" });
const text = (index: number, t: string) => blockStart(index, { type: "text", text: "" }) + delta(index, { type: "text_delta", text: t }) + stopBlock(index);

describe("anthropicModel", () => {
  it("delivers text deltas in order and joins them, when bytes split mid-event", async () => {
    const s = start() + blockStart(0, { type: "text", text: "" }) + delta(0, { type: "text_delta", text: "Hel" }) + delta(0, { type: "text_delta", text: "lo" }) + stopBlock(0) + end("end_turn");
    const { fetch } = fakeFetch(() => sseResponse(s, 6));
    const seen: string[] = [];
    const step = await anthropicModel("k", "claude-haiku-4-5", { fetch })({ ...base, onText: (d) => seen.push(d) });
    expect(seen).toEqual(["Hel", "lo"]);
    expect(step.blocks).toEqual([{ type: "text", text: "Hello" }]);
    expect(step.stop).toBe("end");
    expect(step.usage).toMatchObject({ inputTokens: 10, outputTokens: 9 });
  });

  it("assembles two tool_use blocks with their own ids, names and split JSON inputs", async () => {
    const s = start() +
      blockStart(0, { type: "tool_use", id: "tu_1", name: "roll", input: {} }) + delta(0, { type: "input_json_delta", partial_json: '{"dice"' }) + delta(0, { type: "input_json_delta", partial_json: ':"d20"}' }) + stopBlock(0) +
      blockStart(1, { type: "tool_use", id: "tu_2", name: "look", input: {} }) + delta(1, { type: "input_json_delta", partial_json: "" }) + stopBlock(1) +
      end("tool_use");
    const { fetch } = fakeFetch(() => sseResponse(s, 9));
    const step = await anthropicModel("k", "m", { fetch })(base);
    expect(step.blocks).toEqual([
      { type: "tool_call", id: "tu_1", name: "roll", input: { dice: "d20" } },
      { type: "tool_call", id: "tu_2", name: "look", input: {} },
    ]);
    expect(step.stop).toBe("tool_calls");
  });

  it("sends both results in one user message, caches only system and the last tool, and drops foreign opaque blocks", async () => {
    const { fetch, calls } = fakeFetch(() => sseResponse(start() + end("end_turn")));
    await anthropicModel("k", "m", { fetch })({
      ...base,
      tools: [
        { name: "a", description: "d", inputSchema: { type: "object" } },
        { name: "b", description: "d", inputSchema: { type: "object" } },
      ],
      messages: [
        { role: "assistant", blocks: [
          { type: "opaque", provider: "openai", data: { type: "reasoning", secret: "SECRET" } },
          { type: "tool_call", id: "c1", name: "a", input: {} },
          { type: "tool_call", id: "c2", name: "b", input: {} },
        ] },
        { role: "user", blocks: [
          { type: "tool_result", callId: "c1", content: "one", isError: false },
          { type: "tool_result", callId: "c2", content: "boom", isError: true },
        ] },
      ],
    });
    const body = calls[0].body;
    const msgs = body.messages as { role: string; content: Record<string, unknown>[] }[];
    expect(msgs).toHaveLength(2);
    expect(msgs[1].content).toEqual([
      { type: "tool_result", tool_use_id: "c1", content: "one", is_error: false },
      { type: "tool_result", tool_use_id: "c2", content: "boom", is_error: true },
    ]);
    expect((body.system as Record<string, unknown>[])[0].cache_control).toEqual({ type: "ephemeral" });
    const tools = body.tools as Record<string, unknown>[];
    expect(tools.map((t) => t.cache_control)).toEqual([undefined, { type: "ephemeral" }]);
    expect(JSON.stringify(body)).not.toContain("SECRET");
    expect(body.thinking).toBeUndefined();
    expect(calls[0].headers["x-api-key"]).toBe("k");
  });

  it("reports cache reads and writes apart from full-rate input", async () => {
    const { fetch } = fakeFetch(() => sseResponse(start({ input_tokens: 20, output_tokens: 1, cache_read_input_tokens: 800, cache_creation_input_tokens: 100 }) + text(0, "x") + end("end_turn")));
    const step = await anthropicModel("k", "m", { fetch })(base);
    expect(step.usage).toMatchObject({ inputTokens: 20, cacheReadTokens: 800, cacheWriteTokens: 100 });
  });

  it("does not emit a tool call with invalid JSON, and the stop becomes other", async () => {
    const s = start() + blockStart(0, { type: "tool_use", id: "t", name: "a", input: {} }) + delta(0, { type: "input_json_delta", partial_json: '{"x":' }) + stopBlock(0) + end("tool_use");
    const step = await anthropicModel("k", "m", { fetch: fakeFetch(() => sseResponse(s)).fetch })(base);
    expect(step.blocks).toEqual([]);
    expect(step.stop).toBe("other");
  });

  it("keeps max_tokens and drops the half call when the output cap cut the answer", async () => {
    const s = start() + text(0, "Rolling") + blockStart(1, { type: "tool_use", id: "t", name: "a", input: {} }) + delta(1, { type: "input_json_delta", partial_json: '{"x"' }) + end("max_tokens");
    const step = await anthropicModel("k", "m", { fetch: fakeFetch(() => sseResponse(s)).fetch })(base);
    expect(step.stop).toBe("max_tokens");
    expect(step.blocks).toEqual([{ type: "text", text: "Rolling" }]);
  });

  it("treats a 429 as retryable and a 400 as final, each with the provider's message", async () => {
    const run = (status: number) => anthropicModel("k", "m", { fetch: fakeFetch(() => jsonResponse(status, { type: "error", error: { type: "x", message: `msg ${status}` } })).fetch })(base);
    await expect(run(429)).rejects.toMatchObject({ status: 429, retryable: true, message: "msg 429" });
    await expect(run(400)).rejects.toMatchObject({ status: 400, retryable: false, message: "msg 400" });
    await expect(run(503)).rejects.toMatchObject({ status: 503, retryable: true });
    await expect(run(400)).rejects.toBeInstanceOf(AgentProviderError);
  });

  it("raises a retryable error when the stream ends without message_stop, not a short answer", async () => {
    const s = start() + text(0, "half");
    await expect(anthropicModel("k", "m", { fetch: fakeFetch(() => sseResponse(s)).fetch })(base)).rejects.toMatchObject({ retryable: true });
  });

  it("surfaces a mid-stream overloaded error as retryable with its message", async () => {
    const s = start() + named("error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
    await expect(anthropicModel("k", "m", { fetch: fakeFetch(() => sseResponse(s)).fetch })(base)).rejects.toMatchObject({ retryable: true, message: "Overloaded" });
  });
});
