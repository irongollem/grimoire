// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useHallUiStore } from "./hall";

describe("Hall of the Fallen filters", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("starts untouched, each filter alone lights Clear, and Clear returns to untouched", () => {
    const ui = useHallUiStore();
    expect(ui.hallCampaign).toBeNull();
    expect(ui.hallKind).toBe("all");
    expect(ui.hasHallFiltersActive).toBe(false);

    ui.hallKind = "fallen";
    expect(ui.hasHallFiltersActive).toBe(true);
    ui.resetHallFilters();
    expect(ui.hasHallFiltersActive).toBe(false);

    ui.hallCampaign = "c1";
    expect(ui.hasHallFiltersActive).toBe(true);
    ui.hallKind = "retired";
    ui.resetHallFilters();
    expect(ui.hallCampaign).toBeNull();
    expect(ui.hallKind).toBe("all");
    expect(ui.hasHallFiltersActive).toBe(false);
  });
});

describe("Hall of Heroes filters", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("a setting alone lights Clear, a blank search does not, and Clear puts both back", () => {
    const ui = useHallUiStore();
    ui.hallOfHeroesSearch = "   ";
    expect(ui.hallOfHeroesHasActiveFilters).toBe(false);

    ui.hallOfHeroesSearch = "";
    ui.hallOfHeroesFilterSetting = "Sugarwell";
    expect(ui.hallOfHeroesHasActiveFilters).toBe(true);

    ui.resetHallOfHeroesFilters();
    ui.hallOfHeroesSearch = "ribbon";
    expect(ui.hallOfHeroesHasActiveFilters).toBe(true);

    ui.hallOfHeroesFilterSetting = "Sugarwell";
    ui.resetHallOfHeroesFilters();
    expect(ui.hallOfHeroesSearch).toBe("");
    expect(ui.hallOfHeroesFilterSetting).toBe("all");
    expect(ui.hallOfHeroesHasActiveFilters).toBe(false);
  });
});
