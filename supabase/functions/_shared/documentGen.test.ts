import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DOCUMENT_MAX_TOKENS,
  callDocument,
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

describe("callDocument (anthropic) — request shape", () => {
  it("puts document/image blocks before the text block, in the caller's order", async () => {
    const { requestBody } = stubAnthropicStream([
      messageStart(100),
      textDelta('{"monsters":[]}'),
      messageDelta("end_turn", 5),
    ]);

    await callDocument({ ...BASE_OPTS, parts: [PDF_PART, IMAGE_PART] });

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

    await callDocument({ ...BASE_OPTS, parts: [PDF_PART] });

    const body = requestBody();
    expect(body.stream).toBe(true);
    expect(body.output_config).toEqual({ format: { type: "json_schema", schema: SCHEMA } });
    expect(body.max_tokens).toBe(DEFAULT_DOCUMENT_MAX_TOKENS);
    // No system-prompt "respond with valid JSON" hack — structured outputs replace it.
    expect(body.system).toBe(BASE_OPTS.system);
  });

  it("honours an explicit maxTokens override", async () => {
    const { requestBody } = stubAnthropicStream([messageStart(10), textDelta("{}"), messageDelta("end_turn", 2)]);

    await callDocument({ ...BASE_OPTS, parts: [PDF_PART], maxTokens: 8000 });

    expect(requestBody().max_tokens).toBe(8000);
  });
});

describe("callDocument (anthropic) — SSE accumulation", () => {
  it("concatenates text_delta events across the stream, in order", async () => {
    stubAnthropicStream([
      messageStart(200),
      textDelta('{"monsters":['),
      textDelta('{"name":"Owlbear"}'),
      textDelta("]}"),
      messageDelta("end_turn", 42),
    ]);

    const outcome = await callDocument({ ...BASE_OPTS, parts: [PDF_PART] });

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

    const outcome = await callDocument({ ...BASE_OPTS, parts: [PDF_PART] });

    expect(outcome).toEqual({
      ok: true,
      content: "hello world",
      usage: { input_tokens: 50, output_tokens: 7, model: BASE_OPTS.model, provider: "anthropic" },
    });
  });
});

describe("callDocument (anthropic) — modelled outcomes", () => {
  it("returns a distinct truncated outcome on stop_reason max_tokens, preserving the partial content", async () => {
    stubAnthropicStream([
      messageStart(300),
      textDelta('{"monsters":[{"name":"Beholder"'),
      messageDelta("max_tokens", 32000),
    ]);

    const outcome = await callDocument({ ...BASE_OPTS, parts: [PDF_PART] });

    expect(outcome).toEqual({
      ok: false,
      reason: "truncated",
      content: '{"monsters":[{"name":"Beholder"',
      usage: { input_tokens: 300, output_tokens: 32000, model: BASE_OPTS.model, provider: "anthropic" },
    });
  });

  it("returns a distinct refused outcome on stop_reason refusal, without a content field", async () => {
    stubAnthropicStream([messageStart(80), messageDelta("refusal", 0)]);

    const outcome = await callDocument({ ...BASE_OPTS, parts: [PDF_PART] });

    expect(outcome).toEqual({
      ok: false,
      reason: "refused",
      usage: { input_tokens: 80, output_tokens: 0, model: BASE_OPTS.model, provider: "anthropic" },
    });
    expect(outcome).not.toHaveProperty("content");
  });

  it("distinguishes a refusal from a parse-error-shaped partial: refused has no content key at all", async () => {
    stubAnthropicStream([messageStart(80), textDelta('{"partial'), messageDelta("refusal", 5)]);

    const outcome = await callDocument({ ...BASE_OPTS, parts: [PDF_PART] });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("refused");
    }
    expect(outcome).not.toHaveProperty("content");
  });
});

