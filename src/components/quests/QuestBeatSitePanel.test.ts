import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestBeatSitePanel from "./QuestBeatSitePanel.vue";
import type { QuestBeat } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useUpdateQuestBeat: () => ({ mutateAsync: mocks.update }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: { value: [
    { id: "site-1", name: "Cloister of Small Mercies", location_type: "building", parent_id: null, depth: 0 },
    { id: "room-1", name: "The nave", location_type: "room", parent_id: "site-1", depth: 1 },
    { id: "room-2", name: "The crypt", location_type: "room", parent_id: "site-1", depth: 1 },
    { id: "town-1", name: "Ashmouth", location_type: "town", parent_id: null, depth: 0 },
  ] } }),
}));

const beat = (overrides: Partial<QuestBeat> = {}): QuestBeat => ({
  id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", staged_at_location_id: null,
  ...overrides,
} as QuestBeat);

describe("QuestBeatSitePanel", () => {
  beforeEach(() => mocks.update.mockReset());

  it("offers to choose a site when the beat is not staged at one", () => {
    const wrapper = mount(QuestBeatSitePanel, { props: { beat: beat() }, global: { stubs: { EntityCombobox: true } } });
    expect(wrapper.text()).toContain("This beat can become a crawl");
    expect(wrapper.text()).toContain("none");
  });

  it("shows the room count and an Atlas link once staged at a site", () => {
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "site-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("site · 2 rooms");
    expect(wrapper.text()).toContain("Cloister of Small Mercies");
    expect(wrapper.findComponent({ name: "AppButton" }).exists()).toBe(true);
    const link = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Open in Atlas");
    expect(link?.props("to")).toBe("/locations/site-1");
  });

  it("does not treat a non-site location as a site, even when staged there", () => {
    const wrapper = mount(QuestBeatSitePanel, {
      props: { beat: beat({ staged_at_location_id: "town-1" }) },
      global: { stubs: { EntityCombobox: true, RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("This beat can become a crawl");
  });

  it("offers only site-tier locations, and saves the pick to the beat's staged location", async () => {
    const wrapper = mount(QuestBeatSitePanel, { props: { beat: beat() }, global: { stubs: { EntityCombobox: true } } });
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Choose site")!.trigger("click");

    const combo = wrapper.findComponent({ name: "EntityCombobox" });
    expect((combo.props("options") as Array<{ id: string }>).map((option) => option.id)).toEqual(["site-1"]);

    combo.vm.$emit("update:modelValue", "site-1");
    await flushPromises();

    expect(mocks.update).toHaveBeenCalledWith({
      id: "beat-1", questId: "quest-1", update: { staged_at_location_id: "site-1" },
    });
  });
});
