/**
 * Entity-agnostic embedding infrastructure for #595 (retrieval-backed
 * monster selection) and whatever entity — items, quests, loot tables —
 * follows it onto the same side-table pattern. This module knows nothing
 * about monsters, items, or any specific entity table: no monster types, no
 * table names. Callers own the entity-specific text-building and querying;
 * this module owns the expensive, fiddly, reusable part — provider calls,
 * batching, retry, vector encoding, and the staleness rule.
 *
 * PROVIDER ADAPTER, mirroring `_shared/textGen.ts`'s provider-function +
 * `callText` dispatcher shape — but with two constraints textGen.ts does
 * not have:
 *
 * 1. Embedding vectors from different models are NOT interchangeable.
 *    Cosine distance between an OpenAI vector and a Gemini vector is
 *    meaningless, and Anthropic has no embedding endpoint at all (fal.ai is
 *    image-only). So which provider produces embeddings is a PLATFORM-WIDE
 *    choice, configured once in `provider_config` (see `resolveEmbeddingProvider`),
 *    never per-campaign or per-user the way text/image generation is — and
 *    never BYOK. Two rows embedded by different vendors would silently
 *    corrupt the shared similarity index — every query would return
 *    near-random neighbours with no error anywhere. `isEmbeddingStale`
 *    below is what makes a provider swap self-healing rather than silently
 *    half-corrupt: see its own doc comment.
 *
 * 2. A pgvector column holds exactly one width, and the HNSW index is built
 *    on it. The dimension is genuinely a per-vendor-and-model property, but
 *    it cannot vary per row, so the platform pins it at `EMBEDDING_DIMENSIONS`
 *    (1536) — the width both viable vendors can emit (OpenAI via its
 *    `dimensions` request parameter, Gemini via gemini-embedding-001's
 *    Matryoshka truncation). `assertProviderDimensions` turns any adapter
 *    that can't hit that width into a loud startup failure instead of a
 *    confusing Postgres insert-time rejection or, worse, silently wrong
 *    vectors. A vendor that cannot emit 1536 would need its own side table
 *    at that width — a migration, not something built speculatively here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface EmbeddingUsage {
  input_tokens: number;
  model: string;
  provider: string;
}

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  /** Embed a batch of texts. Chunks internally so callers can pass any length. */
  embed(texts: string[]): Promise<{ vectors: number[][]; usage: EmbeddingUsage }>;
}

/**
 * Width of every `vector(...)` embedding column in the schema
 * (library_monster_embeddings, monster_embeddings, and whatever
 * items/quests/loot tables follow — see supabase/migrations/
 * 20260803000001_rag_monster_embeddings.sql). A platform-wide constant, not
 * a per-provider one — see the module doc for why the column can only hold
 * one width no matter which vendor is configured.
 */
export const EMBEDDING_DIMENSIONS = 1536;

// ── Chunking / retry — provider-independent ──────────────────────────────
// These apply to any vendor's embeddings endpoint, so they are written once
// here and reused by each provider factory rather than per-vendor.

const CHUNK_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Split `texts` into <= CHUNK_SIZE-sized requests, call `embedChunk` for
 * each, and concatenate results IN ORDER. Order matters: callers map
 * vectors back to rows positionally, so a reordered response would attach
 * the wrong vector to the wrong row. Empty input short-circuits without
 * invoking `embedChunk` at all — no API call for nothing to embed.
 */
async function embedInChunks(
  texts: string[],
  embedChunk: (chunk: string[]) => Promise<{ vectors: number[][]; promptTokens: number }>,
): Promise<{ vectors: number[][]; promptTokens: number }> {
  if (texts.length === 0) return { vectors: [], promptTokens: 0 };

  const vectors: number[][] = [];
  let promptTokens = 0;
  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    const chunk = texts.slice(i, i + CHUNK_SIZE);
    const result = await embedChunk(chunk);
    vectors.push(...result.vectors);
    promptTokens += result.promptTokens;
  }
  return { vectors, promptTokens };
}

// ── OpenAI provider ───────────────────────────────────────────────────────

interface OpenAiEmbeddingDatum {
  embedding: number[];
  index: number;
}
interface OpenAiEmbeddingResponse {
  data: OpenAiEmbeddingDatum[];
  usage?: { prompt_tokens?: number };
}

/**
 * One chunk (<= CHUNK_SIZE texts) against OpenAI's /v1/embeddings. Retries
 * HTTP 429 and 5xx with exponential backoff, max 3 attempts; any other
 * error throws immediately with the API's own error message, following the
 * style of the provider functions in `_shared/textGen.ts`.
 */
