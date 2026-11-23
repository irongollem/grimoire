/**
 * Pure half of describe-look (#1252): request parsing, the refusals that come before any credit work, and the shaping
 * of the model's answer. Kept beside index.ts, with no Deno imports, so it is unit-testable without `serve`.
 *
 * The function reads up to four pictures the DM chose and drafts the words of the campaign's Look. Nothing is written
 * to the database: the client puts the text in the Look field, where the DM edits it.
 */
import { AI_PROMPT_LIMIT_LONG, wrapUserInput } from "../_shared/ai-prompt.ts";
import type { DocumentExtractionOutcome, DocumentUsage } from "../_shared/documentGen.ts";

export const MAX_LOOK_IMAGES = 4;
/** A look is one short paragraph an image model paints from; anything longer is the model rambling. */
export const MAX_LOOK_CHARS = 1200;
/** One picture, in bytes, before it is sent to the provider as input tokens. */
export const MAX_LOOK_IMAGE_BYTES = 8 * 1024 * 1024;

export interface Refusal {
  status: number;
  code: string;
  message: string;
}

export interface LookRequest {
  campaignId: string;
  images: string[];
  currentLook: string | null;
}

export type LookPreflight = { ok: true; request: LookRequest } | { ok: false; refusal: Refusal };

const refuse = (status: number, code: string, message: string): { ok: false; refusal: Refusal } => ({
  ok: false,
  refusal: { status, code, message },
});

/**
 * Everything decided before a credit is reserved or a campaign is read: the body's shape, every URL, then the likeness
 * notice (EU AI Act Art 50(1): the pictures may show real people). `isSafeUrl` is the SSRF guard; an unsafe URL is
 * refused, never skipped, because the DM sent each one deliberately.
 */
export async function preflight(
  body: Record<string, unknown> | null,
  deps: { isSafeUrl: (url: string) => boolean; likenessAcknowledged: () => Promise<boolean> },
): Promise<LookPreflight> {
  if (!body || typeof body.campaign_id !== "string" || body.campaign_id === "" || !Array.isArray(body.images)) {
    return refuse(400, "invalid_body", "Need { campaign_id, images: [1 to 4 picture URLs] }.");
  }
  const images = body.images;
  if (images.length < 1 || images.length > MAX_LOOK_IMAGES) {
    return refuse(400, "invalid_images", `Show between 1 and ${MAX_LOOK_IMAGES} pictures.`);
  }
  const urls: string[] = [];
  for (const image of images) {
    if (typeof image !== "string" || !deps.isSafeUrl(image)) {
      return refuse(400, "unsafe_image_url", "One of the pictures is not one of this app's own uploads.");
    }
    urls.push(image);
  }

  let currentLook: string | null = null;
  if (body.current_look !== undefined && body.current_look !== null) {
    if (typeof body.current_look !== "string") return refuse(400, "invalid_body", "current_look must be text.");
    const trimmed = body.current_look.trim();
    if (trimmed.length > AI_PROMPT_LIMIT_LONG) {
      return refuse(400, "invalid_body", `The current look is over ${AI_PROMPT_LIMIT_LONG} characters.`);
    }
    currentLook = trimmed === "" ? null : trimmed;
  }

  // Before any credit work: the client pre-flights the same check, so this only fires on a direct call.
  if (!(await deps.likenessAcknowledged())) {
    return refuse(403, "likeness_acknowledgement_required", "Confirm the likeness notice first, then try again.");
  }
  return { ok: true, request: { campaignId: body.campaign_id, images: urls, currentLook } };
}

const IMAGE_TYPES: Record<string, string> = { "image/png": "image/png", "image/jpeg": "image/jpeg", "image/webp": "image/webp" };

/** The bare media type when it is one the providers read (png, jpeg, webp), else null. Parameters are ignored. */
export function acceptedImageType(contentType: string | null): string | null {
  const bare = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return Object.hasOwn(IMAGE_TYPES, bare) ? IMAGE_TYPES[bare] : null;
}

export const LOOK_SCHEMA = {
  type: "object",
  properties: { look: { type: "string" } },
  required: ["look"],
  additionalProperties: false,
} as const;

export function lookInstruction(count: number, currentLook: string | null): string {
  const shown = `The ${count === 1 ? "picture" : `${count} pictures`} above show the look the DM wants. Write that look.`;
  return currentLook ? `${shown}\n\nThe DM's current look:\n${wrapUserInput(currentLook)}` : shown;
}

export type LookOutcome =
  | { kind: "look"; look: string; usage: DocumentUsage }
  | { kind: "failed"; refusal: Refusal };

/**
 * What the provider's answer is worth. Only a complete, non-empty look is a generation the DM pays for: a refusal, a
 * cut-off paragraph and an empty or malformed reply each come back as a failure with nothing to charge.
 */
export function shapeOutcome(outcome: DocumentExtractionOutcome): LookOutcome {
  const failed = (message: string): LookOutcome => ({ kind: "failed", refusal: { status: 502, code: "generation_failed", message } });
  if (!outcome.ok) {
    return failed(outcome.reason === "refused"
      ? "The AI declined to describe those pictures. Nothing was charged."
      : "The AI ran out of room before finishing. Nothing was charged; please try again.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.content);
  } catch {
    return failed("The AI returned something unreadable. Nothing was charged; please try again.");
  }
  const raw = typeof parsed === "object" && parsed !== null ? (parsed as { look?: unknown }).look : undefined;
  const look = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_LOOK_CHARS).trim() : "";
  if (look === "") return failed("The AI wrote nothing usable. Nothing was charged; please try again.");
  return { kind: "look", look, usage: outcome.usage };
}
