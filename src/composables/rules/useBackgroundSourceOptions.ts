import { computed } from "vue";
import { backgroundBookKey, useBackgrounds } from "@/composables/rules/useBackgrounds";
import { useSourceTitles } from "@/composables/library/useSourceTitles";

/**
 * The source filter of a background list: "All sources", "Custom" (the DM's own
 * rows), then one option per book present in the loaded rows. A book's option
 * value is its key, so the filter state in the codex UI store is just a string.
 */
export function useBackgroundSourceOptions() {
  const { data: backgrounds } = useBackgrounds();
  const { labelFor } = useSourceTitles();
  return computed(() => {
    const books = new Map<string, string>();
    for (const b of backgrounds.value) {
      const key = backgroundBookKey(b);
      if (!key || books.has(key)) continue;
      const label = labelFor(key, b.source_title);
      if (label) books.set(key, label);
    }
    const perBook = [...books]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [
      { value: "all", label: "All sources" },
      { value: "custom", label: "Custom" },
      ...perBook,
    ];
  });
}
