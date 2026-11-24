// Ask Grimoire (#1253): app-shell state of the panel. Whether it is open, whether it has ever been (so the lazy
// panel is mounted and then stays mounted, which is what keeps a running turn alive while it is hidden), a result
// the DM has not seen, and a question waiting for the panel to send it (from the search box).
import { defineStore } from "pinia";
import { ref } from "vue";

export const useAskUiStore = defineStore("ask-ui", () => {
  const open = ref(false);
  const everOpened = ref(false);
  /** A result arrived while the panel was closed (or elsewhere on screen): the Ask button wears a dot. */
  const hasUnread = ref(false);
  /** A question to send as the first message the moment the panel is there. */
  const pendingQuery = ref<string | null>(null);
  /** A request to write into the box unsent (the Canon's Suggest): the DM may change it, then sends. */
  const prefill = ref<string | null>(null);
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

  return { open, everOpened, hasUnread, pendingQuery, prefill, takePrefill, focusRequest, openPanel, closePanel, togglePanel, markUnread, takePendingQuery };
});
