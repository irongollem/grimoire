/**
 * Pure request-body validation and prompts for illuminate-picture (#1176 story 10), colocated so they can be
 * unit-tested without Deno's `serve`/`createClient`, like generate-nook-part/validateNookPartRequest.ts.
 *
 * The picture arrives as base64 PNG the client drew from its own canvas; the server never fetches a URL the
 * client names. An extend request also carries a mask the same size as the picture, because OpenAI refuses a
 * mismatched mask only after the credits are reserved.
 */
import { checkPng, pngSize } from "../_shared/pngRequest.ts";
import { buildSimpleImagePrompt } from "../_shared/image-prompt.ts";
import { SCRIPTORIUM_HOUSE_STYLE, SCRIPTORIUM_LOOK_STYLES, isArtLook, type ScriptoriumArtLook } from "../_shared/scriptoriumLookStyles.ts";

export type IlluminateAction = "cutout" | "ink" | "watercolour" | "extend" | "match";

export const ILLUMINATE_ACTIONS: readonly IlluminateAction[] = ["cutout", "ink", "watercolour", "extend", "match"];

/** The oblongs OpenAI's edit endpoint accepts; the client picks the nearest to the picture. */
export const ILLUMINATE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
export type IlluminateSize = (typeof ILLUMINATE_SIZES)[number];

/**
 * These three restyle a picture the DM uploaded, which may be a photo of a real person, so they sit behind the
 * likeness acknowledgement (EU AI Act Art 50(1), context/compliance/provenance-architecture.md section 3).
 * Cutting out and extending change no likeness.
 */
export function needsLikenessAck(action: IlluminateAction): boolean {
  return action === "ink" || action === "watercolour" || action === "match";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IlluminateRequest {
  campaign_id: string;
  document_id: string;
  action: IlluminateAction;
  size: IlluminateSize;
  image_b64: string;
  /** extend only: transparent where the new margin goes. */
  mask_b64?: string;
  /** match only: which book look to restyle to. The words are ours, never the client's. */
  look?: ScriptoriumArtLook;
}

export type IlluminateValidation =
  | { ok: true; request: IlluminateRequest }
  | { ok: false; error: string };

/** Validates the parsed JSON body of an `illuminate-picture` request. */
export function validateIlluminateRequest(body: unknown): IlluminateValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_body" };
  const { campaign_id, document_id, action, size, image_b64, mask_b64, look } = body as Record<string, unknown>;

  if (typeof campaign_id !== "string" || !UUID.test(campaign_id)) return { ok: false, error: "invalid_body" };
  if (typeof document_id !== "string" || !UUID.test(document_id)) return { ok: false, error: "invalid_body" };
  if (typeof action !== "string" || !(ILLUMINATE_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: "invalid_action" };
  }
  if (typeof size !== "string" || !(ILLUMINATE_SIZES as readonly string[]).includes(size)) {
    return { ok: false, error: "invalid_size" };
  }

  const image = checkPng(image_b64);
  if ("error" in image) return { ok: false, error: image.error };
  const request: IlluminateRequest = {
    campaign_id, document_id, action: action as IlluminateAction, size: size as IlluminateSize, image_b64: image_b64 as string,
  };

  if (action === "extend") {
    if (mask_b64 === undefined || mask_b64 === null || mask_b64 === "") return { ok: false, error: "mask_required" };
    const mask = checkPng(mask_b64);
    if ("error" in mask) return { ok: false, error: mask.error === "image_too_large" ? "image_too_large" : "invalid_mask" };
    const a = pngSize(image.header);
    const b = pngSize(mask.header);
    if (a.width !== b.width || a.height !== b.height) return { ok: false, error: "mask_size_mismatch" };
    request.mask_b64 = mask_b64 as string;
  }

  if (action === "match") {
    if (!isArtLook(look)) return { ok: false, error: "invalid_look" };
    request.look = look;
  }
  return { ok: true, request };
}

const CUTOUT_PROMPT =
  "Isolate the main subject of the attached picture exactly as painted. Do not repaint, restyle, recolour or " +
  "add anything. Keep the whole subject, and make everything around it a fully transparent background.";

const INK_PROMPT =
  "Redraw the attached picture as a pen-and-ink line drawing: black ink on plain paper, confident linework, light " +
  "hatching for shade. Keep the same composition, the same subjects and the same likeness. No colour, and add " +
  "no object, figure or lettering.";

const WATERCOLOUR_PROMPT =
  "Repaint the attached picture as a loose watercolour: soft washes, visible paper grain, paint pooling at the " +
  "edges. Keep the same composition, the same subjects and the same likeness. Add no object, figure or lettering.";

const EXTEND_PROMPT =
  "Paint only the transparent margin so the picture continues seamlessly past its old edge. Match the " +
  "surroundings' subject, texture, brushwork, palette and light. Add no new figure, object or lettering.";

const MATCH_PROMPT =
  "Redraw the attached picture in the style described above. Keep the same composition, the same subjects and " +
  "the same likeness. Add no object, figure or lettering.";

/** The prompt for an action, built only from text in this repo; `look` is required for "match". */
export function illuminatePrompt(action: IlluminateAction, look?: ScriptoriumArtLook): string {
  switch (action) {
    case "cutout": return CUTOUT_PROMPT;
    case "ink": return INK_PROMPT;
    case "watercolour": return WATERCOLOUR_PROMPT;
    case "extend": return EXTEND_PROMPT;
    case "match":
      if (!look) throw new Error("A match prompt needs the look to match.");
      return buildSimpleImagePrompt({ base: `${SCRIPTORIUM_HOUSE_STYLE} ${SCRIPTORIUM_LOOK_STYLES[look]}`, setting: "", subject: MATCH_PROMPT });
  }
}
