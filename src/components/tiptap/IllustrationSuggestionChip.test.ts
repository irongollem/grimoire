import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import IllustrationSuggestionChip from "./IllustrationSuggestionChip.vue";

const campaignMock = { isAiEnabled: true };
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaignMock }));

function mountChip() {
  const wrapper = mount(IllustrationSuggestionChip, {
    props: { prompt: "A ruined tower at dusk", editable: true },
  });
  return { wrapper };
}

describe("IllustrationSuggestionChip", () => {
  it("offers to generate and emits generate when AI is on", async () => {
    campaignMock.isAiEnabled = true;
    const { wrapper } = mountChip();
    expect(wrapper.find("button").classes()).toContain("illus-chip--editor");
    await wrapper.find("button").trigger("click");
    expect(wrapper.emitted("generate")).toHaveLength(1);
  });

  it("is an inert plain suggestion when AI is off", async () => {
    campaignMock.isAiEnabled = false;
    const { wrapper } = mountChip();
    expect(wrapper.find("button").classes()).toContain("illus-chip--viewer");
    expect(wrapper.find("button").attributes("title")).not.toContain("generate");
    await wrapper.find("button").trigger("click");
    expect(wrapper.emitted("generate")).toBeUndefined();
  });
});
