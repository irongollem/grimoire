import { describe, expect, it } from "vitest";
import { openaiModel } from "./openai";
import { data, fakeFetch, jsonResponse, sseResponse } from "./testSupport";
import { AgentProviderError, type ModelRequest } from "./types";

// Recorded shapes of the Responses API's streaming events (developers.openai.com, "Streaming events").
const base: ModelRequest = { system: "sys", messages: [{ role: "user", blocks: [{ type: "text", text: "hi" }] }], tools: [], maxOutputTokens: 500 };
const roll = { name: "roll", description: "d", inputSchema: { type: "object" } };

const textDelta = (i: number, delta: string) => data({ type: "response.output_text.delta", output_index: i, delta });
const itemDone = (i: number, item: unknown) => data({ type: "response.output_item.done", output_index: i, item });
const message = (i: number, text: string) => itemDone(i, { type: "message", role: "assistant", content: [{ type: "output_text", text }] });
const call = (i: number, callId: string, name: string, args: string) =>
  itemDone(i, { type: "function_call", id: `fc_${i}`, call_id: callId, name, arguments: args, status: "completed" });
const completed = (usage: unknown = { input_tokens: 1, output_tokens: 1 }) => data({ type: "response.completed", response: { status: "completed", usage } });
const incomplete = (reason: string) => data({ type: "response.incomplete", response: { status: "incomplete", incomplete_details: { reason } } });

