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

function mountTab() {
  return mount(DetailsTab, { global: { stubs: { DemoCampaignPanel: true, RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } } } });
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

describe("DetailsTab violence dial", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.update.mockResolvedValue({ id: "c1" });
    mocks.row = {
      id: "c1", name: "Test", theme: "vellum", health_visibility: "strategic", immersive_rolls: false,
      battle_map_show_tokens: true, map_memory: "remembered", player_sight: "shared", table_violence: "standard",
    };
  });

  // Bug caught: the dial drawn but not part of the saved row, so the DM's choice is lost.
  it("saves only table_violence when Grim is picked", async () => {
    const w = mountTab();
    await option(w, "Grim").trigger("click");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", update: { table_violence: "grim" } });
  });

  // Bug caught: the stored level ignored, so every table opens on the first option.
  it("marks the stored level active", () => {
    mocks.row.table_violence = "gentle";
    const w = mountTab();
    expect(option(w, "Gentle").props("active")).toBe(true);
    expect(option(w, "Standard").props("active")).toBe(false);
  });

  // Bug caught: the fixed rule left unsaid, so a DM reads the dial as the whole of the table's content settings.
  it("says the sexual-content rules cannot be changed", () => {
    expect(mountTab().text()).toContain("The rules on sexual content are the same at every table and cannot be changed.");
  });
});

describe("DetailsTab and the canon's lines", () => {
  // Bug caught (#1255 item 25): the dial saying nothing of the lines and veils the Narrator also reads, so a DM sets one and forgets the other.
  it("says what must never happen is set in the canon's lines and veils, and links there", () => {
    mocks.row = { id: "c1", name: "Test", theme: "vellum", table_violence: "standard" };
    const line = mountTab().find("[data-testid=violence-canon-link]");
    expect(line.text()).toContain("What must never happen, or only off screen, is set in the canon's lines and veils.");
    expect(line.find("a").attributes("href")).toBe("/canon");
  });
});

describe("DetailsTab and the world's time", () => {
  // Bug: the calendar, today's year, the climate and the populate panel stayed in Settings after they moved to Canon's
  // "How the world works", so the same column could be edited in two places.
  it("holds none of what moved to Canon: no calendar, year, climate or populate panel, and saving writes none of them", async () => {
    mocks.update.mockReset();
    mocks.update.mockResolvedValue({ id: "c1" });
    mocks.row = {
      id: "c1", name: "Test", setting: "Forgotten Realms", calendar_id: "faerun", current_year: 1495,
      climate: "temperate", theme: "vellum", health_visibility: "strategic", immersive_rolls: false,
      battle_map_show_tokens: true, custom_calendar: null, map_memory: "remembered", player_sight: "shared",
    };
    const w = mountTab();
    expect(w.text()).not.toMatch(/CALENDAR|CURRENT YEAR|CLIMATE|POPULATE/);
    expect(w.find("select").exists()).toBe(false);
    await w.find("input").setValue("Renamed");
    await w.find("form").trigger("submit");
    await flushPromises();
    const { update } = mocks.update.mock.calls[0]![0];
    expect(update).toEqual({ name: "Renamed" });
  });
});
