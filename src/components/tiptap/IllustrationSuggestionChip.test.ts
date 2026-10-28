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

  it("never generates for a reader, even with AI on", async () => {
    campaignMock.isAiEnabled = true;
    const wrapper = mount(IllustrationSuggestionChip, { props: { prompt: "A ruined tower", editable: false } });
    await wrapper.find("button").trigger("click");
    expect(wrapper.emitted("generate")).toBeUndefined();
  });

  it("cuts a prompt longer than 80 characters to 77 and an ellipsis, and leaves 80 whole", () => {
    campaignMock.isAiEnabled = true;
    const text = (n: number) => mount(IllustrationSuggestionChip, { props: { prompt: "x".repeat(n), editable: true } }).text();
    expect(text(80)).toContain("x".repeat(80));
    expect(text(80)).not.toContain("…");
    expect(text(81)).toContain(`${"x".repeat(77)}…`);
    expect(text(81)).not.toContain("x".repeat(78));
  });
});
