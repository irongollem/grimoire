import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertProviderDimensions,
  createGeminiEmbeddingProvider,
  createOpenAiEmbeddingProvider,
  EMBEDDING_DIMENSIONS,
  EmbeddingProviderConfigError,
  isEmbeddingStale,
  resolveEmbeddingProvider,
  toVectorLiteral,
  type EmbeddingProvider,
} from "./embeddings";

afterEach(() => vi.unstubAllGlobals());

const OPENAI_MODEL = "text-embedding-3-small";
const GEMINI_MODEL = "gemini-embedding-001";

/**
 * Stubs global fetch as OpenAI's /v1/embeddings endpoint: echoes back one
 * vector per input text (default `[index, text.length]`), tagged with its
 * own `index`, and records each call's `input` array so tests can assert
 * chunk sizes. `reorder` lets a test return the `data` array out of request
 * order while `index` fields still line up with the input positions.
 */
function stubOpenAiFetch(opts: { reorder?: boolean; promptTokensPerInput?: number } = {}) {
  const calls: string[][] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { input: string[] };
    calls.push(body.input);
    const data = body.input.map((text, index) => ({ embedding: [index, text.length], index }));
    if (opts.reorder) data.reverse();
    const promptTokens = (opts.promptTokensPerInput ?? 1) * body.input.length;
    return new Response(JSON.stringify({ data, usage: { prompt_tokens: promptTokens } }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

/** Minimal fake supabase-js client for `resolveEmbeddingProvider`'s one query shape. */
function providerConfigClient(result: { data?: unknown; error?: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq } as unknown as Parameters<typeof resolveEmbeddingProvider>[0];
}

describe("toVectorLiteral", () => {
  it("returns a bracketed string, not a JS array", () => {
    const literal = toVectorLiteral([0.1, 0.2, 0.3]);
    expect(typeof literal).toBe("string");
    expect(literal).toBe("[0.1,0.2,0.3]");
  });

  it("formats integers without a trailing decimal", () => {
    expect(toVectorLiteral([1, 0, -1])).toBe("[1,0,-1]");
  });

  it("formats negative numbers", () => {
    expect(toVectorLiteral([-0.5, -1.25])).toBe("[-0.5,-1.25]");
  });

  it("formats an empty vector as an empty bracket pair", () => {
    expect(toVectorLiteral([])).toBe("[]");
  });
});

describe("createOpenAiEmbeddingProvider", () => {
  it("exposes the given model and the platform's fixed dimensions", () => {
    const provider = createOpenAiEmbeddingProvider("sk-test", OPENAI_MODEL);
    expect(provider.model).toBe(OPENAI_MODEL);
    expect(provider.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("short-circuits on an empty input array without calling the API", async () => {
    const { fetchMock } = stubOpenAiFetch();
    const provider = createOpenAiEmbeddingProvider("sk-test", OPENAI_MODEL);

    const result = await provider.embed([]);

    expect(result).toEqual({
      vectors: [],
      usage: { input_tokens: 0, model: OPENAI_MODEL, provider: "openai" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("chunks a batch spanning the 100-input boundary into separate requests, in order", async () => {
    const { calls } = stubOpenAiFetch();
    const provider = createOpenAiEmbeddingProvider("sk-test", OPENAI_MODEL);
    const texts = Array.from({ length: 150 }, (_, i) => `monster-${i}`);

    const result = await provider.embed(texts);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toHaveLength(100);
    expect(calls[1]).toHaveLength(50);
    expect(result.vectors).toHaveLength(150);
  });

  it("reassembles vectors by the response's own `index`, not array order", async () => {
    stubOpenAiFetch({ reorder: true });
    const provider = createOpenAiEmbeddingProvider("sk-test", OPENAI_MODEL);
    const texts = ["aaa", "bb", "c"]; // distinct lengths so each vector is identifiable

    const result = await provider.embed(texts);

    // Despite the stubbed response reversing `data`, vectors must land back
    // in request order: vectors[i] corresponds to texts[i].
    expect(result.vectors).toEqual([
      [0, 3], // "aaa" -> index 0, length 3
      [1, 2], // "bb"  -> index 1, length 2
      [2, 1], // "c"   -> index 2, length 1
    ]);
  });

  it("sums prompt tokens across chunks", async () => {
    stubOpenAiFetch({ promptTokensPerInput: 3 });
    const provider = createOpenAiEmbeddingProvider("sk-test", OPENAI_MODEL);
    const texts = Array.from({ length: 120 }, (_, i) => `text-${i}`); // 2 chunks: 100 + 20

    const result = await provider.embed(texts);

    expect(result.usage.input_tokens).toBe(120 * 3);
    expect(result.usage.model).toBe(OPENAI_MODEL);
    expect(result.usage.provider).toBe("openai");
  });

  it("requests the platform's fixed dimensionality regardless of the model's native size", async () => {
    const { calls } = stubOpenAiFetch();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { input: string[]; dimensions?: number };
      calls.push(body.input);
      expect(body.dimensions).toBe(EMBEDDING_DIMENSIONS);
      return new Response(JSON.stringify({
        data: body.input.map((_, index) => ({ embedding: [index], index })),
        usage: { prompt_tokens: 1 },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await createOpenAiEmbeddingProvider("sk-test", OPENAI_MODEL).embed(["hello"]);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("retries a 429 once and succeeds on the following attempt", async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      attempt += 1;
      if (attempt === 1) {
        return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 });
      }
      const body = JSON.parse(init.body as string) as { input: string[] };
      const data = body.input.map((_, index) => ({ embedding: [index], index }));
      return new Response(JSON.stringify({ data, usage: { prompt_tokens: 1 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAiEmbeddingProvider("sk-test", OPENAI_MODEL);
    const result = await provider.embed(["only text"]);

    expect(attempt).toBe(2);
    expect(result.vectors).toEqual([[0]]);
  }, 10000);

  it("throws immediately with the API's own message on a non-retryable error", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "invalid api key" } }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAiEmbeddingProvider("sk-test", OPENAI_MODEL);

    await expect(provider.embed(["hello"])).rejects.toThrow("invalid api key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createGeminiEmbeddingProvider", () => {
  it("exposes the given model and the platform's fixed dimensions (Matryoshka-truncated)", () => {
    const provider = createGeminiEmbeddingProvider("gk-test", GEMINI_MODEL);
    expect(provider.model).toBe(GEMINI_MODEL);
    expect(provider.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("calls batchEmbedContents with outputDimensionality pinned to the platform width", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain(`models/${GEMINI_MODEL}:batchEmbedContents`);
      const body = JSON.parse(init.body as string) as {
        requests: { model: string; content: { parts: { text: string }[] }; embedContentConfig: { outputDimensionality: number } }[];
      };
      expect(body.requests).toHaveLength(2);
      expect(body.requests[0].model).toBe(`models/${GEMINI_MODEL}`);
      expect(body.requests[0].embedContentConfig.outputDimensionality).toBe(EMBEDDING_DIMENSIONS);
      return new Response(JSON.stringify({
        embeddings: body.requests.map((r) => ({ values: [r.content.parts[0].text.length] })),
        usageMetadata: { promptTokenCount: 7 },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createGeminiEmbeddingProvider("gk-test", GEMINI_MODEL);
    const result = await provider.embed(["aaa", "bb"]);

    // No index field in Gemini's response — order is trusted as-is.
    expect(result.vectors).toEqual([[3], [2]]);
    expect(result.usage).toEqual({ input_tokens: 7, model: GEMINI_MODEL, provider: "gemini" });
  });

  it("short-circuits on empty input without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGeminiEmbeddingProvider("gk-test", GEMINI_MODEL).embed([]);

    expect(result.vectors).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws immediately with the API's own message on a non-retryable error", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "invalid api key" } }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createGeminiEmbeddingProvider("gk-test", GEMINI_MODEL).embed(["hello"]))
      .rejects.toThrow("invalid api key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("assertProviderDimensions", () => {
  it("does not throw for a provider matching the schema's vector(1536) columns", () => {
    const provider = createOpenAiEmbeddingProvider("sk-test", OPENAI_MODEL);
    expect(() => assertProviderDimensions(provider)).not.toThrow();
  });

  it("throws loudly when a provider's dimensions don't match the column width", () => {
    const mismatched: EmbeddingProvider = {
      model: "some-other-model",
      dimensions: 768,
      embed: vi.fn(),
    };
    expect(() => assertProviderDimensions(mismatched)).toThrow(/768.*1536|1536.*768/);
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });
});

describe("resolveEmbeddingProvider", () => {
  const keys = { openai: "sk-test", gemini: "gk-test" };

  it("builds the matching adapter for the single enabled provider (openai)", async () => {
    const admin = providerConfigClient({
      data: [{ provider: "openai", embedding_model: OPENAI_MODEL, embedding_enabled: true }],
    });

    const provider = await resolveEmbeddingProvider(admin, keys);

    expect(provider.model).toBe(OPENAI_MODEL);
    expect(provider.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("builds the matching adapter for the single enabled provider (gemini)", async () => {
    const admin = providerConfigClient({
      data: [{ provider: "gemini", embedding_model: GEMINI_MODEL, embedding_enabled: true }],
    });

    const provider = await resolveEmbeddingProvider(admin, keys);

    expect(provider.model).toBe(GEMINI_MODEL);
    expect(provider.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("throws when no provider is enabled", async () => {
    const admin = providerConfigClient({ data: [] });
    await expect(resolveEmbeddingProvider(admin, keys)).rejects.toThrow(EmbeddingProviderConfigError);
  });

  it("throws when more than one provider is enabled, rather than picking one", async () => {
    const admin = providerConfigClient({
      data: [
        { provider: "openai", embedding_model: OPENAI_MODEL, embedding_enabled: true },
        { provider: "gemini", embedding_model: GEMINI_MODEL, embedding_enabled: true },
      ],
    });
    await expect(resolveEmbeddingProvider(admin, keys)).rejects.toThrow(EmbeddingProviderConfigError);
  });

  it("throws when the enabled provider has no embedding_model set", async () => {
    const admin = providerConfigClient({
      data: [{ provider: "openai", embedding_model: null, embedding_enabled: true }],
    });
    await expect(resolveEmbeddingProvider(admin, keys)).rejects.toThrow(EmbeddingProviderConfigError);
  });

  it("throws when the enabled provider's platform key is missing", async () => {
    const admin = providerConfigClient({
      data: [{ provider: "gemini", embedding_model: GEMINI_MODEL, embedding_enabled: true }],
    });
    await expect(resolveEmbeddingProvider(admin, { openai: "sk-test", gemini: null }))
      .rejects.toThrow(EmbeddingProviderConfigError);
  });

  it("throws for a vendor with no embedding adapter (e.g. anthropic/falai enabled by mistake)", async () => {
    const admin = providerConfigClient({
      data: [{ provider: "anthropic", embedding_model: "claude-embed", embedding_enabled: true }],
    });
    await expect(resolveEmbeddingProvider(admin, keys)).rejects.toThrow(EmbeddingProviderConfigError);
  });

  it("propagates a query error", async () => {
    const admin = providerConfigClient({ error: { message: "connection refused" } });
    await expect(resolveEmbeddingProvider(admin, keys)).rejects.toThrow(/connection refused/);
  });
});

describe("isEmbeddingStale", () => {
  const fresh = { sourceHash: "hash-a", model: "text-embedding-3-small" };

  it("is stale when there is no stored row at all", () => {
    expect(isEmbeddingStale(null, fresh)).toBe(true);
  });

  it("is not stale when both the hash and the model match", () => {
    const stored = { source_hash: "hash-a", embedding_model: "text-embedding-3-small" };
    expect(isEmbeddingStale(stored, fresh)).toBe(false);
  });

  it("is stale when the source text changed (hash differs)", () => {
    const stored = { source_hash: "hash-b", embedding_model: "text-embedding-3-small" };
    expect(isEmbeddingStale(stored, fresh)).toBe(true);
  });

  // Regression: a provider swap must not leave old-model vectors looking
  // "current" just because the text hasn't changed — that would silently
  // mix vector spaces in the same similarity index. See the module doc.
  it("is stale when the source_hash matches but the embedding_model differs", () => {
    const stored = { source_hash: "hash-a", embedding_model: "text-embedding-ada-002" };
    expect(isEmbeddingStale(stored, fresh)).toBe(true);
  });

  it("is stale when both the hash and the model differ", () => {
    const stored = { source_hash: "hash-b", embedding_model: "some-other-model" };
    expect(isEmbeddingStale(stored, fresh)).toBe(true);
  });
});
