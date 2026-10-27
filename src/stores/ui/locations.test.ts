// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { EXPANDED_CAP, useLocationsUiStore } from "./locations";

describe("Atlas explorer layout", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("opens on the tree expanded, and remembers a fold across navigation and reload", async () => {
    const first = useLocationsUiStore();
    expect(first.locationsTreeCollapsed).toBe(false);

    first.locationsTreeCollapsed = true;
    await nextTick();

    // Same navigation-survives-in-memory guarantee `locationsExpandedIds` gets.
    expect(useLocationsUiStore().locationsTreeCollapsed).toBe(true);

    // And unlike the ephemeral filters above, this is a layout preference —
    // a fresh session (reload, new tab) should still open with the fold kept,
    // the same idiom `questsIsKanban` uses.
    setActivePinia(createPinia());
    expect(useLocationsUiStore().locationsTreeCollapsed).toBe(true);
  });
});

describe("Atlas filters", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("each filter alone lights Clear, and Clear puts both back", () => {
    const store = useLocationsUiStore();
    expect(store.locationsHasActiveFilters).toBe(false);

    store.locationsSearch = "inn";
    expect(store.locationsHasActiveFilters).toBe(true);
    store.resetLocationsFilters();
    expect(store.locationsHasActiveFilters).toBe(false);

    store.locationsFilterType = "dungeon";
    expect(store.locationsHasActiveFilters).toBe(true);
    store.locationsSearch = "x";
    store.resetLocationsFilters();
    expect([store.locationsSearch, store.locationsFilterType]).toEqual(["", "all"]);
  });
});

describe("Atlas tree expansion", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("toggles one branch open and shut without touching the others", () => {
    const store = useLocationsUiStore();
    store.toggleLocationExpanded("a");
    store.toggleLocationExpanded("b");
    store.toggleLocationExpanded("a");
    expect([...store.locationsExpanded]).toEqual(["b"]);
  });

  it("reveals a deep place by opening only the ancestors that were shut", () => {
    const store = useLocationsUiStore();
    store.toggleLocationExpanded("region");
    store.revealLocationPath(["region", "town", "inn"]);
    expect([...store.locationsExpanded].sort()).toEqual(["inn", "region", "town"]);
    // Revealing again is a no-op, not a toggle.
    store.revealLocationPath(["region", "town", "inn"]);
    expect(store.locationsExpanded.size).toBe(3);
  });

  it("keeps the most recently opened branches when the remembered list hits its cap", () => {
    const store = useLocationsUiStore();
    const ids = Array.from({ length: EXPANDED_CAP + 1 }, (_, i) => `loc-${i}`);
    store.revealLocationPath(ids);
    expect(store.locationsExpanded.size).toBe(EXPANDED_CAP);
    expect(store.locationsExpanded.has("loc-0")).toBe(false);
    expect(store.locationsExpanded.has(`loc-${EXPANDED_CAP}`)).toBe(true);
  });

  it("spends the remembered list only on branches it did not already hold", () => {
    const store = useLocationsUiStore();
    store.revealLocationPath(Array.from({ length: EXPANDED_CAP }, (_, i) => `loc-${i}`));
    store.revealLocationPath([`loc-${EXPANDED_CAP - 1}`, "new"]);
    expect(store.locationsExpanded.has("loc-0")).toBe(false);
    expect(store.locationsExpanded.has("loc-1")).toBe(true);
    expect(store.locationsExpanded.has("new")).toBe(true);
  });

  it("collapses everything", () => {
    const store = useLocationsUiStore();
    store.revealLocationPath(["a", "b"]);
    store.collapseAllLocations();
    expect(store.locationsExpanded.size).toBe(0);
  });
});

describe("site map layers", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("toggles one layer without resetting the others", () => {
    const store = useLocationsUiStore();
    expect(store.siteMapLayers.zones).toBe(false);

    store.toggleSiteMapLayer("zones");
    expect(store.siteMapLayers.zones).toBe(true);
    expect(store.siteMapLayers.prepared).toBe(false);
  });
});

describe("revealPopulatedSiteMapLayers (#880, resurfaced after #884)", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  const emptyCounts = { spaces: 0, ways: 0, zones: 0, prepared: 0 };

  it("reveals a hidden layer that has content and was never explicitly toggled", () => {
    const store = useLocationsUiStore();
    expect(store.siteMapLayers.zones).toBe(false);

    store.revealPopulatedSiteMapLayers({ ...emptyCounts, zones: 3 });

    expect(store.siteMapLayers.zones).toBe(true);
  });

  it("leaves a hidden layer with zero content hidden", () => {
    const store = useLocationsUiStore();

    store.revealPopulatedSiteMapLayers({ ...emptyCounts, zones: 0, prepared: 0 });

    expect(store.siteMapLayers.zones).toBe(false);
    expect(store.siteMapLayers.prepared).toBe(false);
  });

  it("does not fight a layer the DM explicitly toggled off, even with content", () => {
    const store = useLocationsUiStore();
    store.toggleSiteMapLayer("zones"); // on
    store.toggleSiteMapLayer("zones"); // explicit off again
    expect(store.siteMapLayers.zones).toBe(false);

    store.revealPopulatedSiteMapLayers({ ...emptyCounts, zones: 5 });

    expect(store.siteMapLayers.zones).toBe(false);
  });

  it("leaves an already-visible layer untouched", () => {
    const store = useLocationsUiStore();
    expect(store.siteMapLayers.spaces).toBe(true);

    store.revealPopulatedSiteMapLayers({ ...emptyCounts, spaces: 4 });

    expect(store.siteMapLayers.spaces).toBe(true);
  });

  it("never turns a layer off", () => {
    const store = useLocationsUiStore();
    expect(store.siteMapLayers.grid).toBe(true);

    store.revealPopulatedSiteMapLayers(emptyCounts);

    expect(store.siteMapLayers.grid).toBe(true);
  });
});
