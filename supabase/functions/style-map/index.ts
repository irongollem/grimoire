import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, sizeMultiplier, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { isValidGeminiAspectRatio } from "../_shared/geminiAspect.ts";
import { isValidStyleImageSize, readPngDimensions, styleChargeSize } from "../_shared/imageSize.ts";
import { OPENAI_IMAGE_SUNBURST, isFlexibleOpenAiModel } from "../_shared/platformModels.ts";
import { isPromptRejected } from "../_shared/moderation.ts";
import { buildMapStylePrompt } from "../_shared/mapStylePrompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";

// ~9 MB binary once base64-decoded — caps the client-supplied source map image.
const MAX_SOURCE_IMAGE_B64_CHARS = 12_000_000;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface StyleMapCampaign extends BaseCampaign {
  image_provider: string | null;
}

const optionalString = (v: unknown) => (typeof v === "string" && v ? v : null);

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const campaign_id = optionalString(body?.campaign_id);
  const image_b64 = optionalString(body?.image_b64);
  if (!body || !campaign_id || !image_b64) {
    return jsonError(400, "invalid_body", "Need { campaign_id, image_b64 }.");
  }
  const preset_id = optionalString(body.preset_id) ?? "playable";
  const map_name = optionalString(body.map_name) ?? "dungeon";
  const map_description = optionalString(body.map_description);
  const prompt_suffix = optionalString(body.prompt_suffix);

  // Bound the client-supplied source image before we base64-decode it server-side
  // (~9 MB binary). Prevents a multi-MB payload from pinning memory.
  if (image_b64.length > MAX_SOURCE_IMAGE_B64_CHARS) {
    return jsonError(413, "image_too_large", "The source image is too large.");
  }

  // DMs only: no player surface calls this, and it spends the campaign's
  // credits (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign<StyleMapCampaign>(admin, campaign_id, user.id, { columns: ["image_provider"] });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "gemini"]),
  ]);

  // Resolve the campaign's chosen image provider (openai / gemini).
  const img = resolveImageProvider({
    imageProvider: campaign.image_provider,
    platformKeys: { openai: platformKeys.openai, gemini: platformKeys.gemini },
    providerConfigs,
    // Admin → Providers' map styler model (sunburst; see migration 20261004230642).
    surface: "map_style",
  });
  if (!img) {
    return jsonError(422, "no_image_provider", "No image API key is configured.");
  }

  // Everything that can reject the upload runs here, before the rate limit
  // and the credit hold below, so a bad upload never reserves anything.
  // Decode base64 PNG to bytes — the client-supplied map is restyled (edit/compose).
  let byteStr: string;
  try {
    byteStr = atob(image_b64);
  } catch {
    return jsonError(400, "invalid_image", "image_b64 is not valid base64.");
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
  // only `gpt-image-2.5-*` / `gpt-image-2.6-*` take an arbitrary size — an admin can point a
  // campaign's plain "openai" provider at an older model via
  // `provider_config`, and the client always sends a flexible-fitted image
  // for "openai" since it can't see which model that actually is.
  const dims = readPngDimensions(bytes);
  if (!dims) return jsonError(400, "invalid_image", "image_b64 is not a valid PNG.");
  if (img.base === "gemini") {
    if (!isValidGeminiAspectRatio(dims.width, dims.height)) {
      return jsonError(
        400, "invalid_image_size",
        `Image aspect ${dims.width}x${dims.height} does not match any of Gemini's supported ratios (1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9).`,
      );
    }
  } else if (!isFlexibleOpenAiModel(img.model)) {
    return jsonError(
      400, "image_model_unsupported",
      `This campaign's image model (${img.model}) does not accept the AI map styler's flexible-sized input; ask an admin to use one that accepts any size, such as ${OPENAI_IMAGE_SUNBURST}.`,
    );
  } else if (!isValidStyleImageSize(dims.width, dims.height)) {
    return jsonError(
      400, "invalid_image_size",
      `Image size ${dims.width}x${dims.height} is outside the accepted range (multiples of 16, 1:3..3:1, <=3840px per edge, 655,360..8,294,400 total px).`,
    );
  }
  const size = `${dims.width}x${dims.height}`;

  const baseCost = await fetchCreditCost(admin, "map_style_generation");
  // By area, like every image generator; see styleChargeSize.
  const cost = wholeCredits(
    applyMultiplier(baseCost, img.imageMultiplier) * sizeMultiplier(styleChargeSize(dims.width, dims.height)),
  );

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // Everything that can be computed before paying is computed before the hold, so nothing after the reserve can
  // throw outside it.
  const prompt = buildMapStylePrompt(preset_id, map_name, map_description, prompt_suffix);
  const quality = await resolveImageQuality(admin, "map_style_generation", img);

  // Hold the balance across the paid image call.
  return withCreditHold(admin, { payerId: user.id, reason: "map_style_generation", cost, report }, async (hold) => {
    let imgResult: Awaited<ReturnType<typeof generateImage>>;
    try {
      imgResult = await generateImage({
        provider: img.provider, model: img.model, apiKey: img.apiKey,
        screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: "map_style" },
        prompt, size, quality, sourceImages: [mapBlob],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Image generation failed";
      // A refused prompt is the DM's to reword, not a provider outage.
      return isPromptRejected(e) ? jsonError(400, "prompt_rejected", msg) : jsonError(502, "generation_failed", msg);
    }

    hold.charge("map_style_generation", {
      cost,
      log: {
        model: img.model, quality, size,
        provider: imgResult.usage.provider,
        image_count: 1,
        input_tokens:       imgResult.usage.input_tokens       || undefined,
        input_image_tokens: imgResult.usage.input_image_tokens || undefined,
        output_tokens:      imgResult.usage.output_tokens      || undefined,
      },
    });

    // EU AI Act Art 50(2) — mark before the bytes leave this pipeline. This
    // endpoint has no server-side upload (the client uploads image_b64), so
    // the response is the last point the resolved provider/model are known.
    // A failure throws, and the hold then writes the charge as a free line.
    const prov: AiProvenance = {
      generatorType: "map_style",
      provider: imgResult.usage.provider,
      model: img.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };
    return json({ image_b64: markGeneratedImageB64(imgResult.b64, imgResult.contentType, prov) });
  });
}));
