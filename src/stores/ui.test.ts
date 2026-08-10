import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useUiStore } from "./ui";

describe("quest filter persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("restores every composable quest filter and clears them together", async () => {
    const first = useUiStore();
    first.questsSearch = "vault";
    first.questsPartyFilter = true;
    first.questsEntityFilter = "faction:faction-1";
    first.questsPrepGapsFilter = true;
    first.questsLootFilter = true;
    await nextTick();

    setActivePinia(createPinia());
    const restored = useUiStore();
    expect({
      search: restored.questsSearch,
      party: restored.questsPartyFilter,
      entity: restored.questsEntityFilter,
      prep: restored.questsPrepGapsFilter,
      loot: restored.questsLootFilter,
    }).toEqual({ search: "vault", party: true, entity: "faction:faction-1", prep: true, loot: true });
    expect(restored.questsHasActiveFilters).toBe(true);

    restored.resetQuestsFilters();
    expect(restored.questsHasActiveFilters).toBe(false);
    expect(restored.questsEntityFilter).toBe("");
    expect(restored.questsPrepGapsFilter).toBe(false);
    expect(restored.questsLootFilter).toBe(false);
  });
});
