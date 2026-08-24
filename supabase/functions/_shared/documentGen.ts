/**
 * Shared document-and-image-provider helpers for AI generation Edge Functions.
 *
 * This is the single home for edge-function calls that hand a provider a
 * *document* — a PDF or a batch of page images — rather than plain text, the
 * way `_shared/textGen.ts` (see that file) is the single home for text-only
 * calls. New document-consuming Edge Functions (the importer's extraction
 * pass, #353) import from here rather than growing their own copy:
 *
 *   import { callDocument, UnsupportedDocumentProviderError } from "../_shared/documentGen.ts";
 *
 * ── Why this is a sibling of textGen.ts, not a parameter added to it ────────
 *
 * 1. Structured outputs. Three different dialects for the same guarantee —
 *    Anthropic's top-level `output_config: { format: { type: "json_schema",
 *    schema } }`, the Responses API's `text: { format: { type: "json_schema",
 *    name, schema, strict: true } }`, and Gemini's `generationConfig: {
 *    responseMimeType: "application/json", responseSchema }` — none of which
 *    look anything like textGen.ts's "Respond with a valid JSON object only,
 *    no markdown fencing" system-prompt hack. That hack is a request, not a
 *    guarantee, and a real contract has no need for a polite fiction, so it
 *    is not carried over here for any of the three.
 *
 * 2. Streaming, on Anthropic only. `claude-opus-5` thinks by default even
 *    when a request omits `thinking`, and `max_tokens` is a budget shared by
 *    thinking *and* response text. A document extraction asked for dozens of
 *    entities needs real headroom for both (see DEFAULT_DOCUMENT_MAX_TOKENS),
 *    and Anthropic requires streaming above ~16000 max_tokens to avoid the
 *    request timing out before the model finishes — a documented Anthropic
 *    server behaviour, not a generic large-response problem. OpenAI's
 *    Responses API shares the same shared-reasoning-budget shape (GPT-5.x
 *    models reason by default, and `max_output_tokens` caps reasoning tokens
 *    *and* visible text together — same as Anthropic's thinking+output
 *    budget) but its docs describe no equivalent forced-streaming cutoff:
 *    the guidance for a very long non-streaming call is to raise the
 *    *client SDK's* timeout, which doesn't apply here since this module
 *    calls `fetch` directly with no timeout of its own. So only
 *    anthropicDocument streams; openaiDocument and geminiDocument make a
 *    single request/response call, the same shape textGen.ts's provider
 *    functions already use. See openaiDocument's own comment if this ever
 *    needs revisiting from measurement rather than from docs.
 *
 * 3. Two extra, distinctly-typed failure shapes a plain text call never
 *    produces: a truncation (ran out of output budget mid-response, content
 *    is a real but incomplete prefix) and a refusal (the provider declined,
 *    little or no content). Both are modelled in DocumentExtractionOutcome
 *    rather than thrown, because both are the provider successfully telling
 *    us something — not the request failing. Each provider expresses these
 *    differently (see each provider's own function for its vocabulary), but
 *    all three collapse onto the same two-outcome shape.
 *
 * ── Raw fetch, not a provider SDK ────────────────────────────────────────────
 *
 * Deliberate, matching textGen.ts and all 14 `generate-*` Edge Functions:
 * they call each provider's REST endpoint directly with its own auth header
 * rather than depending on a vendor SDK. Pulling one in here for one module
 * would be the first exception to that pattern in the edge runtime, not a
 * neutral convenience.
 *
 * ── Provider support ─────────────────────────────────────────────────────────
 *
 * All three providers are implemented behind `callDocument`, mirroring
 * `callText`. `provider_config.document_model` (migration 20260824212352,
 * corrected by 20260824232822) is the source of truth for which model each
 * provider uses for this capability — deliberately distinct from
 * `text_model`, because reading a document is a distinct capability from
 * generating text (see that migration and provider-config.ts's own doc
 * comment). A NULL there means an admin has disabled document extraction for
 * that provider specifically, surfaced to this module as a falsy `model`;
 * `callDocument` throws `UnsupportedDocumentProviderError` in that case, or
 * for a provider string this module doesn't dispatch at all. It no longer
 * means "not implemented in code" — that was the pre-20260824232822 shape,
 * when only Anthropic had a document path and every other provider hit this
 * error regardless of config. This platform's own campaigns default to
 * openai (text and images both already run on it — see that migration), so
 * openaiDocument is the primary path in practice, not anthropicDocument.
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

/**
 * Thrown by callDocument when the given provider has no usable document
 * model — either `provider_config.document_model` is NULL for a provider
 * this module otherwise knows how to call, or the provider string isn't one
 * of the three this module dispatches at all. See the module doc's
 * "Provider support" section.
 */
