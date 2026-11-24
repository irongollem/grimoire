import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs } from "../_shared/provider-config.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { settleHandedOff, withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { callText, resolveTextProvider, NO_TEXT_PROVIDER_MESSAGE, type ResolvedTextProvider } from "../_shared/textGen.ts";
import {
  buildStructureMessage,
  MUSIC_PROMPT_MAX_CHARS,
  MUSIC_STRUCTURE_SYSTEM,
  type MusicLengthSeconds,
  type MusicMention,
  type MusicVocals,
} from "../_shared/musicPrompt.ts";
import {
  claimGenerationJob,
  createGenerationJob,
  failGenerationJob,
  finalizeMusicGenerationJob,
  findGenerationJob,
  persistGenerationArtifact,
  recordGenerationJobMetadata,
  type GenerationJob,
} from "../_shared/aiGenerationJob.ts";
import { uploadWithRetry, publicUrlFor } from "../_shared/storage-upload.ts";
import {
  LYRIA_INTERACTIONS_URL,
  LYRIA_MAX_IMAGES,
  buildLyriaRequest,
  extractLyriaAudio,
  audioExtension,
  normalizeImageMime,
  type LyriaImage,
} from "../_shared/lyria.ts";
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { base64FromBytes as bytesToBase64 } from "../_shared/base64.ts";

/**
 * Music generation, now two AI steps in one durable job (25 Sep 2026): a text
 * model expands the DM's request into a complete Lyria prompt (structuring —
 * see _shared/musicPrompt.ts's top comment for why this moved server-side),
 * then Lyria 3.5 generates the audio from that prompt. Both steps run inside
 * the same background worker and share the single `music_track` credit
 * charge — the structuring call's own provider cost rides along on it rather
 * than being billed separately, the same way Lyria's own per-song price
 * already bundles whatever the model actually costs to run.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type SoundCategory = "ambient" | "music" | "effects";

// Validation ceilings for the DM's structuring inputs.
const MAX_DESCRIPTION_CHARS = 4000;
const MAX_LYRICS_CHARS = 2200;
const MAX_MENTIONS = 20;
const MAX_MENTION_LABEL_CHARS = 200;
const MAX_MENTION_DESCRIPTION_CHARS = 600;
const MUSIC_LENGTHS: MusicLengthSeconds[] = [60, 120, 180];
const MUSIC_VOCALS: MusicVocals[] = ["instrumental", "choir", "vocals"];

interface MusicJobRequest {
  campaignId: string;
  userId: string;
  description: string;
  lengthSeconds: MusicLengthSeconds;
  vocals: MusicVocals;
  lyrics: string | null;
  mentions: MusicMention[];
  /**
   * A complete Lyria prompt the DM wrote or edited — sent as written, with no
   * structuring step. Set when Google refused a structured prompt and the DM
   * reworded it (see the worker's comment on recording the prompt).
   */
  prompt: string | null;
  model: string;
  name: string;
  category: SoundCategory;
  /** Up to LYRIA_MAX_IMAGES storage/CDN URLs Lyria composes alongside the prompt. */
  imageUrls: string[];
}

interface MusicRuntimeRequest extends MusicJobRequest {
  apiKey: string;
  text: ResolvedTextProvider;
  textModel: string | null;
}

function isValidMention(m: unknown): m is MusicMention {
  if (typeof m !== "object" || m === null) return false;
  const label = (m as Record<string, unknown>).label;
  const description = (m as Record<string, unknown>).description;
  return typeof label === "string" && (description === null || typeof description === "string");
}

