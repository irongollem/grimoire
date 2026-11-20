import { ref, watch } from "vue";

/**
 * The text of a field that saves when it is left (`v-model.lazy`: blur or Enter), once per finished edit.
 *
 * - A blank or unchanged value saves nothing and puts the saved words back: a field emptied by mistake never wipes a
 *   row, and a no-op never writes.
 * - `revision` bumps on that revert. A revert to the words the field already held changes nothing Vue can see, so the
 *   field is remade (`:key="revision"`) to drop what was typed.
 * - The words follow the source when it changes (another tab, a refetch).
 */
export function useCommittedText(source: () => string, commit: (next: string) => void) {
  const text = ref(source());
  const revision = ref(0);
  watch(source, (next) => { text.value = next; });
  watch(text, (typed) => {
    // The revert below sets the saved words back, which wakes this watcher once more: nothing to do for that echo.
    if (typed === source()) return;
    const next = typed.trim();
    if (next === "" || next === source()) {
      text.value = source();
      revision.value++;
      return;
    }
    commit(next);
  });
  return { text, revision };
}