export class UnsupportedDocumentProviderError extends Error {}

// ── JSON narrowing ───────────────────────────────────────────────────────────

/**
 * Every provider response here starts life as `unknown` parsed JSON —
 * CLAUDE.md bans `any`, so each read site narrows explicitly rather than
 * trusting a wider shape. Shared across all three providers below.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ── Structured Server-Sent Events (Anthropic only — see module doc, point 2) ─

/**
 * The subset of an Anthropic streaming event this module reads. Every event
 * on the wire has more fields than this; narrowing happens at each read site
 * (isRecord + typeof checks) rather than trusting a wider shape, because the
 * SSE payload is `unknown` parsed JSON.
 */
interface SseEvent {
  readonly type: string;
  readonly [key: string]: unknown;
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

// ── Shared budget ─────────────────────────────────────────────────────────────

/**
 * Default max_tokens / max_output_tokens ceiling for a document extraction
 * call, shared across providers. This is a SHARED budget on both models this
 * platform actually exercises: on claude-opus-5, thinking is on by default
 * even when the request omits a `thinking` block, and on GPT-5.x, reasoning
 * is on by default too — both cap thinking/reasoning tokens *and* response
 * text together, not response text alone (see anthropicDocument's and
 * openaiDocument's own comments for the documented source of each). A
 * document extraction returning dozens of entities needs real headroom for
 * both, so this defaults high rather than to a text-generation-sized budget.
 * Lowering it truncates mid-response, not just mid-thought. Gemini has no
 * equivalent hidden-reasoning budget on the flash tier configured here, so
 * this ceiling is merely generous rather than tight for that provider — a
 * smaller true output just finishes early.
 */
export const DEFAULT_DOCUMENT_MAX_TOKENS = 32000;

interface ProviderCallArgs {
  apiKey: string;
  model: string;
  system: string;
  instruction: string;
  parts: DocumentPart[];
  schema: Record<string, unknown>;
  maxTokens: number;
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

/**
 * Document/image blocks first, in the caller's page order, then the text
 * instruction last — Anthropic reads the message's content array in order,
 * and the instruction is what tells it what to do with the pages that
 * preceded it.
 */
function buildAnthropicContentBlocks(parts: DocumentPart[], instruction: string): unknown[] {
  const blocks: unknown[] = parts.map((part) =>
    part.mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: part.mimeType, data: part.data } }
      : { type: "image", source: { type: "base64", media_type: part.mimeType, data: part.data } },
  );
  blocks.push({ type: "text", text: instruction });
  return blocks;
}

