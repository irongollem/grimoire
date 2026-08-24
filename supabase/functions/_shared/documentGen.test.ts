import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DOCUMENT_MAX_TOKENS,
  extractFromDocument,
  UnsupportedDocumentProviderError,
  type DocumentPart,
} from "./documentGen";

afterEach(() => vi.unstubAllGlobals());

const PDF_PART: DocumentPart = { mimeType: "application/pdf", data: "cGRmYnl0ZXM=" };
const IMAGE_PART: DocumentPart = { mimeType: "image/jpeg", data: "aW1hZ2VieXRlcw==" };
const SCHEMA = { type: "object", properties: {}, required: [], additionalProperties: false };

const BASE_OPTS = {
  provider: "anthropic",
  apiKey: "sk-test",
  model: "claude-opus-5",
  system: "You extract game data.",
  instruction: "Extract everything.",
  schema: SCHEMA,
};

/**
 * Stubs global fetch as Anthropic's streaming /v1/messages endpoint: encodes
 * `events` as one SSE `data:` line per event (in order) and returns them as
 * a ReadableStream, exactly like the real streaming response this module
 * reads. `chunkSplit` optionally breaks the encoded bytes into smaller
 * pieces mid-line to exercise the buffering across multiple `reader.read()`
 * calls, the way a real network stream would.
 */
function stubAnthropicStream(events: unknown[], opts: { status?: number; chunkSplit?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
    const encoded = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
    const bytes = new TextEncoder().encode(encoded);
    const chunkSize = opts.chunkSplit ?? bytes.length;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize) {
          controller.enqueue(bytes.slice(i, i + chunkSize));
        }
        controller.close();
      },
    });
    return new Response(stream, { status: opts.status ?? 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requestBody: () => JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) };
}

function messageStart(inputTokens: number) {
  return { type: "message_start", message: { usage: { input_tokens: inputTokens } } };
}
function textDelta(text: string) {
  return { type: "content_block_delta", delta: { type: "text_delta", text } };
}
function messageDelta(stopReason: string, outputTokens: number) {
  return { type: "message_delta", delta: { stop_reason: stopReason }, usage: { output_tokens: outputTokens } };
}

describe("extractFromDocument — request shape", () => {
  it("puts document/image blocks before the text block, in the caller's order", async () => {
    const { requestBody } = stubAnthropicStream([
      messageStart(100),
      textDelta('{"monsters":[]}'),
      messageDelta("end_turn", 5),
    ]);

    await extractFromDocument({ ...BASE_OPTS, parts: [PDF_PART, IMAGE_PART] });

    const body = requestBody();
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: PDF_PART.data } },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: IMAGE_PART.data } },
          { type: "text", text: BASE_OPTS.instruction },
        ],
      },
    ]);
  });

  it("sends stream:true, the schema under output_config, and the default max_tokens", async () => {
    const { requestBody } = stubAnthropicStream([messageStart(10), textDelta("{}"), messageDelta("end_turn", 2)]);

    await extractFromDocument({ ...BASE_OPTS, parts: [PDF_PART] });

    const body = requestBody();
    expect(body.stream).toBe(true);
    expect(body.output_config).toEqual({ format: { type: "json_schema", schema: SCHEMA } });
    expect(body.max_tokens).toBe(DEFAULT_DOCUMENT_MAX_TOKENS);
    // No system-prompt "respond with valid JSON" hack — structured outputs replace it.
    expect(body.system).toBe(BASE_OPTS.system);
  });

  it("honours an explicit maxTokens override", async () => {
    const { requestBody } = stubAnthropicStream([messageStart(10), textDelta("{}"), messageDelta("end_turn", 2)]);

    await extractFromDocument({ ...BASE_OPTS, parts: [PDF_PART], maxTokens: 8000 });

    expect(requestBody().max_tokens).toBe(8000);
  });
});

describe("extractFromDocument — SSE accumulation", () => {
  it("concatenates text_delta events across the stream, in order", async () => {
    stubAnthropicStream([
      messageStart(200),
      textDelta('{"monsters":['),
      textDelta('{"name":"Owlbear"}'),
      textDelta("]}"),
      messageDelta("end_turn", 42),
    ]);

    const outcome = await extractFromDocument({ ...BASE_OPTS, parts: [PDF_PART] });

    expect(outcome).toEqual({
      ok: true,
      content: '{"monsters":[{"name":"Owlbear"}]}',
      usage: { input_tokens: 200, output_tokens: 42, model: BASE_OPTS.model, provider: "anthropic" },
    });
  });

  it("accumulates correctly even when SSE bytes arrive split mid-line", async () => {
    stubAnthropicStream(
      [messageStart(50), textDelta("hello "), textDelta("world"), messageDelta("end_turn", 7)],
      { chunkSplit: 5 },
    );

    const outcome = await extractFromDocument({ ...BASE_OPTS, parts: [PDF_PART] });

    expect(outcome).toEqual({
      ok: true,
      content: "hello world",
      usage: { input_tokens: 50, output_tokens: 7, model: BASE_OPTS.model, provider: "anthropic" },
    });
  });
});

