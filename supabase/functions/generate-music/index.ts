import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchCreditCost, releaseCredits, reserveCredits, reservationFailureResponse } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import {
  claimGenerationJob,
  createGenerationJob,
  failGenerationJob,
  finalizeMusicGenerationJob,
  findGenerationJob,
  persistGenerationArtifact,
  type GenerationJob,
} from "../_shared/aiGenerationJob.ts";
import { uploadWithRetry } from "../_shared/storage-upload.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type SoundCategory = "ambient" | "music" | "effects" | "misc";

interface MusicJobRequest {
  campaignId: string;
  userId: string;
  style: string;
  model: string;
  lyrics?: string;
  name: string;
  category: SoundCategory;
  pageId: string | null;
}

interface MusicRuntimeRequest extends MusicJobRequest {
  apiKey: string;
}

function audioExtension(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("flac")) return "flac";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  return "mp3";
}

function requestFromJob(job: GenerationJob): MusicJobRequest {
  const request = job.request_json;
  const category = request.category;
  if (
    typeof request.style !== "string" || typeof request.model !== "string" ||
    typeof request.name !== "string" || !["ambient", "music", "effects", "misc"].includes(String(category))
  ) throw new Error("Music job has an invalid durable request.");
  return {
    campaignId: job.campaign_id,
    userId: job.user_id,
    style: request.style,
    model: request.model,
    lyrics: typeof request.lyrics === "string" ? request.lyrics : undefined,
    name: request.name,
    category: category as SoundCategory,
    pageId: typeof request.page_id === "string" ? request.page_id : null,
  };
}

/**
 * This can safely run again after a crash. The database transaction creates the
 * sound with the job id and settles billing/readiness together, so no usable
 * sound can escape its successful charge.
 */
async function finalizeMusicJob(job: GenerationJob): Promise<void> {
  // Validate the saved snapshot before handing it to the SQL finalizer. This
  // protects recovery from malformed legacy rows without ever using HTTP input.
  requestFromJob(job);
  await finalizeMusicGenerationJob(admin, job.id);
}

/** Provider work happens only after the worker wins the queued-job claim. */
async function runMusicGeneration(jobId: string, request: MusicRuntimeRequest): Promise<void> {
  let artifactPersisted = false;
  try {
    const claimed = await claimGenerationJob(admin, jobId);
    if (!claimed) return;

    const prompt = request.lyrics?.trim()
      ? `${request.lyrics.trim()}\n\nMusical style: ${request.style}`
      : request.style;
    const lyriaRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": request.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["AUDIO", "TEXT"] },
        }),
      },
    );
    if (!lyriaRes.ok) {
      const body = await lyriaRes.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? "Music generation failed");
    }

    const lyriaJson = await lyriaRes.json() as {
      candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
    };
    const audioPart = (lyriaJson.candidates?.[0]?.content?.parts ?? []).find((part) => part.inlineData?.data);
    const encodedAudio = audioPart?.inlineData?.data;
    if (!encodedAudio) throw new Error("No audio data in Lyria response.");

    const mimeType = audioPart?.inlineData?.mimeType ?? "audio/mpeg";
    const bytes = Uint8Array.from(atob(encodedAudio), (char) => char.charCodeAt(0));
    const storagePath = `${request.userId}/ai/${jobId}.${audioExtension(mimeType)}`;
    await uploadWithRetry(admin, "sounds", storagePath, bytes, mimeType);
    const { data: publicUrl } = admin.storage.from("sounds").getPublicUrl(storagePath);

    // This is deliberately before the sound row and charge. A later crash can
    // resume finalization without another paid Lyria request.
    await persistGenerationArtifact(admin, jobId, {
      url: publicUrl.publicUrl,
      storage_path: storagePath,
      mime_type: mimeType,
      metadata: { model: request.model, provider: "google" },
    });
    artifactPersisted = true;

    // Fetch by primary key because finalization needs the persisted artifact.
    const { data: settlingJob, error: jobError } = await admin
      .from("ai_generation_jobs")
      .select("id,user_id,campaign_id,generator_type,status,request_json,artifact_url,artifact_storage_path,artifact_mime_type,artifact_metadata,billing_context")
      .eq("id", jobId)
      .single();
    if (jobError || !settlingJob) throw new Error(`Could not reload music job: ${jobError?.message ?? "not found"}`);
    await finalizeMusicJob(settlingJob as GenerationJob);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Music generation failed";
    console.error("Lyria music generation failed:", error);
    // Once an artifact exists, retain its settling state. A request replay can
    // finalize the same sound id without repeating the provider call.
    if (!artifactPersisted) {
      await failGenerationJob(admin, jobId, message).catch((jobError) =>
        console.error("Could not record music generation failure:", jobError),
      );
    }
  }
}

