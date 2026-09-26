/**
 * Unified image-generation across providers (OpenAI gpt-image, Google Gemini
 * "Nano Banana"). One generateImage() the edge functions call so a campaign's
 * chosen image_provider applies everywhere — and adding a provider is a single
 * switch arm instead of edits in six functions.
 */

import {
  screenImagePrompt,
  recordScreeningOutcome,
  type ScreeningContext,
} from "./moderation.ts";
import { nearestGeminiAspect } from "./geminiAspect.ts";

export type ImageProviderKey = "openai" | "gemini";

export interface ImageGenUsage {
  model: string;
  provider: string;
  image_count: number;
  input_tokens?: number;
  input_image_tokens?: number;
  output_tokens?: number;
}

export interface ImageGenResult {
  b64: string;
  /**
   * The image's true, provider-reported byte format (e.g. "image/webp",
   * "image/jpeg", "image/png") — NOT necessarily what this pipeline
   * requested. Callers that mark the bytes with provenance (embedProvenance/
   * markGeneratedImage) must use this, not an assumed "image/webp": OpenAI
   * honors the explicit output_format below, but Gemini is asked for no format
   * at all and returns its own default (png) — marking those bytes as webp
   * would silently no-op.
   */
  contentType: string;
  usage: ImageGenUsage;
}

/**
 * A provider declining the prompt on content grounds — NOT an outage, a bad
 * key, or a rate limit. The distinction is the whole value of the screening
 * log: "we allowed it and the renderer refused" is evidence a threshold is too
 * high, while "we allowed it and the request timed out" is evidence of nothing.
 */
export class ProviderRefusedError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string) {
    super(message);
    this.name = "ProviderRefusedError";
    this.provider = provider;
  }
}

export function isProviderRefusal(e: unknown): e is ProviderRefusedError {
  return e instanceof ProviderRefusedError;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Strips a `; charset=...`-style suffix and normalizes case, so downstream `switch (contentType)` matches stay exact. Falls back when the provider omits the field entirely. */
function normalizeContentType(raw: string | null | undefined, fallback: string): string {
  const value = raw?.split(";")[0]?.trim().toLowerCase();
  return value || fallback;
}

/** Parse a "WxH" size string into pixel dimensions (defaults to 1024²). */
function sizeDims(size: string): { w: number; h: number } {
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec(size.trim());
  if (!m) return { w: 1024, h: 1024 };
  return { w: Number(m[1]), h: Number(m[2]) };
}

/** Valid OpenAI gpt-image `quality` values; anything else is omitted (API default). */
const OPENAI_QUALITIES = new Set(["low", "medium", "high", "auto"]);
/** Valid Gemini `imageConfig.imageSize` values; falls back to "1K". */
const GEMINI_IMAGE_SIZES = new Set(["1K", "2K", "4K"]);

/**
 * Art-direction suffix appended to Gemini prompts for scene/character/illustration
 * work (NOT maps). Gemini-flash follows the prompt literally and the shared
 * image_base style asks for a muted, restrained, "avoid cinematic" look — which
 * renders flat on Gemini while gpt-image's baked-in bias overrides it. This
 * pushes Gemini back toward painterly depth without changing OpenAI's output.
 */
const GEMINI_STYLE_BOOSTER =
  "dramatic volumetric lighting with a strong directional key light and deep chiaroscuro shadows, warm rim light, rich tonal range, layered foreground-to-background atmospheric depth, painterly dimensionality and confident form modeling; avoid flat, evenly-lit, washed-out rendering";

/**
 * Map a "WxH" size to the nearest Gemini `aspectRatio` bucket Gemini
 * actually accepts, rather than the three crude thresholds this used to
 * pick from — a map's own aspect (from the map's own dimensions, not a
 * fixed square) can land anywhere in Gemini's 9:16..21:9 range now that the
 * AI styler sends an image fit to it rather than always square. The ratio
 * list and nearest-match logic itself live in `geminiAspect.ts`, shared with
 * the client so the input it pads to matches the bucket this picks.
 * Resolution comes from the admin quality knob, unchanged.
 */
export function sizeToAspect(size: string, quality?: string | null): { aspectRatio: string; imageSize: string } {
  const { w, h } = sizeDims(size);
  const aspectRatio = nearestGeminiAspect(w, h).label;
  const imageSize = quality && GEMINI_IMAGE_SIZES.has(quality) ? quality : "1K";
  return { aspectRatio, imageSize };
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

/**
 * A refused prompt comes back as a 400 whose `error.code` is
 * `moderation_blocked` (`content_policy_violation` on the older image models).
 * The message alone cannot be trusted to classify it — it is prose, and it is
 * localised — so the code is what this reads.
 */
async function openaiError(res: Response, kind: string): Promise<Error> {
  const body = await res.json().catch(() => ({}));
  const error = body?.error;
  const message = error?.message ?? `OpenAI image ${kind} error ${res.status}`;
  if (error?.code === "moderation_blocked" || error?.code === "content_policy_violation") {
    return new ProviderRefusedError("openai", message);
  }
  return new Error(message);
}

function openaiUsage(data: {
  usage?: { input_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number }; output_tokens?: number };
}, model: string): ImageGenUsage {
  const u = data.usage;
  return {
    model, provider: "openai", image_count: 1,
    input_tokens:       u?.input_tokens_details?.text_tokens  ?? u?.input_tokens ?? 0,
    input_image_tokens: u?.input_tokens_details?.image_tokens ?? 0,
    output_tokens:      u?.output_tokens ?? 0,
  };
}

async function openaiGenerate(
  apiKey: string,
  model: string,
  prompt: string,
  size: string,
  quality?: string | null,
  sources?: Blob[],
  background?: "transparent" | "opaque" | "auto",
): Promise<ImageGenResult> {
  const q = quality && OPENAI_QUALITIES.has(quality) ? quality : null;
  if (sources && sources.length > 0) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    if (q) form.append("quality", q);
    if (background) form.append("background", background);
    form.append("output_format", "webp");
    form.append("n", "1");
    sources.forEach((b, i) => form.append("image[]", new File([b], `ref_${i}.webp`, { type: "image/webp" })));
    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form,
    });
    if (!res.ok) throw await openaiError(res, "edit");
    const data = await res.json();
    // Both OpenAI calls below explicitly request output_format: "webp" — the
    // response is reliably webp, unlike Gemini which gets no such ask.
    return { b64: data.data[0].b64_json as string, contentType: "image/webp", usage: openaiUsage(data, model) };
  }
  // `moderation: "low"` is the least restrictive value gpt-image offers; the
  // default ("auto") refuses a great deal of ordinary fantasy art — wounds,
  // undead, a weapon drawn on a person — while "low" still enforces the hard
  // prohibitions. It is a /v1/images/generations parameter *only*: OpenAI's
  // CreateImageEditRequest has no such field, so the edit form above cannot
  // ask for it and an edit is moderated at the default level.
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      prompt,
      size,
      output_format: "webp",
      moderation: "low",
      ...(q ? { quality: q } : {}),
      ...(background ? { background } : {}),
    }),
  });
  if (!res.ok) throw await openaiError(res, "generation");
  const data = await res.json();
  return { b64: data.data[0].b64_json as string, contentType: "image/webp", usage: openaiUsage(data, model) };
}

