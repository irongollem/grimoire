import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import QuestOverviewDrawer from "./QuestOverviewDrawer.vue";
import type { Quest } from "@/types/quest.types";

vi.mock("@/composables/useQuestFlow", () => ({
  useQuestBeats: () => ({ data: { value: [] }, isLoading: { value: false } }),
  useQuestBeatAttachmentSummaries: () => ({ data: { value: [] } }),
  useQuestBeatLoot: () => ({ data: { value: [] } }),
}));

const quest = {
  id: "quest-1",
  title: "The Unseen",
  status: "active",
} as Quest;

function mountDrawer() {
  return mount(QuestOverviewDrawer, {
    props: { quest },
    global: {
      stubs: {
        Teleport: true,
        QuestSheet: true,
      },
    },
  });
}

describe("QuestOverviewDrawer", () => {
  it("presents the quest dossier as an accessible overlay", () => {
    const wrapper = mountDrawer();
    expect(wrapper.get('[role="dialog"]').attributes("aria-modal")).toBe("true");
    expect(wrapper.text()).toContain("The Unseen — Overview");
    expect(wrapper.findComponent({ name: "QuestSheet" }).props("embedded")).toBe(true);
    wrapper.unmount();
  });

  it("dismisses from the backdrop and Escape key", async () => {
    const wrapper = mountDrawer();
    await wrapper.get('[aria-label="Close quest overview"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wrapper.emitted("close")).toHaveLength(2);
    wrapper.unmount();
  });
});
