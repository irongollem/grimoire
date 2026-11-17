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
  /** The character's cue and the server's key for the line, as they arrived with it. */
  how: string | null;
  key: string;
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

  // Each waiting line with its clip already being made: the next voice is ready when the one before it ends.
  let queue: Array<Promise<string | null>> = [];
  let current: { stop(): void } | null = null;
  // Raised by `stop`, so a clip that was being fetched when the player muted does not start afterwards.
  let generation = 0;

  // A voice already made is kept for as long as this screen lives, so hearing a line again costs nothing.
  const made = new Map<string, Promise<string | null>>();

  /** The line's clip, made once: asked for the first time it is wanted and kept unless it could not be voiced. */
  function clipOf(line: VoiceLine, mine: number): Promise<string | null> {
    const kept = made.get(line.key);
    if (kept) return kept;
    const clip = fetchClip(line, mine);
    made.set(line.key, clip);
    void clip.then((src) => {
      if (src === null && made.get(line.key) === clip) made.delete(line.key);
    });
    return clip;
  }

  async function fetchClip(line: VoiceLine, mine: number): Promise<string | null> {
    const campaignId = options.campaignId();
    const sessionId = options.sessionId();
    if (campaignId === null || sessionId === null) return null;
    let response: Response;
    try {
      response = await transport({ campaignId, sessionId, ...line });
    } catch {
      return null;
    }
    if (response.status === 503) {
      // Voices are not switched on for this server: stop asking, and say so once through `unavailable`.
      if (mine === generation) {
        unavailable.value = true;
        queue = [];
      }
      return null;
    }
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as { audio?: unknown; mime?: unknown } | null;
    if (!body || typeof body.audio !== "string" || body.audio === "") return null;
    return `data:${typeof body.mime === "string" ? body.mime : "audio/mpeg"};base64,${body.audio}`;
  }

  async function drain(): Promise<void> {
    if (speaking.value) return;
    speaking.value = true;
    const mine = generation;
    try {
      while (queue.length > 0 && mine === generation) {
        const src = await queue.shift()!;
        if (mine !== generation || src === null) continue;
        const clip = player(src);
        current = clip;
        await clip.done;
        current = null;
      }
    } finally {
      speaking.value = false;
      // Lines that arrived for a newer generation while this loop was winding down still get their turn.
      if (queue.length > 0 && mine !== generation) void drain();
    }
  }

  /** Voices these lines after whatever is already waiting. Does nothing while voices are off or unavailable. */
  function say(lines: readonly VoiceLine[]): void {
    if (!enabled.value || unavailable.value || lines.length === 0) return;
    // Asked for at once, all of them: making a voice takes seconds, and they are played in order whatever comes back first.
    const mine = generation;
    queue.push(...lines.map((line) => clipOf(line, mine)));
    void drain();
  }

  /** Says these lines again, now: whatever is playing or waiting gives way to them. */
  function replay(lines: readonly VoiceLine[]): void {
    stop();
    say(lines);
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

  return { enabled, unavailable, speaking, say, replay, stop, setEnabled };
}
