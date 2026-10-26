// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWorldUiStore } from "./world";

describe("world web filter state", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("carries every filter across navigation and clears them together", () => {
    const store = useWorldUiStore();
    expect(store.hasActiveFilters).toBe(false);

    store.worldWebSearch = "ama";
    store.toggleKind("item");
    store.setGroup("faction", "f1");
    store.worldWebTieFamily = "faith";

    const again = useWorldUiStore();
    expect(again.hasActiveFilters).toBe(true);
    expect([again.worldWebSearch, again.worldWebHiddenKinds, again.worldWebGroupKind, again.worldWebGroupId, again.worldWebTieFamily])
      .toEqual(["ama", ["item"], "faction", "f1", "faith"]);

    again.resetWorldWebFilters();
    expect(again.hasActiveFilters).toBe(false);
    expect(again.worldWebHiddenKinds).toEqual([]);
    expect(again.worldWebGroupKind).toBe("");
  });

  it("toggles a kind off and back on", () => {
    const store = useWorldUiStore();
    store.toggleKind("deity");
    expect(store.worldWebHiddenKinds).toEqual(["deity"]);
    store.toggleKind("deity");
    expect(store.worldWebHiddenKinds).toEqual([]);
  });

  it("a group is only active once something is chosen", () => {
    const store = useWorldUiStore();
    store.setGroup("location");
    expect(store.hasActiveFilters).toBe(false);
    store.setGroup("location", "l1");
    expect(store.hasActiveFilters).toBe(true);
  });
});
