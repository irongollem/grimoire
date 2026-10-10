import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AiGeneratedBadge from "./AiGeneratedBadge.vue";
import { useAiLabelPrefs } from "@/composables/ai/useAiLabelPrefs";

function mountBadge(props: Record<string, unknown>) {
  return mount(AiGeneratedBadge, { props: props as never });
}

describe("AiGeneratedBadge", () => {
  it("renders the chip from a held record", () => {
    const w = mountBadge({ variant: "chip", provenance: { provider: "meshy" }, corner: "left" });
    expect(w.text()).toContain("AI");
    expect(w.find("span").classes()).toContain("left-1.5");
    expect(w.find("span").attributes("title")).toContain("Provider: meshy");
  });

  it("renders the inline variant in the flow, not as an overlay", () => {
    const w = mountBadge({ variant: "inline", provenance: { provider: "openai" } });
    expect(w.text()).toContain("AI");
    expect(w.find("span").classes()).not.toContain("absolute");
    expect(w.find("span").attributes("title")).toContain("Provider: openai");
  });

  it("keeps the line variant on a held record", () => {
    const w = mountBadge({ variant: "line", provenance: { edited: true } });
    expect(w.text()).toContain("AI-assisted, edited by the DM");
  });

  it("renders nothing for a null record", () => {
    expect(mountBadge({ variant: "chip", provenance: null }).find("span").exists()).toBe(false);
  });
});

describe("AiGeneratedBadge with labels switched off", () => {
  afterEach(() => useAiLabelPrefs().setShowAiLabels(true));

  it("hides both variants for this viewer and shows them again when switched back on", async () => {
    const { setShowAiLabels } = useAiLabelPrefs();
    setShowAiLabels(false);
    const chip = mountBadge({ variant: "chip", provenance: { provider: "openai" } });
    const line = mountBadge({ variant: "line", provenance: { edited: false } });
    expect(chip.find("span").exists()).toBe(false);
    expect(line.find("p").exists()).toBe(false);
    expect(localStorage.getItem("grimoire_show_ai_labels")).toBe("false");

    setShowAiLabels(true);
    await chip.vm.$nextTick();
    expect(chip.find("span").exists()).toBe(true);
  });
});
