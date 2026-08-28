import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import QuestOverviewPanel from "./QuestOverviewPanel.vue";
import type { Quest } from "@/types/quest.types";

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeats: () => ({ data: { value: [] }, isLoading: { value: false } }),
  useQuestBeatAttachmentSummaries: () => ({ data: { value: [] } }),
  useQuestBeatLoot: () => ({ data: { value: [] } }),
}));

const quest = {
  id: "quest-1",
  title: "The Unseen",
  status: "active",
} as Quest;

function mountPanel() {
  return mount(QuestOverviewPanel, {
    props: { quest },
    global: {
      stubs: {
        QuestOverviewMetadata: true,
        QuestOverviewLifecycle: true,
      },
    },
  });
}

describe("QuestOverviewPanel", () => {
  it("presents the quest dossier in place rather than as an overlay", () => {
    const wrapper = mountPanel();
    expect(wrapper.get("section").attributes("aria-label")).toBe("Quest overview");
    // No dialog, no backdrop: it is a surface of the quest screen, not a layer
    // over one, so nothing here traps focus or needs dismissing.
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Close quest overview"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: "QuestOverviewMetadata" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "QuestOverviewLifecycle" }).exists()).toBe(true);
    wrapper.unmount();
  });
});