// ── Gemini ("Nano Banana") — supports reference images via inline_data ─────────

async function geminiGenerate(apiKey: string, model: string, prompt: string, size: string, quality?: string | null, sources?: Blob[]): Promise<ImageGenResult> {
  const parts: unknown[] = [{ text: prompt }];
  for (const b of sources ?? []) {
    parts.push({ inline_data: { mime_type: b.type || "image/webp", data: await blobToBase64(b) } });
  }
  const { aspectRatio, imageSize } = sizeToAspect(size, quality);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio, imageSize } },
      }),
    },
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message ?? `Gemini image error ${res.status}`);
  const data = await res.json();
  const outParts = data?.candidates?.[0]?.content?.parts ?? [];
  interface GeminiImagePart {
    inlineData?: { data?: string; mimeType?: string };
    inline_data?: { data?: string; mime_type?: string };
  }
  const imgPart = (outParts as GeminiImagePart[]).find((p) => p?.inlineData?.data ?? p?.inline_data?.data);
  const b64 = imgPart?.inlineData?.data ?? imgPart?.inline_data?.data;
  if (!b64) {
    // Gemini answers 200 with no image part when it declines, so the reason
    // has to be read out of the body: promptFeedback.blockReason when the
    // prompt was rejected outright, the candidate's finishReason when the
    // render was stopped. Anything else genuinely is an empty response.
    const blockReason: string | undefined = data?.promptFeedback?.blockReason;
    const finishReason: string | undefined = data?.candidates?.[0]?.finishReason;
    const refusal = blockReason ??
      (["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT"].includes(finishReason ?? "") ? finishReason : undefined);
    if (refusal) throw new ProviderRefusedError("gemini", `Gemini refused the prompt (${refusal})`);
    throw new Error("Gemini returned no image");
  }
  // No output format is requested above, so Gemini returns its own default
  // (png) — inlineData.mimeType carries whatever it actually rendered.
  const contentType = normalizeContentType(
    imgPart?.inlineData?.mimeType ?? imgPart?.inline_data?.mime_type,
    "image/png",
  );
  const meta = data.usageMetadata ?? {};
  return {
    b64,
    contentType,
    usage: {
      model, provider: "gemini", image_count: 1,
      input_tokens:  meta.promptTokenCount ?? 0,
      output_tokens: meta.candidatesTokenCount ?? 0,
    },
  };
}

// ── Unified entry point ────────────────────────────────────────────────────────

/**
 * Generate (or, with `sourceImages`, compose/edit) one image with the given
 * provider. Both openai and gemini compose from sourceImages.
 */