async function anthropicDocument(opts: ProviderCallArgs): Promise<DocumentExtractionOutcome> {
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
      messages: [{ role: "user", content: buildAnthropicContentBlocks(parts, instruction) }],
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

// ── OpenAI ────────────────────────────────────────────────────────────────────

/**
 * OpenAI's PDF/image input lives on the Responses API (`/v1/responses`), not
 * Chat Completions (`/v1/chat/completions`, what textGen.ts's openaiText
 * uses) — Chat Completions has no file-input content type at all. That's the
 * reason this can't be folded into textGen.ts as a parameter.
 *
 * Document/image blocks first, then the text instruction last — same
 * ordering rationale as buildAnthropicContentBlocks: the model reads the
 * input array in order, and the instruction is what tells it what to do with
 * the pages that preceded it.
 *
 * `detail` is hardcoded to "high" on every block rather than passed through
 * or defaulted. The Responses API's own default ("auto") is MODEL-DEPENDENT
 * — per OpenAI's PDF-files guide, "for GPT-5.6 and later models, `auto` uses
 * `high`; for earlier models, it uses `low`." That matters more here than it
 * would elsewhere: `provider_config.document_model`'s seeded default (see
 * migration 20260824232822) is `gpt-4o-mini` — a *pre*-5.6 model, chosen
 * because every credit price in `ai_generation_credit_costs` is calibrated
 * against its rate — so `auto` on the platform's own starting config already
 * means `low`, not a hypothetical an admin might one day cause. This
 * extractor's whole job is reading dense statblock art — an ability score
 * drawn as a number in a box with the modifier in a circle beneath,
 * unlabelled stat boxes, small print — and low detail there doesn't fail
 * loudly, it returns plausible wrong numbers into a DM's bestiary. The extra
 * input tokens `high` costs are the point of this extractor, not an
 * oversight to trim later.
 */
function buildOpenAiContentBlocks(parts: DocumentPart[], instruction: string): unknown[] {
  const blocks: unknown[] = parts.map((part) =>
    part.mimeType === "application/pdf"
      ? { type: "input_file", filename: "document.pdf", file_data: `data:${part.mimeType};base64,${part.data}`, detail: "high" }
      : { type: "input_image", image_url: `data:${part.mimeType};base64,${part.data}`, detail: "high" },
  );
  blocks.push({ type: "input_text", text: instruction });
  return blocks;
}

/**
 * Walks `output[].content[]` for `output_text` and `refusal` items rather
 * than trusting the SDK-only `output_text` convenience property some OpenAI
 * SDKs expose — this module calls `fetch` directly (module doc, "Raw fetch,
 * not a provider SDK"), so that aggregate never exists on the raw JSON body.
 */
function extractOpenAiOutput(data: Record<string, unknown>): { content: string; refused: boolean } {
  let content = "";
  let refused = false;
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!isRecord(item) || item.type !== "message") continue;
    const blocks = Array.isArray(item.content) ? item.content : [];
    for (const block of blocks) {
      if (!isRecord(block)) continue;
      if (block.type === "output_text" && typeof block.text === "string") content += block.text;
      else if (block.type === "refusal") refused = true;
    }
  }
  return { content, refused };
}

/**
 * Non-streaming, unlike anthropicDocument — see module doc, point 2, for
 * why: Anthropic's own server rejects/times out a non-streaming request once
 * max_tokens climbs past ~16000, a documented Anthropic-specific behaviour.
 * OpenAI's docs describe no equivalent server-side cutoff for the Responses
 * API; the guidance for a very long non-streaming call is to raise the
 * *client SDK's* default timeout (10 minutes) or use streaming/background
 * mode, not that OpenAI itself refuses the request. This module calls
 * `fetch` directly with no client-side timeout at all, so there is nothing
 * here for a larger max_output_tokens to trip over. If a production
 * extraction ever times out against the real endpoint, switching this call
 * to `stream: true` (which the Responses API supports) is the fix — but
 * until that's measured, a second SSE accumulator here would be complexity
 * for a failure mode OpenAI's own docs don't describe existing.
 */
