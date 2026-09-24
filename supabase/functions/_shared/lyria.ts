/**
 * Google Lyria 3.5 request/response helpers for the Interactions API
 * (https://generativelanguage.googleapis.com/v1beta/interactions), split out
 * from generate-music/index.ts so the shape of the request and the parsing of
 * the response can be unit-tested without a Deno runtime. Google documents
 * Lyria 3.5 on the Interactions API only; `generateContent` is its legacy
 * surface for Gemini models.
 */

export const LYRIA_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** Lyria 3.5 composes from at most 10 images alongside the text prompt. */
export const LYRIA_MAX_IMAGES = 10;

/** One image attachment: base64 bytes plus the mime type Google expects. */
export interface LyriaImage {
  mimeType: string;
  data: string;
}

interface LyriaTextBlock {
  type: "text";
  text: string;
}

interface LyriaImageBlock {
  type: "image";
  mime_type: string;
  data: string;
}

export interface LyriaRequestBody {
  model: string;
  input: string | Array<LyriaTextBlock | LyriaImageBlock>;
  store: boolean;
}

/**
 * Build the Interactions API request body. `store: false` is deliberate:
 * Google stores interactions for 55 days by default for server-side
 * conversation state, which this app never uses, so there is no reason to
 * leave DM prompts sitting in that store.
 *
 * With no images, `input` stays the plain prompt string (unchanged shape for
 * every request before image inputs existed). With images, `input` becomes a
 * list of content blocks — the text prompt first, then up to
 * `LYRIA_MAX_IMAGES` images — matching the Interactions API's multi-part input
 * shape.
 */
export function buildLyriaRequest(model: string, prompt: string, images: LyriaImage[] = []): LyriaRequestBody {
  if (images.length === 0) return { model, input: prompt, store: false };
  const input: Array<LyriaTextBlock | LyriaImageBlock> = [
    { type: "text", text: prompt },
    ...images.map((image): LyriaImageBlock => ({ type: "image", mime_type: image.mimeType, data: image.data })),
  ];
  return { model, input, store: false };
}

/** Mime types Lyria's image input accepts. */
export const LYRIA_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Normalize a fetched image's Content-Type header into one of
 * `LYRIA_IMAGE_MIME_TYPES`, or null if it isn't one. Strips parameters
 * (`image/jpeg; charset=binary`) and lowercases before comparing.
 */
export function normalizeImageMime(contentType: string | null): string | null {
  if (!contentType) return null;
  const bare = contentType.split(";")[0].trim().toLowerCase();
  return (LYRIA_IMAGE_MIME_TYPES as readonly string[]).includes(bare) ? bare : null;
}

export interface LyriaAudio {
  data: string;
  mimeType: string;
}

/**
 * Defensive parse of an Interaction object. Audio lives at `steps[]` where
 * `step.type === "model_output"`, inside `step.content[]` blocks where
 * `block.type === "audio"` (base64 in `block.data`, mime type in
 * `block.mime_type`, absent → "audio/mpeg" since MP3 is the default output).
 * Text blocks (generated lyrics / song structure) are ignored.
 *
 * Takes the LAST matching audio block across all model_output steps, mirroring
 * the SDK's own `output_audio` convenience property ("the last generated audio
 * block") — a multi-step interaction resolves to its final render.
 */
export function extractLyriaAudio(json: unknown): LyriaAudio | null {
  if (typeof json !== "object" || json === null) return null;
  const steps = (json as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return null;

  let last: LyriaAudio | null = null;
  for (const step of steps) {
    if (typeof step !== "object" || step === null) continue;
    const stepType = (step as { type?: unknown }).type;
    if (stepType !== "model_output") continue;

    const content = (step as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const blockType = (block as { type?: unknown }).type;
      if (blockType !== "audio") continue;

      const data = (block as { data?: unknown }).data;
      if (typeof data !== "string" || !data) continue;

      const mimeTypeRaw = (block as { mime_type?: unknown }).mime_type;
      const mimeType = typeof mimeTypeRaw === "string" && mimeTypeRaw ? mimeTypeRaw : "audio/mpeg";
      last = { data, mimeType };
    }
  }
  return last;
}

/** File extension for a stored Lyria render; MP3 is the default output. */
export function audioExtension(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("flac")) return "flac";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  return "mp3";
}
