import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
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

  // #1021 row 1: the table runs on the DM's account, so its session note must not read as the DM's own draft.
  it.each([
    [{ generatorType: "agent_table_record" }, "Written by the Narrator"],
    [{ generatorType: "agent_table_record", edited: true }, "Written by the Narrator, edited by the DM"],
    [{ generatorType: "agent_turn_fact" }, "Written by the Narrator"],
    // A character's memory is in its own words, never the Narrator's.
    [{ generatorType: "agent_turn_memory" }, "Drafted with AI assistance"],
  ])("names who wrote %j", (provenance, expected) => {
    expect(mountBadge({ variant: "line", provenance }).text()).toBe(expected);
  });

  it.each([
    [{ model: "gpt-image-2", provider: "openai" }, "Model: gpt-image-2 (openai)"],
    [{ model: "gpt-image-2" }, "Model: gpt-image-2\n"],
    [{ model: "gpt-image-2", edited: true }, "Edited by a human afterward"],
  ])("explains %j in its tooltip", (provenance, expected) => {
    const title = mountBadge({ variant: "chip", provenance: { ...provenance, generatedAt: "not a date" } }).find("span").attributes("title")!;
    expect((title + "\n")).toContain(expected);
    // An unreadable date is left out rather than printed as "Invalid Date".
    expect(title).not.toContain("Generated:");
  });

  it("says a model-less record is not edited unless it was", () => {
    const plain = mountBadge({ variant: "chip", provenance: { provider: "meshy" } }).find("span").attributes("title");
    expect(plain).not.toContain("Edited");
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
    // useStorage writes through a watcher, which since Vue 3.5.44 runs on the
    // next flush rather than before the setter returns: wait for it.
    await nextTick();
    expect(localStorage.getItem("grimoire_show_ai_labels")).toBe("false");

    setShowAiLabels(true);
    await chip.vm.$nextTick();
    expect(chip.find("span").exists()).toBe(true);
  });
});
