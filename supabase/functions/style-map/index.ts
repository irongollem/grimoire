import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, recordGeneration, releaseCredits, reserveCredits, reservationFailureResponse } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import { isValidGeminiAspectRatio } from "../_shared/geminiAspect.ts";
import { isValidStyleImageSize, readPngDimensions } from "../_shared/imageSize.ts";
import { isFlexibleOpenAiModel } from "../_shared/openaiImageModel.ts";
import { isPromptRejected } from "../_shared/moderation.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";

// ~9 MB binary once base64-decoded — caps the client-supplied source map image.
const MAX_SOURCE_IMAGE_B64_CHARS = 12_000_000;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WATERMARK_SUFFIX = "small 'dungeongrimoire.com' text watermark in the bottom-right corner";

const PRESET_PROMPTS: Record<string, string> = {
  playable:
    "modern illustrated dungeon map, warm candlelight color palette, clean readable encounter zones, detailed environmental dressing, fully spatially accurate, OneDnD 2024 Player's Handbook art style",
  explorer:
    "weathered field sketch on aged crinkled parchment, brown ink and pencil strokes, hand-written margin annotations, compass rose, cartographic imperfections as if drawn from memory mid-expedition",
  isometric:
    "isometric 3D dungeon cutaway, axonometric projection, painted stone walls and wooden floors, deep dramatic shadows, D&D 5e adventure module interior art style — may reinterpret room layout in 3D perspective",
  tactical:
    "tactical battle map, bold encounter zone outlines, numbered encounter areas, high-contrast surface textures, neutral gridded background, optimised for Foundry VTT and Roll20 display",
  tome:
    "medieval illuminated manuscript page, intricate decorative parchment border, gilded drop-cap details, scriptorium brown ink illustration with subtle gold leaf accents, monastic cartography style",
  woodcut:
    "woodcut print on aged paper, bold black ink lines, cross-hatching for shadows and depth, stark limited ink palette, 15th century cartographic broadside style",
};

