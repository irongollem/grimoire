import { ref, watch, type Ref } from "vue";
import { meterAudio } from "./audioMeter";

// The one player behind every voice that reads aloud: the AI table's lines and Ooru's replies in Ask. They used to
// each carry a copy of this queue, and the copies had already drifted (one loop guard each, a different re-drain
// rule), so a fix to one never reached the other. What differs between them is a parameter here.

/**
 * What a `table-voice` answer means for the one who asked: a clip to play, a line to skip (not provable, a failure),
 * or a reason to stop asking: voices are not switched on (503), the caller's credits do not cover a line (402
 * `insufficient_credits`), or the speech service's allowance is used up (any other 402).
 */
export type VoiceAnswer = { kind: "clip"; src: string } | { kind: "skip" } | { kind: "unavailable" | "broke" | "spent" };

export async function readVoiceResponse(response: Response): Promise<VoiceAnswer> {
  if (response.status === 503) return { kind: "unavailable" };
  if (response.status === 402) {
    const refusal = (await response.json().catch(() => null)) as { error?: unknown } | null;
    return { kind: refusal !== null && refusal.error === "insufficient_credits" ? "broke" : "spent" };
  }
  if (!response.ok) return { kind: "skip" };
  const body = (await response.json().catch(() => null)) as { audio?: unknown; mime?: unknown } | null;
  if (!body || typeof body.audio !== "string" || body.audio === "") return { kind: "skip" };
  return { kind: "clip", src: `data:${typeof body.mime === "string" ? body.mime : "audio/mpeg"};base64,${body.audio}` };
}

/**
 * Plays one clip and settles when it is over (or cannot be played). `stop` cuts it short. With `onLevel`, the clip's
 * loudness is reported while it plays, where the browser allows metering it (`metered`); otherwise it just plays.
 */
export type VoicePlayer = (src: string, onLevel?: (level: number) => void) => { done: Promise<void>; stop(): void; metered?: boolean };

export const playClip: VoicePlayer = (src, onLevel) => {
  // Where there is no audio at all (a test DOM, a stripped-down webview) a clip is simply over at once.
  if (typeof Audio === "undefined") return { done: Promise.resolve(), stop: () => {} };
  const audio = new Audio(src);
  const done = new Promise<void>((resolve) => {
    audio.addEventListener("ended", () => resolve(), { once: true });
    audio.addEventListener("error", () => resolve(), { once: true });
    // A browser that refuses to play (no gesture yet) must not hold up the lines behind it.
    audio.play().catch(() => resolve());
  });
  const metered = onLevel !== undefined && meterAudio(audio, onLevel) !== null;
  return {
    done,
    metered,
    stop: () => {
      audio.pause();
      audio.dispatchEvent(new Event("ended"));
    },
  };
};

/** One waiting clip: being made already, and whose voice it is (a change of voice gets a breath). */
export interface QueuedClip {
  clip: Promise<string | null>;
  voice: string;
}

/**
 * Clips played one after another in the order they were asked for, each already being made while the one before it
 * plays. `fetchClip` asks the server and reads its answer; a reason to stop asking (`unavailable`, `spent`, `broke`)
 * is remembered and empties the queue, until `clearRefusals`. `stop` silences at once and drops what waits; a clip
 * still being made when that happens is never played.
 *
 * `owner` is the signed-in account: when it changes, what was playing for the last one stops and their refusals
 * are forgotten, so one account's empty credits never silence the next.
 */
export function useClipQueue(options: {
  owner: Ref<string | null>;
  player?: VoicePlayer;
  /** The breath between two different voices, in ms; 0 for a single speaker. */
  changePauseMs?: number;
  /** Waits between two voices; a test replaces it. */
  pause?: (ms: number) => Promise<void>;
}) {
  const player = options.player ?? playClip;
  const changePauseMs = options.changePauseMs ?? 0;
  const pause = options.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  /** True while a clip is playing (not while one is still being made): what an owl moving with the audio follows. */
  const speaking = ref(false);
  /** The playing clip's loudness, 0 when none plays; `metered` says whether it is being measured at all. */
  const level = ref(0);
  const metered = ref(false);
  /**
   * True from the first clip asked for until the last one has played, the waits to make one and the breaths between
   * voices included: what "a voice is still reading" means to a table that must not go on over it.
   */
  const busy = ref(false);
  const unavailable = ref(false);
  /** The speech allowance is used up. */
  const spent = ref(false);
  /** The caller's credits do not cover a clip. */
  const broke = ref(false);

  let queue: QueuedClip[] = [];
  let current: { stop(): void } | null = null;
  // Raised by `stop`, so a clip that was being made when it was silenced does not start afterwards.
  let generation = 0;
  // One loop at a time. `speaking` cannot be the guard: it is false while a clip is still being made, so a second
  // `enqueue` in that gap would start a second loop and the two would play over each other.
  let draining = false;

  /** Whether asking is pointless until the refusals are cleared. */
  const refused = (): boolean => unavailable.value || spent.value || broke.value;

  /** The clip from the server's answer, or null to skip it. A reason to stop asking is remembered, once. */
  async function fetchClip(send: () => Promise<Response>): Promise<string | null> {
    const mine = generation;
    let response: Response;
    try {
      response = await send();
    } catch {
      return null;
    }
    const read = await readVoiceResponse(response);
    if (read.kind === "clip") return read.src;
    if (read.kind !== "skip" && mine === generation) {
      if (read.kind === "unavailable") unavailable.value = true;
      else if (read.kind === "broke") broke.value = true;
      else spent.value = true;
      queue = [];
    }
    return null;
  }

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    busy.value = true;
    const mine = generation;
    try {
      let last: string | null = null;
      while (queue.length > 0 && mine === generation) {
        const next = queue.shift()!;
        const src = await next.clip;
        if (mine !== generation || src === null) continue;
        if (changePauseMs > 0 && last !== null && last !== next.voice) {
          await pause(changePauseMs);
          if (mine !== generation) continue;
        }
        last = next.voice;
        speaking.value = true;
        const clip = player(src, (l) => (level.value = l));
        metered.value = clip.metered === true;
        current = clip;
        await clip.done;
        current = null;
        speaking.value = false;
        level.value = 0;
      }
    } finally {
      draining = false;
      speaking.value = false;
      busy.value = queue.length > 0;
      // Clips that arrived for a newer generation while this loop was winding down still get their turn.
      if (queue.length > 0) void drain();
    }
  }

  /** Plays these after whatever is waiting. */
  function enqueue(clips: readonly QueuedClip[]): void {
    if (clips.length === 0) return;
    queue.push(...clips);
    void drain();
  }

  /** Silence, now: what is playing stops and what was waiting is dropped. */
  function stop(): void {
    generation += 1;
    queue = [];
    current?.stop();
    current = null;
  }

  /** Asking again is how one finds out voices or credits are back. */
  function clearRefusals(): void {
    unavailable.value = false;
    spent.value = false;
    broke.value = false;
  }

  watch(options.owner, () => {
    stop();
    clearRefusals();
  });

  return { speaking, level, metered, busy, unavailable, spent, broke, refused, fetchClip, enqueue, stop, clearRefusals };
}