/**
 * A global fetch guard.
 *
 * Three tests in this file previously reached the real network: they asserted
 * that openai and gemini threw `UnsupportedDocumentProviderError`, stubbed no
 * fetch because "it never gets that far", and then stopped being true the
 * moment those providers were actually implemented. The failures that surfaced
 * were `Incorrect API key provided: sk-tes…` from OpenAI and `Invalid JSON
 * payload received` from Google — i.e. a unit test suite quietly making
 * outbound calls to two vendors. This makes that impossible rather than
 * unlikely: any unstubbed fetch fails loudly instead of dialling out.
 */
function forbidNetwork(): void {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    throw new Error(`Test made an unstubbed network call to ${url}`);
  }));
}

describe("callDocument — provider dispatch", () => {
  // These replace three tests that asserted openai and gemini were *not
  // implemented*. That was the vendor-lock this module was reworked to remove,
  // so the assertions were encoding the defect: keeping them would have made
  // implementing a provider look like a regression.
  it("throws UnsupportedDocumentProviderError when the provider has no configured model", async () => {
    forbidNetwork();
    // A NULL provider_config.document_model reaches this module as an empty
    // model — an admin disabling document extraction for that provider, which
    // is a real state and distinct from "we cannot call this vendor".
    for (const provider of ["openai", "anthropic", "gemini"]) {
      await expect(callDocument({ ...BASE_OPTS, provider, model: "", parts: [PDF_PART] }))
        .rejects.toBeInstanceOf(UnsupportedDocumentProviderError);
    }
  });

  it("throws UnsupportedDocumentProviderError for a provider it does not dispatch", async () => {
    forbidNetwork();
    await expect(callDocument({ ...BASE_OPTS, provider: "mistral", parts: [PDF_PART] }))
      .rejects.toBeInstanceOf(UnsupportedDocumentProviderError);
  });

  it("never calls fetch when the provider is unusable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(callDocument({ ...BASE_OPTS, provider: "mistral", parts: [PDF_PART] })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes each implemented provider to its own endpoint", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      seen.push(url);
      // Shape-agnostic 400 — this test is about routing, not parsing.
      return new Response(JSON.stringify({ error: { message: "stop here" } }), { status: 400 });
    }));

    for (const [provider, model] of [["openai", "gpt-4o-mini"], ["gemini", "gemini-2.5-flash"], ["anthropic", "claude-opus-5"]]) {
      await callDocument({ ...BASE_OPTS, provider, model, parts: [PDF_PART] }).catch(() => {});
    }

    expect(seen[0]).toContain("api.openai.com/v1/responses");
    expect(seen[1]).toContain("generativelanguage.googleapis.com");
    expect(seen[2]).toContain("api.anthropic.com/v1/messages");
  });
});