async function openaiDocument(opts: ProviderCallArgs): Promise<DocumentExtractionOutcome> {
  const { apiKey, model, system, instruction, parts, schema, maxTokens } = opts;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      instructions: system,
      max_output_tokens: maxTokens,
      input: [{ role: "user", content: buildOpenAiContentBlocks(parts, instruction) }],
      // Verified against OpenAI's structured-outputs guide (developers.
      // openai.com/api/docs/guides/structured-outputs): the Responses API
      // nests schema config under `text.format`, not the Chat Completions
      // `response_format` textGen.ts's openaiText uses. `name` is a required
      // schema identifier, not a display label; `strict: true` is what makes
      // this a guarantee rather than a request, same as Anthropic's
      // output_config and Gemini's responseSchema below.
      text: { format: { type: "json_schema", name: "document_extraction", schema, strict: true } },
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `OpenAI document error ${res.status}`);
  }

  const data: unknown = await res.json();
  if (!isRecord(data)) throw new Error("OpenAI document error: response body was not a JSON object");

  const { content, refused } = extractOpenAiOutput(data);
  const usageRecord = isRecord(data.usage) ? data.usage : undefined;
  const usage: DocumentUsage = {
    input_tokens: usageRecord && typeof usageRecord.input_tokens === "number" ? usageRecord.input_tokens : null,
    output_tokens: usageRecord && typeof usageRecord.output_tokens === "number" ? usageRecord.output_tokens : null,
    model,
    provider: "openai",
  };

  const incompleteDetails = isRecord(data.incomplete_details) ? data.incomplete_details : undefined;
  const incompleteReason = typeof incompleteDetails?.reason === "string" ? incompleteDetails.reason : undefined;

  // A content-policy refusal shows up two ways: an explicit `{type:
  // "refusal"}` content block inside an otherwise-completed response (the
  // model chose not to answer, but the request itself succeeded), or the
  // whole prompt rejected before generation starts (`incomplete_details.
  // reason: "content_filter"`). Both map to the same modelled outcome as
  // Anthropic's stop_reason:"refusal" — content is discarded rather than
  // returned, matching the `{ ok: false; reason: "refused" }` variant's lack
  // of a content field.
  if (refused || incompleteReason === "content_filter") {
    return { ok: false, reason: "refused", usage };
  }
  // GPT-5.x reasons by default and max_output_tokens caps reasoning *and*
  // visible text together (see DEFAULT_DOCUMENT_MAX_TOKENS) — this is the
  // direct analogue of Anthropic's stop_reason:"max_tokens".
  if (incompleteReason === "max_output_tokens") {
    return { ok: false, reason: "truncated", content, usage };
  }
  return { ok: true, content, usage };
}

// ── Gemini ────────────────────────────────────────────────────────────────────

/**
 * Inline file/image parts first, text instruction last — same ordering as
 * the other two providers. Field names are snake_case (`inline_data`,
 * `mime_type`) even though `generationConfig` a few lines down uses
 * camelCase (`responseMimeType`, `maxOutputTokens`) — a real inconsistency
 * in Gemini's own REST surface (verified against ai.google.dev's Part/Blob
 * reference), not a typo here. geminiText.ts's generationConfig block
 * already relies on the camelCase side of the same split.
 */
function buildGeminiParts(parts: DocumentPart[], instruction: string): unknown[] {
  const result: unknown[] = parts.map((part) => ({
    inline_data: { mime_type: part.mimeType, data: part.data },
  }));
  result.push({ text: instruction });
  return result;
}

// finishReason values meaning the provider declined to (fully) answer for
// policy reasons, rather than merely running out of budget (MAX_TOKENS,
// handled separately below) or completing normally (STOP). Mirrors
// Anthropic's stop_reason:"refusal" and OpenAI's refusal content block —
// same modelled outcome, a different vocabulary per provider.
const GEMINI_REFUSAL_FINISH_REASONS = new Set([
  "SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "OTHER",
]);
// promptFeedback.blockReason values for when the whole prompt is rejected
// before generation ever starts — there is no candidate/finishReason to read
// in that case at all, only this.
const GEMINI_BLOCK_REASONS = new Set(["SAFETY", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "IMAGE_SAFETY"]);

/**
 * Least exercised of the three in production (see module doc's "Provider
 * support" and migration 20260824232822's own note) — filled in so a
 * campaign configured for Gemini isn't silently refused, not because it's
 * proven at scale yet.
 */
