import { computed } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { sourceLabel } from "@/lib/library/sourceLabel";

const SOURCE_TITLES_KEY = ["content-source-titles"] as const;

async function fetchSourceTitles(): Promise<{ key: string; title: string }[]> {
  // Read from the table itself, not `get_content_licenses`: that one lists only
  // the books with monsters, spells, items, species, rules or classes in them,
  // so a Dungeon Craft or Backgrounds book had no title to look up.
  const { data, error } = await supabase.from("content_sources").select("key, title");
  if (error) throw error;
  return data;
}

/**
 * Labels for a row's source (see `sourceLabel`). Every badge, tag, header line
 * and filter option that names a book goes through `labelFor`, so a book is
 * called the same thing on every screen. Books change only by migration, hence
 * `staleTime: Infinity`.
 *
 * Shared (`createSharedComposable`): a virtualised grid mounts a SourceBadge per
 * card, and they all read one query observer and one title Map rather than
 * each building its own. Until the titles arrive `labelFor` names nothing, so a
 * badge appears once with the book's title instead of flashing its raw key.
 */
function useSourceTitlesImpl() {
  const { data, isPending } = useQuery({
    queryKey: SOURCE_TITLES_KEY,
    queryFn: fetchSourceTitles,
    staleTime: Infinity,
  });
  const titles = computed(() => new Map((data.value ?? []).map((s) => [s.key, s.title])));
  function labelFor(source: string | null | undefined, storedTitle?: string | null): string | null {
    if (isPending.value) return null;
    return sourceLabel(source, storedTitle, titles.value);
  }
  return { labelFor };
}

export const useSourceTitles = createSharedComposable(useSourceTitlesImpl);