function queueMusicWorker(jobId: string, request: MusicRuntimeRequest): void {
  // @ts-ignore EdgeRuntime is a Deno Deploy global, not in Deno's type defs.
  EdgeRuntime.waitUntil(runMusicGeneration(jobId, request));
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });
  if (await isAccountSuspended(admin, user.id)) return suspendedResponse();

  let campaignId: string, style: string, model: string, lyrics: string | undefined, soundName: string;
  let category: SoundCategory, pageId: string | null, requestId: string;
  try {
    const body = await req.json();
    campaignId = body.campaign_id;
    style = body.style;
    model = body.model ?? "lyria-3-clip-preview";
    lyrics = body.lyrics ?? undefined;
    soundName = typeof body.sound_name === "string" ? body.sound_name.trim() : "";
    category = body.category;
    pageId = typeof body.page_id === "string" ? body.page_id : null;
    requestId = typeof body.request_id === "string" ? body.request_id : "";
    if (!campaignId || !style || !soundName || !requestId || requestId.length > 128 ||
      !["ambient", "music", "effects", "misc"].includes(category)) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need request_id, campaign_id, style, sound_name and category", { status: 400 });
  }

  const { data: campaign } = await admin.from("campaigns")
    .select("id, user_id, ai_enabled, gemini_api_key").eq("id", campaignId).maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled !== true) return new Response("AI is disabled for this campaign", { status: 403 });
  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin.from("campaign_members").select("role")
      .eq("campaign_id", campaignId).eq("user_id", user.id).maybeSingle();
    if (!membership) return new Response("Forbidden", { status: 403 });
  }
  if (pageId) {
    const { data: page } = await admin.from("soundboard_pages").select("id")
      .eq("id", pageId).eq("campaign_id", campaignId).maybeSingle();
    if (!page) return new Response("Soundboard page not found", { status: 404 });
  }

  const existing = await findGenerationJob(admin, user.id, "music", requestId);
  if (existing) {
    if (existing.campaign_id !== campaignId) return new Response("request_id belongs to another campaign", { status: 409 });
    if (existing.status === "settling") {
      // No key required: only writes the idempotent sound row and settles the durable job.
      // @ts-ignore EdgeRuntime is a Deno Deploy global, not in Deno's type defs.
      EdgeRuntime.waitUntil(finalizeMusicJob(existing).catch((error) => console.error("Could not resume music finalization:", error)));
    }
    if (existing.status !== "queued") {
      return new Response(JSON.stringify({ job_id: existing.id }), { headers: { "Content-Type": "application/json" } });
    }
  }
  // A queued retry must execute exactly the original durable snapshot. The
  // incoming body is only used for brand-new work, never to mutate its billing
  // or provider request after an idempotency-key retry.
  const durableRequest: MusicJobRequest = existing
    ? requestFromJob(existing)
    : { campaignId, userId: user.id, style, model, lyrics, name: soundName, category, pageId };

  const ownerIsPro = await isUserPro(admin, campaign.user_id);
  const [campaignGemini, platformKeys, geminiProviderRow] = await Promise.all([
    (ownerIsPro && campaign.gemini_api_key) ? decryptValue(campaign.gemini_api_key).catch(() => null) : Promise.resolve(null),
    fetchPlatformKeys(admin, ["gemini"]),
    admin.from("provider_config").select("audio_enabled, audio_multiplier").eq("provider", "gemini").maybeSingle()
      .then((r) => r.data as { audio_enabled: boolean; audio_multiplier: number | null } | null),
  ]);
  // A queued retry keeps the original billing lane. In particular, it must
  // never fall back from a vanished BYOK key to a platform key while retaining
  // its zero-cost reservation context.
  const isByok = existing ? existing.billing_context.is_byok === true : !!campaignGemini;
  if (!isByok && !geminiProviderRow?.audio_enabled) {
    if (existing) {
      await failGenerationJob(admin, existing.id, "Platform music generation was disabled before this queued request could start.");
    }
    return new Response(JSON.stringify({ error: "Music generation is not enabled on this platform. Contact your admin." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  const geminiKey = isByok ? campaignGemini : platformKeys.gemini ?? null;
  if (!geminiKey) {
    if (existing) {
      await failGenerationJob(admin, existing.id, "The API key for this queued music generation is no longer available.");
    }
    return new Response(JSON.stringify({ error: "No Gemini API key configured. Add one in Campaign Settings → AI, or ask your admin to configure a platform key." }), { status: 422, headers: { "Content-Type": "application/json" } });
  }

  const generationType = durableRequest.model === "lyria-3-pro-preview" ? "music_full_song" : "music_clip";
  const audioCost = (isByok ? 0 : await fetchCreditCost(admin, generationType)) * (geminiProviderRow?.audio_multiplier ?? 1);
  let job = existing;
  if (!job) {
    if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "Content-Type": "application/json" } });
    }
    const reservation = await reserveCredits(admin, user.id, audioCost, generationType);
    if (!reservation.ok) return reservationFailureResponse(reservation);
    try {
      const created = await createGenerationJob(admin, {
        user_id: user.id,
        campaign_id: campaignId,
        kind: "music",
        request: { style, model, lyrics: lyrics ?? null, name: soundName, category, page_id: pageId },
        billing: {
          reservation_ids: reservation.ids,
          generation_type: generationType,
          cost: audioCost,
          is_byok: isByok,
          log: { model, provider: "google", image_count: 1 },
        },
        idempotency_key: requestId,
        stale_after: new Date(Date.now() + 15 * 60 * 1_000).toISOString(),
      });
      job = created.job;
      if (!created.created) await releaseCredits(admin, reservation.ids);
    } catch (error) {
      await releaseCredits(admin, reservation.ids);
      console.error("Could not queue music generation:", error);
      return new Response(JSON.stringify({ error: "Could not queue music generation" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  queueMusicWorker(job.id, {
    ...durableRequest,
    apiKey: geminiKey,
  });
  return new Response(JSON.stringify({ job_id: job.id }), { headers: { "Content-Type": "application/json" } });
}));
