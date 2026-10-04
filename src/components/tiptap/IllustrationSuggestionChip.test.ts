import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import IllustrationSuggestionChip from "./IllustrationSuggestionChip.vue";

const campaignMock = { isAiEnabled: true };
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaignMock }));
vi.mock("@tiptap/vue-3", () => ({
  nodeViewProps: {
    editor: { type: Object, required: true },
    node: { type: Object, required: true },
    extension: { type: Object, required: true },
    getPos: { type: Function, required: true },
  },
  NodeViewWrapper: defineComponent({ setup: (_, { slots }) => () => h("div", slots.default?.()) }),
}));

function mountChip(onPromptClick = vi.fn()) {
  const wrapper = mount(IllustrationSuggestionChip, {
    props: {
      editor: { isEditable: true },
      node: { attrs: { prompt: "A ruined tower at dusk" } },
      extension: { options: { onPromptClick } },
      getPos: () => 12,
    } as never,
  });
  return { wrapper, onPromptClick };
}

describe("IllustrationSuggestionChip", () => {
  it("offers to generate and reports which chip was clicked when AI is on", async () => {
    campaignMock.isAiEnabled = true;
    const { wrapper, onPromptClick } = mountChip();
    expect(wrapper.find("button").classes()).toContain("illus-chip--editor");
    await wrapper.find("button").trigger("click");
    expect(onPromptClick).toHaveBeenCalledWith({ pos: 12, prompt: "A ruined tower at dusk" });
  });

  it("is an inert plain suggestion when AI is off", async () => {
    campaignMock.isAiEnabled = false;
    const { wrapper, onPromptClick } = mountChip();
    expect(wrapper.find("button").classes()).toContain("illus-chip--viewer");
    expect(wrapper.find("button").attributes("title")).not.toContain("generate");
    await wrapper.find("button").trigger("click");
    expect(onPromptClick).not.toHaveBeenCalled();
  });
});
