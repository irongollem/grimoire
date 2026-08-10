import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Quest } from "@/types/quest.types";
import QuestFlowConversionPanel from "./QuestFlowConversionPanel.vue";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock("@/composables/useQuestFlow", () => ({
  useQuestFlowConversionPreview: () => ({
    data: { value: {
      flow_enabled: false,
      overview_available: true,
      overview_beats_to_create: 1,
      encounter_refs: 2,
      encounter_beats_to_create: 2,
      objectives_preserved: 3,
      triggers_preserved: 1,
      subquests_preserved: 2,
      shared_characters_preserved: 4,
      rewards_preserved: true,
    } },
    isLoading: { value: false },
    error: { value: null },
  }),
  useConvertQuestToFlow: () => ({ mutateAsync: mocks.mutateAsync, isPending: { value: false } }),
}));

const quest = { id: "quest-1", title: "The Vault" } as Quest;

describe("QuestFlowConversionPanel", () => {
  beforeEach(() => mocks.mutateAsync.mockReset().mockResolvedValue({ flow_enabled: true }));

  it("previews only unconnected generated beats and names preserved legacy systems", () => {
    const wrapper = mount(QuestFlowConversionPanel, { props: { quest } });
    expect(wrapper.text()).toContain("2 combat beats");
    expect(wrapper.text()).toContain("placed unconnected in a staging area");
    expect(wrapper.text()).toContain("3 objectives · 1 triggers · 2 subquests · 4 shared characters · rewards");
    expect(wrapper.text()).toContain("No route is inferred");
  });

  it("cancels without writing and converts only after explicit confirmation", async () => {
    const wrapper = mount(QuestFlowConversionPanel, { props: { quest } });
    const buttons = wrapper.findAll("button");
    await buttons.find((button) => button.text() === "Keep legacy quest")!.trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(mocks.mutateAsync).not.toHaveBeenCalled();

    await buttons.find((button) => button.text() === "Create story flow")!.trigger("click");
    await flushPromises();
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ questId: "quest-1", includeOverview: true });
    expect(wrapper.emitted("converted")).toHaveLength(1);
  });
});
