import { computed, onBeforeUnmount, ref, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { SampleResponse, SpeechVoice, VoiceStudioRequest } from "@/types/speechVoice.types";

// The voice registry (#1272), read by the admin's Voices page and the DM's voice picker on an NPC sheet. RLS decides
// what comes back: a DM reads the filled, active cast slots; the admin reads every slot.

export const SPEECH_VOICES_KEY = ["speech-voices"] as const;

/** `enabled` lets a surface that only shows where AI is on skip the read where it is off. */
export function useSpeechVoices(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: SPEECH_VOICES_KEY,
    enabled: computed(() => toValue(enabled)),
    queryFn: async (): Promise<SpeechVoice[]> => {
      const { data, error } = await supabase.from("speech_voices").select("*").order("kind").order("name");
      if (error) throw error;
      return data as SpeechVoice[];
    },
    staleTime: 60_000,
  });
}

/** Calls `voice-studio` and hands back the raw response. The seam a test replaces. */
export type VoiceStudioTransport = (request: VoiceStudioRequest) => Promise<Response>;

export const sendToVoiceStudio: VoiceStudioTransport = async (request) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-studio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(request),
  });
};

/** The studio's answer as JSON, or its refusal as an Error carrying the server's sentence. */
export async function voiceStudioCall<T>(request: VoiceStudioRequest, transport: VoiceStudioTransport = sendToVoiceStudio): Promise<T> {
  const response = await transport(request);
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON (a gateway's page): the status alone decides.
  }
  if (!response.ok) {
    // Only the studio's own refusals carry a sentence for a person, and they always carry an `error` code with it. A
    // gateway or platform error has a `message` too ("name resolution failed"), which is not for anyone's eyes.
    const ours = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" && "message" in body && typeof body.message === "string";
    throw new Error(ours ? (body as { message: string }).message : "The voice studio could not be reached. Try again in a moment.");
  }
  return body as T;
}

/** An object URL for base64 audio, for an `<audio>` or `new Audio()`. The caller revokes it. */
export function audioUrlOf(base64: string, mediaType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mediaType }));
}

/**
 * The listen button of a slot: fetches the slot's sample once per slot and plays it; a second press while it plays
 * stops it. One sample plays at a time.
 */
export function useVoiceSample(transport: VoiceStudioTransport = sendToVoiceStudio) {
  const playing = ref<string | null>(null);
  const loading = ref<string | null>(null);
  const problem = ref<string | null>(null);
  const urls = new Map<string, string>();
  let audio: HTMLAudioElement | null = null;

  function stop(): void {
    audio?.pause();
    audio = null;
    playing.value = null;
  }

  async function toggle(slotId: string): Promise<void> {
    if (playing.value === slotId) return stop();
    stop();
    problem.value = null;
    let url = urls.get(slotId);
    if (url === undefined) {
      loading.value = slotId;
      try {
        const sample = await voiceStudioCall<SampleResponse>({ action: "sample", slotId }, transport);
        url = audioUrlOf(sample.audio, sample.mediaType);
        urls.set(slotId, url);
      } catch (error) {
        problem.value = error instanceof Error ? error.message : "The voice could not be played.";
        return;
      } finally {
        loading.value = null;
      }
    }
    audio = new Audio(url);
    audio.addEventListener("ended", () => {
      if (playing.value === slotId) playing.value = null;
    });
    playing.value = slotId;
    await audio.play().catch(() => stop());
  }

  /** Forget a slot's sample, after its voice was replaced. */
  function forget(slotId: string): void {
    const url = urls.get(slotId);
    if (url !== undefined) URL.revokeObjectURL(url);
    urls.delete(slotId);
  }

  onBeforeUnmount(() => {
    stop();
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
  });

  return { playing, loading, problem, toggle, stop, forget };
}