describe("extractFromDocument — modelled outcomes", () => {
  it("returns a distinct truncated outcome on stop_reason max_tokens, preserving the partial content", async () => {
    stubAnthropicStream([
      messageStart(300),
      textDelta('{"monsters":[{"name":"Beholder"'),
      messageDelta("max_tokens", 32000),
    ]);

    const outcome = await extractFromDocument({ ...BASE_OPTS, parts: [PDF_PART] });

    expect(outcome).toEqual({
      ok: false,
      reason: "truncated",
      content: '{"monsters":[{"name":"Beholder"',
      usage: { input_tokens: 300, output_tokens: 32000, model: BASE_OPTS.model, provider: "anthropic" },
    });
  });

  it("returns a distinct refused outcome on stop_reason refusal, without a content field", async () => {
    stubAnthropicStream([messageStart(80), messageDelta("refusal", 0)]);

    const outcome = await extractFromDocument({ ...BASE_OPTS, parts: [PDF_PART] });

    expect(outcome).toEqual({
      ok: false,
      reason: "refused",
      usage: { input_tokens: 80, output_tokens: 0, model: BASE_OPTS.model, provider: "anthropic" },
    });
    expect(outcome).not.toHaveProperty("content");
  });

  it("distinguishes a refusal from a parse-error-shaped partial: refused has no content key at all", async () => {
    stubAnthropicStream([messageStart(80), textDelta('{"partial'), messageDelta("refusal", 5)]);

    const outcome = await extractFromDocument({ ...BASE_OPTS, parts: [PDF_PART] });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("refused");
    }
    expect(outcome).not.toHaveProperty("content");
  });
});

describe("extractFromDocument — provider dispatch", () => {
  it("throws UnsupportedDocumentProviderError for gemini", async () => {
    await expect(extractFromDocument({ ...BASE_OPTS, provider: "gemini", parts: [PDF_PART] }))
      .rejects.toBeInstanceOf(UnsupportedDocumentProviderError);
  });

  it("throws UnsupportedDocumentProviderError for openai", async () => {
    await expect(extractFromDocument({ ...BASE_OPTS, provider: "openai", parts: [PDF_PART] }))
      .rejects.toBeInstanceOf(UnsupportedDocumentProviderError);
  });

  it("never calls fetch for an unsupported provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractFromDocument({ ...BASE_OPTS, provider: "openai", parts: [PDF_PART] })).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("extractFromDocument — provider HTTP errors", () => {
  it("throws (does not return a modelled outcome) on a non-2xx response", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "invalid_request_error: bad schema" } }), { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractFromDocument({ ...BASE_OPTS, parts: [PDF_PART] }))
      .rejects.toThrow("invalid_request_error: bad schema");
  });

  it("falls back to a generic message when the error body isn't JSON", async () => {
    const fetchMock = vi.fn(async () => new Response("not json", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractFromDocument({ ...BASE_OPTS, parts: [PDF_PART] }))
      .rejects.toThrow("Anthropic document error 500");
  });
});

describe("extractFromDocument — missing usage data", () => {
  // Regression: an earlier draft threw when the stream ended without a usage
  // number. That destroyed a complete extraction the provider had already
  // billed for — the caller marks the row failed, deletes the source document,
  // and the user re-uploads and pays a second time for work that succeeded.
  // Null means "we don't know what this cost", never "it was free" and never
  // "the call failed".
  it("returns the extraction with null counts when the stream carries no usage", async () => {
    stubAnthropicStream([
      { type: "message_start", message: {} },
      textDelta('{"monsters":[]}'),
      { type: "message_delta", delta: { stop_reason: "end_turn" } },
    ]);

    const result = await extractFromDocument({ ...BASE_OPTS, parts: [PDF_PART] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe('{"monsters":[]}');
      expect(result.usage.input_tokens).toBeNull();
      expect(result.usage.output_tokens).toBeNull();
      // The model is known even when the meter isn't — it came from the request.
      expect(result.usage.model).toBe("claude-opus-5");
    }
  });

  it("keeps a known count when only one of the two is reported", async () => {
    stubAnthropicStream([
      messageStart(5000),
      textDelta("{}"),
      { type: "message_delta", delta: { stop_reason: "end_turn" } },
    ]);

    const result = await extractFromDocument({ ...BASE_OPTS, parts: [IMAGE_PART] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage.input_tokens).toBe(5000);
      expect(result.usage.output_tokens).toBeNull();
    }
  });
});