describe("openaiModel", () => {
  it("delivers text deltas in order and joins them, when bytes split mid-event", async () => {
    const stream = textDelta(0, "Hel") + textDelta(0, "lo, ") + textDelta(0, "world") + message(0, "Hello, world") + completed();
    const { fetch, calls } = fakeFetch(() => sseResponse(stream, 5));
    const seen: string[] = [];
    const step = await openaiModel("k", "gpt-x", { fetch })({ ...base, onText: (d) => seen.push(d) });
    expect(seen).toEqual(["Hel", "lo, ", "world"]);
    expect(step.blocks).toEqual([{ type: "text", text: "Hello, world" }]);
    expect(step.stop).toBe("end");
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
  });

  // #1021 row 6a: the reason for the move. Chat Completions refused tools with an effort (seen live, 16 Nov 2026), so the
  // narrator could not think between calls. On this endpoint it keeps the effort `textGen.ts` uses, tools or not.
  it("keeps the reasoning effort on a request that declares tools, and switches it off only for a quick call", async () => {
    const { fetch, calls } = fakeFetch(() => sseResponse(completed()));
    const model = openaiModel("k", "gpt-6-luna", { fetch });
    await model({ ...base, tools: [roll] });
    expect(calls[0].body.reasoning).toEqual({ effort: "low" });
    await model({ ...base, quick: true });
    expect(calls[1].body.reasoning).toEqual({ effort: "none" });
    // A model outside the reasoning families is sent no effort at all: it rejects the parameter.
    await openaiModel("k", "gpt-4o", { fetch })(base);
    expect("reasoning" in calls[2].body).toBe(false);
  });

  it("keeps nothing at OpenAI: the request is stateless and asks for the reasoning it must replay", async () => {
    // Bug caught: `store` left to its default (true), which keeps every sitting's text on OpenAI's side.
    const { fetch, calls } = fakeFetch(() => sseResponse(completed()));
    await openaiModel("k", "gpt-6-luna", { fetch })(base);
    expect(calls[0].body.store).toBe(false);
    expect(calls[0].body.include).toEqual(["reasoning.encrypted_content"]);
    expect(calls[0].body.instructions).toBe("sys");
    expect(calls[0].body.input).toEqual([{ role: "user", content: "hi" }]);
  });

  it("returns a reasoning item as this provider's opaque block, in its place before the call it led to", async () => {
    const reasoning = { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "ENC", status: "completed" };
    const stream = itemDone(0, reasoning) + call(1, "call_a", "roll", '{"dice":"d20"}') + completed();
    const { fetch } = fakeFetch(() => sseResponse(stream));
    const step = await openaiModel("k", "gpt-6-luna", { fetch })({ ...base, tools: [roll] });
    expect(step.blocks).toEqual([
      { type: "opaque", provider: "openai", data: { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "ENC" } },
      { type: "tool_call", id: "call_a", name: "roll", input: { dice: "d20" } },
    ]);
    expect(step.stop).toBe("tool_calls");
  });

  it("hands its own reasoning back in order, drops another provider's, and sends results as call outputs", async () => {
    // Bug caught: a reasoning item sent after its call, or lost, so the model starts its thinking over every call;
    // or an Anthropic thinking block leaked into an OpenAI request.
    const { fetch, calls } = fakeFetch(() => sseResponse(completed()));
    await openaiModel("k", "gpt-x", { fetch })({
      ...base,
      tools: [roll],
      messages: [
        { role: "assistant", blocks: [
          { type: "opaque", provider: "anthropic", data: { type: "thinking", thinking: "SECRET" } },
          { type: "opaque", provider: "openai", data: { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "ENC" } },
          { type: "text", text: "Let me see." },
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
    expect(body.tools).toEqual([{ type: "function", name: "roll", description: "d", parameters: { type: "object" }, strict: false }]);
    expect(body.input).toEqual([
      { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "ENC" },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "Let me see." }] },
      { type: "function_call", call_id: "c1", name: "roll", arguments: '{"a":1}' },
      { type: "function_call", call_id: "c2", name: "roll", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", output: "one" },
      { type: "function_call_output", call_id: "c2", output: "Error: boom" },
    ]);
    expect(JSON.stringify(body)).not.toContain("SECRET");
    expect(body.stream).toBe(true);
  });

  it("keeps two calls apart, in output order, with their own ids and inputs", async () => {
    const stream = call(1, "call_b", "look", '{"where":"door"}') + call(0, "call_a", "roll", '{"dice":"d20"}') + completed();
    const { fetch } = fakeFetch(() => sseResponse(stream, 11));
    const step = await openaiModel("k", "gpt-x", { fetch })(base);
    expect(step.blocks).toEqual([
      { type: "tool_call", id: "call_a", name: "roll", input: { dice: "d20" } },
      { type: "tool_call", id: "call_b", name: "look", input: { where: "door" } },
    ]);
  });

  it("does not count cached input tokens as full-rate input", async () => {
    const usage = { input_tokens: 1000, output_tokens: 50, input_tokens_details: { cached_tokens: 800 } };
    const { fetch } = fakeFetch(() => sseResponse(textDelta(0, "x") + message(0, "x") + completed(usage)));
    const step = await openaiModel("k", "gpt-x", { fetch })(base);
    expect(step.usage).toMatchObject({ inputTokens: 200, cacheReadTokens: 800, outputTokens: 50, cacheWriteTokens: 0, provider: "openai", model: "gpt-x" });
  });

  it("does not emit a call whose arguments are not valid JSON, and the stop becomes other", async () => {
    const { fetch } = fakeFetch(() => sseResponse(call(0, "c", "roll", '{"a":') + completed()));
    const step = await openaiModel("k", "gpt-x", { fetch })(base);
    expect(step.blocks).toEqual([]);
    expect(step.stop).toBe("other");
  });

  it("keeps max_tokens and the text written, and drops a call when the output cap cut the answer", async () => {
    const stream = textDelta(0, "Rolling") + call(1, "c", "roll", "{}") + incomplete("max_output_tokens");
    const { fetch } = fakeFetch(() => sseResponse(stream));
    const step = await openaiModel("k", "gpt-x", { fetch })(base);
    expect(step.stop).toBe("max_tokens");
    expect(step.blocks).toEqual([{ type: "text", text: "Rolling" }]);
  });

  it("reports a refusal, from a refusal part or from the content filter", async () => {
    const refusal = itemDone(0, { type: "message", role: "assistant", content: [{ type: "refusal", refusal: "No." }] });
    const a = await openaiModel("k", "gpt-x", { fetch: fakeFetch(() => sseResponse(refusal + completed())).fetch })(base);
    expect(a.stop).toBe("refusal");
    const b = await openaiModel("k", "gpt-x", { fetch: fakeFetch(() => sseResponse(incomplete("content_filter"))).fetch })(base);
    expect(b.stop).toBe("refusal");
  });

  it("treats a 429 as retryable and a 400 as final, each with the provider's message", async () => {
    const run = (status: number) => openaiModel("k", "gpt-x", { fetch: fakeFetch(() => jsonResponse(status, { error: { message: `msg ${status}` } })).fetch })(base);
    await expect(run(429)).rejects.toMatchObject({ status: 429, retryable: true, message: "msg 429" });
    await expect(run(400)).rejects.toMatchObject({ status: 400, retryable: false, message: "msg 400" });
    await expect(run(503)).rejects.toMatchObject({ status: 503, retryable: true });
    await expect(run(400)).rejects.toBeInstanceOf(AgentProviderError);
  });

  it("fails on a failed response, retryable only for a server error", async () => {
    const failed = (code: string) => data({ type: "response.failed", response: { status: "failed", error: { code, message: `m ${code}` } } });
    const run = (code: string) => openaiModel("k", "gpt-x", { fetch: fakeFetch(() => sseResponse(failed(code))).fetch })(base);
    await expect(run("server_error")).rejects.toMatchObject({ retryable: true, message: "m server_error" });
    await expect(run("invalid_prompt")).rejects.toMatchObject({ retryable: false });
  });

  it("raises a retryable error when the stream ends without its terminal event, not a short answer", async () => {
    const { fetch } = fakeFetch(() => sseResponse(textDelta(0, "half an ans")));
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
