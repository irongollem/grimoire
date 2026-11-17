import { computed, ref } from "vue";
import { useStorage } from "@vueuse/core";
import { supabase } from "@/lib/supabase";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { NO_VOICES, type SpokenLine, type VoicePart, type VoiceParts } from "@/lib/table/voiceLines";
import { useAuthStore } from "@/stores/auth";

/** A line of the sitting to be voiced, as the page knows it (`voiceLines.ts`). */
export type VoiceLine = SpokenLine;

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
    // A line without a key is asked for by its words alone: the server answers it only from a clip it kept.
    body: JSON.stringify(request.key === null ? { ...request, key: undefined } : request),
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

// What each account wants read aloud, on this device: the narrator, the characters, their own character. All off
// until asked for: sound a page starts by itself is not something to surprise anyone with, and every voiced line
// is a paid call.
const wanted = useStorage<Record<string, VoiceParts>>("grimoire:ai-table-voices", {}, safeLocalStorage());

/**
 * The voices at the AI table (#1021): the narrator's, the characters' and the player's own character's, each with
 * a switch of its own. Lines are read aloud one after another, in the order they came (the server speaks only a
 * line the sitting showed, with the character's own cue for how it is said). Deeds stay text. What line is read is
 * the caller's choice (`voiceLines.ts`); this only refuses to speak while everything is off.
 *
 * It never throws and never blocks the story: a line that cannot be voiced is skipped, and when the server says
 * voices are not switched on, `unavailable` is set and nothing more is asked.
 */
/** The breath between two different voices: a narrator who starts on the heels of a character sounds like one speaker. */
export const VOICE_CHANGE_PAUSE_MS = 500;

export function useTableVoice(options: {
  campaignId: () => string | null;
  sessionId: () => string | null;
  transport?: VoiceTransport;
  player?: VoicePlayer;
  /** Waits between two voices; a test replaces it. */
  pause?: (ms: number) => Promise<void>;
}) {
  const auth = useAuthStore();
  const transport = options.transport ?? sendToTableVoice;
  const player = options.player ?? playClip;
  const pause = options.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // Who spoke last, so a change of voice gets a breath and the same voice going on does not.
  const voiceOf = (line: VoiceLine): string => `${line.role}:${line.speakerId ?? line.speakerName}`;
  const userId = computed(() => auth.user?.id ?? null);

  const parts = computed<VoiceParts>(() => {
    const mine = userId.value === null ? undefined : wanted.value[userId.value];
    return mine === undefined ? NO_VOICES : { ...NO_VOICES, ...mine };
  });
  const enabled = computed(() => parts.value.narrator || parts.value.characters || parts.value.player);
  const unavailable = ref(false);
  /** The speech allowance is used up. Cleared when a voice is switched on again, which is how one finds out it is back. */
  const spent = ref(false);
  const speaking = ref(false);

  // Each waiting line with its clip already being made: the next voice is ready when the one before it ends.
  let queue: Array<{ clip: Promise<string | null>; voice: string }> = [];
  let current: { stop(): void } | null = null;
  // Raised by `stop`, so a clip that was being fetched when the player muted does not start afterwards.
  let generation = 0;

  // A voice already made is kept for as long as this screen lives, so hearing a line again costs nothing.
  const made = new Map<string, Promise<string | null>>();

  /** The line's clip, made once: asked for the first time it is wanted and kept unless it could not be voiced. */
  function clipOf(line: VoiceLine, mine: number): Promise<string | null> {
    // By its key when it has one; a stored line is known by who said what.
    const name = line.key !== null ? line.key : `${line.role}:${line.speakerName}:${line.text}`;
    const kept = made.get(name);
    if (kept) return kept;
    const clip = fetchClip(line, mine);
    made.set(name, clip);
    void clip.then((src) => {
      if (src === null && made.get(name) === clip) made.delete(name);
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
    if (response.status === 402) {
      // The speech allowance is used up: asking for the next line cannot help, so stop, and say so once.
      if (mine === generation) {
        spent.value = true;
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
      let last: string | null = null;
      while (queue.length > 0 && mine === generation) {
        const next = queue.shift()!;
        const src = await next.clip;
        if (mine !== generation || src === null) continue;
        if (last !== null && last !== next.voice) {
          await pause(VOICE_CHANGE_PAUSE_MS);
          if (mine !== generation) continue;
        }
        last = next.voice;
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
    if (!enabled.value || unavailable.value || spent.value || lines.length === 0) return;
    // Asked for at once, all of them: making a voice takes seconds, and they are played in order whatever comes back first.
    const mine = generation;
    queue.push(...lines.map((line) => ({ clip: clipOf(line, mine), voice: voiceOf(line) })));
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

  /** Switches one of the three on or off for this account. */
  function setPart(part: VoicePart, on: boolean): void {
    const id = userId.value;
    if (id === null) return;
    wanted.value = { ...wanted.value, [id]: { ...parts.value, [part]: on } };
    if (!enabled.value) stop();
    // Asking again is how a player finds out voices have since been switched on.
    if (on) {
      unavailable.value = false;
      spent.value = false;
    }
  }

  /** Everything off: the server said voices are not switched on. */
  function setAllOff(): void {
    const id = userId.value;
    if (id === null) return;
    wanted.value = { ...wanted.value, [id]: { ...NO_VOICES } };
    stop();
  }

  return { parts, enabled, unavailable, spent, speaking, say, replay, stop, setPart, setAllOff };
}
