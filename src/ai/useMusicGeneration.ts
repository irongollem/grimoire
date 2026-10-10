import { ref } from "vue";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useQueryClient, type QueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import type { SoundCategory } from "@/types/sound.types";
import type { FallbackPromptRequest, MusicLengthSeconds, MusicVocals } from "@/lib/audio/aiMusic";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { isAnyAiGenerating, registerAiGenerator } from "./aiGeneratorRegistry";
import {
  AiGenerationJobFailedError,
  acknowledgeAiGenerationJob,
  listUnconsumedAiGenerationJobs,
  waitForAiGenerationJob,
  type AiGenerationJob,
} from "./useAiGenerationJob";

/**
 * Soundboard music generation (generate-music), run in the background like
 * every other generator: the state lives here at module level, so the DM can
 * close the Add Sound dialog while Lyria works and the AiGenerationBadge tells
 * them when the track is on the board, or brings the dialog back if it failed.
 *
 * Server path only. The local-vault BYOK path stays in SoundForm, in the
 * foreground: it runs in the browser tab and saves through component-bound
 * upload and create composables, and new capability does not ship to that
 * legacy tier (project_ai_byok_tiers).
 */

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

/**
 * The Generate tab's draft. Module-level so that closing the dialog mid-run,
 * or reopening it from the badge after Lyria refused a prompt, finds it as the
 * DM left it, refused prompt included.
 */
const _draft = {
  description: ref(""),
  lengthSeconds: ref<MusicLengthSeconds>(60),
  vocals: ref<MusicVocals>("instrumental"),
  lyrics: ref(""),
  /** A complete Lyria prompt the DM is editing after a refusal. While set, it
   * is sent as written in place of the description. */
  editedPrompt: ref<string | null>(null),
  /** The board section of the last run, so a reopened retry files the track
   * where the DM first asked for it. (Its name is the badge's `concept`.) */
  category: ref<SoundCategory>("ambient"),
};

function resetDraft(): void {
  _draft.description.value = "";
  _draft.lengthSeconds.value = 60;
  _draft.vocals.value = "instrumental";
  _draft.lyrics.value = "";
  _draft.editedPrompt.value = null;
  _draft.category.value = "ambient";
}

registerAiGenerator({
  ..._state,
  label: "Music",
  // Sounds have no page of their own; the finished track is on the board.
  entityRoute: () => "/soundboard",
  openPanel: () => {
    useSoundboardUiStore().addSoundDialogOpen = true;
  },
});

interface MusicGenerationResult {
  campaign_id: string;
  sound_id: string;
}

// ── Idempotency key, persisted per campaign ─────────────────────────────────

const MUSIC_REQUEST_STORAGE_PREFIX = "grimoire_music_request:";

interface PendingMusicRequest {
  requestId: string;
  fingerprint: string;
}

/**
 * Store the idempotency key before the HTTP request leaves this tab. Reusing it
 * for the same draft turns a lost invoke response into a safe retry instead of
 * a second paid generation.
 */
async function getOrCreateMusicRequestId(originCampaignId: string, fingerprint: string): Promise<string> {
  const storageKey = `${MUSIC_REQUEST_STORAGE_PREFIX}${originCampaignId}`;
  try {
    const saved = JSON.parse(safeLocalStorage().getItem(storageKey) ?? "null") as PendingMusicRequest | null;
    if (saved?.requestId && saved.fingerprint === fingerprint) {
      // A retry reuses a pending request, but a terminal result must not trap
      // the same form inputs behind an old failed/consumed job forever.
      const { data, error } = await supabase
        .from("ai_generation_jobs")
        .select("status, consumed_at")
        .eq("generator_type", "music")
        .eq("idempotency_key", saved.requestId)
        .maybeSingle();
      const job = data as { status: string; consumed_at: string | null } | null;
      if (error || !job || (job.status !== "failed" && !(job.status === "ready" && job.consumed_at))) {
        return saved.requestId;
      }
      safeLocalStorage().removeItem(storageKey);
    }
    const requestId = crypto.randomUUID();
    safeLocalStorage().setItem(storageKey, JSON.stringify({ requestId, fingerprint } satisfies PendingMusicRequest));
    return requestId;
  } catch {
    // The server-side job is still durable once the request reaches it.
    return crypto.randomUUID();
  }
}

function forgetMusicRequest(originCampaignId: string, requestId?: string): void {
  if (!requestId) return;
  try {
    const storageKey = `${MUSIC_REQUEST_STORAGE_PREFIX}${originCampaignId}`;
    const saved = JSON.parse(safeLocalStorage().getItem(storageKey) ?? "null") as PendingMusicRequest | null;
    if (saved?.requestId === requestId) safeLocalStorage().removeItem(storageKey);
  } catch {
    // Nothing else to clean up.
  }
}

// ── Settling a finished job ─────────────────────────────────────────────────

