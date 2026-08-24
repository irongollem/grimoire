/**
 * Shared document-and-image-provider helpers for AI generation Edge Functions.
 *
 * This is the single home for edge-function calls that hand a provider a
 * *document* — a PDF or a batch of page images — rather than plain text, the
 * way `_shared/textGen.ts` (see that file) is the single home for text-only
 * calls. New document-consuming Edge Functions (the importer's extraction
 * pass, #353) import from here rather than growing their own copy:
 *
 *   import { extractFromDocument, UnsupportedDocumentProviderError } from "../_shared/documentGen.ts";
 *
 * ── Why this is a sibling of textGen.ts, not a parameter added to it ────────
 *
 * 1. Structured outputs. Anthropic's `output_config: { format: { type:
 *    "json_schema", schema } }` guarantees the response matches the caller's
 *    schema. That replaces textGen.ts's "Respond with a valid JSON object
 *    only, no markdown fencing" system-prompt hack — a request, not a
 *    guarantee — which is why that hack is NOT carried over here: a real
 *    contract has no need for a polite fiction.
 *
 * 2. Streaming. `claude-opus-5` thinks by default even when a request omits
 *    `thinking`, and `max_tokens` is a budget shared by thinking *and*
 *    response text. A document extraction asked for dozens of entities needs
 *    real headroom for both (see DEFAULT_DOCUMENT_MAX_TOKENS), and Anthropic
 *    requires streaming above ~16000 max_tokens to avoid the request timing
 *    out before the model finishes. textGen.ts's single `fetch` +
 *    `await res.json()` has no way to survive that; this module always
 *    streams the response and accumulates it instead.
 *
 * 3. Two extra, distinctly-typed failure shapes a plain text call never
 *    produces: a truncation (`stop_reason: "max_tokens"`, content is a real
 *    but incomplete prefix) and a refusal (`stop_reason: "refusal"`, HTTP 200
 *    with little or no content). Both are modelled in
 *    DocumentExtractionOutcome rather than thrown, because both are the
 *    provider successfully telling us something — not the request failing.
 *
 * ── Raw fetch, not the Anthropic SDK ─────────────────────────────────────────
 *
 * Deliberate, matching textGen.ts and all 14 `generate-*` Edge Functions:
 * they call `https://api.anthropic.com/v1/messages` directly with an
 * `x-api-key` / `anthropic-version` header pair rather than depending on the
 * Anthropic SDK. Pulling the SDK in here for one module would be the first
 * exception to that pattern in the edge runtime, not a neutral convenience.
 *
 * ── Provider support ─────────────────────────────────────────────────────────
 *
 * Only Anthropic is wired up. `provider_config.document_model` (migration
 * 20260824212352) is `claude-opus-5` for anthropic and NULL for gemini and
 * openai — NULL there means "not available for document extraction", not
 * "use the default". `extractFromDocument` throws
 * `UnsupportedDocumentProviderError` for any other provider rather than
 * silently falling back to a model that cannot read PDFs at all.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocumentPart {
  /** One of: application/pdf, image/jpeg, image/png, image/webp */
  mimeType: string;
  /** base64-encoded bytes, no newlines */
  data: string;
}

export interface DocumentUsage {
  /**
   * Null means the provider never reported a count — genuinely unknown, not
   * zero. Callers pass it straight to the credit ledger, whose token fields are
   * optional, so an unknown count is recorded as absent rather than as free.
   */
  input_tokens: number | null;
  output_tokens: number | null;
  model: string;
  provider: string;
}

/**
 * Three outcomes, not two, because a document extraction can succeed, be cut
 * short mid-response, or be refused outright — and the caller (the wizard
 * writing staged rows to `document_imports`) needs to tell those apart rather
 * than treat a truncation as a silent partial or a refusal as a parse error.
 */
export type DocumentExtractionOutcome =
  | { ok: true; content: string; usage: DocumentUsage }
  | { ok: false; reason: "truncated"; content: string; usage: DocumentUsage }
  | { ok: false; reason: "refused"; usage: DocumentUsage };

/** Thrown by extractFromDocument for any provider without a document_model — see the module doc's "Provider support" section. */
export class UnsupportedDocumentProviderError extends Error {}

// ── Structured Server-Sent Events ────────────────────────────────────────────

/**
 * The subset of an Anthropic streaming event this module reads. Every event
 * on the wire has more fields than this; narrowing happens at each read site
 * (isRecord + typeof checks) rather than trusting a wider shape, because the
 * SSE payload is `unknown` parsed JSON and CLAUDE.md bans `any`.
 */
