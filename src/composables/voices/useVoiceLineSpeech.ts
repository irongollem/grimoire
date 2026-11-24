import { computed, ref, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { sendToTableVoice, type VoiceTransport } from "@/composables/table/useTableVoice";
import { useClipQueue, type VoicePlayer } from "@/composables/voices/useClipQueue";

/** Where one line's Speak aloud stands: nothing, a clip being made, or the clip playing. */
export type LineSpeechPhase = "idle" | "loading" | "playing";

// The one voice line playing anywhere, as its card's silence. Each card has its own player, so without this a line
// went on playing after its card was regenerated, discarded or followed by a new question, and two cards could play
// over each other.
let playingNow: (() => void) | null = null;

/** Silences whatever voice line is playing, on any card: a new question, a new conversation, another campaign. */
export function stopVoiceLines(): void {
  playingNow?.();
}

/** One line a card may speak: its words as generated and the server's key for them. */
export interface SpeakableLine {
  text: string;
  /** Null: the reply carried no key, so the line cannot be spoken. */
  key: string | null;
}

/**
 * Speak aloud on a card of lines an NPC could say (#1273): one press plays a line in the NPC's own voice through
 * `table-voice`, a second press while it plays stops it, and a later press replays the clip already fetched without
 * asking again. One line plays at a time. A refusal (voices off, no credits, the allowance used up) is remembered
 * for the life of this object, which is one card, so the card stops offering the button until it is opened again.
 */
export function useVoiceLineSpeech(options: {
  campaignId: string;
  speaker: { id: string; name: string };
  lines: readonly SpeakableLine[];
  transport?: VoiceTransport;
  player?: VoicePlayer;
}) {
  const auth = useAuthStore();
  const transport = options.transport ?? sendToTableVoice;
  const owner = computed(() => auth.user?.id ?? null);
  const queue = useClipQueue({ owner, player: options.player });

  const active = ref<number | null>(null);
  const loading = ref(false);
  // The clip made for a line, kept for as long as the card lives: hearing it again costs nothing.
  const made = new Map<number, string>();
  // Raised on every press, so a clip that arrives after its line was stopped is kept but never played.
  let turn = 0;

  /** The reason the card stops offering Speak aloud, or null. */
  const refusal = computed(() => {
    if (queue.broke.value) return "The voice went quiet: you are out of credits.";
    if (queue.spent.value) return "The voice went quiet: the voices allowance is used up for now.";
    if (queue.unavailable.value) return "The voice cannot speak: voices are not switched on.";
    return null;
  });

  const phaseOf = (index: number): LineSpeechPhase => {
    if (active.value !== index) return "idle";
    return loading.value ? "loading" : "playing";
  };
  /** Whether the line has a key to be spoken with and no refusal stands. */
  const canSpeak = (index: number): boolean => options.lines[index]?.key != null && !queue.refused();
  /** Whether pressing it again costs nothing: the clip is already here. */
  const isFetched = (index: number): boolean => made.has(index);

  function silence(): void {
    turn += 1;
    queue.stop();
    active.value = null;
    loading.value = false;
    if (playingNow === silence) playingNow = null;
  }

  async function toggle(index: number): Promise<void> {
    const line = options.lines[index];
    if (!line || line.key === null || queue.refused()) return;
    if (active.value === index) {
      silence();
      return;
    }
    silence();
    // Another card's line gives way: one voice line at a time, app-wide.
    if (playingNow !== null) playingNow();
    playingNow = silence;
    const mine = turn;
    active.value = index;
    let src = made.get(index);
    if (src === undefined) {
      loading.value = true;
      src =
        (await queue.fetchClip(() =>
          transport({ campaignId: options.campaignId, sessionId: null, role: "character", speakerId: options.speaker.id, speakerName: options.speaker.name, text: line.text, how: null, key: line.key }),
        )) ?? undefined;
      if (src !== undefined) made.set(index, src);
    }
    if (mine !== turn) return;
    loading.value = false;
    if (src === undefined) {
      active.value = null;
      return;
    }
    queue.enqueue([{ clip: Promise.resolve(src), voice: options.speaker.id }]);
    // The clip is over when the queue has drained it (busy is raised synchronously by enqueue).
    const stopWatching = watch(
      queue.busy,
      (busy) => {
        if (busy) return;
        stopWatching();
        if (mine === turn) active.value = null;
      },
      { flush: "sync" },
    );
  }

  return { phaseOf, canSpeak, isFetched, refusal, toggle, stop: silence };
}
