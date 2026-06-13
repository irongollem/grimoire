/**
 * Unified image-generation across providers (OpenAI gpt-image, fal.ai FLUX,
 * Google Gemini "Nano Banana"). One generateImage() the edge functions call so
 * a campaign's chosen image_provider applies everywhere — and adding a provider
 * is a single switch arm instead of edits in six functions.
 */

export type ImageProviderKey = "openai" | "openai-mini" | "falai" | "gemini";

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
  usage: ImageGenUsage;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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

/** Map a "WxH" size to Gemini's aspectRatio; resolution comes from the admin quality knob. */
function sizeToAspect(size: string, quality?: string | null): { aspectRatio: string; imageSize: string } {
  const { w, h } = sizeDims(size);
  const r = w / h;
  const aspectRatio = r > 1.2 ? "3:2" : r < 0.83 ? "2:3" : "1:1";
  const imageSize = quality && GEMINI_IMAGE_SIZES.has(quality) ? quality : "1K";
  return { aspectRatio, imageSize };
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

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

async function openaiGenerate(apiKey: string, model: string, prompt: string, size: string, quality?: string | null, sources?: Blob[]): Promise<ImageGenResult> {
  const q = quality && OPENAI_QUALITIES.has(quality) ? quality : null;
  if (sources && sources.length > 0) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    if (q) form.append("quality", q);
    form.append("output_format", "webp");
    form.append("n", "1");
    sources.forEach((b, i) => form.append("image[]", new File([b], `ref_${i}.webp`, { type: "image/webp" })));
    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message ?? `OpenAI image edit error ${res.status}`);
    const data = await res.json();
    return { b64: data.data[0].b64_json as string, usage: openaiUsage(data, model) };
  }
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, size, output_format: "webp", ...(q ? { quality: q } : {}) }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message ?? `OpenAI image error ${res.status}`);
  const data = await res.json();
  return { b64: data.data[0].b64_json as string, usage: openaiUsage(data, model) };
}

// ── fal.ai (generate-only; no reference/edit support) ──────────────────────────

async function falaiGenerate(apiKey: string, model: string, prompt: string, size: string): Promise<ImageGenResult> {
  const { w, h } = sizeDims(size);
  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
    body: JSON.stringify({ prompt, image_size: { width: w, height: h } }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message ?? `fal.ai error ${res.status}`);
  const { images } = await res.json();
  const imgRes = await fetch(images[0].url);
  if (!imgRes.ok) throw new Error(`fal.ai image fetch error ${imgRes.status}`);
  return { b64: await blobToBase64(await imgRes.blob()), usage: { model, provider: "falai", image_count: 1 } };
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
  const imgPart = outParts.find((p: { inlineData?: { data?: string }; inline_data?: { data?: string } }) =>
    p?.inlineData?.data ?? p?.inline_data?.data);
  const b64 = imgPart?.inlineData?.data ?? imgPart?.inline_data?.data;
  if (!b64) throw new Error("Gemini returned no image");
  const meta = data.usageMetadata ?? {};
  return {
    b64,
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
 * provider. fal.ai ignores sourceImages (generate-only); openai + gemini compose.
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
}): Promise<ImageGenResult> {
  const { provider, model, apiKey, prompt, size, quality, boostStyle, sourceImages } = opts;
  switch (provider) {
    case "falai":  return falaiGenerate(apiKey, model, prompt, size);
    case "gemini": {
      const geminiPrompt = boostStyle ? `${prompt} — ${GEMINI_STYLE_BOOSTER}` : prompt;
      return geminiGenerate(apiKey, model, geminiPrompt, size, quality, sourceImages);
    }
    default:       return openaiGenerate(apiKey, model, prompt, size, quality, sourceImages); // openai + openai-mini
  }
}

// ── Provider resolution ─────────────────────────────────────────────────────────

const DEFAULT_MODEL: Record<string, string> = {
  openai: "gpt-image-2",
  falai:  "fal-ai/flux-2/flex",
  gemini: "gemini-3.1-flash-image",
};

export interface ResolvedImageProvider {
  provider: ImageProviderKey;
  /** Underlying provider whose key/config/pricing applies (openai-mini → openai). */
  base: "openai" | "falai" | "gemini";
  model: string;
  apiKey: string;
  isByok: boolean;
  /** Credit multiplier from provider_config (1.0 if unset). */
  imageMultiplier: number;
  /** Provider-specific quality lever from provider_config (null = provider default). */
  imageQuality: string | null;
}

/**
 * Resolve the campaign's chosen image provider into a concrete model + API key.
 * `campaignKeys`/`platformKeys` are decrypted keys keyed by underlying provider
 * (openai/falai/gemini). Returns null when no usable key exists.
 */
export function resolveImageProvider(args: {
  imageProvider: string | null | undefined;
  campaignKeys: Partial<Record<"openai" | "falai" | "gemini", string | null>>;
  platformKeys: Partial<Record<"openai" | "falai" | "gemini", string | null>>;
  providerConfigs: Partial<Record<string, { image_model?: string | null; image_multiplier?: number | null; image_quality?: string | null } | undefined>>;
  /** Client-requested OpenAI sub-model (gpt-image-1.5/2). Honored only for plain "openai". */
  requestedModel?: string | null;
}): ResolvedImageProvider | null {
  const choice = (args.imageProvider ?? "openai") as ImageProviderKey;
  const base: "openai" | "falai" | "gemini" = choice === "openai-mini" ? "openai" : (choice as "openai" | "falai" | "gemini");

  const campaignKey = args.campaignKeys[base] ?? null;
  const apiKey = campaignKey ?? args.platformKeys[base] ?? null;
  if (!apiKey) return null;

  const model = choice === "openai-mini"
    ? "gpt-image-1-mini"
    : choice === "openai" && args.requestedModel
      ? args.requestedModel
      : (args.providerConfigs[base]?.image_model ?? DEFAULT_MODEL[base]);

  return {
    provider: choice,
    base,
    model,
    apiKey,
    isByok: !!campaignKey,
    imageMultiplier: args.providerConfigs[base]?.image_multiplier ?? 1.0,
    imageQuality: args.providerConfigs[base]?.image_quality ?? null,
  };
}