interface SseEvent {
  readonly type: string;
  readonly [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Decodes an SSE byte stream into parsed `data:` events. Anthropic's stream
 * also sends `event:` lines and blank separators; only `data:` lines carry
 * a JSON payload, and everything else is ignored here rather than validated,
 * since this module has nothing to do with them.
 */
async function* iterateSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // The last element may be a partial line still waiting on more bytes —
      // keep it in the buffer instead of parsing it early.
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice("data:".length).trim();
        if (!payload || payload === "[DONE]") continue;
        const parsed: unknown = JSON.parse(payload);
        if (isRecord(parsed) && typeof parsed.type === "string") {
          yield parsed as SseEvent;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Content blocks ───────────────────────────────────────────────────────────

/**
 * Document/image blocks first, in the caller's page order, then the text
 * instruction last — Anthropic reads the message's content array in order,
 * and the instruction is what tells it what to do with the pages that
 * preceded it.
 */
function buildContentBlocks(parts: DocumentPart[], instruction: string): unknown[] {
  const blocks: unknown[] = parts.map((part) =>
    part.mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: part.mimeType, data: part.data } }
      : { type: "image", source: { type: "base64", media_type: part.mimeType, data: part.data } },
  );
  blocks.push({ type: "text", text: instruction });
  return blocks;
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

/**
 * Default max_tokens ceiling for a document extraction call. This is a
 * SHARED budget: on claude-opus-5, thinking is on by default even when the
 * request omits a `thinking` block, and max_tokens caps thinking tokens
 * *and* response text together — not response text alone. A document
 * extraction returning dozens of entities needs real headroom for both, so
 * this defaults high rather than to a text-generation-sized budget. Lowering
 * it truncates mid-response, not just mid-thought.
 */
export const DEFAULT_DOCUMENT_MAX_TOKENS = 32000;

async function anthropicExtractDocument(opts: {
  apiKey: string;
  model: string;
  system: string;
  instruction: string;
  parts: DocumentPart[];
  schema: Record<string, unknown>;
  maxTokens: number;
}): Promise<DocumentExtractionOutcome> {
  const { apiKey, model, system, instruction, parts, schema, maxTokens } = opts;

  // Always streamed (see module doc, point 2) — this call's max_tokens
  // default already sits well above the ~16000 non-streaming ceiling, so
  // there is no smaller-request branch that could skip it.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      stream: true,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: buildContentBlocks(parts, instruction) }],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Anthropic document error ${res.status}`);
  }
  if (!res.body) {
    throw new Error("Anthropic document error: streaming response had no body");
  }

  let content = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let stopReason: string | undefined;

  for await (const event of iterateSseEvents(res.body)) {
    switch (event.type) {
      case "message_start": {
        const message = isRecord(event.message) ? event.message : undefined;
        const usage = message && isRecord(message.usage) ? message.usage : undefined;
        if (usage && typeof usage.input_tokens === "number") inputTokens = usage.input_tokens;
        break;
      }
      case "content_block_delta": {
        const delta = isRecord(event.delta) ? event.delta : undefined;
        if (delta && delta.type === "text_delta" && typeof delta.text === "string") {
          content += delta.text;
        }
        break;
      }
      case "message_delta": {
        const delta = isRecord(event.delta) ? event.delta : undefined;
        if (delta && typeof delta.stop_reason === "string") stopReason = delta.stop_reason;
        const usage = isRecord(event.usage) ? event.usage : undefined;
        if (usage && typeof usage.output_tokens === "number") outputTokens = usage.output_tokens;
        break;
      }
      default:
        // message_stop, content_block_start/stop, ping — nothing this module needs.
        break;
    }
  }

  // A stream can deliver every byte of the extraction and still not carry a
  // usage number — a tail-end hiccup, a provider variation, a `message_delta`
  // that never arrives. Two wrong answers are available here and both were
  // written before this one:
  //
  //   * Coerce to 0. Forbidden for the reason CLAUDE.md gives: a silent 0
  //     reads as "this call was free" rather than "we don't know", and it
  //     under-reports real spend in the one report that sets feature pricing.
  //   * Throw. Worse. The provider call already happened and Anthropic has
  //     already billed us; throwing discards a complete, correct extraction
  //     over a missing meter reading. The caller marks the row failed and
  //     deletes the source document, so the user re-uploads and pays twice for
  //     work that succeeded the first time.
  //
  // So the count is nullable and null means exactly "unknown". The ledger
  // fields are optional (`CreditLogFields` in _shared/credits.ts), so a null
  // is recorded as an absent field — honestly missing rather than falsely
  // zero — and the extraction itself survives.
  const usage: DocumentUsage = {
    input_tokens: inputTokens ?? null,
    output_tokens: outputTokens ?? null,
    model,
    provider: "anthropic",
  };

  if (stopReason === "refusal") {
    return { ok: false, reason: "refused", usage };
  }
  if (stopReason === "max_tokens") {
    return { ok: false, reason: "truncated", content, usage };
  }
  return { ok: true, content, usage };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Select and call the campaign's configured document-extraction provider.
 * Unlike `callText`'s three-way fallback chain, there is no fallback here:
 * a provider without a `document_model` genuinely cannot read a PDF, so
 * routing it to a different model silently would produce a confident-looking
 * failure instead of a clear one. See the module doc's "Provider support".
 */
export async function extractFromDocument(opts: {
  provider: string;
  apiKey: string;
  model: string;
  system: string;
  instruction: string;
  parts: DocumentPart[];
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<DocumentExtractionOutcome> {
  const { provider, apiKey, model, system, instruction, parts, schema, maxTokens } = opts;

  if (provider !== "anthropic") {
    throw new UnsupportedDocumentProviderError(
      `Document extraction is not available for provider "${provider}" — provider_config.document_model is NULL for it`,
    );
  }

  return anthropicExtractDocument({
    apiKey,
    model,
    system,
    instruction,
    parts,
    schema,
    maxTokens: maxTokens ?? DEFAULT_DOCUMENT_MAX_TOKENS,
  });
}