export async function generateImage(opts: {
  provider: ImageProviderKey;
  model: string;
  apiKey: string;
  prompt: string;
  size: string;
  /** Provider-specific quality lever from provider_config (OpenAI quality / Gemini imageSize). */
  quality?: string | null;
  /**
   * Append GEMINI_STYLE_BOOSTER (Gemini only) for scene/character/illustration
   * work to counter flash-image's flat literalness. Leave false for maps —
   * dramatic lighting/depth ruins top-down cartography.
   */
  boostStyle?: boolean;
  sourceImages?: Blob[];
  /** OpenAI output background. Ignored by providers that do not expose it. */
  background?: "transparent" | "opaque" | "auto";
  /**
   * Screening context (see moderation.ts). Its `apiKey` is an OpenAI key even
   * when the campaign renders on Gemini, because screening is always OpenAI's
   * free classifier — and Gemini needs it most: its adjustable safety filters
   * default to off on 2.5/3 models, so nothing else stands between a prompt
   * and a billed render. `imageProvider` is filled in here rather than by the
   * caller, which would only be restating `provider`. Omit the whole object
   * and the render is unscreened and unlogged.
   */
  screening?: Omit<ScreeningContext, "imageProvider">;
}): Promise<ImageGenResult> {
  const { provider, model, apiKey, prompt, size, quality, boostStyle, sourceImages, background, screening } = opts;

  const dispatch = () => {
    switch (provider) {
      case "gemini": {
        const geminiPrompt = boostStyle ? `${prompt} — ${GEMINI_STYLE_BOOSTER}` : prompt;
        return geminiGenerate(apiKey, model, geminiPrompt, size, quality, sourceImages);
      }
      default:       return openaiGenerate(apiKey, model, prompt, size, quality, sourceImages, background); // openai
    }
  };

  if (!screening) return dispatch();

  // Before anything billable. Throws PromptRejectedError on a refusal (the row
  // is written first, so a block is logged); fails open when the classifier is
  // unavailable, in which case there is no row to stamp an outcome onto.
  const logged = await screenImagePrompt(prompt, { ...screening, imageProvider: provider });
  if (!logged.id) return dispatch();

  try {
    const result = await dispatch();
    await recordScreeningOutcome(screening.admin, logged.id, "rendered");
    return result;
  } catch (e) {
    // The half of the loop our own verdict cannot supply: what the renderer
    // did with a prompt we allowed. The prompt text is kept only on a refusal
    // — at screen time we could not know this row would need reading, and its
    // score may have been nowhere near a threshold, which is the finding.
    const refused = isProviderRefusal(e);
    await recordScreeningOutcome(
      screening.admin, logged.id, refused ? "refused" : "error", refused ? prompt : undefined,
    );
    throw e;
  }
}

// ── Provider resolution ─────────────────────────────────────────────────────────

const DEFAULT_MODEL: Record<string, string> = {
  openai: "gpt-image-2",
  gemini: "gemini-3.1-flash-image",
};

export interface ResolvedImageProvider {
  provider: ImageProviderKey;
  /** Underlying provider whose key/config/pricing applies — currently
   *  always equal to `provider`, kept as its own field since call sites
   *  already read `.base` for the key/pricing lookup rather than `.provider`. */
  base: "openai" | "gemini";
  model: string;
  apiKey: string;
  /** OpenAI key for prompt screening, independent of the chosen renderer (null when the account has none). */
  moderationKey: string | null;
  isByok: boolean;
  /** Credit multiplier from provider_config (1.0 if unset). */
  imageMultiplier: number;
  /** Provider-specific quality lever from provider_config (null = provider default). */
  imageQuality: string | null;
}

/**
 * Resolve the campaign's chosen image provider into a concrete model + API key.
 * `campaignKeys`/`platformKeys` are decrypted keys keyed by underlying provider
 * (openai/gemini). Returns null when no usable key exists.
 */
export function resolveImageProvider(args: {
  imageProvider: string | null | undefined;
  campaignKeys: Partial<Record<"openai" | "gemini", string | null>>;
  platformKeys: Partial<Record<"openai" | "gemini", string | null>>;
  providerConfigs: Partial<Record<string, { image_model?: string | null; image_multiplier?: number | null; image_quality?: string | null } | undefined>>;
  /** Client-requested OpenAI sub-model (gpt-image-2/1.5). Honored only for plain "openai". */
  requestedModel?: string | null;
}): ResolvedImageProvider | null {
  const choice = (args.imageProvider ?? "openai") as ImageProviderKey;
  const base = choice;

  const campaignKey = args.campaignKeys[base] ?? null;
  const apiKey = campaignKey ?? args.platformKeys[base] ?? null;
  if (!apiKey) return null;

  const model = choice === "openai" && args.requestedModel
    ? args.requestedModel
    : (args.providerConfigs[base]?.image_model ?? DEFAULT_MODEL[base]);

  return {
    provider: choice,
    base,
    model,
    apiKey,
    // Screening is always OpenAI's classifier, so it reads the OpenAI keys
    // rather than `base`'s — a Gemini campaign on a platform OpenAI key is
    // still screened. Null only when neither key exists, and the caller then
    // renders unscreened rather than not at all.
    moderationKey: args.campaignKeys.openai ?? args.platformKeys.openai ?? null,
    isByok: !!campaignKey,
    imageMultiplier: args.providerConfigs[base]?.image_multiplier ?? 1.0,
    imageQuality: args.providerConfigs[base]?.image_quality ?? null,
  };
}
