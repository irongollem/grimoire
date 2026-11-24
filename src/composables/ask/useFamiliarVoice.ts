import { computed, ref } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useAuthStore } from "@/stores/auth";
import { playClip, readVoiceResponse, sendToTableVoice, type VoicePlayer, type VoiceTransport } from "@/composables/table/useTableVoice";

/** The name Oolu's words are kept under on the server (`FAMILIAR_SPEAKER`); the server sets it whatever is sent. */
export const FAMILIAR_NAME = "Oolu";

// Whether each account wants Oolu's replies read aloud, on this device. Off until asked for: sound a page starts by
// itself is not something to surprise anyone with, and every voiced reply is a paid call.
const wanted = useStorage<Record<string, boolean>>("grimoire:familiar-voice", {}, safeLocalStorage());

/**
 * Oolu reading its own replies aloud (Ask Grimoire, `ask-grimoire.md` "Oolu reads aloud"). Only the words the Familiar wrote are ever handed to `say`; this never
 * decides what is said, it only refuses to speak while the switch is off. It never throws and never blocks the
 * conversation: a reply that cannot be voiced is skipped, and a 503 or 402 is remembered (`unavailable`, `broke`,
 * `spent`) so nothing more is asked until the switch is turned on again.
 */
export function useFamiliarVoice(options: { transport?: VoiceTransport; player?: VoicePlayer } = {}) {
  const auth = useAuthStore();
  const transport = options.transport ?? sendToTableVoice;
  const player = options.player ?? playClip;
  const userId = computed(() => auth.user?.id ?? null);

  const on = computed(() => userId.value !== null && wanted.value[userId.value] === true);
  const unavailable = ref(false);
  /** The speech allowance is used up. */
  const spent = ref(false);
  /** The DM's credits do not cover a reply. */
  const broke = ref(false);
  const speaking = ref(false);

  let queue: Array<Promise<string | null>> = [];
  let current: { stop(): void } | null = null;
  // Raised by `stop`, so a clip that was being fetched when it was muted does not start afterwards.
  let generation = 0;

  /** The reply's clip, or null to skip it. A reason to stop asking is remembered, once, for the switch to show. */
  async function fetchClip(request: { campaignId: string; sessionId: string; text: string }, mine: number): Promise<string | null> {
    let response: Response;
    try {
      // No key: Ask signs nothing, and the server proves the words against the conversation's stored turns.
      response = await transport({ ...request, role: "familiar", speakerId: null, speakerName: FAMILIAR_NAME, how: null, key: null });
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

  // One loop at a time: `speaking` is true only while a clip plays, so it cannot be the guard, or a reply asked for
  // while the first clip is still being made would start a second loop and the two would play over each other.
  let draining = false;
  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    const mine = generation;
    try {
      while (queue.length > 0 && mine === generation) {
        const src = await queue.shift()!;
        if (mine !== generation || src === null) continue;
        speaking.value = true;
        const clip = player(src);
        current = clip;
        await clip.done;
        current = null;
        speaking.value = false;
      }
    } finally {
      draining = false;
      speaking.value = false;
      // Replies that arrived for a newer generation while this loop was winding down still get their turn.
      if (queue.length > 0) void drain();
    }
  }

  /** Reads these replies after whatever is waiting. Does nothing, and asks for nothing, while off or unavailable. */
  function say(input: { campaignId: string; sessionId: string; texts: readonly string[] }): void {
    if (!on.value || unavailable.value || spent.value || broke.value || input.texts.length === 0) return;
    // Asked for at once, all of them: making a voice takes seconds, and they are played in order.
    const mine = generation;
    queue.push(
      ...input.texts.map((text) =>
        fetchClip({ campaignId: input.campaignId, sessionId: input.sessionId, text }, mine),
      ),
    );
    void drain();
  }

  /** Silence, now: what is playing stops and what was waiting is dropped. */
  function stop(): void {
    generation += 1;
    queue = [];
    current?.stop();
    current = null;
  }

  function setOn(value: boolean): void {
    const id = userId.value;
    if (id === null) return;
    wanted.value = { ...wanted.value, [id]: value };
    if (!value) stop();
    // Asking again is how a DM finds out voices or credits are back.
    else {
      unavailable.value = false;
      spent.value = false;
      broke.value = false;
    }
  }

  return { on, setOn, speaking, unavailable, spent, broke, say, stop };
}