describe("callDocument (openai) — the platform's primary path", () => {
  const OPENAI_OPTS = { ...BASE_OPTS, provider: "openai", model: "gpt-4o-mini", apiKey: "sk-test" };

  function stubOpenAi(body: unknown, status = 200) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, requestBody: () => JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) };
  }

  const okBody = (text: string) => ({
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
    usage: { input_tokens: 4200, output_tokens: 800 },
  });

  it("sends a PDF as input_file and an image as input_image, document blocks first", async () => {
    const { requestBody } = stubOpenAi(okBody("{}"));
    await callDocument({ ...OPENAI_OPTS, parts: [PDF_PART, IMAGE_PART] });

    const content = requestBody().input[0].content;
    expect(content[0].type).toBe("input_file");
    expect(content[0].file_data).toContain("data:application/pdf;base64,");
    expect(content[1].type).toBe("input_image");
    expect(content[2].type).toBe("input_text");
  });

  it("forces detail:high on every file and image block", async () => {
    // The reason this is asserted rather than left to `auto`: OpenAI resolves
    // `auto` to `high` only on 5.6-and-later models and to `low` on everything
    // earlier — and this platform's configured model, gpt-4o-mini, is earlier.
    // Low detail on graphical ability scores does not fail, it returns
    // plausible wrong numbers. See issue #770.
    const { requestBody } = stubOpenAi(okBody("{}"));
    await callDocument({ ...OPENAI_OPTS, parts: [PDF_PART, IMAGE_PART] });

    const blocks = requestBody().input[0].content.filter((b: { type: string }) => b.type !== "input_text");
    expect(blocks).toHaveLength(2);
    for (const block of blocks) expect(block.detail).toBe("high");
  });

  it("constrains the response with a json_schema rather than asking for JSON politely", async () => {
    const { requestBody } = stubOpenAi(okBody("{}"));
    await callDocument({ ...OPENAI_OPTS, parts: [PDF_PART] });

    expect(requestBody().text.format.type).toBe("json_schema");
    expect(requestBody().text.format.schema).toEqual(SCHEMA);
    // The textGen.ts-era "respond with valid JSON only, no markdown fencing"
    // hack must not have been carried over — a real contract needs no plea.
    expect(JSON.stringify(requestBody())).not.toMatch(/markdown fencing/i);
  });

  it("returns the extracted text and the reported usage", async () => {
    stubOpenAi(okBody('{"monsters":[]}'));
    const outcome = await callDocument({ ...OPENAI_OPTS, parts: [PDF_PART] });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.content).toBe('{"monsters":[]}');
      expect(outcome.usage.input_tokens).toBe(4200);
      expect(outcome.usage.output_tokens).toBe(800);
      expect(outcome.usage.provider).toBe("openai");
      expect(outcome.usage.model).toBe("gpt-4o-mini");
    }
  });

  it("maps an output-budget cutoff to truncated, keeping the partial content", async () => {
    stubOpenAi({
      ...okBody('{"monsters":[{"ref":"m1"'),
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    });
    const outcome = await callDocument({ ...OPENAI_OPTS, parts: [PDF_PART] });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("truncated");
      // The partial is a real prefix and must survive — the caller stores what
      // parsed and warns, rather than discarding a paid-for extraction.
      if (outcome.reason === "truncated") expect(outcome.content).toContain('"m1"');
    }
  });

  it("maps a content filter to refused, with no content key", async () => {
    stubOpenAi({
      output: [{ type: "message", content: [{ type: "refusal", refusal: "I can't help with that." }] }],
      usage: { input_tokens: 4200, output_tokens: 12 },
    });
    const outcome = await callDocument({ ...OPENAI_OPTS, parts: [PDF_PART] });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("refused");
    // A refusal is not a zero-length success — the caller must not be able to
    // read an empty string off it and treat it as parsed-but-empty.
    expect(outcome).not.toHaveProperty("content");
  });

  it("throws on a non-2xx rather than returning a modelled outcome", async () => {
    stubOpenAi({ error: { message: "Incorrect API key provided" } }, 401);
    await expect(callDocument({ ...OPENAI_OPTS, parts: [PDF_PART] }))
      .rejects.toThrow("Incorrect API key provided");
  });
});

describe("callDocument (anthropic) — provider HTTP errors", () => {
  it("throws (does not return a modelled outcome) on a non-2xx response", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "invalid_request_error: bad schema" } }), { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(callDocument({ ...BASE_OPTS, parts: [PDF_PART] }))
      .rejects.toThrow("invalid_request_error: bad schema");
  });

  it("falls back to a generic message when the error body isn't JSON", async () => {
    const fetchMock = vi.fn(async () => new Response("not json", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callDocument({ ...BASE_OPTS, parts: [PDF_PART] }))
      .rejects.toThrow("Anthropic document error 500");
  });
});

describe("callDocument (anthropic) — missing usage data", () => {
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

    const result = await callDocument({ ...BASE_OPTS, parts: [PDF_PART] });

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

    const result = await callDocument({ ...BASE_OPTS, parts: [IMAGE_PART] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage.input_tokens).toBe(5000);
      expect(result.usage.output_tokens).toBeNull();
    }
  });
});
