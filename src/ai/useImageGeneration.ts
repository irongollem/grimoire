import { useCampaignStore } from "@/stores/campaign";
import { supabase } from "@/lib/supabase";
import {
  uploadToBucket,
  uploadWithVariants,
  type BucketKey,
} from "@/lib/storage";
import { edgeErrorMessage } from "@/lib/edgeError";
import { b64ToBlob } from "@/ai/utils";
import { fetchImageBasePrompt } from "@/ai/systemPrompts";
import {
  buildLabelledImagePrompt,
  buildSimpleImagePrompt,
} from "@/ai/imagePrompt";
import { getImageProvider, OPENAI_IMAGE_MODEL_KEY } from "@/ai/providers";
import { logUsage } from "@/composables/useAiCredits";
import { waitForImageJob } from "@/ai/useImageJob";
import { buildAiProvenance } from "@/ai/provenance";
import { markGeneratedImageB64 } from "@edge-shared/provenance/mark.ts";
import { sniffImageFormat } from "@edge-shared/provenance/sniff.ts";

export type ImagePurpose =
  | "chronicler" | "group_portrait" | "npc_portrait" | "npc_disguise"
  | "monster" | "item" | "spell" | "faction" | "location" | "location_map"
  | "trap" | "puzzle" | "party_member" | "species" | "map_style";

interface PurposeConfig {
  bucket: BucketKey;
  size: string;
  variants: boolean;
  scene: boolean;
  labelled: boolean;
}

const PURPOSES: Record<ImagePurpose, PurposeConfig> = {
  chronicler:     { bucket: "chronicle",      size: "1024x1024", variants: false, scene: true,  labelled: false },
  group_portrait: { bucket: "chronicle",      size: "1536x1024", variants: false, scene: true,  labelled: false },
  npc_portrait:   { bucket: "npcPortraits",   size: "1024x1536", variants: true,  scene: false, labelled: true },
  npc_disguise:   { bucket: "npcPortraits",   size: "1024x1536", variants: true,  scene: false, labelled: false },
  monster:        { bucket: "monsterImages",  size: "1024x1536", variants: true,  scene: false, labelled: false },
  item:           { bucket: "itemImages",     size: "1024x1536", variants: true,  scene: false, labelled: false },
  spell:          { bucket: "spellImages",    size: "1024x1024", variants: true,  scene: false, labelled: false },
  faction:        { bucket: "factionImages",  size: "1024x1024", variants: true,  scene: false, labelled: false },
  location:       { bucket: "locationImages", size: "1024x1024", variants: true,  scene: false, labelled: false },
  location_map:   { bucket: "locationImages", size: "1024x1024", variants: true,  scene: false, labelled: false },
  trap:           { bucket: "trapImages",     size: "1024x1536", variants: true,  scene: false, labelled: false },
  puzzle:         { bucket: "puzzleImages",   size: "1024x1536", variants: true,  scene: false, labelled: false },
  party_member:   { bucket: "chronicle",      size: "1024x1536", variants: false, scene: false, labelled: true },
  species:        { bucket: "assetImages",    size: "1024x1024", variants: false, scene: false, labelled: false },
  map_style:      { bucket: "locationImages", size: "1024x1024", variants: true,  scene: false, labelled: false },
};

export interface ImageGenerationRequest {
  /** Captured at the start of the parent generation; never re-read after awaits. */
  campaignId: string;
  settingPrompt: string;
  imageProvider: string | null;
  imageModel: string;
  /** Browser-local BYOK key captured with the campaign; never sent server-side. */
  imageApiKey: string | null;
  purpose: ImagePurpose;
  /** Model-ready visual subject. The central pipeline adds style and setting. */
  subject: string;
  size?: string;
  referenceUrls?: string[];
  textDescriptions?: string[];
  /** A new browser-produced reference (currently the Cartographer canvas). */
  sourceImage?: Blob;
}

