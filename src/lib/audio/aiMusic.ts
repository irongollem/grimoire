import { supabase } from "@/lib/supabase";
// composeFallbackPrompt is pure TS with no Deno-specific imports, so it is
// imported directly rather than duplicated — same as several other _shared
// modules already imported from browser code (src/lib/storage/upload.ts,
// src/lib/mediaConvert.ts, src/lib/legal.ts, …). Structuring itself (the
// text-model expansion step) is server-only now; this is only the minimal
// hand-composed fallback the local-BYOK path still needs — see
// generateMusicLocally's doc comment below.
export { composeFallbackPrompt, type MusicRequest as FallbackPromptRequest } from "@edge-shared/musicPrompt.ts";

/** Selectable target lengths for a generated track. Lyria 3.5 is one model —
 * length is steered by the prompt (a target duration plus a timestamped
 * timeline), not by picking a different model. */
export const MUSIC_LENGTHS = [
  { seconds: 60, label: "1 min" },
  { seconds: 120, label: "2 min" },
  { seconds: 180, label: "3 min" },
] as const;

export type MusicLengthSeconds = (typeof MUSIC_LENGTHS)[number]["seconds"];

/** `choir` is a wordless choir — the voice epic fantasy scoring reaches for
 * most, and one neither "instrumental" (no voices) nor "vocals" (a singer
 * with lyrics) can ask for. */
export type MusicVocals = "instrumental" | "choir" | "vocals";

/** The single credit-cost / pricing-category generation type for music, now
 * that one model (Lyria 3.5) serves every length. */
export const MUSIC_GENERATION_TYPE = "music_track";

/** Maximum lyrics length in characters (keeps generated audio within ~3 min, ~400 words). */
export const LYRICS_MAX_CHARS = 2200;

/** Lyria's Interactions API accepts at most 10 images per request. */
export const MUSIC_MAX_IMAGES = 10;

/**
 * Defensive parse of Google's Interactions API response. Audio lives in
 * `steps[]` where `type === "model_output"`, in `content[]` blocks where
 * `type === "audio"`, base64 in `data`. When more than one audio block is
 * present (across steps or within one), the last one wins.
 */
export function extractInteractionAudio(json: unknown): { data: string; mimeType: string } | null {
  if (typeof json !== "object" || json === null) return null;
  const steps = (json as Record<string, unknown>).steps;
  if (!Array.isArray(steps)) return null;

  let found: { data: string; mimeType: string } | null = null;
  for (const step of steps) {
    if (typeof step !== "object" || step === null) continue;
    if ((step as Record<string, unknown>).type !== "model_output") continue;
    const content = (step as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b.type !== "audio") continue;
      if (typeof b.data !== "string" || !b.data) continue;
      const mimeType = typeof b.mime_type === "string" && b.mime_type ? b.mime_type : "audio/mpeg";
      found = { data: b.data, mimeType };
    }
  }
  return found;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
};

function extensionFor(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "mp3";
}

const LYRIA_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const LYRIA_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
// Chunked so a large image never spreads its whole byte array into
// String.fromCharCode at once (that blows the call-stack argument limit).
const BASE64_CHUNK_SIZE = 8192;

async function blobToBase64Chunked(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

interface LyriaImageInput {
  mimeType: string;
  data: string;
}

/** Fetches and base64-encodes one image for Lyria. Any failure throws — an
 * attached image is never silently dropped from the request. */
async function fetchImageForLyria(url: string): Promise<LyriaImageInput> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("Could not read an attached image.");
  }
  if (!response.ok) throw new Error("Could not read an attached image.");

  const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!mimeType || !LYRIA_IMAGE_MIME_TYPES.has(mimeType)) throw new Error("Could not read an attached image.");

  const blob = await response.blob();
  if (blob.size > LYRIA_IMAGE_MAX_BYTES) throw new Error("Could not read an attached image.");

  return { mimeType, data: await blobToBase64Chunked(blob) };
}

/** Over the cap throws rather than trimming — same rule as a failed fetch:
 * an attached image is never dropped without the DM hearing about it. */
function dedupeImageUrls(urls: string[]): string[] {
  const unique = Array.from(new Set(urls));
  if (unique.length > MUSIC_MAX_IMAGES) throw new Error(`Lyria reads at most ${MUSIC_MAX_IMAGES} images.`);
  return unique;
}

/**
 * The body Google's Interactions API expects: a plain string when there are
 * no images, or the list form — text first, then one block per image — when
 * there are. Pure so it can be tested without a network call.
 */
export function buildInteractionInput(
  prompt: string,
  images: LyriaImageInput[],
): string | Array<{ type: "text"; text: string } | { type: "image"; mime_type: string; data: string }> {
  if (images.length === 0) return prompt;
  return [
    { type: "text" as const, text: prompt },
    ...images.map((image) => ({ type: "image" as const, mime_type: image.mimeType, data: image.data })),
  ];
}

/**
 * The local-BYOK path: reads the configured Lyria model from provider_config,
 * calls Google's Interactions API directly from the browser, and returns the
 * generated audio plus the model that produced it (needed by the caller to
 * log usage, since the model is no longer chosen client-side). `imageUrls`
 * are fetched and base64-encoded in the browser — Lyria reads the bytes, the
 * server never sees this path's images.
 *
 * `prompt` is expected to already be a complete Lyria prompt — the caller
 * builds it with `composeFallbackPrompt`, not a structured one. Structuring
 * (the text-model expansion step) is server-only now (see generate-music's
 * worker): this path is legacy per the BYOK-tier policy (local-vault keys
 * never leave the browser), so it sends the hand-composed prompt rather than
 * adding a second BYOK text-provider call here.
 */
export async function generateMusicLocally(
  prompt: string,
  apiKey: string,
  imageUrls: string[] = [],
): Promise<{ file: File; model: string }> {
  const { data } = await supabase
    .from("provider_config")
    .select("audio_model")
    .eq("provider", "gemini")
    .maybeSingle();
  const model = (data as { audio_model: string | null } | null)?.audio_model;
  if (!model) throw new Error("No music model is configured.");

  const images = await Promise.all(dedupeImageUrls(imageUrls).map(fetchImageForLyria));

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({ model, input: buildInteractionInput(prompt, images), store: false }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body?.error?.message ?? `Lyria API error ${res.status}`);
  }

  const json: unknown = await res.json();
  const audio = extractInteractionAudio(json);
  if (!audio) throw new Error("No audio data in Lyria response.");

  const binary = atob(audio.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: audio.mimeType });
  const file = new File([blob], `ai-generated-${Date.now()}.${extensionFor(audio.mimeType)}`, { type: audio.mimeType });
  return { file, model };
}