async function openAiEmbedChunk(
  apiKey: string,
  model: string,
  texts: string[],
): Promise<{ vectors: number[][]; promptTokens: number }> {
  let lastError = new Error("Embedding request failed");

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      // `dimensions` truncates text-embedding-3-* output to the platform's
      // fixed width (see EMBEDDING_DIMENSIONS) regardless of the model's
      // native size, via OpenAI's Matryoshka-trained embeddings.
      body: JSON.stringify({ model, input: texts, dimensions: EMBEDDING_DIMENSIONS }),
    });

    if (res.ok) {
      const data = await res.json() as OpenAiEmbeddingResponse;
      // The endpoint does not guarantee the response order matches the
      // request order — each datum carries its own `index`; sort on it
      // before trusting positional alignment with `texts`. Trusting array
      // order here would attach the wrong vector to the wrong row with no
      // error to catch it.
      const vectors = [...data.data]
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
      return { vectors, promptTokens: data.usage?.prompt_tokens ?? 0 };
    }

    const retryable = res.status === 429 || res.status >= 500;
    const body = await res.json().catch(() => ({}));
    const message = (body as { error?: { message?: string } })?.error?.message
      ?? `OpenAI embeddings error ${res.status}`;
    lastError = new Error(message);

    if (!retryable || attempt === MAX_RETRIES - 1) throw lastError;
    await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
  }

  throw lastError;
}

/**
 * Build an OpenAI-backed embedding provider. `model` is required — it comes
 * from `provider_config.embedding_model` via `resolveEmbeddingProvider`,
 * never a hardcoded fallback here (see the module doc: the embedding vendor
 * and model are a live, admin-editable platform setting, not code).
 */
export function createOpenAiEmbeddingProvider(apiKey: string, model: string): EmbeddingProvider {
  return {
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts: string[]) {
      const { vectors, promptTokens } = await embedInChunks(
        texts,
        (chunk) => openAiEmbedChunk(apiKey, model, chunk),
      );
      return { vectors, usage: { input_tokens: promptTokens, model, provider: "openai" } };
    },
  };
}

// ── Gemini provider ───────────────────────────────────────────────────────

interface GeminiEmbeddingItem {
  values: number[];
}
interface GeminiBatchEmbedResponse {
  embeddings: GeminiEmbeddingItem[];
  usageMetadata?: { promptTokenCount?: number };
}

/**
 * One chunk (<= CHUNK_SIZE texts) against Gemini's batchEmbedContents.
 * Same retry policy as `openAiEmbedChunk`. Unlike OpenAI's response, Google
 * documents `embeddings[i]` as corresponding to `requests[i]` with no
 * per-item index field — response order IS request order here, so no
 * reassembly step is needed (see the vectors line below).
 */
async function geminiEmbedChunk(
  apiKey: string,
  model: string,
  texts: string[],
): Promise<{ vectors: number[][]; promptTokens: number }> {
  let lastError = new Error("Embedding request failed");

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            // Matryoshka truncation to the platform's fixed width — see
            // EMBEDDING_DIMENSIONS and the OpenAI `dimensions` parameter above.
            embedContentConfig: { outputDimensionality: EMBEDDING_DIMENSIONS },
          })),
        }),
      },
    );

    if (res.ok) {
      const data = await res.json() as GeminiBatchEmbedResponse;
      const vectors = data.embeddings.map((e) => e.values);
      return { vectors, promptTokens: data.usageMetadata?.promptTokenCount ?? 0 };
    }

    const retryable = res.status === 429 || res.status >= 500;
    const body = await res.json().catch(() => ({}));
    const message = (body as { error?: { message?: string } })?.error?.message
      ?? `Gemini embeddings error ${res.status}`;
    lastError = new Error(message);

    if (!retryable || attempt === MAX_RETRIES - 1) throw lastError;
    await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
  }

  throw lastError;
}

/**
 * Build a Gemini-backed embedding provider. `model` is required, same
 * reasoning as `createOpenAiEmbeddingProvider`. Disabled by default in
 * `provider_config` — see `resolveEmbeddingProvider`.
 */
export function createGeminiEmbeddingProvider(apiKey: string, model: string): EmbeddingProvider {
  return {
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts: string[]) {
      const { vectors, promptTokens } = await embedInChunks(
        texts,
        (chunk) => geminiEmbedChunk(apiKey, model, chunk),
      );
      return { vectors, usage: { input_tokens: promptTokens, model, provider: "gemini" } };
    },
  };
}

// ── DB-driven resolution ─────────────────────────────────────────────────

export class EmbeddingProviderConfigError extends Error {}

interface EmbeddingProviderConfigRow {
  provider: string;
  embedding_model: string | null;
  embedding_enabled: boolean;
}

