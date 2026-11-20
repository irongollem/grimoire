import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ update: vi.fn(), switchTo: vi.fn(), row: {} as Record<string, unknown> }));
vi.mock("@/composables/campaign/useCampaigns", () => ({
  useCampaignById: () => ({ data: ref(mocks.row) }),
  useUpdateCampaign: () => ({ mutateAsync: mocks.update, isPending: ref(false) }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: null, switchToCampaign: mocks.switchTo }) }));
vi.mock("@/stores/calendar", () => ({
  useCalendarStore: () => ({ adapter: { epochName: "DR", months: [{ num: 1, name: "Hammer", days: 30 }, { num: 2, name: "Alturiak", days: 30 }], formatDate: (y: number, m: number | null, d: number | null) => `${d} ${m} ${y}` } }),
}));

import WorldTime from "./WorldTime.vue";

const mountIt = () => mount(WorldTime, { global: { stubs: { CalendarEditor: true, WorldPopulate: true } } });

describe("WorldTime", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.update.mockResolvedValue({ id: "c1" });
    mocks.switchTo.mockReset();
    mocks.row = { id: "c1", calendar_id: "faerun", custom_calendar: null, current_year: 1495, current_month: 1, current_day: 5, climate: "temperate" };
  });

  // Bug: the fields moved out of Settings but saved nothing, or wrote the whole form back.
  it("writes only the calendar column when a calendar is chosen, and clears the custom one", async () => {
    const w = mountIt();
    await w.find("select[aria-label=Calendar]").setValue("eberron");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", update: { calendar_id: "eberron", custom_calendar: null } });
    expect(mocks.switchTo).toHaveBeenCalled();
  });

  it("writes today's date as year, month and day together when the day changes", async () => {
    const w = mountIt();
    const day = w.find("input[aria-label=Day]");
    (day.element as HTMLInputElement).value = "12";
    await day.trigger("change");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", update: { current_year: 1495, current_month: 1, current_day: 12 } });
  });

  it("refuses a day the month does not have, so today is never a date the calendar lacks", async () => {
    const w = mountIt();
    const day = w.find("input[aria-label=Day]");
    (day.element as HTMLInputElement).value = "31";
    await day.trigger("change");
    await flushPromises();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("never clears today's year: emptying the field writes nothing", async () => {
    const w = mountIt();
    const year = w.find("input[aria-label=Year]");
    (year.element as HTMLInputElement).value = "";
    await year.trigger("change");
    await flushPromises();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("writes the climate on its own", async () => {
    const w = mountIt();
    await w.find("select[aria-label=Climate]").setValue("polar");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", update: { climate: "polar" } });
  });
});
