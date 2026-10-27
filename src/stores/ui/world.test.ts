// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWorldUiStore } from "./world";

describe("world web filter state", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it.each([
    ["search", (s: ReturnType<typeof useWorldUiStore>) => { s.worldWebSearch = "ama"; }],
    ["a hidden kind", (s: ReturnType<typeof useWorldUiStore>) => { s.toggleKind("item"); }],
    ["a chosen group", (s: ReturnType<typeof useWorldUiStore>) => { s.setGroup("faction", "f1"); }],
    ["a tie family", (s: ReturnType<typeof useWorldUiStore>) => { s.worldWebTieFamily = "faith"; }],
  ])("%s alone lights Clear, survives navigation, and is put back by it", (_name, narrow) => {
    const store = useWorldUiStore();
    expect(store.hasActiveFilters).toBe(false);
    narrow(store);

    const again = useWorldUiStore();
    expect(again.hasActiveFilters).toBe(true);

    again.resetWorldWebFilters();
    expect(again.hasActiveFilters).toBe(false);
    expect([again.worldWebSearch, again.worldWebHiddenKinds, again.worldWebGroupKind, again.worldWebGroupId, again.worldWebTieFamily])
      .toEqual(["", [], "", "", ""]);
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
