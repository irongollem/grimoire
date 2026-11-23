import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useCanonUiStore } from "./canon";

describe("useCanonUiStore filters", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("starts with nothing narrowing the page", () => {
    expect(useCanonUiStore().hasActiveFilters).toBe(false);
  });

  // Bug caught: Clear showing for the arc but not for a search (or the reverse), so a narrowed list had no way back.
  it("is active with an arc chosen, or with any one part's search typed", () => {
    const store = useCanonUiStore();
    store.arcFilter = "a1";
    expect(store.hasActiveFilters).toBe(true);
    store.arcFilter = null;
    store.partQuery.lore = "flood";
    expect(store.hasActiveFilters).toBe(true);
  });

  // Bug caught: a query of spaces counting as a filter, so Clear showed on a list nothing narrows.
  it("does not count a blank search as a filter", () => {
    const store = useCanonUiStore();
    store.partQuery.truths = "   ";
    expect(store.hasActiveFilters).toBe(false);
  });

  it("resets the arc and every search", () => {
    const store = useCanonUiStore();
    store.arcFilter = "a1";
    store.partQuery.truths = "a";
    store.partQuery.backstories = "b";
    store.resetFilters();
    expect(store.arcFilter).toBeNull();
    expect(Object.values(store.partQuery).every((q) => q === "")).toBe(true);
    expect(store.hasActiveFilters).toBe(false);
  });
});