export type ImageGenerationContext = Pick<
  ImageGenerationRequest,
  "campaignId" | "settingPrompt" | "imageProvider" | "imageModel"
  | "imageApiKey"
>;

/** Snapshot campaign-owned image configuration before a parent generation awaits. */
export function captureImageGenerationContext(): ImageGenerationContext {
  const store = useCampaignStore();
  const campaign = store.activeCampaign;
  if (!campaign) throw new Error("No active campaign selected.");
  const imageProvider = campaign.image_provider ?? "openai";
  const imageApiKey = ({
    openai: store.decryptedOpenAiKey,
    "openai-mini": store.decryptedOpenAiKey,
    gemini: store.decryptedGeminiKey,
    falai: store.decryptedFalAiKey,
  } as Record<string, string | null | undefined>)[imageProvider] ?? null;
  return {
    campaignId: campaign.id,
    settingPrompt: campaign.ai_setting_prompt ?? "",
    imageProvider,
    imageApiKey,
    imageModel: imageProvider === "openai-mini"
      ? "gpt-image-1-mini"
      : (typeof localStorage !== "undefined" ? localStorage.getItem(OPENAI_IMAGE_MODEL_KEY) : null) ?? "gpt-image-2",
  };
}

const localJobs = new Map<string, Promise<string>>();

function isLocalMode(): boolean {
  return typeof localStorage !== "undefined"
    && localStorage.getItem("grimoire_key_local_mode") === "local";
}

