/**
 * Pure request-body validation for generate-nook-part (Book Nook, #1142), colocated so it can be unit-tested
 * without Deno's `serve`/`createClient`, like validateCutoutRequest.ts.
 *
 * The images arrive as base64 PNG the client cropped from its own canvas. They are checked here for being a
 * PNG, for size, and (fill) for the mask matching the crop, because the OpenAI edit endpoint refuses a
 * mismatched mask only after the credits are reserved.
 */

export type NookPartMode = "paint" | "lift" | "fill";

export const NOOK_PART_MODES: readonly NookPartMode[] = ["paint", "lift", "fill"];

/** The largest image or mask the function accepts, decoded. */
export const MAX_NOOK_IMAGE_BYTES = 6 * 1024 * 1024;

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 300;
/** A lift hint is optional but bounded the same way as a subject. */
export const HINT_MAX = SUBJECT_MAX;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface NookPartRequest {
  campaign_id: string;
  nook_id: string;
  mode: NookPartMode;
  /** paint: the thing to paint. lift: an optional hint at which thing to isolate. */
  subject?: string;
  image_b64?: string;
  mask_b64?: string;
}

export type NookPartValidation =
  | { ok: true; request: NookPartRequest }
  | { ok: false; error: string };

/** Decoded byte length of a base64 string without decoding it. */
export function base64DecodedLength(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** The first 24 bytes of a base64 PNG: enough for the signature and the IHDR width and height. */
function pngHeader(b64: string): number[] | null {
  try {
    const head = atob(b64.slice(0, 32));
    return Array.from(head, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function pngSize(header: number[]): { width: number; height: number } {
  const u32 = (at: number) => ((header[at] << 24) | (header[at + 1] << 16) | (header[at + 2] << 8) | header[at + 3]) >>> 0;
  return { width: u32(16), height: u32(20) };
}

/** Why `b64` is not an acceptable PNG, or the header bytes when it is. */
function checkPng(b64: unknown): { error: string } | { header: number[] } {
  if (typeof b64 !== "string" || !b64) return { error: "invalid_image" };
  if (!BASE64.test(b64) || b64.length % 4 !== 0) return { error: "invalid_image" };
  if (base64DecodedLength(b64) > MAX_NOOK_IMAGE_BYTES) return { error: "image_too_large" };
  const header = pngHeader(b64);
  if (!header || header.length < 24 || PNG_SIGNATURE.some((byte, i) => header[i] !== byte)) {
    return { error: "invalid_image" };
  }
  return { header };
}

/** Validates the parsed JSON body of a `generate-nook-part` request. */
export function validateNookPartRequest(body: unknown): NookPartValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_body" };
  const { campaign_id, nook_id, mode, subject, image_b64, mask_b64 } = body as Record<string, unknown>;

  if (typeof campaign_id !== "string" || !UUID.test(campaign_id)) return { ok: false, error: "invalid_body" };
  if (typeof nook_id !== "string" || !UUID.test(nook_id)) return { ok: false, error: "invalid_body" };
  if (typeof mode !== "string" || !(NOOK_PART_MODES as readonly string[]).includes(mode)) {
    return { ok: false, error: "invalid_mode" };
  }
  const request: NookPartRequest = { campaign_id, nook_id, mode: mode as NookPartMode };

  if (mode === "paint") {
    const text = typeof subject === "string" ? subject.trim() : "";
    if (text.length < SUBJECT_MIN || text.length > SUBJECT_MAX) return { ok: false, error: "invalid_subject" };
    request.subject = text;
    return { ok: true, request };
  }

  // lift and fill both work from the client's crop of the room.
  const image = checkPng(image_b64);
  if ("error" in image) return { ok: false, error: image.error };
  request.image_b64 = image_b64 as string;

  if (mode === "lift") {
    if (subject !== undefined && subject !== null && subject !== "") {
      if (typeof subject !== "string" || subject.trim().length > HINT_MAX) return { ok: false, error: "invalid_subject" };
      request.subject = subject.trim();
    }
    return { ok: true, request };
  }

  // fill
  if (mask_b64 === undefined || mask_b64 === null || mask_b64 === "") return { ok: false, error: "mask_required" };
  const mask = checkPng(mask_b64);
  if ("error" in mask) return { ok: false, error: mask.error === "image_too_large" ? "image_too_large" : "invalid_mask" };
  const a = pngSize(image.header);
  const b = pngSize(mask.header);
  if (a.width !== b.width || a.height !== b.height) return { ok: false, error: "mask_size_mismatch" };
  request.mask_b64 = mask_b64 as string;
  return { ok: true, request };
}

/** Decodes validated base64 into a PNG Blob. */
export function pngBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

export const NOOK_PART_SIZE = "1024x1024";

const PAINT_PROMPT = (subject: string) =>
  `Paint one thing only: ${subject}. Match the attached room's painting style, palette, brushwork and light ` +
  "exactly, as if it were painted by the same hand under the same lamps. Show it whole and centred on a fully " +
  "transparent background: no room, no ground, no cast shadow, no glow, no lettering.";

// The DM's words are their own sentence, not a parenthesis after "the main subject": they often say what to
// leave out ("the music box, not the table"), and a parenthesis read as a label lost that half.
const LIFT_PROMPT = (hint?: string) =>
  "Isolate the main subject of the attached picture exactly as painted. " +
  (hint ? `What to keep, in the DM's words: "${hint}". Keep only what that describes, and nothing it leaves out. ` : "") +
  "Do not repaint, restyle, recolour or add anything. Keep the whole subject, and make everything around it a " +
  "fully transparent background.";

const FILL_PROMPT =
  "Repaint only the masked area so the room continues seamlessly behind where an object stood. Match the " +
  "surrounding surfaces, texture, brushwork and light. Add nothing new: no object, figure, shadow of the old " +
  "object or lettering.";

/** The prompt for a mode; `subject` is already trimmed by the validator. */
export function nookPartPrompt(mode: NookPartMode, subject?: string): string {
  if (mode === "paint") return PAINT_PROMPT(subject ?? "");
  if (mode === "lift") return LIFT_PROMPT(subject);
  return FILL_PROMPT;
}