function requestFromJob(job: GenerationJob): MusicJobRequest {
  const request = job.request_json;
  const category = request.category;
  const imageUrls = request.image_urls;
  const lengthSeconds = request.length_seconds;
  const vocals = request.vocals;
  const mentions = request.mentions;
  const lyrics = request.lyrics;
  // Absent on jobs queued before the DM could edit a prompt; null means structure it.
  const prompt = request.prompt ?? null;
  if (
    typeof request.description !== "string" || typeof request.model !== "string" ||
    typeof request.name !== "string" || !["ambient", "music", "effects"].includes(String(category)) ||
    !MUSIC_LENGTHS.includes(Number(lengthSeconds) as MusicLengthSeconds) ||
    !MUSIC_VOCALS.includes(String(vocals) as MusicVocals) ||
    (lyrics !== null && typeof lyrics !== "string") ||
    (prompt !== null && (typeof prompt !== "string" || !prompt.trim() || prompt.length > MUSIC_PROMPT_MAX_CHARS)) ||
    !Array.isArray(mentions) || !mentions.every(isValidMention) ||
    // There are no old jobs to be compatible with — image_urls is required, always an
    // array, and re-validated here because a durable snapshot can be re-executed on retry.
    !Array.isArray(imageUrls) || !imageUrls.every((url) => typeof url === "string" && isSafeStorageUrl(url))
  ) throw new Error("Music job has an invalid durable request.");
  return {
    campaignId: job.campaign_id,
    userId: job.user_id,
    description: request.description,
    lengthSeconds: lengthSeconds as MusicLengthSeconds,
    vocals: vocals as MusicVocals,
    lyrics: lyrics as string | null,
    mentions: mentions as MusicMention[],
    prompt: prompt as string | null,
    model: request.model,
    name: request.name,
    category: category as SoundCategory,
    imageUrls: imageUrls as string[],
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

const MAX_LYRIA_IMAGE_BYTES = 10 * 1024 * 1024;


/**
 * Fetch and validate one Lyria image input. The URL was already checked with
 * isSafeStorageUrl before this runs (at request time, and again from the
 * durable snapshot on a retry) — this only validates what the fetch itself
 * returns: a successful response, an accepted content type, and a size under
 * MAX_LYRIA_IMAGE_BYTES (checked against both the Content-Length header, when
 * present, and the actual bytes received).
 */
async function fetchLyriaImage(url: string): Promise<LyriaImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not read an attached image.");

  const mimeType = normalizeImageMime(res.headers.get("content-type"));
  if (!mimeType) throw new Error("Could not read an attached image.");

  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_LYRIA_IMAGE_BYTES) throw new Error("Could not read an attached image.");

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_LYRIA_IMAGE_BYTES) throw new Error("Could not read an attached image.");

  return { mimeType, data: bytesToBase64(bytes) };
}