function buildScenePrompt(subject: string, descriptions: string[], setting: string, base: string): string {
  const parts = [base, setting, "Compose a scene illustration."];
  if (descriptions.length) {
    parts.push(`Characters and creatures:\n${descriptions.map((entry) => `• ${entry}`).join("\n")}`);
    parts.push("Use references for likeness only; re-pose every subject naturally for this scene and depict each exactly once.");
  }
  parts.push(`Scene: ${subject}`);
  return parts.filter(Boolean).join("\n\n");
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Marks a local (BYOK) generation result before it's ever uploaded — EU AI
 * Act Art 50(2), write point B (context/compliance/provenance-architecture.md
 * §5). This is the ONLY place these bytes are marked: `runLocal` never
 * touches the server, so unlike the server-backed generators there is no
 * edge function to do it first. The provider's true byte format is sniffed
 * from the decoded bytes rather than assumed — OpenAI honors an explicit
 * `output_format: "webp"`, but Gemini returns PNG and fal.ai returns JPEG,
 * and marking with the wrong format-specific embedder silently no-ops.
 */
async function markLocalResult(
  purpose: ImagePurpose,
  b64: string,
  usage: { provider: string; model: string },
): Promise<string> {
  const bytes = new Uint8Array(await b64ToBlob(b64).arrayBuffer());
  const contentType = sniffImageFormat(bytes) ?? "image/webp";
  const prov = buildAiProvenance(purpose, usage.provider, usage.model);
  return markGeneratedImageB64(b64, contentType, prov);
}

async function uploadLocalResult(purpose: ImagePurpose, b64: string): Promise<{ url: string; userId: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to store generated art.");
  const config = PURPOSES[purpose];
  const blob = b64ToBlob(b64);
  if (config.variants) {
    const url = await uploadWithVariants({ bucket: config.bucket, userId: user.id, blob });
    if (!url) throw new Error("Generated image upload failed.");
    return { url, userId: user.id };
  }
  const path = `${user.id}/${purpose}-${crypto.randomUUID()}.webp`;
  const url = await uploadToBucket({ bucket: config.bucket, blob, path, contentType: "image/webp" });
  if (!url) throw new Error("Generated image upload failed.");
  return { url, userId: user.id };
}

async function recordLocalChroniclerImage(args: {
  campaignId: string;
  userId: string;
  imageUrl: string;
  prompt: string;
  size: string;
}): Promise<void> {
  const { error } = await supabase.from("chronicler_images").insert({
    campaign_id: args.campaignId,
    user_id: args.userId,
    image_url: args.imageUrl,
    prompt: args.prompt.slice(0, 500),
    size: args.size,
  });
  if (error) throw new Error(`Could not save Chronicle image: ${error.message}`);
}

async function runLocal(request: ImageGenerationRequest): Promise<string> {
  const config = PURPOSES[request.purpose];
  const [base, references] = await Promise.all([
    fetchImageBasePrompt(),
    Promise.all((request.referenceUrls ?? []).map(async (url) => {
      try {
        const response = await fetch(url);
        return response.ok ? await response.blob() : null;
      } catch {
        return null;
      }
    })),
  ]);
  if (request.sourceImage) references.push(request.sourceImage);
  const setting = request.settingPrompt;
  const prompt = config.scene
    ? buildScenePrompt(request.subject, request.textDescriptions ?? [], setting, base)
    : request.purpose === "location_map" || request.purpose === "map_style"
      ? request.subject
    : config.labelled
      ? buildLabelledImagePrompt({ base, setting, subject: request.subject })
      : buildSimpleImagePrompt({ base, setting, subject: request.subject });
  const provider = getImageProvider({
    imageProvider: request.imageProvider,
    imageModel: request.imageModel,
    apiKey: request.imageApiKey,
  });
  const { b64, usage } = references.some(Boolean) && provider.edit
    ? await provider.edit(references.filter((entry): entry is Blob => !!entry), prompt, request.size ?? config.size)
    : await provider.generate(prompt, request.size ?? config.size);
  const markedB64 = await markLocalResult(request.purpose, b64, usage);
  const { url, userId } = await uploadLocalResult(request.purpose, markedB64);
  if (request.purpose === "chronicler") {
    await recordLocalChroniclerImage({
      campaignId: request.campaignId,
      userId,
      imageUrl: url,
      prompt: request.subject,
      size: request.size ?? config.size,
    });
  }
  const reason = request.purpose === "chronicler"
    ? "chronicle_image"
    : request.purpose === "map_style"
      ? "map_style_generation"
      : "entity_image";
  logUsage({ reason, imageUsage: usage });
  return url;
}

async function startServer(request: ImageGenerationRequest): Promise<string> {
  const config = PURPOSES[request.purpose];
  const { data, error } = await supabase.functions.invoke("generate-chronicle-image", {
    body: {
      campaign_id: request.campaignId,
      purpose: request.purpose,
      subject: request.subject,
      size: request.size ?? config.size,
      portrait_urls: request.referenceUrls ?? [],
      text_descriptions: request.textDescriptions ?? [],
      source_image_b64: request.sourceImage ? await blobToBase64(request.sourceImage) : null,
      image_model: request.imageModel,
    },
  });
  if (error) throw new Error(await edgeErrorMessage(error));
  const jobId = (data as { job_id?: string } | null)?.job_id;
  if (!jobId) throw new Error("Image generator did not return a job id.");
  return jobId;
}

/** Start one image through the only frontend generation boundary. */
export async function startImageGeneration(request: ImageGenerationRequest): Promise<{ jobId: string }> {
  if (!request.subject.trim()) throw new Error("Image subject is required.");
  if (!request.campaignId) throw new Error("No campaign selected for image generation.");
  if (!isLocalMode()) return { jobId: await startServer(request) };

  const jobId = `local-${crypto.randomUUID()}`;
  const promise = runLocal(request).finally(() => localJobs.delete(jobId));
  localJobs.set(jobId, promise);
  return { jobId };
}

export function getLocalImageJob(jobId: string): Promise<string> | undefined {
  return localJobs.get(jobId);
}

/** Start and await an image while preserving a durable server job in platform mode. */
export async function generateImage(request: ImageGenerationRequest): Promise<string> {
  const { jobId } = await startImageGeneration(request);
  return jobId.startsWith("local-")
    ? localJobs.get(jobId) ?? Promise.reject(new Error("Local image job not found."))
    : waitForImageJob(jobId);
}
