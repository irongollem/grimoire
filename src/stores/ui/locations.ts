// DM Atlas: filters, explorer state, site map layer bar.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

// Cap on remembered expanded ids; the player atlas (`player.ts`) reuses it so the
// two atlases cannot drift.
export const EXPANDED_CAP = 500;

export const useLocationsUiStore = defineStore("ui:locations", () => {
  // Locations (Atlas) UI state — DM
  const locationsSearch = ref("");
  const locationsFilterType = ref("all");

  const locationsHasActiveFilters = computed(
    () => locationsSearch.value !== "" || locationsFilterType.value !== "all",
  );

  function resetLocationsFilters() {
    locationsSearch.value = "";
    locationsFilterType.value = "all";
  }

  // Atlas explorer (DM) — which branches are open, which place is selected, and
  // whether its pane is showing contents or the map. Expansion is not a filter,
  // so `resetLocationsFilters` deliberately leaves it alone: clearing a search
  // should return you to the tree you had, not collapse the world.
  //
  // Persisted, unlike the filters below, and the exception is deliberate. A
  // world is nested several levels deep, so the branch you work in costs real
  // clicks to reopen — and a reload (a deploy, an HMR refresh, closing a tab)
  // would otherwise dump you at the top of the tree every time. There is
  // already an explicit way to start over: Collapse all.
  //
  // Stored as an array because a Set does not survive JSON, with a Set exposed
  // for lookups. Ids of deleted locations are inert — they simply match no row —
  // and the cap keeps the list from growing without bound across campaigns.

  const locationsExpandedIds = useStorage<string[]>("grimoire:atlas:expanded", [], safeLocalStorage());
  const locationsExpanded = computed(() => new Set(locationsExpandedIds.value));
  const locationsSelectedId = ref<string | null>(null);
  const locationsPaneMode = ref<"places" | "map">("places");

  // Whether the tree column is folded away, giving its width to the place
  // pane. Desktop-only in effect (there is no tree/pane split below `lg` to
  // fold — AtlasExplorer swaps the two panes instead), but the flag itself is
  // stored unconditionally rather than as a derived value: it is a durable
  // layout preference, the same idiom as `entityListLayout`/`questsIsKanban`,
  // not a list filter, so `useLocalStorage` is the right call rather than a
  // plain ref that resets on reload.
  //
  // Only the DM's own chevrons write it. A pane that wants the width (a
  // site's Map tab, the runner) and an open search are derived on top of it
  // in `useAtlasTreeFold`; writing them here is what once left the tree
  // folded for good after a reload.
  const locationsTreeCollapsed = useStorage("grimoire:atlas:treeCollapsed", false, safeLocalStorage());

  // The place the Atlas was left on. Selection itself lives in the URL
  // (`/locations?at=<id>`) so that Back walks the trail of places visited, and
  // that is worth keeping — but it means leaving the Atlas by the sidebar and
  // returning through a bare `/locations` dropped the place you were looking
  // at. This remembers it so arriving with no `at` can restore one.
  //
  // Stored, not session state: coming back to the map you were reading is the
  // same kind of durable preference as the tree's fold, and it should survive a
  // reload rather than only a Back.
  const locationsLastSelectedId = useStorage<string | null>("grimoire:atlas:lastSelected", null, safeLocalStorage());

  function rememberExpanded(ids: string[]) {
    locationsExpandedIds.value = ids.slice(-EXPANDED_CAP);
  }

  function toggleLocationExpanded(id: string) {
    const current = locationsExpandedIds.value;
    rememberExpanded(
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  /** Opens every ancestor so a deep location can be revealed and selected. */
  function revealLocationPath(ancestorIds: readonly string[]) {
    const missing = ancestorIds.filter((id) => !locationsExpandedIds.value.includes(id));
    if (missing.length) rememberExpanded([...locationsExpandedIds.value, ...missing]);
  }

  function collapseAllLocations() {
    locationsExpandedIds.value = [];
  }

  // Site map layer bar (#868, frame 03) — which of a site plan's overlays are
  // currently painted. A plain ref rather than `useLocalStorage`: which
  // layers are on is a working-session preference for whichever plan is open
  // right now, not a durable setting worth carrying between sessions or
  // sites the way `locationsTreeCollapsed` is.
  // `picture`/`drawing` (#884) toggle the map stack's own two image layers —
  // distinct from the traced-content layers above: turning the Drawing off
  // reveals the Picture beneath it (when there is one), and turning the
  // Picture off hides it where nothing else covers it. Default both on, same
  // as every other layer here.
  // `tokens`/`fog` (#884, wave 4, S12) are the stack's two PLAYED layers —
  // see `lib/locations/mapStack.ts`'s `MAP_STACK_LAYERS`. Default off: unlike
  // the authored layers above, a caller only ever offers these where play
  // state actually exists (a run surface, an encounter, Build's player
  // preview), so there is no "every other layer here" default to match —
  // fog starting on would open a site run already fogged before the DM
  // asked for it.
  const siteMapLayers = ref({
    spaces: true,
    ways: true,
    zones: false,
    prepared: false,
    grid: true,
    picture: true,
    drawing: true,
    tokens: false,
    fog: false,
  });

  // Which layers the DM has explicitly toggled this session — tracked here,
  // inside the one action that changes a layer's visibility, so no call site
  // can add a new way to flip `siteMapLayers` without also recording intent.
  // `revealPopulatedSiteMapLayers` below reads this set to know which layers
  // it must leave alone.
  const touchedSiteMapLayers = new Set<keyof typeof siteMapLayers.value>();

  function toggleSiteMapLayer(key: keyof typeof siteMapLayers.value) {
    touchedSiteMapLayers.add(key);
    siteMapLayers.value[key] = !siteMapLayers.value[key];
  }

  // #880 again, after #884 moved tracing out of this file's reach. The
  // original fix (`revealLayerForRegionRole`, removed by #884) turned a
  // structural layer on when the DM picked a region to trace *in
  // `MapRegionsLayer`* — but #884 moved all tracing into `MapWorkbench`,
  // which paints plan spaces/zones unconditionally, so that trigger no
  // longer exists and restoring the old function verbatim would be dead
  // code (CLAUDE.md's no-legacy rule). The defect survived anyway: `zones`
  // and `prepared` still default to false (see `siteMapLayers` above), and
  // `MapRegionsLayer`'s Browse/Run display path still gates on them, so a
  // DM who traces zones in Build and returns to Browse still sees nothing.
  //
  // Keyed on content rather than on region role this time: any structural
  // layer that has something in it and is still hidden gets revealed,
  // which also covers `prepared` (identical default, identical symptom)
  // and cannot regress when a third structural layer is added. It must
  // never fight a toggle the DM made on purpose, which is what
  // `touchedSiteMapLayers` is for, and it must never turn a layer off —
  // only ever the opposite of what #880 needed.
  function revealPopulatedSiteMapLayers(counts: {
    spaces: number;
    ways: number;
    zones: number;
    prepared: number;
  }) {
    for (const key of ["spaces", "ways", "zones", "prepared"] as const) {
      if (
        counts[key] > 0 &&
        !siteMapLayers.value[key] &&
        !touchedSiteMapLayers.has(key)
      ) {
        siteMapLayers.value[key] = true;
      }
    }
  }

  return {
    locationsSearch,
    locationsFilterType,
    locationsHasActiveFilters,
    resetLocationsFilters,
    locationsExpanded,
    locationsSelectedId,
    locationsLastSelectedId,
    locationsPaneMode,
    locationsTreeCollapsed,
    toggleLocationExpanded,
    revealLocationPath,
    collapseAllLocations,
    siteMapLayers,
    toggleSiteMapLayer,
    revealPopulatedSiteMapLayers,
  };
});
