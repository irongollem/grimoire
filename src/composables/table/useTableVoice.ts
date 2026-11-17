import { computed, ref } from "vue";
import { useStorage } from "@vueuse/core";
import { supabase } from "@/lib/supabase";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useAuthStore } from "@/stores/auth";

/** A spoken line of the sitting, as the page knows it. The server finds the stored line from these three. */
export interface VoiceLine {
  speakerId: string | null;
  speakerName: string;
  text: string;
}

export interface VoiceRequest extends VoiceLine {
  campaignId: string;
  sessionId: string;
}

/** Calls `table-voice` and hands back the raw response. The seam a test replaces. */
export type VoiceTransport = (request: VoiceRequest) => Promise<Response>;

export const sendToTableVoice: VoiceTransport = async (request) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/table-voice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(request),
  });
};

/** Plays one clip and settles when it is over (or cannot be played). `stop` cuts it short. */
export type VoicePlayer = (src: string) => { done: Promise<void>; stop(): void };

export const playClip: VoicePlayer = (src) => {
  // Where there is no audio at all (a test DOM, a stripped-down webview) a clip is simply over at once.
  if (typeof Audio === "undefined") return { done: Promise.resolve(), stop: () => {} };
  const audio = new Audio(src);
  const done = new Promise<void>((resolve) => {
    audio.addEventListener("ended", () => resolve(), { once: true });
    audio.addEventListener("error", () => resolve(), { once: true });
    // A browser that refuses to play (no gesture yet) must not hold up the lines behind it.
    audio.play().catch(() => resolve());
  });
  return {
    done,
    stop: () => {
      audio.pause();
      audio.dispatchEvent(new Event("ended"));
    },
  };
};

// Which accounts want the characters voiced, on this device. Off until asked for: sound a page starts by itself is
// not something to surprise anyone with, and every voiced line is a paid call.
const wanted = useStorage<string[]>("grimoire:ai-table-voice", [], safeLocalStorage());

/**
 * The characters' voices at the AI table (#1021). Spoken lines are read aloud one after another, in the order they
 * were said, each as the server stored it (the server speaks only a line the sitting showed, with the character's
 * own cue for how it is said). Deeds and narration stay text.
 *
 * It never throws and never blocks the story: a line that cannot be voiced is skipped, and when the server says
 * voices are not switched on, `unavailable` is set and nothing more is asked.
 */
export function useTableVoice(options: { campaignId: () => string | null; sessionId: () => string | null; transport?: VoiceTransport; player?: VoicePlayer }) {
  const auth = useAuthStore();
  const transport = options.transport ?? sendToTableVoice;
  const player = options.player ?? playClip;
  const userId = computed(() => auth.user?.id ?? null);

  const enabled = computed(() => userId.value !== null && wanted.value.includes(userId.value));
  const unavailable = ref(false);
  const speaking = ref(false);

  let queue: VoiceLine[] = [];
  let current: { stop(): void } | null = null;
  // Raised by `stop`, so a clip that was being fetched when the player muted does not start afterwards.
  let generation = 0;

  async function drain(): Promise<void> {
    if (speaking.value) return;
    speaking.value = true;
    const mine = generation;
    try {
      while (queue.length > 0 && mine === generation) {
        const line = queue.shift()!;
        const campaignId = options.campaignId();
        const sessionId = options.sessionId();
        if (campaignId === null || sessionId === null) continue;
        let response: Response;
        try {
          response = await transport({ campaignId, sessionId, ...line });
        } catch {
          continue;
        }
        if (response.status === 503) {
          // Voices are not switched on for this server: stop asking, and say so once through `unavailable`.
          unavailable.value = true;
          queue = [];
          break;
        }
        if (!response.ok) continue;
        const body = (await response.json().catch(() => null)) as { audio?: unknown; mime?: unknown } | null;
        if (mine !== generation || !body || typeof body.audio !== "string" || body.audio === "") continue;
        const clip = player(`data:${typeof body.mime === "string" ? body.mime : "audio/mpeg"};base64,${body.audio}`);
        current = clip;
        await clip.done;
        current = null;
      }
    } finally {
      speaking.value = false;
    }
  }

  /** Voices these lines after whatever is already waiting. Does nothing while voices are off or unavailable. */
  function say(lines: readonly VoiceLine[]): void {
    if (!enabled.value || unavailable.value || lines.length === 0) return;
    queue.push(...lines);
    void drain();
  }

  /** Silence, now: what is playing stops and what was waiting is dropped. */
  function stop(): void {
    generation += 1;
    queue = [];
    current?.stop();
    current = null;
  }

  function setEnabled(on: boolean): void {
    const id = userId.value;
    if (id === null) return;
    const others = wanted.value.filter((u) => u !== id);
    wanted.value = on ? [...others, id] : others;
    if (!on) stop();
    // Asking again is how a player finds out voices have since been switched on.
    if (on) unavailable.value = false;
  }

  return { enabled, unavailable, speaking, say, stop, setEnabled };
}
