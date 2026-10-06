import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import IllustrationSuggestionNodeView from "./IllustrationSuggestionNodeView.vue";

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: true }) }));
vi.mock("@tiptap/vue-3", () => ({
  nodeViewProps: {
    editor: { type: Object, required: true },
    node: { type: Object, required: true },
    extension: { type: Object, required: true },
    getPos: { type: Function, required: true },
  },
  NodeViewWrapper: defineComponent({ setup: (_, { slots }) => () => h("div", slots.default?.()) }),
}));

function mountView(getPos: () => number | undefined) {
  const onPromptClick = vi.fn();
  const wrapper = mount(IllustrationSuggestionNodeView, {
    props: {
      editor: { isEditable: true },
      node: { attrs: { prompt: "A ruined tower at dusk" } },
      extension: { options: { onPromptClick } },
      getPos,
    } as never,
  });
  return { wrapper, onPromptClick };
}

describe("IllustrationSuggestionNodeView", () => {
  it("reports the chip's position and prompt to the extension when clicked", async () => {
    const { wrapper, onPromptClick } = mountView(() => 12);
    await wrapper.find("button").trigger("click");
    expect(onPromptClick).toHaveBeenCalledWith({ pos: 12, prompt: "A ruined tower at dusk" });
  });

  it("does nothing when the node has no position any more", async () => {
    const { wrapper, onPromptClick } = mountView(() => undefined);
    await wrapper.find("button").trigger("click");
    expect(onPromptClick).not.toHaveBeenCalled();
  });
});
