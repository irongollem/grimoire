import { useCampaignStore } from "@/stores/campaign";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { waitForImageJob } from "@/ai/useImageJob";
import { blobToBase64 } from "@/lib/blobToBase64";

export type ImagePurpose =
  | "chronicler" | "group_portrait" | "npc_portrait" | "npc_disguise"
  | "monster" | "item" | "spell" | "faction" | "location" | "location_map"
  | "trap" | "puzzle" | "party_member" | "species" | "dungeon_feature" | "deity";

/** The picture size the server renders each purpose at unless a caller asks for another. */
const PURPOSE_SIZES: Record<ImagePurpose, string> = {
  chronicler: "1024x1024",
  group_portrait: "1536x1024",
  npc_portrait: "1024x1536",
  npc_disguise: "1024x1536",
  monster: "1024x1536",
  item: "1024x1536",
  spell: "1024x1024",
  faction: "1024x1024",
  location: "1024x1024",
  location_map: "1024x1024",
  trap: "1024x1536",
  puzzle: "1024x1536",
  party_member: "1024x1536",
  species: "1024x1024",
  dungeon_feature: "1024x1536",
  deity: "1024x1536",
};

export interface ImageGenerationRequest {
  /** Captured at the start of the parent generation; never re-read after awaits. */
  campaignId: string;
  purpose: ImagePurpose;
  /** Model-ready visual subject. The central pipeline adds style and setting. */
  subject: string;
  size?: string;
  referenceUrls?: string[];
  textDescriptions?: string[];
  /** A new browser-produced reference (currently the Cartographer canvas). */
  sourceImage?: Blob;
  /** Chronicler only: the saved note holding this job's pendingImage anchor.
   * The server records it as the job's completion target and swaps the
   * anchor into the note's content when the render finishes (#614). Absent
   * for unsaved notes — the client resolver alone handles those. */
  noteId?: string | null;
}

export type ImageGenerationContext = Pick<ImageGenerationRequest, "campaignId">;

export class NoActiveCampaignError extends Error {
  constructor() {
    super("No active campaign selected.");
    this.name = "NoActiveCampaignError";
  }
}

/** What a generator shows when capturing its context failed: the no-campaign sentence only for that case, else the error's own message. */
export function captureFailureMessage(e: unknown): string {
  if (e instanceof NoActiveCampaignError) return e.message;
  return e instanceof Error ? e.message : "Generation failed";
}

/** Snapshot campaign-owned image configuration before a parent generation awaits. */
export async function captureImageGenerationContext(): Promise<ImageGenerationContext> {
  const store = useCampaignStore();
  const campaign = store.activeCampaign;
  if (!campaign) throw new NoActiveCampaignError();
  return { campaignId: campaign.id };
}

async function startServer(request: ImageGenerationRequest): Promise<string> {
  const { data, error } = await supabase.functions.invoke("generate-chronicle-image", {
    body: {
      campaign_id: request.campaignId,
      purpose: request.purpose,
      subject: request.subject,
      size: request.size ?? PURPOSE_SIZES[request.purpose],
      portrait_urls: request.referenceUrls ?? [],
      text_descriptions: request.textDescriptions ?? [],
      source_image_b64: request.sourceImage ? await blobToBase64(request.sourceImage) : null,
      note_id: request.noteId ?? null,
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
  return { jobId: await startServer(request) };
}

/** Start an image and await its durable server job. */
export async function generateImage(request: ImageGenerationRequest): Promise<string> {
  const { jobId } = await startImageGeneration(request);
  return waitForImageJob(jobId);
}
