import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartyMilestonesPanel from "./PartyMilestonesPanel.vue";
import type { PartyMilestone } from "@/types/quest.types";

const routerStubs = { RouterLink: RouterLinkStub };

function milestone(overrides: Partial<PartyMilestone> & { id: string }): PartyMilestone {
  return {
    campaign_id: "c1",
    quest_id: null,
    text: "The party earned renown",
    source_event_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as PartyMilestone;
}

const mocks = vi.hoisted(() => ({
  milestones: { value: [] as PartyMilestone[] },
  quests: { value: [] as Array<{ id: string; title: string }> },
  createMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  createPending: false,
  confirmResult: true,
}));

vi.mock("@/composables/party/usePartyMilestones", () => ({
  usePartyMilestones: () => ({ data: mocks.milestones }),
  useCreatePartyMilestone: () => ({
    mutateAsync: mocks.createMilestone,
    isPending: { value: mocks.createPending },
  }),
  useDeletePartyMilestone: () => ({ mutateAsync: mocks.deleteMilestone }),
}));

vi.mock("@/composables/quests/useQuests", () => ({
  useQuests: () => ({ data: mocks.quests }),
}));

vi.mock("@/composables/useConfirm", () => ({
  useConfirm: () => ({ confirm: vi.fn().mockImplementation(() => Promise.resolve(mocks.confirmResult)) }),
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "c1" }),
}));

describe("PartyMilestonesPanel", () => {
  beforeEach(() => {
    mocks.milestones.value = [];
    mocks.quests.value = [];
    mocks.createMilestone.mockReset().mockResolvedValue(undefined);
    mocks.deleteMilestone.mockReset().mockResolvedValue(undefined);
    mocks.createPending = false;
    mocks.confirmResult = true;
  });

  it("shows the empty state when there are no milestones", () => {
    const wrapper = mount(PartyMilestonesPanel, { global: { stubs: routerStubs } });
    expect(wrapper.text()).toContain("No milestones yet.");
  });

  it("orders milestones newest first", () => {
    mocks.milestones.value = [
      milestone({ id: "m1", text: "Oldest one", created_at: "2026-01-01T00:00:00Z" }),
      milestone({ id: "m2", text: "Newest one", created_at: "2026-01-05T00:00:00Z" }),
    ];
    const wrapper = mount(PartyMilestonesPanel, { global: { stubs: routerStubs } });
    const text = wrapper.text();
    expect(text.indexOf("Newest one")).toBeLessThan(text.indexOf("Oldest one"));
  });

  it("disables Add milestone while the input is blank", async () => {
    const wrapper = mount(PartyMilestonesPanel, { global: { stubs: routerStubs } });
    const addButton = wrapper.findAll("button").find((b) => b.text() === "Add milestone");
    expect(addButton?.attributes("disabled")).toBeDefined();

    await wrapper.find("input").setValue("Struck a deal with the duchy");
    expect(addButton?.attributes("disabled")).toBeUndefined();

    await addButton!.trigger("click");
    expect(mocks.createMilestone).toHaveBeenCalledWith({
      campaign_id: "c1",
      quest_id: null,
      text: "Struck a deal with the duchy",
      source_event_id: null,
    });
  });

  it("resolves a quest link when the milestone's quest_id matches a known quest", () => {
    mocks.quests.value = [{ id: "q1", title: "The Sealed Crypt" }];
    mocks.milestones.value = [milestone({ id: "m1", quest_id: "q1" })];
    const wrapper = mount(PartyMilestonesPanel, { global: { stubs: routerStubs } });
    const link = wrapper.findComponent(RouterLinkStub);
    expect(link.props("to")).toBe("/quests/q1");
    expect(link.text()).toBe("The Sealed Crypt");
  });

  it("confirms before deleting a milestone", async () => {
    mocks.milestones.value = [milestone({ id: "m1" })];
    const wrapper = mount(PartyMilestonesPanel, { global: { stubs: routerStubs } });
    // The delete action is the icon-only button — the other button on the
    // page (Add milestone) carries visible text.
    const deleteButton = wrapper.findAll("button").find((b) => b.text() === "");
    await deleteButton!.trigger("click");
    await flushPromises();
    expect(mocks.deleteMilestone).toHaveBeenCalledWith({ id: "m1", campaignId: "c1" });
  });
});
