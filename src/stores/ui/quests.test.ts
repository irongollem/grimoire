// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useQuestsUiStore } from "./quests";

describe("quest filter state", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  // Each filter alone must light the Clear button and be put back by it: a
  // filter missing from either `questsHasActiveFilters` or the reset leaves a
  // board that is narrowed with nothing to say so, or a Clear that does not.
  it.each([
    ["search", (s: ReturnType<typeof useQuestsUiStore>) => { s.questsSearch = "vault"; }],
    ["party", (s: ReturnType<typeof useQuestsUiStore>) => { s.questsPartyFilter = true; }],
    ["entity", (s: ReturnType<typeof useQuestsUiStore>) => { s.questsEntityFilter = "faction:faction-1"; }],
    ["prep gaps", (s: ReturnType<typeof useQuestsUiStore>) => { s.questsPrepGapsFilter = true; }],
    ["loot", (s: ReturnType<typeof useQuestsUiStore>) => { s.questsLootFilter = true; }],
  ])("the %s filter alone lights Clear, survives navigation, and is put back by it", (_name, narrow) => {
    narrow(useQuestsUiStore());

    // Navigating to another view and back resolves the same store instance.
    const afterNavigation = useQuestsUiStore();
    expect(afterNavigation.questsHasActiveFilters).toBe(true);

    afterNavigation.resetQuestsFilters();
    expect(afterNavigation.questsHasActiveFilters).toBe(false);
    expect({
      search: afterNavigation.questsSearch,
      party: afterNavigation.questsPartyFilter,
      entity: afterNavigation.questsEntityFilter,
      prep: afterNavigation.questsPrepGapsFilter,
      loot: afterNavigation.questsLootFilter,
    }).toEqual({ search: "", party: false, entity: "", prep: false, loot: false });
  });

  // The story-flow canvas remembers what was selected per quest; opening
  // another quest must not inherit a beat id that belongs to the first.
  it("hands back the remembered selection only to the quest it was made in", () => {
    const store = useQuestsUiStore();
    store.questFlowSelection = { questId: "q1", beatId: "b1", edgeId: null };
    expect(store.questFlowSelectionFor("q1")).toEqual({ questId: "q1", beatId: "b1", edgeId: null });
    expect(store.questFlowSelectionFor("q2")).toBeNull();
  });

  it("does not persist filters, so a later session opens on the whole board", async () => {
    const first = useQuestsUiStore();
    first.questsSearch = "vault";
    first.questsPrepGapsFilter = true;
    await nextTick();

    expect(Object.keys(localStorage).filter((key) => key.startsWith("grimoire:quests:")))
      .toEqual(["grimoire:quests:kanban"]);

    setActivePinia(createPinia());
    const nextSession = useQuestsUiStore();
    expect(nextSession.questsSearch).toBe("");
    expect(nextSession.questsPrepGapsFilter).toBe(false);
    expect(nextSession.questsHasActiveFilters).toBe(false);
  });

  it("keeps the kanban/list layout choice, which is a preference rather than a filter", async () => {
    const first = useQuestsUiStore();
    first.questsIsKanban = false;
    await nextTick();

    setActivePinia(createPinia());
    expect(useQuestsUiStore().questsIsKanban).toBe(false);
  });
});
