// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useLocationsUiStore } from "./locations";

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
