/**
 * The request Ask Grimoire (#1253) hands to a screen it opens (Quest Designer, the map styler, a fight's complication
 * dialog): what the DM said, waiting for that screen to take it. Not a filter and not persisted: it is a one-shot
 * hand-over, so a screen takes it once and it is gone.
 *
 * It expires. A screen that never mounts (AI switched off for the campaign hides the Quest Designer) would otherwise
 * keep the text until the next visit, long after the DM forgot asking, and fill a box they did not expect.
 */
import { defineStore } from "pinia";
import { ref } from "vue";

/** How long an offered request stays waiting for its screen: the navigation and the screen's load, with room to spare. */
export const ASK_PREFILL_TTL_MS = 60_000;

interface Offered {
  text: string;
  at: number;
}

export const useAskPrefillStore = defineStore("ui:askPrefill", () => {
  const pending = ref<Record<string, Offered>>({});

  /** Leaves `text` for `screenId`, replacing anything still waiting there. */
  function offer(screenId: string, text: string) {
    pending.value = { ...pending.value, [screenId]: { text, at: Date.now() } };
  }

  /** The waiting request, once: null when there is none or it went stale. */
  function take(screenId: string): string | null {
    const offered = pending.value[screenId];
    if (!offered) return null;
    const { [screenId]: _taken, ...rest } = pending.value;
    pending.value = rest;
    return Date.now() - offered.at <= ASK_PREFILL_TTL_MS ? offered.text : null;
  }

  return { pending, offer, take };
});