function buildPrompt(
  presetId: string,
  mapName: string,
  mapDescription: string | null | undefined,
  suffix: string | null | undefined,
): string {
  const presetPrompt = PRESET_PROMPTS[presetId] ?? PRESET_PROMPTS["playable"];
  const parts: string[] = [];
  if (mapName) parts.push(mapName);
  if (mapDescription?.trim()) parts.push(mapDescription.trim());
  parts.push(presetPrompt);
  if (suffix?.trim()) parts.push(suffix.trim());
  parts.push(WATERMARK_SUFFIX);
  return parts.join(", ");
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });

  // Frozen accounts cannot generate — including BYOK, which skips the credit gate.
  if (await isAccountSuspended(admin, user.id)) return suspendedResponse();

  let campaign_id: string, preset_id: string, image_b64: string,
      map_name: string, map_description: string | null, prompt_suffix: string | null;

  try {
    const body = await req.json();
    campaign_id     = body.campaign_id;
    preset_id       = body.preset_id       ?? "playable";
    image_b64       = body.image_b64;
    map_name        = body.map_name        ?? "dungeon";
    map_description = body.map_description ?? null;
    prompt_suffix   = body.prompt_suffix   ?? null;
    if (!campaign_id || !image_b64) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, image_b64 }", { status: 400 });
  }

  // Bound the client-supplied source image before we base64-decode it server-side
  // (~9 MB binary). Prevents a multi-MB payload from pinning memory.
  if (image_b64.length > MAX_SOURCE_IMAGE_B64_CHARS) {
    return new Response("Source image too large", { status: 413 });
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, image_provider, openai_api_key, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled !== true) return new Response("AI is disabled for this campaign", { status: 403 });

  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaign_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return new Response("Forbidden", { status: 403 });
  }

  // BYOK is Pro-only: ignore stored campaign keys unless the owner is currently Pro.
  const ownerIsPro = await isUserPro(admin, campaign.user_id);
  async function decryptKey(enc: string | null): Promise<string | null> {
    if (!enc || !ownerIsPro) return null;
    try { return await decryptValue(enc); } catch { return null; }
  }

  const [[campaignOpenai, campaignGemini], platformKeys, providerConfigs] = await Promise.all([
    Promise.all([
      decryptKey(campaign.openai_api_key),
      decryptKey(campaign.gemini_api_key),
    ]),
    fetchPlatformKeys(admin, ["openai", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "gemini"]),
  ]);

  // Resolve the campaign's chosen image provider (openai / gemini).
  const img = resolveImageProvider({
    imageProvider: campaign.image_provider,
    campaignKeys: { openai: campaignOpenai, gemini: campaignGemini },
    platformKeys: { openai: platformKeys.openai, gemini: platformKeys.gemini },
    providerConfigs,
  });
  if (!img) {
    return new Response("No image API key configured", { status: 422 });
  }
  const isByok = img.isByok;

  // Everything that can reject the upload runs here, before the rate limit
  // and the credit reservation below: a 400 after `reserveCredits` would
  // return without releasing the hold.
  // Decode base64 PNG to bytes — the client-supplied map is restyled (edit/compose).
  let byteStr: string;
  try {
    byteStr = atob(image_b64);
  } catch {
    return new Response("image_b64 is not valid base64", { status: 400 });
  }
  const bytes = new Uint8Array(byteStr.length);
  for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
  const mapBlob = new Blob([bytes], { type: "image/png" });

  // The size requested from the provider is read from the uploaded PNG's own
  // IHDR chunk, never a client-sent field — there is no such field, so a
  // caller cannot ask for a size the image itself doesn't carry. Re-validated
  // against the resolved provider/model's own rules (the client is expected
  // to have already fit its render to them, `bake.ts`'s `fitStyleInputCanvas`)
  // so a malformed or out-of-range upload is rejected here rather than
  // forwarded to a paid provider call. Gemini has no multiple-of-16/total-pixel
  // rule of its own, only a fixed list of aspect ratios (`geminiAspect.ts`);
  // its own request resolution is the admin's `imageSize` knob regardless of
  // what was sent. The OpenAI check reads `img.model`, not just `img.base`:
  // only `gpt-image-2.5-*` takes an arbitrary size — an admin can point a
  // campaign's plain "openai" provider at an older model via
  // `provider_config`, and the client always sends a flexible-fitted image
  // for "openai" since it can't see which model that actually is.
  const dims = readPngDimensions(bytes);
  if (!dims) return new Response("image_b64 is not a valid PNG", { status: 400 });
  if (img.base === "gemini") {
    if (!isValidGeminiAspectRatio(dims.width, dims.height)) {
      return new Response(
        `Image aspect ${dims.width}x${dims.height} does not match any of Gemini's supported ratios (1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9)`,
        { status: 400 },
      );
    }
  } else if (!isFlexibleOpenAiModel(img.model)) {
    return new Response(
      `This campaign's image model (${img.model}) does not accept the AI map styler's flexible-sized input; ask an admin to use a gpt-image-2.5 model`,
      { status: 400 },
    );
  } else if (!isValidStyleImageSize(dims.width, dims.height)) {
    return new Response(
      `Image size ${dims.width}x${dims.height} is outside the accepted range (multiples of 16, 1:3..3:1, <=3840px per edge, 655,360..8,294,400 total px)`,
      { status: 400 },
    );
  }
  const size = `${dims.width}x${dims.height}`;

  const baseCost = isByok ? 0 : await fetchCreditCost(admin, "map_style_generation");
  const cost = applyMultiplier(baseCost, img.imageMultiplier);

  // Atomic affordability gate: hold the balance across the paid image call.
  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, cost, "map_style_generation");
  if (!reservation.ok) {
    return reservationFailureResponse(reservation);
  }

  const prompt = buildPrompt(preset_id, map_name, map_description, prompt_suffix);

  let imgResult: Awaited<ReturnType<typeof generateImage>>;
  try {
    imgResult = await generateImage({
      provider: img.provider, model: img.model, apiKey: img.apiKey,
      screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: "map_style" },
      prompt, size, quality: img.imageQuality, sourceImages: [mapBlob],
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    const msg = e instanceof Error ? e.message : "Image generation failed";
    // A refused prompt is the DM's to reword, not a provider outage.
    return new Response(
      JSON.stringify({ error: msg }),
      { status: isPromptRejected(e) ? 400 : 502, headers: { "Content-Type": "application/json" } },
    );
  }

  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, "map_style_generation", isByok, cost, {
    model: img.model, quality: img.imageQuality, size,
    provider: imgResult.usage.provider,
    image_count: 1,
    input_tokens:       imgResult.usage.input_tokens       || undefined,
    input_image_tokens: imgResult.usage.input_image_tokens || undefined,
    output_tokens:      imgResult.usage.output_tokens      || undefined,
  });

  // EU AI Act Art 50(2) — mark before the bytes leave this pipeline. This
  // endpoint has no server-side upload (the client uploads image_b64), so
  // the response is the last point the resolved provider/model are known.
  const prov: AiProvenance = {
    generatorType: "map_style",
    provider: imgResult.usage.provider,
    model: img.model,
    generatedAt: new Date().toISOString(),
    edited: false,
  };

  return new Response(
    JSON.stringify({ image_b64: markGeneratedImageB64(imgResult.b64, imgResult.contentType, prov) }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
