import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ update: vi.fn(), switchTo: vi.fn(), row: {} as Record<string, unknown> }));
vi.mock("@/composables/campaign/useCampaigns", () => ({
  useCampaignById: () => ({ data: ref(mocks.row) }),
  useUpdateCampaign: () => ({ mutateAsync: mocks.update, isPending: ref(false) }),
}));
vi.mock("@/composables/rules/useSpecies", () => ({ useCampaignSpecies: () => ({ data: ref([{ name: "Tabaxi" }]) }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: null, switchToCampaign: mocks.switchTo }) }));

import WorldPeoples from "./WorldPeoples.vue";

async function setField(w: ReturnType<typeof mount>, label: string, value: string) {
  const input = w.find(`input[aria-label="${label}"]`);
  (input.element as HTMLInputElement).value = value;
  await input.trigger("input");
}

describe("WorldPeoples", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.update.mockReset();
    mocks.update.mockResolvedValue({ id: "c1" });
    mocks.switchTo.mockReset();
    mocks.row = { id: "c1", peoples: [{ name: "Elf", percent: 80 }, { name: "Human", percent: 10 }] };
  });

  // Bug: a change to a share never reached campaigns.peoples, so the generator kept rolling the old odds.
  it("saves the list when a share changes", async () => {
    const w = mount(WorldPeoples);
    await setField(w, "Share of Human, percent", "15");
    await vi.advanceTimersByTimeAsync(11_000);
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", update: { peoples: [{ name: "Elf", percent: 80 }, { name: "Human", percent: 15 }] } });
  });

  // Bug: a total past 100 was sent and the database refused it, instead of the screen saying so.
  it("says a total past 100 and does not save it", async () => {
    const w = mount(WorldPeoples);
    await setField(w, "Share of Human, percent", "30");
    await vi.advanceTimersByTimeAsync(11_000);
    await flushPromises();
    expect(w.find("[role=alert]").text()).toContain("110%");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("shows the running total and what is left for anyone else", () => {
    const w = mount(WorldPeoples);
    expect(w.get("[data-testid=peoples-total]").text()).toBe("Adds up to 90%. The other 10% is anyone else.");
  });

  // Bug: removing a row only hid it, and the saved list still held the people.
  it("removes a people and saves the rest", async () => {
    const w = mount(WorldPeoples);
    await w.find("button[aria-label='Remove Human']").trigger("click");
    await vi.advanceTimersByTimeAsync(11_000);
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", update: { peoples: [{ name: "Elf", percent: 80 }] } });
  });
});
