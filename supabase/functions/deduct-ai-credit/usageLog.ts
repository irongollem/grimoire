// What `deduct-ai-credit` accepts: a usage beacon for a generation the client made with the user's own key
// (`logUsage` in src/composables/ai/useAiCredits.ts), never a spend.
//
// The function used to have a second branch that subtracted a client-chosen `amount` under a client-chosen `reason`.
// Its only caller always sent `amount: 0, is_byok: true`, so that branch had no caller and let any signed-in user
// write spend rows under any generator's name (#1234). Every platform-paid generation is charged server-side by the
// function that made it (`_shared/pipeline/creditHold.ts`), so the branch was removed rather than fixed, and a body
// that is not a BYOK beacon is refused.
//
// The name stays because deployed clients call it by name.

export interface UsageRow {
  reason: string;
  model?: string;
  provider?: string;
  input_tokens?: number;
  input_image_tokens?: number;
  output_tokens?: number;
  image_count?: number;
}

// Generator reasons are snake_case codes (`quest_generation`, `entity_image`): a free-text reason would be a row the
// cost reports cannot group.
const REASON = /^[a-z][a-z0-9_]{0,63}$/;
const SHORT_TEXT = 120;

function count(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined;
}

function text(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 && v.length <= SHORT_TEXT ? v : undefined;
}

/** The ledger fields to log, or null when the body is not a BYOK usage beacon. Bad token counts are dropped, not stored. */
export function parseUsageLog(body: Record<string, unknown> | null): UsageRow | null {
  if (!body || body.is_byok !== true) return null;
  if (typeof body.reason !== "string" || !REASON.test(body.reason)) return null;
  return {
    reason: body.reason,
    model: text(body.model),
    provider: text(body.provider),
    input_tokens: count(body.input_tokens),
    input_image_tokens: count(body.input_image_tokens),
    output_tokens: count(body.output_tokens),
    image_count: count(body.image_count),
  };
}
