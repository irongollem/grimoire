import { computed, onBeforeUnmount, watch } from "vue";
import { useTableVoice } from "@/composables/table/useTableVoice";
import { useToast } from "@/composables/useToast";
import type { StoryItem } from "@/lib/table/solo/soloTypes";
import { freshLines, linesOfItem, replayLines } from "@/lib/table/solo/voiceLines";

export interface TableSpeechDeps {
  campaignId: () => string | null;
  sessionId: () => string | null;
  /** The items the turn is telling now. */
  live: () => StoryItem[];
  /** The character the player plays, whose lines are the player's own voice. */
  played: () => { id: string; name: string } | null;
}

/**
 * The voices: the narrator's, the characters' and the player's own. A line is handed to the voice the moment it
 * arrives with the server's key for it, so the voice is being made while the player reads. `voiced` keeps each line
 * to once, counted whether or not its switch was on, so switching a voice on later does not read out what is past.
 */
export function useTableSpeech(deps: TableSpeechDeps) {
  const toast = useToast();
  const voice = useTableVoice({ campaignId: deps.campaignId, sessionId: deps.sessionId });
  const voiced = new Set<string>();
  const playedSpeaker = computed(() => deps.played());
  watch(
    () => deps.live(),
    (items) => {
      const fresh = items.flatMap((item) => {
        // Narration gets its keys stretch by stretch, so each stretch is counted on its own.
        const keyed = linesOfItem(item, playedSpeaker.value).filter((line) => line.key !== null && !voiced.has(`${item.id}:${line.key}`));
        if (keyed.length === 0) return [];
        for (const line of keyed) voiced.add(`${item.id}:${line.key}`);
        const stretches = new Set(keyed.map((line) => line.key));
        const only = item.kind === "narration" && item.voices ? { ...item, voices: item.voices.filter((v) => stretches.has(v.key)) } : item;
        return [only];
      });
      voice.say(freshLines(fresh, voice.parts.value, playedSpeaker.value));
    },
  );
  // Hearing something again. A line from a reopened sitting has no key: the server finds it in the conversation
  // itself (or answers the clip it kept), so anything on the page can be heard.
  function onReplay(item: StoryItem): void {
    voice.replay(replayLines(item, playedSpeaker.value));
  }
  watch(
    () => voice.unavailable.value,
    (off) => {
      if (!off) return;
      toast.error("Voices are not switched on for this server.");
      voice.setAllOff();
    },
  );
  watch(
    () => voice.spent.value,
    (spent) => {
      if (spent) toast.error("The voices have used up their allowance for now. The story goes on in text.");
    },
  );
  watch(
    () => voice.broke.value,
    (broke) => {
      if (broke) toast.error("You are out of credits, so the voices have stopped. The story goes on in text.");
    },
  );
  onBeforeUnmount(() => voice.stop());

  /** Another sitting is opened on this page: nothing of the last one is read out, and its lines are forgotten. */
  function restart(): void {
    voice.stop();
    voiced.clear();
  }

  return { voice, onReplay, restart };
}
