import { computed } from "vue";
import { useContentLicenses } from "@/composables/library/useContentLicenses";

/**
 * Book titles by `content_sources` key, for rows whose `source` names a book
 * ("srd-2024" reads "System Reference Document 5.2"). A homebrew row's `source`
 * is free text, so a key with no book is shown as written.
 */
export function useSourceTitles() {
  const { data } = useContentLicenses();
  const titles = computed(() => new Map((data.value ?? []).map((s) => [s.key, s.title])));
  function titleFor(source: string | null): string | null {
    if (!source) return null;
    return titles.value.get(source) ?? source;
  }
  return { titleFor };
}
