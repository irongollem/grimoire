// Ask Grimoire (#1253): app-shell state of the panel. Whether it is open, whether it has ever been (so the lazy
// panel is mounted and then stays mounted, which is what keeps a running turn alive while it is hidden), a result
// the DM has not seen, and a question waiting for the panel to send it (from the search box).
import { defineStore } from "pinia";
import { ref } from "vue";
import type { AskRecordRef } from "@edge-shared/agent/askContract";

/** A generator its button asked the Familiar to open: its card waits here until the conversation takes it. */
export interface PendingGenerator {
  generatorId: string;
  /** Over the generator's own `opened` inputs. */
  inputs?: Record<string, unknown>;
  /** The record a `fill` generator works on. */
  target?: AskRecordRef;
  concept?: string;
}

export const useAskUiStore = defineStore("ask-ui", () => {
  const open = ref(false);
  const everOpened = ref(false);
  /** A result arrived while the panel was closed (or elsewhere on screen): the Ask button wears a dot. */
  const hasUnread = ref(false);
  /** A question to send as the first message the moment the panel is there. */
  const pendingQuery = ref<string | null>(null);
  /** A request to write into the box unsent (the Canon's Suggest): the DM may change it, then sends. */
  const prefill = ref<string | null>(null);
  /** A generator's card to open in the thread (a page's Generate button); no question is sent and nothing is charged. */
  const pendingGenerator = ref<PendingGenerator | null>(null);
  /** "Design it with me" asked for from a page (#1282): the panel takes it once and starts the walk in its thread. */
  const pendingWalk = ref(false);
  /** Rises each time the input should take focus (the hotkey, the button). */
  const focusRequest = ref(0);

  function openPanel(query?: string, { send = true }: { send?: boolean } = {}) {
    open.value = true;
    everOpened.value = true;
    hasUnread.value = false;
    focusRequest.value += 1;
    const q = query?.trim();
    if (!q) return;
    if (send) pendingQuery.value = q;
    else prefill.value = q;
  }

  /** Opens the Familiar on the generator's own card, ready for the DM to fill in. */
  function openGenerator(generatorId: string, options: Omit<PendingGenerator, "generatorId"> = {}) {
    openPanel();
    pendingGenerator.value = { generatorId, ...options };
  }

  /** Opens the Familiar on the walk through the canon: the first question is asked, nothing is charged. */
  function openWalk() {
    openPanel();
    pendingWalk.value = true;
  }

  function closePanel() {
    open.value = false;
  }

  function togglePanel() {
    if (open.value) closePanel();
    else openPanel();
  }

  function markUnread() {
    hasUnread.value = true;
  }

  /** Takes the waiting question once: a second call, or a remount, gets nothing, so it is never sent twice. */
  function takePendingQuery(): string | null {
    const q = pendingQuery.value;
    pendingQuery.value = null;
    return q;
  }

  /** Takes the waiting request once, for the composer to write into its box. */
  function takePrefill(): string | null {
    const q = prefill.value;
    prefill.value = null;
    return q;
  }

  /** Takes the waiting generator once: a second call, or a remount, gets nothing, so the card is never opened twice. */
  function takePendingGenerator(): PendingGenerator | null {
    const pending = pendingGenerator.value;
    pendingGenerator.value = null;
    return pending;
  }

  /** Takes the waiting walk request once: a second call, or a remount, gets false, so the walk never starts twice. */
  function takePendingWalk(): boolean {
    const pending = pendingWalk.value;
    pendingWalk.value = false;
    return pending;
  }

  return { pendingWalk, takePendingWalk, openWalk, open, everOpened, hasUnread, pendingQuery, prefill, takePrefill, pendingGenerator, takePendingGenerator, openGenerator, focusRequest, openPanel, closePanel, togglePanel, markUnread, takePendingQuery };
});