function buildProvider(
  vendor: string,
  model: string,
  keys: { openai: string | null; gemini: string | null },
): EmbeddingProvider {
  if (vendor === "openai") {
    if (!keys.openai) {
      throw new EmbeddingProviderConfigError(
        "provider_config has embedding_enabled=true for openai, but no platform OpenAI key is configured",
      );
    }
    return createOpenAiEmbeddingProvider(keys.openai, model);
  }
  if (vendor === "gemini") {
    if (!keys.gemini) {
      throw new EmbeddingProviderConfigError(
        "provider_config has embedding_enabled=true for gemini, but no platform Gemini key is configured",
      );
    }
    return createGeminiEmbeddingProvider(keys.gemini, model);
  }
  throw new EmbeddingProviderConfigError(`No embedding adapter implemented for provider "${vendor}"`);
}

/**
 * Resolve the platform's embedding provider from `provider_config`, the
 * same table + pattern `_shared/provider-config.ts`'s `fetchProviderConfigs`
 * reads `text_model`/`image_model` from — switching the embedding vendor is
 * a one-row UPDATE, not a deploy. Deliberately uncached (unlike
 * `fetchProviderConfigs`'s 5-minute TTL): an admin flipping
 * `embedding_enabled` and immediately re-running the backfill must see the
 * change on the very next call, not up to 5 minutes later.
 *
 * Exactly one provider must have `embedding_enabled = true`. Zero is a
 * missing-config error; more than one is a misconfiguration that would
 * silently produce a mixed index (some rows embedded by each vendor with no
 * way to tell them apart at query time) — both fail loudly here rather than
 * picking one arbitrarily. The resolved adapter is also run through
 * `assertProviderDimensions` before being handed back, so a model swapped
 * in without matching the schema's column width fails here too, not at
 * insert time.
 */
export async function resolveEmbeddingProvider(
  admin: SupabaseClient,
  keys: { openai: string | null; gemini: string | null },
): Promise<EmbeddingProvider> {
  const { data, error } = await admin
    .from("provider_config")
    .select("provider, embedding_model, embedding_enabled")
    .eq("embedding_enabled", true);
  if (error) {
    throw new EmbeddingProviderConfigError(`Failed to read embedding provider config: ${error.message}`);
  }

  const enabled = (data ?? []) as EmbeddingProviderConfigRow[];
  if (enabled.length === 0) {
    throw new EmbeddingProviderConfigError("No embedding provider is enabled in provider_config");
  }
  if (enabled.length > 1) {
    throw new EmbeddingProviderConfigError(
      `More than one embedding provider is enabled (${enabled.map((r) => r.provider).join(", ")}) — ` +
      "this would silently mix vector spaces in the same similarity index. Enable exactly one.",
    );
  }

  const row = enabled[0];
  if (!row.embedding_model) {
    throw new EmbeddingProviderConfigError(
      `provider_config.${row.provider} has embedding_enabled=true but no embedding_model set`,
    );
  }

  const provider = buildProvider(row.provider, row.embedding_model, keys);
  assertProviderDimensions(provider);
  return provider;
}

// ── pgvector encoding ────────────────────────────────────────────────────

/**
 * pgvector wire format for supabase-js — a bracketed literal string like
 * "[0.1,0.2,...]", NOT a JS array. Passing a raw number[] through
 * supabase-js to a `vector` column/parameter does not work; Postgres needs
 * this bracketed literal form.
 */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

// ── Column-width guard ───────────────────────────────────────────────────

/**
 * Throws if `provider` would produce vectors of the wrong width for the
 * schema's `vector(1536)` columns (`EMBEDDING_DIMENSIONS`). Call this
 * before any embedding work — failing loudly here beats a confusing
 * Postgres insert-time rejection. `resolveEmbeddingProvider` already runs
 * this on every provider it returns.
 */
export function assertProviderDimensions(provider: EmbeddingProvider): void {
  if (provider.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding provider "${provider.model}" produces ${provider.dimensions}-dim vectors, but the schema's embedding columns are ${EMBEDDING_DIMENSIONS}-dim.`,
    );
  }
}

// ── Staleness rule ───────────────────────────────────────────────────────

export interface StoredEmbeddingMeta {
  source_hash: string;
  embedding_model: string;
}

/**
 * True when a row's embedding needs to be (re)computed: no stored row at
 * all, the source text changed (`source_hash` differs), or the platform
 * embedding provider/model changed (`embedding_model` differs). The model
 * check is what makes a provider swap self-healing: flip
 * `provider_config.embedding_enabled`/`embedding_model` and re-run the
 * backfill, and every row still keyed to the old vendor's vector space is
 * treated as stale and re-embedded, rather than silently coexisting with
 * the new vectors as dead weight in the same similarity index (see the
 * module doc for why that mix is actively dangerous, not just wasteful).
 */
export function isEmbeddingStale(
  stored: StoredEmbeddingMeta | null,
  fresh: { sourceHash: string; model: string },
): boolean {
  if (!stored) return true;
  return stored.source_hash !== fresh.sourceHash || stored.embedding_model !== fresh.model;
}