/** Provider work happens only after the worker wins the queued-job claim. */
async function runMusicGeneration(jobId: string, request: MusicRuntimeRequest): Promise<void> {
  let artifactPersisted = false;
  try {
    const claimed = await claimGenerationJob(admin, jobId);
    if (!claimed) return;

    // Never skip an attached image silently — the DM asked for it and would
    // otherwise get music that quietly ignored what they attached.
    let images: LyriaImage[];
    try {
      images = await Promise.all(request.imageUrls.map(fetchLyriaImage));
    } catch {
      throw new Error("Could not read an attached image.");
    }

    // Step 1: expand the DM's request into a complete Lyria prompt with a
    // text model — unless the DM supplied the prompt themselves, which is
    // sent exactly as written. This used to run in the browser via a
    // provider that threw for every platform-credit DM (see this
    // file's top comment) — deliberately NO fallback to a hand-composed
    // prompt here. A silent downgrade is exactly what hid that bug for four
    // months, so a failed structuring step fails the whole job instead.
    let structuredPrompt: string;
    if (request.prompt) {
      structuredPrompt = request.prompt.trim();
    } else {
      const { data: promptRow, error: promptError } = await admin
        .from("ai_system_prompts").select("content").eq("generator_type", "music_structure").maybeSingle();
      if (promptError) throw promptError;
      const structureSystem = promptRow?.content ?? MUSIC_STRUCTURE_SYSTEM;
      const structureMessage = buildStructureMessage({
        title: request.name,
        description: request.description,
        lengthSeconds: request.lengthSeconds,
        vocals: request.vocals,
        lyrics: request.lyrics ?? undefined,
        mentions: request.mentions,
        imageCount: request.imageUrls.length,
      });

      try {
        const textResult = await callText({
          text: request.text,
          model: request.textModel,
          system: structureSystem,
          user: structureMessage,
          outputFormat: "text",
        });
        structuredPrompt = textResult.content.trim();
        if (!structuredPrompt) throw new Error("Structuring model returned an empty prompt.");
      } catch (e) {
        console.error("Music prompt structuring failed:", e);
        throw new Error("Could not prepare the music prompt.");
      }
    }

    // Record the prompt before Lyria sees it, so it survives a refusal. Google
    // screens the text for "sensitive words" and answers only with that
    // phrase; without the prompt on the failed job the DM cannot see what
    // tripped it, only that something did (28 Sep 2026: a song about an NPC,
    // with nothing but her name and portrait to go on, was refused once and
    // passed on retry, and nobody could say why). The form hands it back to
    // be reworded.
    await recordGenerationJobMetadata(admin, jobId, {
      model: request.model,
      provider: "google",
      prompt: structuredPrompt,
    });

    // Step 2: Lyria generates the audio from the structured prompt. Images
    // (if any) ride alongside it in the same Interactions API call.
    const lyriaRes = await fetch(LYRIA_INTERACTIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": request.apiKey },
      body: JSON.stringify(buildLyriaRequest(request.model, structuredPrompt, images)),
    });
    if (!lyriaRes.ok) {
      const body = await lyriaRes.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? "Music generation failed");
    }

    const lyriaJson = await lyriaRes.json();
    const audio = extractLyriaAudio(lyriaJson);
    if (!audio) throw new Error("No audio data in Lyria response.");

    const mimeType = audio.mimeType;
    const bytes = Uint8Array.from(atob(audio.data), (char) => char.charCodeAt(0));
    const storagePath = `${request.userId}/ai/${jobId}.${audioExtension(mimeType)}`;
    await uploadWithRetry(admin, "sounds", storagePath, bytes, mimeType);
    // publicUrlFor, not getPublicUrl: `sounds` is CDN-fronted (#577), and
    // building the origin URL here kept every generated track off the CDN — the
    // one bucket where egress multiplies by party size, because each client pulls
    // its own copy during shared playback.
    const publicUrl = publicUrlFor(admin, "sounds", storagePath);

    // This is deliberately before the sound row and charge. A later crash can
    // resume finalization without another paid Lyria request.
    await persistGenerationArtifact(admin, jobId, {
      url: publicUrl,
      storage_path: storagePath,
      mime_type: mimeType,
      // `prompt` is the structured prompt Lyria actually received — recorded
      // so the DM (and any future debugging of a bad generation) can see what
      // structuring produced, since it's no longer visible client-side as it
      // is built.
      metadata: { model: request.model, provider: "google", prompt: structuredPrompt },
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

function queueMusicWorker(jobId: string, request: MusicRuntimeRequest, report: (err: unknown) => void): void {
  const run = runMusicGeneration(jobId, request);
  try {
    // @ts-ignore EdgeRuntime is a Deno Deploy global, not in Deno's type defs.
    EdgeRuntime.waitUntil(run);
  } catch (e) {
    // The worker is already running; only the keep-alive failed.
    console.error("generate-music: waitUntil failed", e);
    report(e);
  }
}

interface ParsedMusicRequest {
  campaignId: string;
  soundName: string;
  category: SoundCategory;
  requestId: string;
  imageUrls: string[];
  description: string;
  lengthSeconds: MusicLengthSeconds;
  vocals: MusicVocals;
  lyrics: string | null;
  mentions: MusicMention[];
  prompt: string | null;
}

/** The validated request, or null when the body breaks any rule (a 400 for the caller to give). */
function parseMusicRequest(body: Record<string, unknown>): ParsedMusicRequest | null {
  const campaignId = body.campaign_id;
  const soundName = typeof body.sound_name === "string" ? body.sound_name.trim() : "";
  const category = body.category;
  const requestId = typeof body.request_id === "string" ? body.request_id : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const lengthSeconds = body.length_seconds;
  const vocals = body.vocals;
  const rawLyrics = body.lyrics;
  const lyrics = typeof rawLyrics === "string" && rawLyrics.trim() ? rawLyrics.trim() : null;
  const rawPrompt = body.prompt;
  let prompt: string | null;
  if (rawPrompt === undefined || rawPrompt === null) {
    prompt = null;
  } else if (typeof rawPrompt === "string" && rawPrompt.trim()) {
    prompt = rawPrompt.trim();
  } else {
    return null;
  }
  const rawMentions = body.mentions;
  let mentions: MusicMention[];
  if (rawMentions === undefined) {
    mentions = [];
  } else if (Array.isArray(rawMentions) && rawMentions.every(isValidMention)) {
    mentions = rawMentions as MusicMention[];
  } else {
    return null;
  }
  const rawImageUrls = body.image_urls;
  let imageUrls: string[];
  if (rawImageUrls === undefined) {
    imageUrls = [];
  } else if (Array.isArray(rawImageUrls) && rawImageUrls.every((url: unknown) => typeof url === "string")) {
    imageUrls = [...new Set(rawImageUrls as string[])];
  } else {
    return null;
  }
  if (
    typeof campaignId !== "string" || !campaignId || !soundName || !requestId || requestId.length > 128 ||
    typeof category !== "string" || !["ambient", "music", "effects"].includes(category) ||
    !description || description.length > MAX_DESCRIPTION_CHARS ||
    !MUSIC_LENGTHS.includes(lengthSeconds as MusicLengthSeconds) || !MUSIC_VOCALS.includes(vocals as MusicVocals) ||
    (lyrics !== null && lyrics.length > MAX_LYRICS_CHARS) ||
    (prompt !== null && prompt.length > MUSIC_PROMPT_MAX_CHARS) ||
    mentions.length > MAX_MENTIONS ||
    !mentions.every((m) =>
      m.label.length > 0 && m.label.length <= MAX_MENTION_LABEL_CHARS &&
      (m.description === null || m.description.length <= MAX_MENTION_DESCRIPTION_CHARS)
    ) ||
    imageUrls.length > LYRIA_MAX_IMAGES || !imageUrls.every((url) => isSafeStorageUrl(url))
  ) return null;
  return {
    campaignId, soundName, category: category as SoundCategory, requestId, imageUrls, description,
    lengthSeconds: lengthSeconds as MusicLengthSeconds, vocals: vocals as MusicVocals, lyrics, mentions, prompt,
  };
}

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const parsed = body ? parseMusicRequest(body) : null;
  if (!parsed) {
    return jsonError(
      400, "invalid_body",
      "Invalid body — need request_id, campaign_id, sound_name, category, description (non-empty, " +
        `max ${MAX_DESCRIPTION_CHARS} chars), length_seconds (60|120|180), vocals (instrumental|choir|vocals), ` +
        `lyrics (optional, max ${MAX_LYRICS_CHARS} chars), prompt (optional, a complete Lyria prompt sent as ` +
        `written, max ${MUSIC_PROMPT_MAX_CHARS} chars), mentions (optional, max ${MAX_MENTIONS}, label max ` +
        `${MAX_MENTION_LABEL_CHARS} chars, description max ${MAX_MENTION_DESCRIPTION_CHARS} chars or null) and ` +
        "image_urls (max 10, our storage/CDN only).",
    );
  }
  const { campaignId, soundName, category, requestId, imageUrls, description, lengthSeconds, vocals, lyrics, mentions, prompt } = parsed;

  // DMs only: no player surface calls this, and it spends the campaign's
  // credits (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign<BaseCampaign>(admin, campaignId, user.id);
  if (!load.ok) return load.response;

  const existing = await findGenerationJob(admin, user.id, "music", requestId);
  if (existing) {
    if (existing.campaign_id !== campaignId) {
      return jsonError(409, "request_id_conflict", "That request id belongs to another campaign.");
    }
    if (existing.status === "settling") {
      // No key required: only writes the idempotent sound row and settles the durable job.
      // @ts-ignore EdgeRuntime is a Deno Deploy global, not in Deno's type defs.
      EdgeRuntime.waitUntil(finalizeMusicJob(existing).catch((error) => console.error("Could not resume music finalization:", error)));
    }
    if (existing.status !== "queued") return json({ job_id: existing.id });
  }

  const [platformKeys, geminiProviderRow, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["gemini", "openai", "anthropic"]),
    admin.from("provider_config").select("audio_enabled, audio_multiplier, audio_model").eq("provider", "gemini").maybeSingle()
      .then((r) => {
        if (r.error) throw r.error;
        return r.data as { audio_enabled: boolean; audio_multiplier: number | null; audio_model: string | null } | null;
      }),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  // ── Audio (Lyria) key: the platform's ───────────────────────────────────────
  if (!geminiProviderRow?.audio_enabled) {
    if (existing) {
      await failGenerationJob(admin, existing.id, "Platform music generation was disabled before this queued request could start.");
    }
    return jsonError(403, "music_disabled", "Music generation is not enabled on this platform. Contact your admin.");
  }
  const geminiKey = platformKeys.gemini ?? null;
  if (!geminiKey) {
    if (existing) {
      await failGenerationJob(admin, existing.id, "The platform's music key is no longer available.");
    }
    return jsonError(422, "no_music_key", "No Gemini API key is configured on the platform. Contact your admin.");
  }

  // ── Text (structuring) key — no billing lane of its own; resolved fresh on
  // every attempt, including a queued retry, since it isn't part of the paid
  // reservation. Checked here, at request time, so a missing/disabled text
  // provider surfaces immediately instead of failing the job after Lyria's
  // (billed) work has already started. ─────────────────────────────────────
  const text = resolveTextProvider({
    platformKeys,
    providerConfigs,
  });
  if (!text) {
    if (existing) {
      await failGenerationJob(admin, existing.id, "No text provider is available to prepare this queued music prompt.");
    }
    return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);
  }
  // fast_text_model when the admin has set one — this is a short structuring
  // task, not a long-form generation, same reasoning as the quest designer's
  // per-turn calls (quest-designer-turn/index.ts).
  const textModel = text.config?.fast_text_model ?? text.config?.text_model ?? null;

  // A queued retry runs under the hold its job already owns: nothing is reserved here.
  if (existing) {
    queueMusicWorker(existing.id, { ...requestFromJob(existing), apiKey: geminiKey, text, textModel }, report);
    return json({ job_id: existing.id });
  }

  // The model is an admin setting (provider_config.audio_model), not something
  // the client chooses.
  const configuredModel = geminiProviderRow?.audio_model?.trim();
  if (!configuredModel) {
    return jsonError(503, "no_music_model", "No music model is configured. Ask your admin to set one under Admin → AI Providers.");
  }
  const durableRequest: MusicJobRequest = {
    campaignId, userId: user.id, description, lengthSeconds, vocals, lyrics, mentions, prompt,
    model: configuredModel, name: soundName, category, imageUrls,
  };

  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  const generationType = "music_track";
  // Flat per-song credit price, unchanged by this move — the structuring
  // call's own provider cost rides along on this single charge rather than
  // being metered separately (see this file's top comment).
  const audioCost = wholeCredits(
    (await fetchCreditCost(admin, generationType)) * (geminiProviderRow?.audio_multiplier ?? 1),
  );

  return withCreditHold(admin, { payerId: user.id, reason: generationType, cost: audioCost, report }, async (hold) => {
    // The job row records the hold's ids and SQL settles them (finalize_music_generation_job,
    // fail_ai_generation_job), so the hold is handed off before the row is written. If no job comes of it, the ids are
    // released here through the same settle path.
    const reservationIds = hold.handOff();
    const releaseUnused = () => settleHandedOff(admin, { payerId: user.id, ids: reservationIds, report }, async () => undefined);
    let created: Awaited<ReturnType<typeof createGenerationJob>>;
    try {
      created = await createGenerationJob(admin, {
        user_id: user.id,
        campaign_id: campaignId,
        kind: "music",
        request: {
          description: durableRequest.description,
          length_seconds: durableRequest.lengthSeconds,
          vocals: durableRequest.vocals,
          lyrics: durableRequest.lyrics,
          mentions: durableRequest.mentions,
          prompt: durableRequest.prompt,
          model: durableRequest.model,
          name: soundName,
          category,
          image_urls: durableRequest.imageUrls,
        },
        billing: {
          reservation_ids: reservationIds,
          generation_type: generationType,
          cost: audioCost,
          log: { model: durableRequest.model, provider: "google", image_count: 1 },
        },
        idempotency_key: requestId,
        stale_after: new Date(Date.now() + 15 * 60 * 1_000).toISOString(),
      });
    } catch (error) {
      console.error("Could not queue music generation:", error);
      await releaseUnused();
      return jsonError(500, "queue_failed", "Could not queue music generation. Please try again.");
    }
    // A concurrent request with the same id created the job first and owns its own hold; this one's is released.
    if (!created.created) await releaseUnused();
    queueMusicWorker(created.job.id, { ...durableRequest, apiKey: geminiKey, text, textModel }, report);
    return json({ job_id: created.job.id });
  });
}));