/** The sound row already exists (finalize_music_generation_job creates it with
 * the charge); this refreshes the board and marks the job applied. */
async function saveReadyMusicJob(
  queryClient: QueryClient,
  job: AiGenerationJob<MusicGenerationResult>,
  requestId?: string,
): Promise<string> {
  if (!job.artifacts.url || !job.artifacts.storagePath || !job.result_json?.sound_id) {
    throw new Error("The music job finished without a stored sound.");
  }
  await queryClient.invalidateQueries({ queryKey: ["sounds", job.result_json.campaign_id] });
  await acknowledgeAiGenerationJob(job.id);
  forgetMusicRequest(job.result_json.campaign_id, requestId);
  return job.result_json.sound_id;
}

/** Resolves to the new sound's id, or null when another tab already applied it. */
async function resumeMusicJob(
  queryClient: QueryClient,
  jobId: string,
  expectedCampaignId: string,
  requestId: string,
): Promise<string | null> {
  const job = await waitForAiGenerationJob<MusicGenerationResult>(jobId);
  if (job.consumedAt) {
    forgetMusicRequest(expectedCampaignId, requestId);
    return null;
  }
  if (job.result_json?.campaign_id !== expectedCampaignId) {
    throw new Error("This music job belongs to a different campaign.");
  }
  return saveReadyMusicJob(queryClient, job, requestId);
}

export interface MusicGenerationInput {
  campaignId: string;
  pageId: string | null;
  soundName: string;
  category: SoundCategory;
  request: FallbackPromptRequest;
  imageUrls: string[];
  /** The DM's edited Lyria prompt, sent as written; null to have it structured. */
  prompt: string | null;
}

export function useMusicGeneration() {
  const queryClient = useQueryClient();

  /**
   * Queue the track and wait for it. Resolves true once the sound is on the
   * board. The closure outlives the dialog that started it, which is the point:
   * closing the dialog does not stop the wait, only hides it.
   */
  async function generate(input: MusicGenerationInput): Promise<boolean> {
    if (isAnyAiGenerating.value) return false;
    _state.isGenerating.value = true;
    _state.error.value = null;
    _state.clearCompleted();
    _state.concept.value = input.soundName;
    _draft.category.value = input.category;
    startAiQuotes("music");

    try {
      const { request } = input;
      const requestFingerprint = JSON.stringify({
        // Keys the retry to the DM's original intent (not the structured
        // prompt, which only exists server-side) so a lost invoke response
        // cannot turn a differently worded retry into another paid request.
        description: request.description,
        lengthSeconds: request.lengthSeconds,
        vocals: request.vocals,
        lyrics: request.lyrics ?? null,
        prompt: input.prompt,
        name: input.soundName,
        category: input.category,
        pageId: input.pageId,
        imageUrls: [...input.imageUrls].sort(),
      });
      const requestId = await getOrCreateMusicRequestId(input.campaignId, requestFingerprint);
      const { data, error } = await supabase.functions.invoke("generate-music", {
        body: {
          request_id: requestId,
          campaign_id: input.campaignId,
          sound_name: input.soundName,
          category: input.category,
          page_id: input.pageId,
          description: request.description,
          length_seconds: request.lengthSeconds,
          vocals: request.vocals,
          lyrics: request.lyrics,
          prompt: input.prompt ?? undefined,
          mentions: request.mentions,
          image_urls: input.imageUrls,
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      if (data?.error) throw new Error(data.error);

      const jobId = (data as { job_id?: string } | null)?.job_id;
      if (!jobId) throw new Error("Music generator did not return a job id.");
      const soundId = await resumeMusicJob(queryClient, jobId, input.campaignId, requestId);
      resetDraft();
      if (soundId) _state.completedEntityId.value = soundId;
      return true;
    } catch (err) {
      _state.error.value = err instanceof Error ? err.message : "Generation failed.";
      // generate-music records the prompt on the job before Lyria reads it; a
      // job that failed earlier (structuring, an unreadable image) has none.
      const sentPrompt = err instanceof AiGenerationJobFailedError ? err.job.artifacts.metadata.prompt : null;
      if (typeof sentPrompt === "string") _draft.editedPrompt.value = sentPrompt;
      return false;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  /**
   * Apply tracks that finished while no tab was waiting on them (a reload or a
   * closed browser mid-run). Returns how many were applied.
   */
  async function recoverReadyJobs(campaignId: string): Promise<number> {
    const jobs = await listUnconsumedAiGenerationJobs<MusicGenerationResult>({
      campaignId,
      generatorType: "music",
    });
    let applied = 0;
    for (const job of jobs) {
      if (!job.result_json?.sound_id || job.result_json.campaign_id !== campaignId) continue;
      _state.completedEntityId.value = await saveReadyMusicJob(queryClient, job);
      applied++;
    }
    return applied;
  }

  return {
    ..._state,
    draft: _draft,
    generate,
    recoverReadyJobs,
    resetDraft,
  };
}
