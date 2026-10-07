import { useQuery } from "@tanstack/vue-query";
import { toValue, type MaybeRefOrGetter } from "vue";
import { loadSettingContent } from "@/settings/content";

/**
 * A built-in setting's seed content (locations, factions, deities, the default
 * AI prompt), fetched as its own chunk the first time something renders it.
 * The data is static, so it never goes stale; `data` is null for an id that is
 * not a built-in setting (homebrew, custom) and undefined until it has loaded.
 * Use `getSetting` from `@/settings/index` instead when only the label or
 * calendar is needed, which costs no download.
 */
export function useSettingContent(settingId: MaybeRefOrGetter<string | null | undefined>) {
  return useQuery({
    queryKey: ["setting-content", () => toValue(settingId) ?? null],
    queryFn: () => {
      const id = toValue(settingId);
      if (!id) throw new Error("useSettingContent ran without a setting id");
      return loadSettingContent(id);
    },
    enabled: () => !!toValue(settingId),
    staleTime: Infinity,
  });
}
