// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useCanonUiStore } from "./canon";

describe("useCanonUiStore filters", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("starts with nothing narrowing the page", () => {
    expect(useCanonUiStore().hasActiveFilters).toBe(false);
  });

  // Bug caught: Clear showing for the arc but not for the search (or the reverse), so a narrowed page had no way back.
  it("is active with an arc chosen, or with the page's search typed", () => {
    const store = useCanonUiStore();
    store.arcFilter = "a1";
    expect(store.hasActiveFilters).toBe(true);
    store.arcFilter = null;
    store.query = "flood";
    expect(store.hasActiveFilters).toBe(true);
  });

  // Bug caught: a query of spaces counting as a filter, so Clear showed on a page nothing narrows.
  it("does not count a blank search as a filter", () => {
    const store = useCanonUiStore();
    store.query = "   ";
    expect(store.hasActiveFilters).toBe(false);
  });

  // Bug caught: the lore kind lighting no Clear, or Clear leaving the kind set so the chapter stays narrowed.
  it("lights the lore Clear for a kind and puts it back", () => {
    const store = useCanonUiStore();
    expect(store.loreHasActiveFilters).toBe(false);
    store.loreKindFilter = "faith";
    expect(store.loreHasActiveFilters).toBe(true);
    store.resetLoreFilters();
    expect(store.loreKindFilter).toBeNull();
  });

  it("resets the arc and the search", () => {
    const store = useCanonUiStore();
    store.arcFilter = "a1";
    store.query = "a";
    store.resetFilters();
    expect(store.arcFilter).toBeNull();
    expect(store.query).toBe("");
    expect(store.hasActiveFilters).toBe(false);
  });

  // Bug caught: Tonight opening on Everything, or a chosen scope neither counting as a filter nor clearing with the rest.
  it("opens Tonight on where the party is, and counts and clears another scope", () => {
    const store = useCanonUiStore();
    expect(store.tonightScope).toBe("party");
    store.tonightScope = "all";
    expect(store.hasActiveFilters).toBe(true);
    store.resetFilters();
    expect(store.tonightScope).toBe("party");
    expect(store.hasActiveFilters).toBe(false);
  });
});

describe("useCanonUiStore truths filter (#1258 item 22)", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  // Bug caught: the truths' Clear showing for a mark but not for grouping (or the reverse), leaving a grouped ledger with no way back.
  it("counts a mark filter or grouping as active, and resets both", () => {
    const store = useCanonUiStore();
    expect(store.truthsHaveActiveFilters).toBe(false);
    store.truthFilter = "secret";
    expect(store.truthsHaveActiveFilters).toBe(true);
    store.truthFilter = "any";
    store.truthsGrouped = true;
    expect(store.truthsHaveActiveFilters).toBe(true);
    store.truthFilter = "some";
    store.resetTruthFilters();
    expect(store.truthFilter).toBe("any");
    expect(store.truthsGrouped).toBe(false);
  });

  // Bug caught: Clear on the page wiping the truths' own filter, which belongs to that ledger.
  it("leaves the truths' filter alone when the page's filters are cleared", () => {
    const store = useCanonUiStore();
    store.truthFilter = "secret";
    store.resetFilters();
    expect(store.truthFilter).toBe("secret");
  });
});

describe("useCanonUiStore last part", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("is Premise until the DM has been elsewhere", () => {
    expect(useCanonUiStore().lastPart).toBe("premise");
  });

  // Bug caught: the last part kept only in memory, so /canon opened on Premise after every reload.
  it("is kept for the next visit", async () => {
    useCanonUiStore().lastPart = "lore";
    await nextTick();
    setActivePinia(createPinia());
    expect(useCanonUiStore().lastPart).toBe("lore");
  });

  // Bug caught: a stored part that no longer exists (a renamed part) opening /canon on nothing.
  it("falls back to Premise for a remembered part that is not one", () => {
    localStorage.setItem("grimoire:canon-part", "gone");
    expect(useCanonUiStore().lastPart).toBe("premise");
  });

  // Bug caught (#1283): the field guide's kingdom lighting no Clear, or Clear leaving the kingdom set so the list stays narrowed.
  it("lights the field guide Clear for a kingdom and puts it back", () => {
    const store = useCanonUiStore();
    expect(store.fieldGuideHasActiveFilters).toBe(false);
    store.fieldGuideKingdom = "plant";
    expect(store.fieldGuideHasActiveFilters).toBe(true);
    store.resetFieldGuideFilters();
    expect(store.fieldGuideKingdom).toBeNull();
    expect(store.fieldGuideHasActiveFilters).toBe(false);
  });
});
