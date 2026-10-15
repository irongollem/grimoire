// The shared Dressing library (epic #1062): top-down props a DM places on a
// Cartographer map. Rows change only by migration, so one fetch an hour is
// plenty; the same shape as the Dungeon Craft libraries (#1060).

import { computed, onScopeDispose, shallowRef, watch, type ShallowRef } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useLibrarySourceSlugs } from "@/composables/library/useEnabledSources";
import { buildDressingCatalog, loadDressingImage } from "@/cartographer/dressingImages";
import type { DressingCatalog } from "@/cartographer/dressing";
import type { LibraryDressing } from "@/types/dressing.types";

const LIBRARY_KEY = "library-dressing";
const LIBRARY_STALE_MS = 60 * 60 * 1000;
const COLUMNS = "id, name, group_key, tags, footprint_w, footprint_h, image_url, source, flat";

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
const allLibraryDressingQuery = {
  queryKey: [LIBRARY_KEY, "all"],
  queryFn: fetchAllLibraryDressing,
  staleTime: LIBRARY_STALE_MS,
};

export function useAllLibraryDressing() {
  return useQuery(allLibraryDressingQuery);
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
 * The catalog the renderer and the bake read: every prop's footprint, with art
 * for the props `wanted` names (those placed on the map, and the armed brush).
 * Art is loaded for nothing else: a 62-prop library is not downloaded to open
 * a map with three props on it, or none. The catalog appears with `image: null`
 * (props draw as placeholders), then each image swaps in as a NEW Map so
 * watchers over `catalog` re-render.
 *
 * `load()` is for a bake (publish, the AI styler, a PNG download): it waits for
 * the library rows and for every wanted prop's art, so nothing is baked with a
 * 1x1 stand-in footprint or a grey box that would have been art a moment later.
 */
export function useDressingCatalog(wanted: () => Iterable<string>): {
  catalog: ShallowRef<DressingCatalog>;
  load: () => Promise<DressingCatalog>;
} {
  const queryClient = useQueryClient();
  const { data } = useAllLibraryDressing();
  const catalog = shallowRef<DressingCatalog>(new Map());
  const images = new Map<string, CanvasImageSource>();
  let rows: LibraryDressing[] = [];
  let stopped = false;

  function rebuild(): void {
    catalog.value = buildDressingCatalog(rows, images);
  }

  /** Image urls of the wanted props not loaded yet. Keyed by url, not prop id:
   *  a republished picture is a new url, and the prop must pick it up rather
   *  than keep the one loaded first. */
  function missingUrls(ids: Iterable<string>): string[] {
    const urlById = new Map(rows.map((row) => [row.id, row.image_url]));
    const urls = new Set<string>();
    for (const id of ids) {
      const url = urlById.get(id);
      if (url && !images.has(url)) urls.add(url);
    }
    return [...urls];
  }

  async function loadArt(url: string): Promise<void> {
    const img = await loadDressingImage(url);
    if (stopped || !img || images.has(url)) return;
    images.set(url, img);
    rebuild();
  }

  const wantedIds = computed(() => new Set(wanted()));
  watch(
    [data, wantedIds],
    ([next, ids]) => {
      if (!next) return;
      if (next !== rows) {
        rows = next;
        rebuild();
      }
      for (const url of missingUrls(ids)) void loadArt(url);
    },
    { immediate: true },
  );

  async function load(): Promise<DressingCatalog> {
    const next = await queryClient.ensureQueryData(allLibraryDressingQuery);
    if (next !== rows) {
      rows = next;
      rebuild();
    }
    await Promise.all(missingUrls(wanted()).map(loadArt));
    return catalog.value;
  }

  onScopeDispose(() => {
    stopped = true;
  });

  return { catalog, load };
}
