// The provider side of painting a map the AI table made (#1021 row 17): the same styler, price and rules as the
// `style-map` function (resolve the provider, validate the size the styler accepts, hold the credits, mark the result
// as AI), called with the plain picture drawn from the plan. The rules of what is painted and when it is used are in
// `mapMakeIo.ts`; this file is only the binding, so it holds no logic of its own to test beyond what those functions do.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { applyMultiplier, fetchProviderConfigs } from "../_shared/provider-config.ts";
import { fetchCreditCost, sizeMultiplier, wholeCredits } from "../_shared/credits.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { isValidGeminiAspectRatio } from "../_shared/geminiAspect.ts";
import { isValidStyleImageSize, styleChargeSize } from "../_shared/imageSize.ts";
import { isFlexibleOpenAiModel } from "../_shared/platformModels.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { markGeneratedImage } from "../_shared/provenance/mark.ts";
import { registerImageProvenance } from "../_shared/provenance/register.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { publicUrlFor, uploadWithRetry } from "../_shared/storage-upload.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import encodeWebp from "@jsquash/webp/encode";
import type { PlanPicture } from "../_shared/planPicture.ts";
import { storable } from "../_shared/storableImage.ts";
import { adoptPicture, type PaintDeps, type Painted, type Painter } from "./mapMakeIo.ts";

export const MAP_BUCKET = "location-images";

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" };

/** Uploads bytes under the user's own folder and answers the public URL (CDN-fronted, like every other writer). */
export async function uploadMapPicture(admin: SupabaseClient, userId: string, bytes: Uint8Array, contentType: string): Promise<{ url: string; path: string }> {
  const extension = EXTENSIONS[contentType];
  if (extension === undefined) throw new Error(`A map picture cannot be stored as ${contentType}`);
  const path = `${userId}/map-${crypto.randomUUID()}.${extension}`;
  await uploadWithRetry(admin, MAP_BUCKET, path, bytes, contentType);
  return { url: publicUrlFor(admin, MAP_BUCKET, path), path };
}

/**
 * The plain picture as the buckets take it: lossless WebP (the image buckets accept WebP and JPEG, never PNG, and a
 * plan of flat colours and sharp walls is what lossy JPEG smears). Code-drawn, so it carries no AI mark.
 */
export async function uploadPlainMapPicture(admin: SupabaseClient, userId: string, picture: PlanPicture): Promise<string> {
  // Deno has no ImageData constructor; the encoder reads only these four fields of the one it is given.
  const image = { data: picture.rgba, width: picture.width, height: picture.height, colorSpace: "srgb" } as ImageData;
  const webp = await encodeWebp(image, { lossless: 1 });
  return (await uploadMapPicture(admin, userId, new Uint8Array(webp), "image/webp")).url;
}

export interface PaintBinding {
  admin: SupabaseClient;
  userId: string;
  campaignId: string;
  placeId: string;
  drawingId: string;
  plainUrl: string;
  decrypt: (ciphertext: string) => Promise<string>;
  report: (error: unknown) => void;
}

export function makePaintDeps(b: PaintBinding): PaintDeps {
  const { admin, userId } = b;
  return {
    async painter(dims): Promise<Painter | null> {
      // The turn was admitted by `accountRefusal`, but painting runs after it, on its own clock: ask again, failing closed.
      if (await generationRefusal(admin, userId, { failClosed: true }) !== null) return null;
      const { data: campaign, error } = await admin.from("campaigns").select("id, user_id, image_provider").eq("id", b.campaignId).maybeSingle();
      if (error) throw error;
      if (campaign === null) return null;
      const [keys, platformKeys, providerConfigs] = await Promise.all([
        loadCampaignKeys(admin, campaign as { id: string; user_id: string }, b.decrypt),
        fetchPlatformKeys(admin, ["openai", "gemini"]),
        fetchProviderConfigs(admin, ["openai", "gemini"]),
      ]);
      const img = resolveImageProvider({
        imageProvider: campaign.image_provider as string | null,
        campaignKeys: { openai: keys.openai, gemini: keys.gemini },
        platformKeys: { openai: platformKeys.openai, gemini: platformKeys.gemini },
        providerConfigs,
        surface: "map_style",
      });
      if (img === null) return null;
      // The sizes the styler accepts, checked as `style-map` checks them, so a paid call is never forwarded to be refused.
      const sizeOk = img.base === "gemini"
        ? isValidGeminiAspectRatio(dims.width, dims.height)
        : isFlexibleOpenAiModel(img.model) && isValidStyleImageSize(dims.width, dims.height);
      if (!sizeOk) return null;
      const size = `${dims.width}x${dims.height}`;
      const baseCost = img.isByok ? 0 : await fetchCreditCost(admin, "map_style_generation");
      const cost = wholeCredits(applyMultiplier(baseCost, img.imageMultiplier) * sizeMultiplier(styleChargeSize(dims.width, dims.height)));
      const quality = await resolveImageQuality(admin, "map_style_generation", img);
      return {
        cost,
        isByok: img.isByok,
        async generate(prompt, source): Promise<Painted> {
          const result = await generateImage({
            provider: img.provider, model: img.model, apiKey: img.apiKey,
            screening: { apiKey: img.moderationKey, admin, userId, generationType: "map_style" },
            prompt, size, quality, sourceImages: [source],
          });
          const provenance: AiProvenance = { generatorType: "map_style", provider: result.usage.provider, model: img.model, generatedAt: new Date().toISOString(), edited: false };
          const stored = await storable(Uint8Array.from(atob(result.b64), (c) => c.charCodeAt(0)), result.contentType);
          return {
            // Marked in the format it is stored in, so the mark is in the file a reader opens.
            bytes: markGeneratedImage(stored.bytes, stored.contentType, provenance),
            contentType: stored.contentType,
            provenance,
            log: {
              model: img.model, quality, size, provider: result.usage.provider, image_count: 1,
              input_tokens: result.usage.input_tokens || undefined,
              input_image_tokens: result.usage.input_image_tokens || undefined,
              output_tokens: result.usage.output_tokens || undefined,
            },
          };
        },
      };
    },

    async withHold(painter, work): Promise<boolean> {
      const response = await withCreditHold(admin, { payerId: userId, reason: "map_style_generation", cost: painter.cost, report: b.report }, async (hold) => {
        await work((log) => hold.charge("map_style_generation", { cost: painter.cost, isByok: painter.isByok, log }));
        return new Response(null, { status: 204 });
      });
      return response.ok;
    },

    async store(painted): Promise<string> {
      const { url, path } = await uploadMapPicture(admin, userId, painted.bytes, painted.contentType);
      // The mark inside the file is the disclosure of record; a registry row that could not be written must not waste a paid picture.
      try {
        await registerImageProvenance(admin, MAP_BUCKET, path, userId, painted.provenance);
      } catch (error) {
        console.error(`agent-turn: registering the painted map's provenance failed (${path}):`, error);
      }
      return url;
    },

    adopt: (url) => adoptPicture(admin, { placeId: b.placeId, drawingId: b.drawingId, plainUrl: b.plainUrl }, url),
  };
}
