import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LevelMilestonesPanel from "./LevelMilestonesPanel.vue";
import type { LevelMilestone } from "@/composables/party/useLevelMilestones";

const mocks = vi.hoisted(() => ({
  milestones: { value: [] as LevelMilestone[] },
  remove: vi.fn(),
  updateCampaign: vi.fn(),
  confirmResult: true,
  partyLevel: 3 as number | null,
}));

vi.mock("@/composables/party/useLevelMilestones", async () => {
  const { computed } = await import("vue");
  return {
    // A template unwraps only a real ref, so the list is handed over as one.
    useLevelMilestones: () => ({ data: computed(() => mocks.milestones.value) }),
    useDeleteLevelMilestone: () => ({ mutateAsync: mocks.remove }),
  };
});
vi.mock("@/composables/campaign/useCampaigns", () => ({
  useUpdateCampaign: () => ({ mutate: mocks.updateCampaign }),
}));
vi.mock("@/composables/useConfirm", () => ({
  useConfirm: () => ({ confirm: () => Promise.resolve(mocks.confirmResult) }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: { id: "c1", party_level: mocks.partyLevel } }),
}));

const level4: LevelMilestone = {
  id: "m4",
  level: 4,
  needs: 2,
  note: null,
  reachedAt: null,
  items: [
    { id: "s1", questId: "q1", objectiveId: null, label: "The Sunken Library", questTitle: null, done: true },
    { id: "s2", questId: "q2", objectiveId: null, label: "The Three Houses", questTitle: null, done: false },
    { id: "s3", questId: "q3", objectiveId: null, label: "The Salt Road", questTitle: null, done: false },
  ],
};

const mountPanel = () =>
  mount(LevelMilestonesPanel, {
    global: { stubs: { RouterLink: RouterLinkStub, LevelMilestoneEditor: true } },
  });

describe("LevelMilestonesPanel", () => {
  beforeEach(() => {
    mocks.milestones.value = [level4];
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.updateCampaign.mockReset();
    mocks.confirmResult = true;
    mocks.partyLevel = 3;
  });

  it("counts done items against what the milestone needs, not against the whole list", () => {
    expect(mountPanel().text()).toContain("1 of 2 done");
  });

  it("cancelling the delete confirm keeps the milestone", async () => {
    mocks.confirmResult = false;
    const wrapper = mountPanel();
    await wrapper.find('[aria-label="Delete level 4"]').trigger("click");
    await flushPromises();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("confirming deletes it", async () => {
    const wrapper = mountPanel();
    await wrapper.find('[aria-label="Delete level 4"]').trigger("click");
    await flushPromises();
    expect(mocks.remove).toHaveBeenCalledWith({ id: "m4", campaignId: "c1" });
  });

  it("setting the party level to Not set clears it rather than writing level 0", async () => {
    const wrapper = mountPanel();
    const select = wrapper.find('select[aria-label="Party level"]');
    (select.element as HTMLSelectElement).selectedIndex = 0;
    await select.trigger("change");
    expect(mocks.updateCampaign).toHaveBeenCalledWith({ id: "c1", update: { party_level: null } });
  });
});
