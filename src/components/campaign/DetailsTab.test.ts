import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DetailsTab from "./DetailsTab.vue";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  row: {} as Record<string, unknown>,
}));

vi.mock("@/composables/campaign/useCampaigns", () => ({
  useCampaignById: () => ({ data: ref(mocks.row) }),
  useUpdateCampaign: () => ({ mutateAsync: mocks.update, isPending: ref(false) }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: null, switchToCampaign: vi.fn() }),
}));
vi.mock("@/composables/useTheme", () => ({ useTheme: () => ({ themes: [], setTheme: vi.fn() }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  usePopulateLocations: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  usePopulateFactions: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({
  usePopulateSettingNpcs: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));

function mountTab() {
  return mount(DetailsTab, { global: { stubs: { DemoCampaignPanel: true, CalendarEditor: true } } });
}

function option(wrapper: ReturnType<typeof mountTab>, caption: string) {
  const hit = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text().startsWith(caption));
  if (!hit) throw new Error(`no option ${caption}`);
  return hit;
}

describe("DetailsTab map settings", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.update.mockResolvedValue({ id: "c1" });
    mocks.row = {
      id: "c1", name: "Test", setting: "Forgotten Realms", calendar_id: "faerun", current_year: 1495,
      climate: "temperate", theme: "vellum", health_visibility: "strategic", immersive_rolls: false,
      battle_map_show_tokens: true, custom_calendar: null, map_memory: "remembered", player_sight: "shared",
    };
  });

  it("marks the stored value active, not the first option", () => {
    mocks.row.map_memory = "strict";
    mocks.row.player_sight = "own";
    const w = mountTab();
    expect(option(w, "Strict").props("active")).toBe(true);
    expect(option(w, "Remembered").props("active")).toBe(false);
    expect(option(w, "Each their own").props("active")).toBe(true);
    expect(option(w, "Shared by the party").props("active")).toBe(false);
  });

  it("saves only the two changed columns when Strict and Each their own are picked", async () => {
    const w = mountTab();
    await option(w, "Strict").trigger("click");
    await option(w, "Each their own").trigger("click");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({
      id: "c1",
      update: { map_memory: "strict", player_sight: "own" },
    });
  });
});

describe("DetailsTab populate from setting", () => {
  beforeEach(() => {
    mocks.row = {
      id: "c1", name: "Test", setting: "Forgotten Realms", calendar_id: "faerun", current_year: 1495,
      climate: "temperate", theme: "vellum", health_visibility: "strategic", immersive_rolls: false,
      battle_map_show_tokens: true, custom_calendar: null, map_memory: "remembered", player_sight: "shared",
    };
  });

  // Bug: the panel named the calendar picked in the unsaved form while the
  // seeders read the saved one, so Populate seeded a world it did not offer.
  it("offers the saved calendar's setting, not one picked but not yet saved", async () => {
    const w = mountTab();
    expect(w.text()).toContain("POPULATE FROM FORGOTTEN REALMS");
    const calendarSelect = w.findAll("select").find((s) => s.findAll("option").some((o) => o.element.value === "eberron"));
    if (!calendarSelect) throw new Error("no calendar select");
    await calendarSelect.setValue("eberron");
    expect(w.text()).toContain("POPULATE FROM FORGOTTEN REALMS");
    expect(w.text()).not.toContain("POPULATE FROM EBERRON");
  });
});
