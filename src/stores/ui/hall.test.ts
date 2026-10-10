// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useHallUiStore } from "./hall";

describe("Hall of the Fallen filters", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("starts untouched, lights up on a pick, and Clear returns to untouched", () => {
    const ui = useHallUiStore();
    expect(ui.hallCampaign).toBeNull();
    expect(ui.hallKind).toBe("all");
    expect(ui.hasHallFiltersActive).toBe(false);

    ui.hallKind = "fallen";
    expect(ui.hasHallFiltersActive).toBe(true);
    ui.hallCampaign = "all";
    ui.resetHallFilters();
    expect(ui.hallCampaign).toBeNull();
    expect(ui.hallKind).toBe("all");
    expect(ui.hasHallFiltersActive).toBe(false);
  });
});
