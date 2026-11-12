/**
 * Pure request validation and prompt for paint-brush-tips (#1181), colocated so they can be unit-tested
 * without Deno's `serve`/`createClient`, like illuminate-picture/validateIlluminateRequest.ts.
 *
 * A brush belongs to the painter, not to a book, so the request has no document id. The words are the
 * painter's; everything else in the prompt is ours.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const BRUSH_DESCRIPTION_MIN = 3;
export const BRUSH_DESCRIPTION_MAX = 200;

/** One square sheet: four tips laid out 2x2. */
export const BRUSH_TIPS_SIZE = "1024x1024";

export interface BrushTipsRequest {
  campaign_id: string;
  description: string;
}

export type BrushTipsValidation =
  | { ok: true; request: BrushTipsRequest }
  | { ok: false; error: string };

export function validateBrushTipsRequest(body: unknown): BrushTipsValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_body" };
  const { campaign_id, description } = body as Record<string, unknown>;
  if (typeof campaign_id !== "string" || !UUID.test(campaign_id)) return { ok: false, error: "invalid_body" };
  if (typeof description !== "string") return { ok: false, error: "invalid_description" };
  const trimmed = description.trim();
  if (trimmed.length < BRUSH_DESCRIPTION_MIN || trimmed.length > BRUSH_DESCRIPTION_MAX) {
    return { ok: false, error: "invalid_description" };
  }
  return { ok: true, request: { campaign_id, description: trimmed } };
}

/** The prompt: the painter's words inside a fixed frame that asks for a cuttable 2x2 sheet. */
export function brushTipsPrompt(description: string): string {
  return [
    `A sheet of four separate single brush marks, each made by this brush: ${description}.`,
    "Each mark is one complete dab or one short stroke, a different take of the same brush.",
    "Pure black ink on a pure white background, laid out in a 2x2 grid with generous white space between the marks and around them, so each can be cut out on its own.",
    "No shading of the paper, no text, no frame, no border, no colour, nothing else on the sheet.",
  ].join(" ");
}
