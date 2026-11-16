import { describe, expect, it } from "vitest";
import { openaiModel } from "./openai";
import { data, fakeFetch, jsonResponse, sseResponse } from "./testSupport";
import { AgentProviderError, type ModelRequest } from "./types";

const base: ModelRequest = { system: "sys", messages: [{ role: "user", blocks: [{ type: "text", text: "hi" }] }], tools: [], maxOutputTokens: 500 };

const chunk = (delta: unknown, finish: string | null = null) => data({ choices: [{ index: 0, delta, finish_reason: finish }], usage: null });
const usageChunk = (u: unknown) => data({ choices: [], usage: u });
const DONE = "data: [DONE]\n\n";

describe("openaiModel", () => {
  it("delivers text deltas in order and joins them, when bytes split mid-event", async () => {
    const stream = chunk({ role: "assistant", content: "Hel" }) + chunk({ content: "lo, " }) + chunk({ content: "world" }) + chunk({}, "stop") + usageChunk({ prompt_tokens: 3, completion_tokens: 4 }) + DONE;
    const { fetch } = fakeFetch(() => sseResponse(stream, 5));
    const seen: string[] = [];
    const step = await openaiModel("k", "gpt-x", { fetch })({ ...base, onText: (d) => seen.push(d) });
    expect(seen).toEqual(["Hel", "lo, ", "world"]);
    expect(step.blocks).toEqual([{ type: "text", text: "Hello, world" }]);
    expect(step.stop).toBe("end");
  });

  // Seen live, 16 Nov 2026: a gpt-5.6 request with function tools and a reasoning effort is a 400 on this endpoint.
  it("fails if a gpt-5.6 request that declares tools still carries a reasoning effort the endpoint refuses", async () => {
    const { fetch, calls } = fakeFetch(() => sseResponse(chunk({}, "stop") + DONE));
    const model = openaiModel("k", "gpt-5.6-luna", { fetch });
    await model({ ...base, tools: [{ name: "roll", description: "d", inputSchema: { type: "object" } }] });
    expect(calls[0].body.reasoning_effort).toBe("none");
    // Without tools the effort `textGen.ts` sends is kept.
    await model(base);
    expect(calls[1].body.reasoning_effort).toBe("low");
  });

  // Seen live the same day: gpt-6-luna sent no effort at all, picked its own, and refused the tools with the same 400.
  it("fails if a gpt-6 request that declares tools goes out without switching reasoning off", async () => {
    const { fetch, calls } = fakeFetch(() => sseResponse(chunk({}, "stop") + DONE));
    const model = openaiModel("k", "gpt-6-luna", { fetch });
    await model({ ...base, tools: [{ name: "roll", description: "d", inputSchema: { type: "object" } }] });
    expect(calls[0].body.reasoning_effort).toBe("none");
  });

  it("keeps two interleaved tool calls apart by index with their own ids and inputs", async () => {
    const stream =
      chunk({ tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "roll", arguments: "" } }] }) +
      chunk({ tool_calls: [{ index: 1, id: "call_b", type: "function", function: { name: "look", arguments: "" } }] }) +
      chunk({ tool_calls: [{ index: 0, function: { arguments: '{"dice":' } }] }) +
      chunk({ tool_calls: [{ index: 1, function: { arguments: '{"where"' } }] }) +
      chunk({ tool_calls: [{ index: 0, function: { arguments: '"d20"}' } }] }) +
      chunk({ tool_calls: [{ index: 1, function: { arguments: ':"door"}' } }] }) +
      chunk({}, "tool_calls") + usageChunk({ prompt_tokens: 1, completion_tokens: 1 }) + DONE;
    const { fetch } = fakeFetch(() => sseResponse(stream, 11));
    const step = await openaiModel("k", "gpt-x", { fetch })(base);
    expect(step.blocks).toEqual([
      { type: "tool_call", id: "call_a", name: "roll", input: { dice: "d20" } },
      { type: "tool_call", id: "call_b", name: "look", input: { where: "door" } },
    ]);
    expect(step.stop).toBe("tool_calls");
  });

  it("sends two tool results as two tool messages, declares tools, and drops another provider's opaque block", async () => {
    const { fetch, calls } = fakeFetch(() => sseResponse(chunk({}, "stop") + DONE));
    await openaiModel("k", "gpt-x", { fetch })({
      ...base,
      tools: [{ name: "roll", description: "d", inputSchema: { type: "object" } }],
      messages: [
        { role: "assistant", blocks: [
          { type: "opaque", provider: "anthropic", data: { type: "thinking", thinking: "SECRET" } },
          { type: "tool_call", id: "c1", name: "roll", input: { a: 1 } },
          { type: "tool_call", id: "c2", name: "roll", input: {} },
        ] },
        { role: "user", blocks: [
          { type: "tool_result", callId: "c1", content: "one", isError: false },
          { type: "tool_result", callId: "c2", content: "boom", isError: true },
        ] },
      ],
    });
    const body = calls[0].body;
    expect(body.tools).toEqual([{ type: "function", function: { name: "roll", description: "d", parameters: { type: "object" } } }]);
    const msgs = body.messages as Record<string, unknown>[];
    expect(msgs.slice(2)).toEqual([
      { role: "tool", tool_call_id: "c1", content: "one" },
      { role: "tool", tool_call_id: "c2", content: "Error: boom" },
    ]);
    expect((msgs[1].tool_calls as { id: string; function: { arguments: string } }[]).map((c) => c.function.arguments)).toEqual(['{"a":1}', "{}"]);
    expect(JSON.stringify(body)).not.toContain("SECRET");
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it("does not count cached prompt tokens as full-rate input", async () => {
    const { fetch } = fakeFetch(() => sseResponse(chunk({ content: "x" }, "stop") + usageChunk({ prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 800 } }) + DONE));
    const step = await openaiModel("k", "gpt-x", { fetch })(base);
    expect(step.usage).toMatchObject({ inputTokens: 200, cacheReadTokens: 800, outputTokens: 50, cacheWriteTokens: 0, provider: "openai", model: "gpt-x" });
  });

  it("does not emit a tool call whose arguments are not valid JSON, and the stop becomes other", async () => {
    const stream = chunk({ tool_calls: [{ index: 0, id: "c", function: { name: "roll", arguments: '{"a":' } }] }) + chunk({}, "tool_calls") + DONE;
    const { fetch } = fakeFetch(() => sseResponse(stream));
    const step = await openaiModel("k", "gpt-x", { fetch })(base);
    expect(step.blocks).toEqual([]);
    expect(step.stop).toBe("other");
  });

  it("keeps max_tokens and drops the half-written call when the output cap cut the answer", async () => {
    const stream = chunk({ content: "Rolling" }) + chunk({ tool_calls: [{ index: 0, id: "c", function: { name: "roll", arguments: '{"a"' } }] }) + chunk({}, "length") + DONE;
    const { fetch } = fakeFetch(() => sseResponse(stream));
    const step = await openaiModel("k", "gpt-x", { fetch })(base);
    expect(step.stop).toBe("max_tokens");
    expect(step.blocks).toEqual([{ type: "text", text: "Rolling" }]);
  });

  it("treats a 429 as retryable and a 400 as final, each with the provider's message", async () => {
    const run = (status: number) => openaiModel("k", "gpt-x", { fetch: fakeFetch(() => jsonResponse(status, { error: { message: `msg ${status}` } })).fetch })(base);
    await expect(run(429)).rejects.toMatchObject({ status: 429, retryable: true, message: "msg 429" });
    await expect(run(400)).rejects.toMatchObject({ status: 400, retryable: false, message: "msg 400" });
    await expect(run(503)).rejects.toMatchObject({ status: 503, retryable: true });
    await expect(run(400)).rejects.toBeInstanceOf(AgentProviderError);
  });

  it("raises a retryable error when the stream ends without its terminal line, not a short answer", async () => {
    const { fetch } = fakeFetch(() => sseResponse(chunk({ content: "half an ans" })));
    await expect(openaiModel("k", "gpt-x", { fetch })(base)).rejects.toMatchObject({ retryable: true });
  });

  it("rethrows a caller abort as an abort, and a stall past the timeout as a retryable provider error", async () => {
    const hang = (async (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("x", "AbortError"))))) as typeof fetch;
    const controller = new AbortController();
    const pending = openaiModel("k", "gpt-x", { fetch: hang })({ ...base, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.not.toBeInstanceOf(AgentProviderError);
    await expect(openaiModel("k", "gpt-x", { fetch: hang, timeoutMs: 10 })(base)).rejects.toMatchObject({ retryable: true, message: expect.stringContaining("timed out") });
  });
});
