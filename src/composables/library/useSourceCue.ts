import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useStorage } from "@vueuse/core";

/**
 * The "more library content to explore" dot on a sources trigger: shown while the
 * picker offers a source that is not enabled in the current scope and that this
 * viewer has not yet seen in this picker. Opening the picker marks everything it
 * lists as seen, so the dot only returns when a new source appears.
 *
 * Seen state is a per-viewer convenience (like a collapsed section), so it lives in
 * localStorage under one key. It is deliberately not a database table and not a list
 * filter, so it is not a UI store.
 */
export type SourceCueSeen = Record<string, string[]>;

/**
 * The decision, free of Vue and storage so it can be asserted directly. `enabled`
 * is null while the scope's enabled sources are still loading: not knowing what is
 * on yet must not flash a dot over a source that is.
 */
export function hasSourceCue(
  available: readonly { source: string }[] | undefined,
  enabled: ReadonlySet<string> | null,
  seen: readonly string[] | undefined,
): boolean {
  if (!available || !enabled) return false;
  return available.some((s) => !enabled.has(s.source) && !(seen ?? []).includes(s.source));
}

/** The seen list after opening the picker: everything it lists now, plus what was seen before. */
export function markSourcesSeen(
  available: readonly { source: string }[] | undefined,
  seen: readonly string[] | undefined,
): string[] {
  return [...new Set([...(seen ?? []), ...(available ?? []).map((s) => s.source)])];
}

export function useSourceCue(
  cueKey: MaybeRefOrGetter<string | undefined>,
  available: MaybeRefOrGetter<readonly { source: string }[] | undefined>,
  enabled: MaybeRefOrGetter<ReadonlySet<string> | null>,
) {
  const seenByCue = useStorage<SourceCueSeen>("library-source-cue-seen", {});
  const hasCue = computed(() => {
    const key = toValue(cueKey);
    if (!key) return false;
    return hasSourceCue(toValue(available), toValue(enabled), seenByCue.value[key]);
  });
  function markSeen() {
    const key = toValue(cueKey);
    const list = toValue(available);
    // Nothing listed yet (still loading) must not mark anything seen.
    if (!key || !list || list.length === 0) return;
    seenByCue.value = { ...seenByCue.value, [key]: markSourcesSeen(list, seenByCue.value[key]) };
  }
  return { hasCue, markSeen };
}
