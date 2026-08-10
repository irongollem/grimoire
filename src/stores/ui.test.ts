import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useUiStore } from "./ui";

describe("quest filter state", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("carries every quest filter across navigation and clears them together", () => {
    const store = useUiStore();
    store.questsSearch = "vault";
    store.questsPartyFilter = true;
    store.questsEntityFilter = "faction:faction-1";
    store.questsPrepGapsFilter = true;
    store.questsLootFilter = true;

    // Navigating to another view and back resolves the same store instance.
    const afterNavigation = useUiStore();
    expect({
      search: afterNavigation.questsSearch,
      party: afterNavigation.questsPartyFilter,
      entity: afterNavigation.questsEntityFilter,
      prep: afterNavigation.questsPrepGapsFilter,
      loot: afterNavigation.questsLootFilter,
    }).toEqual({ search: "vault", party: true, entity: "faction:faction-1", prep: true, loot: true });
    expect(afterNavigation.questsHasActiveFilters).toBe(true);

    afterNavigation.resetQuestsFilters();
    expect(afterNavigation.questsHasActiveFilters).toBe(false);
    expect(afterNavigation.questsSearch).toBe("");
    expect(afterNavigation.questsPartyFilter).toBe(false);
    expect(afterNavigation.questsEntityFilter).toBe("");
    expect(afterNavigation.questsPrepGapsFilter).toBe(false);
    expect(afterNavigation.questsLootFilter).toBe(false);
  });

  it("does not persist filters, so a later session opens on the whole board", async () => {
    const first = useUiStore();
    first.questsSearch = "vault";
    first.questsPrepGapsFilter = true;
    await nextTick();

    expect(Object.keys(localStorage).filter((key) => key.startsWith("grimoire:quests:")))
      .toEqual(["grimoire:quests:kanban"]);

    setActivePinia(createPinia());
    const nextSession = useUiStore();
    expect(nextSession.questsSearch).toBe("");
    expect(nextSession.questsPrepGapsFilter).toBe(false);
    expect(nextSession.questsHasActiveFilters).toBe(false);
  });

  it("keeps the kanban/list layout choice, which is a preference rather than a filter", async () => {
    const first = useUiStore();
    first.questsIsKanban = false;
    await nextTick();

    setActivePinia(createPinia());
    expect(useUiStore().questsIsKanban).toBe(false);
  });
});
