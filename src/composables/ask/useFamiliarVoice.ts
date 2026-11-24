import { computed, ref, watch } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useAuthStore } from "@/stores/auth";
import { sendToTableVoice, type VoiceTransport } from "@/composables/table/useTableVoice";
import { useClipQueue, type VoicePlayer } from "@/composables/voices/useClipQueue";

/** The name Ooru's words are kept under on the server (`FAMILIAR_SPEAKER`); the server sets it whatever is sent. */
export const FAMILIAR_NAME = "Ooru";

// Whether each account wants Ooru's replies read aloud, on this device. Off until asked for: sound a page starts by
// itself is not something to surprise anyone with, and every voiced reply is a paid call.
const wanted = useStorage<Record<string, boolean>>("grimoire:familiar-voice", {}, safeLocalStorage());

/**
 * Ooru reading its own replies aloud (Ask Grimoire, `ask-grimoire.md` "Ooru reads aloud"). Only the words the Familiar wrote are ever handed to `say`; this never
 * decides what is said, it only refuses to speak while the switch is off. It never throws and never blocks the
 * conversation: a reply that cannot be voiced is skipped, and a 503 or 402 is remembered (`unavailable`, `broke`,
 * `spent`) so nothing more is asked until the switch is turned on again or another account signs in.
 */
export function useFamiliarVoice(options: { transport?: VoiceTransport; player?: VoicePlayer } = {}) {
  const auth = useAuthStore();
  const transport = options.transport ?? sendToTableVoice;
  const userId = computed(() => auth.user?.id ?? null);
  const voice = useClipQueue({ owner: userId, player: options.player });

  const on = computed(() => userId.value !== null && wanted.value[userId.value] === true);

  /** Reads these replies after whatever is waiting. Does nothing, and asks for nothing, while off or refused. */
  function say(input: { campaignId: string; sessionId: string; texts: readonly string[] }): void {
    if (!on.value || voice.refused()) return;
    // Asked for at once, all of them: making a voice takes seconds, and they are played in order.
    // No key: Ask signs nothing, and the server proves the words against the conversation's stored turns.
    voice.enqueue(
      input.texts.map((text) => ({
        clip: voice.fetchClip(() =>
          transport({ campaignId: input.campaignId, sessionId: input.sessionId, text, role: "familiar", speakerId: null, speakerName: FAMILIAR_NAME, how: null, key: null }),
        ),
        voice: FAMILIAR_NAME,
      })),
    );
  }

  /** The reply being read on its own speaker button, so that button can show Stop; null otherwise. */
  const replaying = ref<string | null>(null);
  watch(voice.busy, (busy) => {
    if (!busy) replaying.value = null;
  });

  /**
   * Reads one reply on its own speaker button, now: whatever plays gives way. A press is asking, so it plays with the
   * read-aloud switch off as well (refused only while a refusal stands). The server answers from the clip it kept, so
   * a reply already read costs nothing; one never read is made and charged like any.
   */
  function replay(input: { campaignId: string; sessionId: string; text: string }): void {
    voice.stop();
    if (voice.refused()) return;
    replaying.value = input.text;
    voice.enqueue([
      {
        clip: voice.fetchClip(() =>
          transport({ campaignId: input.campaignId, sessionId: input.sessionId, text: input.text, role: "familiar", speakerId: null, speakerName: FAMILIAR_NAME, how: null, key: null }),
        ),
        voice: FAMILIAR_NAME,
      },
    ]);
  }

  function stop(): void {
    voice.stop();
    replaying.value = null;
  }

  function setOn(value: boolean): void {
    const id = userId.value;
    if (id === null) return;
    wanted.value = { ...wanted.value, [id]: value };
    if (!value) voice.stop();
    else voice.clearRefusals();
  }

  return { on, setOn, speaking: voice.speaking, replaying, unavailable: voice.unavailable, spent: voice.spent, broke: voice.broke, say, replay, stop };
}