async function geminiDocument(opts: ProviderCallArgs): Promise<DocumentExtractionOutcome> {
  const { apiKey, model, system, instruction, parts, schema, maxTokens } = opts;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: buildGeminiParts(parts, instruction) }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          maxOutputTokens: maxTokens,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Gemini document error ${res.status}`);
  }

  const data: unknown = await res.json();
  if (!isRecord(data)) throw new Error("Gemini document error: response body was not a JSON object");

  const usageMeta = isRecord(data.usageMetadata) ? data.usageMetadata : undefined;
  const usage: DocumentUsage = {
    input_tokens: usageMeta && typeof usageMeta.promptTokenCount === "number" ? usageMeta.promptTokenCount : null,
    output_tokens: usageMeta && typeof usageMeta.candidatesTokenCount === "number" ? usageMeta.candidatesTokenCount : null,
    model,
    // Matches geminiText's usage.provider — the credit ledger and pricing
    // config key this provider as "google", not "gemini".
    provider: "google",
  };

  // The whole prompt can be blocked before generation ever starts, in which
  // case there is no `candidates` array to read a finishReason from at all —
  // `promptFeedback.blockReason` is the only signal available.
  const promptFeedback = isRecord(data.promptFeedback) ? data.promptFeedback : undefined;
  const blockReason = typeof promptFeedback?.blockReason === "string" ? promptFeedback.blockReason : undefined;
  if (blockReason && GEMINI_BLOCK_REASONS.has(blockReason)) {
    return { ok: false, reason: "refused", usage };
  }

  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const candidate = candidates[0];
  if (!isRecord(candidate)) {
    // res.ok was true and the prompt wasn't blocked, so an empty candidates
    // array here is a genuinely unexpected shape, not a modelled outcome.
    throw new Error("Gemini document error: response had no candidates");
  }

  const contentParts = isRecord(candidate.content) && Array.isArray(candidate.content.parts)
    ? candidate.content.parts
    : [];
  let content = "";
  for (const part of contentParts) {
    if (isRecord(part) && typeof part.text === "string") content += part.text;
  }

  const finishReason = typeof candidate.finishReason === "string" ? candidate.finishReason : undefined;
  if (finishReason && GEMINI_REFUSAL_FINISH_REASONS.has(finishReason)) {
    return { ok: false, reason: "refused", usage };
  }
  if (finishReason === "MAX_TOKENS") {
    return { ok: false, reason: "truncated", content, usage };
  }
  return { ok: true, content, usage };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

const DOCUMENT_PROVIDERS = new Set(["openai", "anthropic", "gemini"]);

/**
 * Default document-extraction model per provider, mirroring textGen.ts's
 * DEFAULT_TEXT_MODELS. Values match provider_config.document_model's seeded
 * defaults (migration 20260824232822) — kept here only as a fallback for a
 * caller that doesn't resolve `model` itself; import-extract/index.ts always
 * does, since document_model is the one thing it looks up (and gates on)
 * before calling this dispatcher at all.
 *
 * openai is `gpt-4o-mini` — the model this platform already runs for text —
 * because every credit price in `ai_generation_credit_costs` is calibrated
 * against its rate ($0.75 per 1M input + 1M output). The upgrade ladder, if it
 * cannot read graphical statblock art, is `gpt-5.6-luna` ($1.40) and then
 * `gpt-5.6-terra` ($14.00); `gpt-4o` is dominated by terra and is not on it.
 * See migration 20260824232822 for the full arithmetic.
 *
 * openai is `gpt-4o-mini` — the same model this platform already runs for
 * text, deliberately not a vision flagship. Every credit price in
 * `ai_generation_credit_costs` is calibrated against mini's rate ($0.75 per
 * 1M input + 1M output combined). If mini turns out unable to read graphical
 * ability scores or unlabelled stat boxes, the documented upgrade path is
 * `gpt-5.6-luna` ($1.40) first and `gpt-5.6-terra` ($14.00) above that —
 * `gpt-4o` ($12.50) is deliberately not on the ladder, since it sits within
 * 12% of terra's price while being a generation behind terra on vision. See
 * migration 20260824232822 for the full comparison against claude-opus-5's
 * $30.00.
 */
export const DEFAULT_DOCUMENT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-opus-5",
  gemini: "gemini-2.5-flash",
} as const;

/**
 * Select and call the campaign's configured document-extraction provider.
 * Unlike `callText`'s three-way fallback chain, there is no fallback here: a
 * provider with no configured `model` genuinely cannot read a document for
 * this campaign right now (see UnsupportedDocumentProviderError's doc
 * comment), so routing it to a different provider's model would silently
 * ignore that decision rather than honour it.
 */
export async function callDocument(opts: {
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

  if (!DOCUMENT_PROVIDERS.has(provider) || !model) {
    throw new UnsupportedDocumentProviderError(
      `Document extraction is not available for provider "${provider}" — provider_config.document_model is NULL for it`,
    );
  }

  const callArgs: ProviderCallArgs = {
    apiKey, model, system, instruction, parts, schema,
    maxTokens: maxTokens ?? DEFAULT_DOCUMENT_MAX_TOKENS,
  };
  switch (provider) {
    case "openai": return openaiDocument(callArgs);
    case "gemini": return geminiDocument(callArgs);
    default: return anthropicDocument(callArgs);
  }
}
