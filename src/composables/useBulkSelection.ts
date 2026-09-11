import { computed, shallowRef, ref } from "vue";

/**
 * Bulk row selection for a list view (#875). A plain composable, not a store —
 * each list view calls it and owns its own selection, the same way
 * `useCardForgeStore`'s buckets are per-source rather than shared. Selection
 * is transient and per-visit; it is deliberately NOT a `useUiStore` filter (the
 * Filter State Pattern governs filters over the list, which this is not), so
 * navigating away and back starts empty.
 *
 * The `Set` lives in a `shallowRef` and is replaced (never mutated in place)
 * on every change so Vue's reactivity actually tracks it — the same idiom
 * `src/stores/cardForge.ts:57` uses for its per-source `Set<string>` buckets.
 */
export function useBulkSelection() {
  const selecting = ref(false);
  const selectedIds = shallowRef<ReadonlySet<string>>(new Set());

  const count = computed(() => selectedIds.value.size);

  function isSelected(id: string): boolean {
    return selectedIds.value.has(id);
  }

  function toggle(id: string): void {
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
  }

  /** "Select all shown" — replaces the selection with exactly the ids given.
   *  The caller passes the filtered ids (every row passing the current
   *  filters), not the windowed/painted subset. */
  function selectAll(ids: readonly string[]): void {
    selectedIds.value = new Set(ids);
  }

  /** Empties the selection but stays in selection mode. */
  function clear(): void {
    selectedIds.value = new Set();
  }

  /** Clears the selection and leaves selection mode entirely. */
  function stop(): void {
    selectedIds.value = new Set();
    selecting.value = false;
  }

  /**
   * Drops any selected id that is no longer in `validIds` and returns what's
   * left. Call this whenever the set of rows a selection may legally apply to
   * changes — a filter edit, a campaign switch, a background refetch — and
   * again immediately before a batched write, so an id from a row the DM can
   * no longer see (hidden by a filter, or gone from the underlying list) can
   * never reach it. A selection is otherwise never pruned on its own: it does
   * not depend on the filtered list, so a stale id would sit there silently
   * until the caller checks.
   */
  function pruneTo(validIds: Iterable<string>): string[] {
    const valid = validIds instanceof Set ? validIds : new Set(validIds);
    const kept = [...selectedIds.value].filter((id) => valid.has(id));
    if (kept.length !== selectedIds.value.size) selectedIds.value = new Set(kept);
    return kept;
  }

  return { selecting, selectedIds, count, isSelected, toggle, selectAll, clear, stop, pruneTo };
}
