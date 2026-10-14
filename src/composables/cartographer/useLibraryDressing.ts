// The shared Dressing library (epic #1062): top-down props a DM places on a
// Cartographer map. Rows change only by migration, so one fetch an hour is
// plenty; the same shape as the Dungeon Craft libraries (#1060).

import { computed, onScopeDispose, shallowRef, watch, type ShallowRef } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useLibrarySourceSlugs } from "@/composables/library/useEnabledSources";
import { buildDressingCatalog, loadDressingImage } from "@/cartographer/dressingImages";
import type { DressingCatalog } from "@/cartographer/dressing";
import type { LibraryDressing } from "@/types/dressing.types";

const LIBRARY_KEY = "library-dressing";
const LIBRARY_STALE_MS = 60 * 60 * 1000;
const COLUMNS = "id, name, group_key, tags, footprint_w, footprint_h, image_url, source";

async function fetchAllLibraryDressing(): Promise<LibraryDressing[]> {
  const { data, error } = await supabase.from("library_dressing").select(COLUMNS).order("name", { ascending: true });
  if (error) throw error;
  return data as LibraryDressing[];
}

async function fetchLibraryDressingFrom(slugs: string[]): Promise<LibraryDressing[]> {
  const { data, error } = await supabase
    .from("library_dressing")
    .select(COLUMNS)
    .in("source", slugs)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as LibraryDressing[];
}

/** Every library prop, enabled or not: what a placed prop's id RESOLVES
 *  against. Enablement governs what is offered, never whether a prop already
 *  on a map still draws (#954). */
export function useAllLibraryDressing() {
  return useQuery({ queryKey: [LIBRARY_KEY, "all"], queryFn: fetchAllLibraryDressing, staleTime: LIBRARY_STALE_MS });
}

/** The props of the books this scope has enabled: what the picker OFFERS. Held
 *  until the enabled sources are known (`null`, see useLibrarySourceSlugs). */
export function useLibraryDressing() {
  const { slugs } = useLibrarySourceSlugs();
  const query = useQuery({
    queryKey: computed(() => [LIBRARY_KEY, "enabled", slugs.value] as const),
    queryFn: () => fetchLibraryDressingFrom(slugs.value!),
    enabled: () => slugs.value !== null,
    staleTime: LIBRARY_STALE_MS,
  });
  // While the enabled sources are unknown the list is loading, not empty.
  return { ...query, isLoading: computed(() => query.isLoading.value || slugs.value === null) };
}

/**
 * The catalog the renderer and the bake read: every prop, with its image once
 * loaded. It appears at once with `image: null` (props draw as placeholders),
 * then each image swaps in as a NEW Map so watchers over `catalog` re-render.
 */
export function useDressingCatalog(): { catalog: ShallowRef<DressingCatalog> } {
  const { data } = useAllLibraryDressing();
  const catalog = shallowRef<DressingCatalog>(new Map());
  const images = new Map<string, CanvasImageSource>();
  let rows: LibraryDressing[] = [];
  let stopped = false;

  function rebuild(): void {
    catalog.value = buildDressingCatalog(rows, images);
  }

  watch(
    data,
    (next) => {
      if (!next) return;
      rows = next;
      rebuild();
      // Keyed by url, not prop id: a republished picture is a new url, and the
      // prop must pick it up rather than keep the one loaded first.
      for (const row of next) {
        const url = row.image_url;
        if (!url || images.has(url)) continue;
        void loadDressingImage(url).then((img) => {
          if (stopped || !img || images.has(url)) return;
          images.set(url, img);
          rebuild();
        });
      }
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    stopped = true;
  });

  return { catalog };
}
